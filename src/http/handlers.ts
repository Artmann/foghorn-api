import { Clock, Effect, Layer } from 'effect'
import { HttpApiBuilder } from 'effect/http-api'

import { Api } from '../api/api'
import { CurrentUser } from '../api/authentication'
import { timestampToDateTime } from '../lib/time'
import { toApiKeyDto } from '../models/api-key'
import { toTeamDto } from '../models/team'
import { toTeamMemberDto } from '../models/team-member'
import { toUserDto } from '../models/user'
import { ApiKeys } from '../services/api-keys'
import { Issues } from '../services/issues'
import { JobRunners } from '../services/job-runners'
import { Pages } from '../services/pages'
import { Sites } from '../services/sites'
import { Teams } from '../services/teams'
import { Users } from '../services/users'

// Database failures are unexpected, so every handler turns them into defects
// with `Effect.catchTag('DatabaseError', Effect.die)`. The client gets a
// generic 500 and the error middleware logs the cause.

const success = { success: true as const }

export const HealthHandlers = HttpApiBuilder.group(Api, 'health', (handlers) =>
  Effect.gen(function* () {
    const jobRunners = yield* JobRunners

    return handlers.handle('health', () =>
      Effect.gen(function* () {
        const jobRunner = yield* jobRunners
          .status(yield* Clock.currentTimeMillis)
          .pipe(
            Effect.catchTag('DatabaseError', (error) =>
              Effect.logError('Could not read the job runner status.').pipe(
                Effect.annotateLogs({ error: error.message }),
                Effect.as({ lastSeenAt: null, status: 'unknown' as const })
              )
            )
          )

        return { jobRunner, service: 'foghorn-api', status: 'ok' }
      })
    )
  })
)

export const AuthHandlers = HttpApiBuilder.group(Api, 'auth', (handlers) =>
  Effect.gen(function* () {
    const users = yield* Users

    return handlers
      .handle('signUp', ({ payload }) =>
        users.signUp(payload).pipe(
          Effect.map((user) => ({ user: toUserDto(user) })),
          Effect.catchTag('DatabaseError', Effect.die)
        )
      )
      .handle('signIn', ({ payload }) =>
        users.signIn(payload).pipe(
          Effect.map(({ expiresIn, token, user }) => ({
            expiresIn,
            token,
            user: toUserDto(user)
          })),
          Effect.catchTag('DatabaseError', Effect.die)
        )
      )
  })
)

export const ApiKeysHandlers = HttpApiBuilder.group(
  Api,
  'apiKeys',
  (handlers) =>
    Effect.gen(function* () {
      const apiKeys = yield* ApiKeys

      return handlers
        .handle('create', ({ payload }) =>
          Effect.gen(function* () {
            const { userId } = yield* CurrentUser
            const { apiKey, key } = yield* apiKeys.create({
              expiresAt: payload.expiresAt
                ? new Date(payload.expiresAt).getTime()
                : null,
              name: payload.name,
              userId
            })

            return {
              apiKey: {
                createdAt: timestampToDateTime(apiKey.createdAt),
                expiresAt:
                  apiKey.expiresAt === null
                    ? null
                    : timestampToDateTime(apiKey.expiresAt),
                id: apiKey.id,
                key,
                keyPrefix: apiKey.keyPrefix,
                name: apiKey.name
              }
            }
          }).pipe(Effect.catchTag('DatabaseError', Effect.die))
        )
        .handle('list', () =>
          Effect.gen(function* () {
            const { userId } = yield* CurrentUser
            const keys = yield* apiKeys.list(userId)

            return { apiKeys: keys.map(toApiKeyDto) }
          }).pipe(Effect.catchTag('DatabaseError', Effect.die))
        )
        .handle('delete', ({ params }) =>
          Effect.gen(function* () {
            const { userId } = yield* CurrentUser

            yield* apiKeys.delete({ id: params.id, userId })

            return success
          }).pipe(Effect.catchTag('DatabaseError', Effect.die))
        )
    })
)

