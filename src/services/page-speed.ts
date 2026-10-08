import {
  Clock,
  Config,
  Context,
  Duration,
  Effect,
  Layer,
  Redacted,
  Schedule,
  Schema
} from 'effect'
import { HttpClient } from 'effect/http'

import { toPageAuditReport } from '../lib/page-speed-report'
import type { PageAuditReport } from '../models/page'

// PageSpeed answered 429. Says nothing about the page, so callers should back
// off instead of recording a failed audit.
export class PageSpeedRateLimited extends Schema.TaggedError<PageSpeedRateLimited>()(
  'PageSpeedRateLimited',
  { message: Schema.String }
) {}

// The audit failed. `message` is stored on the page as its audit error.
export class PageSpeedFailed extends Schema.TaggedError<PageSpeedFailed>()(
  'PageSpeedFailed',
  { message: Schema.String }
) {}

// A failure that may go away on retry: a network error or a 5xx response.
class PageSpeedUnavailable extends Schema.TaggedError<PageSpeedUnavailable>()(
  'PageSpeedUnavailable',
  { message: Schema.String }
) {}

export interface PageSpeedShape {
  readonly audit: (
    url: string
  ) => Effect.Effect<PageAuditReport, PageSpeedFailed | PageSpeedRateLimited>
}

export interface PageSpeedOptions {
  // How often to retry network errors and 5xx responses.
  readonly retries: number
  readonly retryDelay: Duration.Input
  readonly timeout: Duration.Input
}

const defaultOptions: PageSpeedOptions = {
  retries: 2,
  retryDelay: '2 seconds',
  timeout: '60 seconds'
}

const endpoint = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed'

export class PageSpeed extends Context.Service<PageSpeed, PageSpeedShape>()(
  'foghorn/services/PageSpeed'
) {
  static readonly layerWith = (options: Partial<PageSpeedOptions> = {}) =>
    Layer.effect(
      PageSpeed,
      Effect.gen(function* () {
        const settings = { ...defaultOptions, ...options }
        const client = yield* HttpClient.HttpClient
        const apiKey = yield* Config.Redacted('PAGESPEED_API_KEY').pipe(
          Config.withDefault(Redacted.make(''))
        )

        const buildUrl = (url: string) => {
          const params = new URLSearchParams({ strategy: 'mobile', url })

          for (const category of [
            'performance',
            'accessibility',
            'best-practices',
            'seo'
          ]) {
            params.append('category', category)
          }

          const key = Redacted.value(apiKey)

          if (key.length > 0) {
            params.set('key', key)
          }

          return `${endpoint}?${params}`
        }

        const request = (url: string) =>
          Effect.gen(function* () {
            const response = yield* client.get(buildUrl(url)).pipe(
              Effect.timeout(settings.timeout),
              Effect.catchTag('TimeoutError', () =>
                Effect.fail(
                  new PageSpeedFailed({ message: `Timeout auditing ${url}` })
                )
              ),
              Effect.catchTag('HttpClientError', (error) =>
                Effect.fail(
                  new PageSpeedUnavailable({
                    message: `Could not reach PageSpeed Insights while auditing ${url}: ${error.message}`
                  })
                )
              )
            )

            if (response.status === 429) {
              return yield* new PageSpeedRateLimited({
                message:
                  'PageSpeed Insights is rate limiting requests. Set PAGESPEED_API_KEY or lower the concurrency.'
              })
            }

            if (response.status >= 500) {
              return yield* new PageSpeedUnavailable({
                message: `HTTP ${response.status} auditing ${url}`
              })
            }

            if (response.status >= 400) {
              return yield* new PageSpeedFailed({
                message: `HTTP ${response.status} auditing ${url}`
              })
            }

            return yield* response.json.pipe(
              Effect.catchTag('HttpClientError', () =>
                Effect.fail(
                  new PageSpeedFailed({
                    message: `PageSpeed Insights returned invalid JSON for ${url}`
                  })
                )
              )
            )
          })

        const audit = Effect.fn('PageSpeed.audit')(function* (url: string) {
          const startedAt = yield* Clock.currentTimeMillis
          const data = yield* request(url).pipe(
            Effect.retry({
              schedule: Schedule.exponential(settings.retryDelay),
              times: settings.retries,
              while: (error) => error._tag === 'PageSpeedUnavailable'
            }),
            Effect.catchTag('PageSpeedUnavailable', (error) =>
              Effect.fail(new PageSpeedFailed({ message: error.message }))
            )
          )
          const durationMs = (yield* Clock.currentTimeMillis) - startedAt
          const report = toPageAuditReport(data, durationMs)

          if (!report) {
            return yield* new PageSpeedFailed({
              message: `PageSpeed Insights returned no Lighthouse result for ${url}`
            })
          }

          return report
        })

        return PageSpeed.of({ audit })
      })
    )

  static readonly layer = PageSpeed.layerWith()
}
