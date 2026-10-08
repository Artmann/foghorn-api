import { Clock, Context, Effect, Layer } from 'effect'

import type { SiteDto } from '../api/schemas'
import {
  NotTeamMember,
  SiteLimitReached,
  SiteNotFound,
  TeamNotFound
} from '../api/errors'
import { Site, toSiteDto } from '../models/site'
import { Database, type DatabaseError } from './database'
import { JobQueue } from './job-queue'
import { Teams } from './teams'

export const maxSitesPerTeam = 10

type MembershipError = DatabaseError | NotTeamMember | TeamNotFound

export interface SitesShape {
  readonly create: (input: {
    domain: string
    sitemapPath: string | undefined
    teamId: string
    userId: string
  }) => Effect.Effect<SiteDto, MembershipError | SiteLimitReached>
  readonly delete: (input: {
    siteId: string
    userId: string
  }) => Effect.Effect<void, MembershipError | SiteNotFound>
  readonly get: (input: {
    siteId: string
    userId: string
  }) => Effect.Effect<SiteDto, MembershipError | SiteNotFound>
  readonly list: (input: {
    teamId: string | undefined
    userId: string
  }) => Effect.Effect<SiteDto[], MembershipError>
  // The sites a user can see, either in one team or in all their teams.
  readonly listModels: (input: {
    siteId: string | undefined
    userId: string
  }) => Effect.Effect<Site[], MembershipError | SiteNotFound>
  // Fails unless the site exists and the user is in its team.
  readonly require: (input: {
    siteId: string
    userId: string
  }) => Effect.Effect<Site, MembershipError | SiteNotFound>
  readonly update: (input: {
    domain: string | undefined
    siteId: string
    sitemapPath: string | undefined
    userId: string
  }) => Effect.Effect<SiteDto, MembershipError | SiteNotFound>
}

export class Sites extends Context.Service<Sites, SitesShape>()(
  'foghorn/services/Sites'
) {
  static readonly layer = Layer.effect(
    Sites,
    Effect.gen(function* () {
      const database = yield* Database
      const jobQueue = yield* JobQueue
      const teams = yield* Teams

      const toDto = Effect.fn('Sites.toDto')(function* (site: Site) {
        const now = yield* Clock.currentTimeMillis
        const counts = yield* jobQueue.countSiteAudits(site.id, now)

        return toSiteDto(site, counts, now)
      })

      const sitesForTeams = Effect.fn('Sites.sitesForTeams')(function* (
        teamIds: string[]
      ) {
        if (teamIds.length === 0) {
          return []
        }

        return yield* database.use('Site.whereIn', () =>
          Site.whereIn('teamId', teamIds).get()
        )
      })

      const requireSite = Effect.fn('Sites.require')(function* (input: {
        siteId: string
        userId: string
      }) {
        const site = yield* database.use('Site.find', () =>
          Site.find(input.siteId)
        )

        if (!site) {
          return yield* new SiteNotFound({
            message:
              'Site not found. List your sites with GET /sites to find the right ID.'
          })
        }

        yield* teams.requireMembership({
          teamId: site.teamId,
          userId: input.userId
        })

        return site
      })

      const create = Effect.fn('Sites.create')(function* (input: {
        domain: string
        sitemapPath: string | undefined
        teamId: string
        userId: string
      }) {
        yield* teams.requireMembership(input)

        const existing = yield* sitesForTeams([input.teamId])

        if (existing.length >= maxSitesPerTeam) {
          return yield* new SiteLimitReached({
            message: `This team has reached the maximum of ${maxSitesPerTeam} sites.`
          })
        }

        const site = yield* database.use('Site.create', () =>
          Site.create({
            domain: input.domain,
            sitemapPath: input.sitemapPath ?? '/sitemap.xml',
            teamId: input.teamId
          })
        )

        yield* Effect.logInfo('Site created').pipe(
          Effect.annotateLogs({
            siteId: site.id,
            teamId: input.teamId,
            userId: input.userId
          })
        )

        return yield* toDto(site)
      })

      const listModels = Effect.fn('Sites.listModels')(function* (input: {
        siteId: string | undefined
        userId: string
      }) {
        if (input.siteId !== undefined) {
          return [
            yield* requireSite({ siteId: input.siteId, userId: input.userId })
          ]
        }

        return yield* sitesForTeams(yield* teams.teamIdsForUser(input.userId))
      })

      const list = Effect.fn('Sites.list')(function* (input: {
        teamId: string | undefined
        userId: string
      }) {
        let sites: Site[]

        if (input.teamId !== undefined) {
          yield* teams.requireMembership({
            teamId: input.teamId,
            userId: input.userId
          })
          sites = yield* sitesForTeams([input.teamId])
        } else {
          sites = yield* sitesForTeams(
            yield* teams.teamIdsForUser(input.userId)
          )
        }

        return yield* Effect.forEach(sites, toDto, { concurrency: 5 })
      })

      const get = Effect.fn('Sites.get')(function* (input: {
        siteId: string
        userId: string
      }) {
        return yield* toDto(yield* requireSite(input))
      })

      const update = Effect.fn('Sites.update')(function* (input: {
        domain: string | undefined
        siteId: string
        sitemapPath: string | undefined
        userId: string
      }) {
        const site = yield* requireSite(input)

        const sitemapChanged =
          (input.domain !== undefined && input.domain !== site.domain) ||
          (input.sitemapPath !== undefined &&
            input.sitemapPath !== site.sitemapPath)

        if (input.domain !== undefined) {
          site.domain = input.domain
        }

        if (input.sitemapPath !== undefined) {
          site.sitemapPath = input.sitemapPath
        }

        // Queue a new scrape so the change is picked up on the next job run.
        if (sitemapChanged) {
          site.lastScrapedSitemapAt = null
          site.scrapeSitemapError = null
        }

        yield* database.use('Site.save', () => site.save())

        yield* Effect.logInfo('Site updated').pipe(
          Effect.annotateLogs({
            siteId: site.id,
            teamId: site.teamId,
            userId: input.userId
          })
        )

        return yield* toDto(site)
      })

      const remove = Effect.fn('Sites.delete')(function* (input: {
        siteId: string
        userId: string
      }) {
        const site = yield* requireSite(input)

        yield* database.use('Site.delete', () => site.delete())

        yield* Effect.logInfo('Site deleted').pipe(
          Effect.annotateLogs({
            siteId: site.id,
            teamId: site.teamId,
            userId: input.userId
          })
        )
      })

      return Sites.of({
        create,
        delete: remove,
        get,
        list,
        listModels,
        require: requireSite,
        update
      })
    })
  )
}