export const TeamsHandlers = HttpApiBuilder.group(Api, 'teams', (handlers) =>
  Effect.gen(function* () {
    const teams = yield* Teams

    return handlers
      .handle('create', ({ payload }) =>
        Effect.gen(function* () {
          const { userId } = yield* CurrentUser
          const team = yield* teams.create({ name: payload.name, userId })

          return { team: toTeamDto(team) }
        }).pipe(Effect.catchTag('DatabaseError', Effect.die))
      )
      .handle('list', () =>
        Effect.gen(function* () {
          const { userId } = yield* CurrentUser
          const teamList = yield* teams.listForUser(userId)

          return { teams: teamList.map(toTeamDto) }
        }).pipe(Effect.catchTag('DatabaseError', Effect.die))
      )
      .handle('get', ({ params }) =>
        Effect.gen(function* () {
          const { userId } = yield* CurrentUser
          const team = yield* teams.requireMembership({
            teamId: params.id,
            userId
          })

          return { team: toTeamDto(team) }
        }).pipe(Effect.catchTag('DatabaseError', Effect.die))
      )
      .handle('update', ({ params, payload }) =>
        Effect.gen(function* () {
          const { userId } = yield* CurrentUser
          const team = yield* teams.rename({
            name: payload.name,
            teamId: params.id,
            userId
          })

          return { team: toTeamDto(team) }
        }).pipe(Effect.catchTag('DatabaseError', Effect.die))
      )
      .handle('delete', ({ params }) =>
        Effect.gen(function* () {
          const { userId } = yield* CurrentUser

          yield* teams.delete({ teamId: params.id, userId })

          return success
        }).pipe(Effect.catchTag('DatabaseError', Effect.die))
      )
      .handle('addMember', ({ params, payload }) =>
        Effect.gen(function* () {
          const { userId } = yield* CurrentUser
          const member = yield* teams.addMember({
            actorId: userId,
            teamId: params.id,
            userId: payload.userId
          })

          return { member: toTeamMemberDto(member) }
        }).pipe(Effect.catchTag('DatabaseError', Effect.die))
      )
      .handle('listMembers', ({ params }) =>
        Effect.gen(function* () {
          const { userId } = yield* CurrentUser
          const members = yield* teams.listMembers({
            teamId: params.id,
            userId
          })

          return { members: members.map(toTeamMemberDto) }
        }).pipe(Effect.catchTag('DatabaseError', Effect.die))
      )
      .handle('removeMember', ({ params }) =>
        Effect.gen(function* () {
          const { userId } = yield* CurrentUser

          yield* teams.removeMember({
            actorId: userId,
            teamId: params.id,
            userId: params.userId
          })

          return success
        }).pipe(Effect.catchTag('DatabaseError', Effect.die))
      )
  })
)

export const SitesHandlers = HttpApiBuilder.group(Api, 'sites', (handlers) =>
  Effect.gen(function* () {
    const sites = yield* Sites

    return handlers
      .handle('create', ({ payload }) =>
        Effect.gen(function* () {
          const { userId } = yield* CurrentUser
          const site = yield* sites.create({
            domain: payload.domain,
            sitemapPath: payload.sitemapPath,
            teamId: payload.teamId,
            userId
          })

          return { site }
        }).pipe(Effect.catchTag('DatabaseError', Effect.die))
      )
      .handle('list', ({ query }) =>
        Effect.gen(function* () {
          const { userId } = yield* CurrentUser
          const siteList = yield* sites.list({ teamId: query.teamId, userId })

          return { sites: siteList }
        }).pipe(Effect.catchTag('DatabaseError', Effect.die))
      )
      .handle('get', ({ params }) =>
        Effect.gen(function* () {
          const { userId } = yield* CurrentUser
          const site = yield* sites.get({ siteId: params.id, userId })

          return { site }
        }).pipe(Effect.catchTag('DatabaseError', Effect.die))
      )
      .handle('update', ({ params, payload }) =>
        Effect.gen(function* () {
          const { userId } = yield* CurrentUser
          const site = yield* sites.update({
            domain: payload.domain,
            siteId: params.id,
            sitemapPath: payload.sitemapPath,
            userId
          })

          return { site }
        }).pipe(Effect.catchTag('DatabaseError', Effect.die))
      )
      .handle('delete', ({ params }) =>
        Effect.gen(function* () {
          const { userId } = yield* CurrentUser

          yield* sites.delete({ siteId: params.id, userId })

          return success
        }).pipe(Effect.catchTag('DatabaseError', Effect.die))
      )
  })
)

export const PagesHandlers = HttpApiBuilder.group(Api, 'pages', (handlers) =>
  Effect.gen(function* () {
    const pages = yield* Pages

    return handlers
      .handle('list', ({ query }) =>
        Effect.gen(function* () {
          const { userId } = yield* CurrentUser
          const pageList = yield* pages.list({
            search: query.search,
            siteId: query.siteId,
            userId
          })

          return { pages: pageList }
        }).pipe(Effect.catchTag('DatabaseError', Effect.die))
      )
      .handle('get', ({ params }) =>
        Effect.gen(function* () {
          const { userId } = yield* CurrentUser
          const page = yield* pages.get({ pageId: params.id, userId })

          return { page }
        }).pipe(Effect.catchTag('DatabaseError', Effect.die))
      )
  })
)

export const IssuesHandlers = HttpApiBuilder.group(Api, 'issues', (handlers) =>
  Effect.gen(function* () {
    const issues = yield* Issues

    return handlers.handle('list', ({ query }) =>
      Effect.gen(function* () {
        const { userId } = yield* CurrentUser

        return yield* issues.list({
          category: query.category,
          siteId: query.siteId,
          userId
        })
      }).pipe(Effect.catchTag('DatabaseError', Effect.die))
    )
  })
)

export const AllHandlers = Layer.mergeAll(
  ApiKeysHandlers,
  AuthHandlers,
  HealthHandlers,
  IssuesHandlers,
  PagesHandlers,
  SitesHandlers,
  TeamsHandlers
)
