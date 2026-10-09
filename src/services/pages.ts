import { Clock, Context, Effect, Layer } from 'effect'

import {
  NotTeamMember,
  PageNotFound,
  SiteNotFound,
  TeamNotFound
} from '../api/errors'
import {
  pageListLimit,
  type PageDto,
  type PageSummaryDto,
  type PaginationDto
} from '../api/schemas'
import { makePagination } from '../lib/pagination'
import {
  Page,
  pageSummaryProjection,
  readPageSummary,
  toPageDto,
  toPageSummaryDto
} from '../models/page'
import { Database, type DatabaseError, type StoredDocument } from './database'
import { Sites } from './sites'

type AccessError = DatabaseError | NotTeamMember | SiteNotFound | TeamNotFound

export interface PageList {
  readonly pages: PageSummaryDto[]
  readonly pagination: PaginationDto
}

export interface PagesShape {
  readonly get: (input: {
    pageId: string
    userId: string
  }) => Effect.Effect<PageDto, AccessError | PageNotFound>
  // Pages sorted by URL, without their audit reports.
  readonly list: (input: {
    limit: number | undefined
    offset: number | undefined
    search: string | undefined
    siteId: string | undefined
    userId: string
  }) => Effect.Effect<PageList, AccessError>
}

// Escapes text so it matches literally inside a regular expression.
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export class Pages extends Context.Service<Pages, PagesShape>()(
  'foghorn/services/Pages'
) {
  static readonly layer = Layer.effect(
    Pages,
    Effect.gen(function* () {
      const database = yield* Database
      const sites = yield* Sites

      const list = Effect.fn('Pages.list')(function* (input: {
        limit: number | undefined
        offset: number | undefined
        search: string | undefined
        siteId: string | undefined
        userId: string
      }) {
        const limit = input.limit ?? pageListLimit.default
        const offset = input.offset ?? 0
        const siteList = yield* sites.listModels(input)

        if (siteList.length === 0) {
          return {
            pages: [],
            pagination: makePagination({ limit, offset, total: 0 })
          }
        }

        // A plain, case-insensitive text match. The search text is escaped,
        // so it never acts as a regular expression.
        const search = input.search?.trim()
        const searchFilter = search
          ? {
              $or: [
                { url: { $options: 'i', $regex: escapeRegExp(search) } },
                { path: { $options: 'i', $regex: escapeRegExp(search) } }
              ]
            }
          : {}
        const filter = {
          siteId: { $in: siteList.map((site) => site.id) },
          ...searchFilter
        }

        const collection = yield* database.collection('pages')
        const [total, documents] = yield* database.use('Pages.list', () =>
          Promise.all([
            collection.countDocuments(filter),
            collection
              .find(filter)
              .project<StoredDocument>(pageSummaryProjection)
              // Key order matters here: by URL, then by ID for a stable order.
              .sort({ url: 1, _id: 1 })
              .skip(offset)
              .limit(limit)
              .toArray()
          ])
        )
        const now = yield* Clock.currentTimeMillis

        return {
          pages: documents.map((document) =>
            toPageSummaryDto(readPageSummary(document), now)
          ),
          pagination: makePagination({ limit, offset, total })
        }
      })

      const get = Effect.fn('Pages.get')(function* (input: {
        pageId: string
        userId: string
      }) {
        const page = yield* database.use('Page.find', () =>
          Page.find(input.pageId)
        )

        if (!page) {
          return yield* new PageNotFound({
            message:
              'Page not found. Check the ID against the list of pages for the site.'
          })
        }

        yield* sites.require({ siteId: page.siteId, userId: input.userId })

        return toPageDto(page, yield* Clock.currentTimeMillis)
      })

      return Pages.of({ get, list })
    })
  )
}
