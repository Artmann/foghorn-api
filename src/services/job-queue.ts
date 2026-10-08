import { Context, Effect, Layer } from 'effect'
import type { BaseModel } from 'esix'

import {
  getDueBefore,
  getLeaseCutoff,
  type AuditProgress
} from '../lib/job-status'
import { Page, type PageAuditReport } from '../models/page'
import { Site } from '../models/site'
import { Database, type DatabaseError } from './database'

export interface SiteAuditCounts {
  readonly audits: AuditProgress
  // Pages that have never been audited, including ones running right now.
  readonly unauditedPages: number
}

export interface PageUrl {
  readonly id: string
  readonly path: string
  readonly url: string
}

export interface AuditResult {
  readonly auditError: string | null
  readonly auditReport?: PageAuditReport
  readonly lastAuditedAt: number
}

export interface ScrapeResult {
  readonly lastScrapedSitemapAt: number
  readonly scrapeSitemapError: string | null
}

export interface JobQueueShape {
  readonly countSiteAudits: (
    siteId: string,
    now: number
  ) => Effect.Effect<SiteAuditCounts, DatabaseError>
  readonly findPagesDueForAudit: (
    now: number,
    limit: number
  ) => Effect.Effect<Page[], DatabaseError>
  // Returns the site's pages without their audit reports, which can be large.
  readonly findPageUrls: (
    siteId: string
  ) => Effect.Effect<PageUrl[], DatabaseError>
  readonly findSitesDueForScrape: (
    now: number,
    limit: number
  ) => Effect.Effect<Site[], DatabaseError>
  readonly markAuditFinished: (
    pageId: string,
    result: AuditResult
  ) => Effect.Effect<void, DatabaseError>
  readonly markAuditReleased: (
    pageId: string
  ) => Effect.Effect<void, DatabaseError>
  readonly markAuditStarted: (
    pageId: string,
    now: number
  ) => Effect.Effect<void, DatabaseError>
  // Only records the result if the domain and sitemap path are unchanged. If
  // they changed during the scrape, the site stays queued for a new scrape.
  readonly markScrapeFinished: (
    site: Site,
    result: ScrapeResult
  ) => Effect.Effect<void, DatabaseError>
  readonly markScrapeStarted: (
    siteId: string,
    now: number
  ) => Effect.Effect<void, DatabaseError>
}

function notRunning(startedField: string, now: number) {
  return {
    $or: [
      { [startedField]: null },
      { [startedField]: { $lte: getLeaseCutoff(now) } }
    ]
  }
}

// `whereIn` doesn't keep the order of the ids, so put them back in order.
function sortByIds<T extends BaseModel>(models: T[], ids: string[]): T[] {
  const positions = new Map(ids.map((id, index) => [id, index]))

  return [...models].sort(
    (a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0)
  )
}

