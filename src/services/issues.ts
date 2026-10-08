import { Clock, Context, Effect, Layer } from 'effect'

import type { NotTeamMember, SiteNotFound, TeamNotFound } from '../api/errors'
import type { IssueCategory, IssueDto } from '../api/schemas'
import { collectIssues } from '../lib/issues'
import { summarizeAudits, type AuditProgress } from '../lib/job-status'
import { Page } from '../models/page'
import { Database, type DatabaseError } from './database'
import { Sites } from './sites'

export interface IssuesResult {
  readonly audits: AuditProgress
  readonly issues: IssueDto[]
  readonly status: 'pending' | 'ready'
}

export interface IssuesShape {
  readonly list: (input: {
    category: IssueCategory | undefined
    siteId: string | undefined
    userId: string
  }) => Effect.Effect<
    IssuesResult,
    DatabaseError | NotTeamMember | SiteNotFound | TeamNotFound
  >
}

export class Issues extends Context.Service<Issues, IssuesShape>()(
  'foghorn/services/Issues'
) {
  static readonly layer = Layer.effect(
    Issues,
    Effect.gen(function* () {
      const database = yield* Database
      const sites = yield* Sites

      const list = Effect.fn('Issues.list')(function* (input: {
        category: IssueCategory | undefined
        siteId: string | undefined
        userId: string
      }) {
        const siteList = yield* sites.listModels(input)
        const pages =
          siteList.length === 0
            ? []
            : yield* database.use('Page.whereIn', () =>
                Page.whereIn(
                  'siteId',
                  siteList.map((site) => site.id)
                ).get()
              )

        // Issues are incomplete while a sitemap hasn't been scraped yet or
        // pages are waiting for their first audit.
        const hasPendingSitemaps = siteList.some(
          (site) => site.lastScrapedSitemapAt === null
        )
        const hasUnauditedPages = pages.some(
          (page) => page.lastAuditedAt === null
        )

        return {
          audits: summarizeAudits(pages, yield* Clock.currentTimeMillis),
          issues: collectIssues(pages, input.category),
          status:
            hasPendingSitemaps || hasUnauditedPages
              ? ('pending' as const)
              : ('ready' as const)
        }
      })

      return Issues.of({ list })
    })
  )
}
