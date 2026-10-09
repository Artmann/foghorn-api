import { Clock, Context, Effect, Layer, Predicate } from 'effect'

import type { NotTeamMember, SiteNotFound, TeamNotFound } from '../api/errors'
import {
  issueListLimit,
  pagesPerIssueLimit,
  type IssueCategory,
  type IssueDto,
  type PaginationDto
} from '../api/schemas'
import { issueCategories, makeIssueCollector } from '../lib/issues'
import type { AuditProgress } from '../lib/job-status'
import { makePagination } from '../lib/pagination'
import type { CategoryResult } from '../models/page'
import { Database, type DatabaseError, type StoredDocument } from './database'
import { JobQueue } from './job-queue'
import { Sites } from './sites'

export interface IssuesResult {
  readonly audits: AuditProgress
  readonly issues: IssueDto[]
  readonly pagination: PaginationDto
  readonly status: 'pending' | 'ready'
}

export interface IssuesShape {
  readonly list: (input: {
    category: IssueCategory | undefined
    limit: number | undefined
    offset: number | undefined
    pagesPerIssue: number | undefined
    siteId: string | undefined
    userId: string
  }) => Effect.Effect<
    IssuesResult,
    DatabaseError | NotTeamMember | SiteNotFound | TeamNotFound
  >
}

// Reads the audits of one category from a projected page document.
function readCategory(
  document: StoredDocument,
  category: IssueCategory
): CategoryResult | undefined {
  const report = document.auditReport

  if (!Predicate.isObject(report)) {
    return undefined
  }

  const result: unknown = Reflect.get(report, category)

  if (!Predicate.isObject(result)) {
    return undefined
  }

  const audits: unknown = Reflect.get(result, 'audits')

  // The runner wrote these audits from a validated PageSpeed report.
  return Array.isArray(audits)
    ? { audits: audits as CategoryResult['audits'], score: null }
    : undefined
}

export class Issues extends Context.Service<Issues, IssuesShape>()(
  'foghorn/services/Issues'
) {
  static readonly layer = Layer.effect(
    Issues,
    Effect.gen(function* () {
      const database = yield* Database
      const jobQueue = yield* JobQueue
      const sites = yield* Sites

      const countAudits = Effect.fn('Issues.countAudits')(function* (
        siteIds: string[]
      ) {
        const now = yield* Clock.currentTimeMillis
        const counts = yield* Effect.forEach(
          siteIds,
          (siteId) => jobQueue.countSiteAudits(siteId, now),
          { concurrency: 5 }
        )
        const audits: AuditProgress = {
          completedPages: 0,
          failedPages: 0,
          pendingPages: 0,
          runningPages: 0,
          totalPages: 0
        }
        let unauditedPages = 0

        for (const count of counts) {
          audits.completedPages += count.audits.completedPages
          audits.failedPages += count.audits.failedPages
          audits.pendingPages += count.audits.pendingPages
          audits.runningPages += count.audits.runningPages
          audits.totalPages += count.audits.totalPages
          unauditedPages += count.unauditedPages
        }

        return { audits, unauditedPages }
      })

      // Reads pages one at a time, with only the audits of the requested
      // categories, so memory stays bounded however many pages there are.
      const collectIssues = Effect.fn('Issues.collectIssues')(
        function* (input: {
          category: IssueCategory | undefined
          pagesPerIssue: number
          siteIds: string[]
        }) {
          const categories = input.category ? [input.category] : issueCategories
          const collector = makeIssueCollector(input)
          const projection: Record<string, 1> = { path: 1, url: 1 }

          for (const category of categories) {
            projection[`auditReport.${category}.audits`] = 1
          }

          const collection = yield* database.collection('pages')

          yield* database.use('Issues.collectIssues', async () => {
            const cursor = collection
              .find({ siteId: { $in: input.siteIds } })
              .project<StoredDocument>(projection)

            try {
              let document = await cursor.next()

              while (document) {
                const auditReport: Partial<
                  Record<IssueCategory, CategoryResult>
                > = {}

                for (const category of categories) {
                  const result = readCategory(document, category)

                  if (result) {
                    auditReport[category] = result
                  }
                }

                collector.add({
                  auditReport,
                  id: String(document._id),
                  path: String(document.path),
                  url: String(document.url)
                })

                document = await cursor.next()
              }
            } finally {
              await cursor.close()
            }
          })

          return collector.result()
        }
      )

      const list = Effect.fn('Issues.list')(function* (input: {
        category: IssueCategory | undefined
        limit: number | undefined
        offset: number | undefined
        pagesPerIssue: number | undefined
        siteId: string | undefined
        userId: string
      }) {
        const limit = input.limit ?? issueListLimit.default
        const offset = input.offset ?? 0
        const siteList = yield* sites.listModels(input)
        const siteIds = siteList.map((site) => site.id)

        const [{ audits, unauditedPages }, issues] = yield* Effect.all([
          countAudits(siteIds),
          siteIds.length === 0
            ? Effect.succeed([])
            : collectIssues({
                category: input.category,
                pagesPerIssue:
                  input.pagesPerIssue ?? pagesPerIssueLimit.default,
                siteIds
              })
        ])

        // Issues are incomplete while a sitemap hasn't been scraped yet or
        // pages are waiting for their first audit.
        const hasPendingSitemaps = siteList.some(
          (site) => site.lastScrapedSitemapAt === null
        )

        return {
          audits,
          issues: issues.slice(offset, offset + limit),
          pagination: makePagination({ limit, offset, total: issues.length }),
          status:
            hasPendingSitemaps || unauditedPages > 0
              ? ('pending' as const)
              : ('ready' as const)
        }
      })

      return Issues.of({ list })
    })
  )
}