// The job state is written with `$set` so it never overwrites changes made
// through the API while the job was running. Esix strips `$` operators from
// queries, so these go through the collection directly.
export class JobQueue extends Context.Service<JobQueue, JobQueueShape>()(
  'foghorn/services/JobQueue'
) {
  static readonly layer = Layer.effect(
    JobQueue,
    Effect.gen(function* () {
      const database = yield* Database

      // Finds the ids of documents that have never run first, then the ones
      // that last ran before the cooldown, oldest first. Skips anything
      // running.
      const findDueIds = Effect.fn('JobQueue.findDueIds')(function* (
        collectionName: 'pages' | 'sites',
        lastRunField: string,
        startedField: string,
        now: number,
        limit: number
      ) {
        const collection = yield* database.collection(collectionName)
        const projection = { _id: 1 }

        const neverRun = yield* database.use('findDueIds', () =>
          collection
            .find(
              { [lastRunField]: null, ...notRunning(startedField, now) },
              { projection }
            )
            .limit(limit)
            .toArray()
        )

        const remaining = limit - neverRun.length

        if (remaining <= 0) {
          return neverRun.map((document) => String(document._id))
        }

        const stale = yield* database.use('findDueIds', () =>
          collection
            .find(
              {
                [lastRunField]: { $lt: getDueBefore(now) },
                ...notRunning(startedField, now)
              },
              { projection }
            )
            .sort({ [lastRunField]: 1 })
            .limit(remaining)
            .toArray()
        )

        return [...neverRun, ...stale].map((document) => String(document._id))
      })

      const countSiteAudits = Effect.fn('JobQueue.countSiteAudits')(function* (
        siteId: string,
        now: number
      ) {
        const pages = yield* database.collection('pages')
        const idle = notRunning('auditStartedAt', now)

        const [
          totalPages,
          runningPages,
          pendingPages,
          failedPages,
          unauditedPages
        ] = yield* database.use('countSiteAudits', () =>
          Promise.all([
            pages.countDocuments({ siteId }),
            pages.countDocuments({
              auditStartedAt: { $gt: getLeaseCutoff(now) },
              siteId
            }),
            pages.countDocuments({ lastAuditedAt: null, siteId, ...idle }),
            pages.countDocuments({
              auditError: { $ne: null },
              lastAuditedAt: { $ne: null },
              siteId,
              ...idle
            }),
            pages.countDocuments({ lastAuditedAt: null, siteId })
          ])
        )

        return {
          audits: {
            completedPages:
              totalPages - runningPages - pendingPages - failedPages,
            failedPages,
            pendingPages,
            runningPages,
            totalPages
          },
          unauditedPages
        }
      })

      const findPagesDueForAudit = Effect.fn('JobQueue.findPagesDueForAudit')(
        function* (now: number, limit: number) {
          const ids = yield* findDueIds(
            'pages',
            'lastAuditedAt',
            'auditStartedAt',
            now,
            limit
          )

          if (ids.length === 0) {
            return []
          }

          const pages = yield* database.use('Page.whereIn', () =>
            Page.whereIn('id', ids).get()
          )

          return sortByIds(pages, ids)
        }
      )

      const findSitesDueForScrape = Effect.fn('JobQueue.findSitesDueForScrape')(
        function* (now: number, limit: number) {
          const ids = yield* findDueIds(
            'sites',
            'lastScrapedSitemapAt',
            'scrapeStartedAt',
            now,
            limit
          )

          if (ids.length === 0) {
            return []
          }

          const sites = yield* database.use('Site.whereIn', () =>
            Site.whereIn('id', ids).get()
          )

          return sortByIds(sites, ids)
        }
      )

      const findPageUrls = Effect.fn('JobQueue.findPageUrls')(function* (
        siteId: string
      ) {
        const pages = yield* database.collection('pages')
        const documents = yield* database.use('findPageUrls', () =>
          pages
            .find({ siteId }, { projection: { _id: 1, path: 1, url: 1 } })
            .toArray()
        )

        return documents.map((document) => ({
          id: String(document._id),
          path: String(document.path),
          url: String(document.url)
        }))
      })

      const updatePage = (pageId: string, fields: Record<string, unknown>) =>
        Effect.flatMap(database.collection('pages'), (pages) =>
          database.use('updatePage', () =>
            pages.updateOne({ _id: pageId }, { $set: fields })
          )
        ).pipe(Effect.asVoid)

      const markAuditFinished = (pageId: string, result: AuditResult) =>
        updatePage(pageId, { ...result, auditStartedAt: null })

      const markAuditReleased = (pageId: string) =>
        updatePage(pageId, { auditStartedAt: null })

      const markAuditStarted = (pageId: string, now: number) =>
        updatePage(pageId, { auditStartedAt: now })

      const markScrapeFinished = Effect.fn('JobQueue.markScrapeFinished')(
        function* (site: Site, result: ScrapeResult) {
          const sites = yield* database.collection('sites')

          const { matchedCount } = yield* database.use(
            'markScrapeFinished',
            () =>
              sites.updateOne(
                {
                  _id: site.id,
                  domain: site.domain,
                  sitemapPath: site.sitemapPath
                },
                { $set: { ...result, scrapeStartedAt: null } }
              )
          )

          if (matchedCount === 0) {
            yield* database.use('markScrapeFinished', () =>
              sites.updateOne(
                { _id: site.id },
                { $set: { scrapeStartedAt: null } }
              )
            )
          }
        }
      )

      const markScrapeStarted = (siteId: string, now: number) =>
        Effect.flatMap(database.collection('sites'), (sites) =>
          database.use('markScrapeStarted', () =>
            sites.updateOne({ _id: siteId }, { $set: { scrapeStartedAt: now } })
          )
        ).pipe(Effect.asVoid)

      return JobQueue.of({
        countSiteAudits,
        findPageUrls,
        findPagesDueForAudit,
        findSitesDueForScrape,
        markAuditFinished,
        markAuditReleased,
        markAuditStarted,
        markScrapeFinished,
        markScrapeStarted
      })
    })
  )
}
