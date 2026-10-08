import { Clock, Context, Effect, Layer } from 'effect'

import {
  NotTeamMember,
  PageNotFound,
  SiteNotFound,
  TeamNotFound
} from '../api/errors'
import type { PageDto } from '../api/schemas'
import { Page, toPageDto } from '../models/page'
import { Database, type DatabaseError } from './database'
import { Sites } from './sites'

type AccessError = DatabaseError | NotTeamMember | SiteNotFound | TeamNotFound

export interface PagesShape {
  readonly get: (input: {
    pageId: string
    userId: string
  }) => Effect.Effect<PageDto, AccessError | PageNotFound>
  readonly list: (input: {
    search: string | undefined
    siteId: string | undefined
    userId: string
  }) => Effect.Effect<PageDto[], AccessError>
  // The pages of every site the user can see, or of one site.
  readonly listModels: (input: {
    siteId: string | undefined
    userId: string
  }) => Effect.Effect<Page[], AccessError>
}

export class Pages extends Context.Service<Pages, PagesShape>()(
  'foghorn/services/Pages'
) {
  static readonly layer = Layer.effect(
    Pages,
    Effect.gen(function* () {
      const database = yield* Database
      const sites = yield* Sites

      const listModels = Effect.fn('Pages.listModels')(function* (input: {
        siteId: string | undefined
        userId: string
      }) {
        const siteList = yield* sites.listModels(input)

        if (siteList.length === 0) {
          return []
        }

        return yield* database.use('Page.whereIn', () =>
          Page.whereIn(
            'siteId',
            siteList.map((site) => site.id)
          ).get()
        )
      })

      const list = Effect.fn('Pages.list')(function* (input: {
        search: string | undefined
        siteId: string | undefined
        userId: string
      }) {
        const now = yield* Clock.currentTimeMillis
        const search = input.search?.trim().toLowerCase()
        let pages = yield* listModels(input)

        // A plain, case-insensitive text match. User input is never turned
        // into a regular expression.
        if (search) {
          pages = pages.filter(
            (page) =>
              page.url.toLowerCase().includes(search) ||
              page.path.toLowerCase().includes(search)
          )
        }

        return pages.map((page) => toPageDto(page, now))
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
              'Page not found. List the pages with GET /pages?siteId=... to find the right ID.'
          })
        }

        yield* sites.require({ siteId: page.siteId, userId: input.userId })

        return toPageDto(page, yield* Clock.currentTimeMillis)
      })

      return Pages.of({ get, list, listModels })
    })
  )
}
