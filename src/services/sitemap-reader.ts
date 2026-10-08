import { Context, Duration, Effect, Layer, Schema } from 'effect'
import { HttpClient } from 'effect/http'

import { parseSitemap } from '../lib/sitemap'

export class SitemapFetchFailed extends Schema.TaggedError<SitemapFetchFailed>()(
  'SitemapFetchFailed',
  { message: Schema.String }
) {}

export interface SitemapReaderShape {
  // Returns every page URL in the sitemap, following sitemap indexes.
  readonly read: (url: string) => Effect.Effect<string[], SitemapFetchFailed>
}

// Sitemap indexes can point to other indexes. Stop after a few levels.
const maxDepth = 3

// The protocol allows 50,000 URLs per sitemap. Stop collecting after that so a
// huge index can't use unbounded memory.
const maxUrls = 50_000

const timeout = Duration.seconds(15)

export class SitemapReader extends Context.Service<
  SitemapReader,
  SitemapReaderShape
>()('foghorn/services/SitemapReader') {
  static readonly layer = Layer.effect(
    SitemapReader,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient

      const fetchXml = Effect.fn('SitemapReader.fetchXml')(function* (
        url: string
      ) {
        const response = yield* client.get(url).pipe(
          Effect.timeout(timeout),
          Effect.catchTag('TimeoutError', () =>
            Effect.fail(
              new SitemapFetchFailed({ message: `Timeout fetching ${url}` })
            )
          ),
          Effect.catchTag('HttpClientError', (error) =>
            Effect.fail(
              new SitemapFetchFailed({
                message: `Could not fetch ${url}: ${error.message}`
              })
            )
          )
        )

        if (response.status < 200 || response.status >= 300) {
          return yield* new SitemapFetchFailed({
            message: `HTTP ${response.status} fetching ${url}`
          })
        }

        return yield* response.text.pipe(
          Effect.catchTag('HttpClientError', () =>
            Effect.fail(
              new SitemapFetchFailed({
                message: `Could not read the response from ${url}`
              })
            )
          )
        )
      })

      const collect = (
        url: string,
        depth: number,
        urls: string[]
      ): Effect.Effect<void, SitemapFetchFailed> =>
        Effect.gen(function* () {
          if (depth > maxDepth || urls.length >= maxUrls) {
            return
          }

          const sitemap = parseSitemap(yield* fetchXml(url))

          if (sitemap.kind === 'index') {
            for (const nested of sitemap.sitemaps) {
              yield* collect(nested, depth + 1, urls)
            }
          } else if (sitemap.kind === 'urlset') {
            urls.push(...sitemap.urls.slice(0, maxUrls - urls.length))
          }
        })

      const read = Effect.fn('SitemapReader.read')(function* (url: string) {
        const urls: string[] = []

        yield* collect(url, 0, urls)

        return urls
      })

      return SitemapReader.of({ read })
    })
  )
}
