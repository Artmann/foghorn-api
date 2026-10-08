import { Clock, type Duration, Effect, Ref } from 'effect'

import type { Page } from '../models/page'
import { JobQueue } from '../services/job-queue'
import { PageSpeed } from '../services/page-speed'

// Audits one page and records the result. A failed audit is recorded on the
// page. Fails with `PageSpeedRateLimited` after releasing the page, since a
// rate limit says nothing about the page.
export const auditPage = Effect.fn('auditPage')(function* (page: Page) {
  const jobQueue = yield* JobQueue
  const pageSpeed = yield* PageSpeed

  yield* Effect.logInfo(`Auditing ${page.url}...`)
  yield* jobQueue.markAuditStarted(page.id, yield* Clock.currentTimeMillis)

  const result = yield* pageSpeed.audit(page.url).pipe(
    Effect.map((report) => ({ auditError: null, auditReport: report })),
    Effect.catchTag('PageSpeedFailed', (error) =>
      Effect.succeed({ auditError: error.message, auditReport: undefined })
    ),
    Effect.tapErrorTag('PageSpeedRateLimited', () =>
      jobQueue.markAuditReleased(page.id)
    )
  )

  const lastAuditedAt = yield* Clock.currentTimeMillis

  if (result.auditError !== null) {
    yield* Effect.logError(`Error auditing ${page.url}: ${result.auditError}`)

    // Leave out `auditReport` so the last successful report is kept.
    yield* jobQueue.markAuditFinished(page.id, {
      auditError: result.auditError,
      lastAuditedAt
    })

    return
  }

  yield* Effect.logInfo(
    `Audited ${page.url} in ${result.auditReport.durationMs}ms (performance: ${result.auditReport.performance.score})`
  )

  yield* jobQueue.markAuditFinished(page.id, {
    auditError: null,
    auditReport: result.auditReport,
    lastAuditedAt
  })
})

// Audits pages in parallel. Each worker waits `delay` between audits. Stops
// picking up new pages once PageSpeed rate limits. Audits that have started
// always finish, so stopping the runner never leaves a page half done.
export const auditPages = Effect.fn('auditPages')(function* (
  pages: Page[],
  options: { concurrency: number; delay: Duration.Input }
) {
  const rateLimited = yield* Ref.make(false)

  yield* Effect.forEach(
    pages,
    (page, index) =>
      Effect.gen(function* () {
        if (yield* Ref.get(rateLimited)) {
          return
        }

        if (index >= options.concurrency) {
          yield* Effect.sleep(options.delay)
        }

        if (yield* Ref.get(rateLimited)) {
          return
        }

        yield* Effect.uninterruptible(
          auditPage(page).pipe(
            Effect.catchTag('PageSpeedRateLimited', (error) =>
              Effect.gen(function* () {
                if (!(yield* Ref.getAndSet(rateLimited, true))) {
                  yield* Effect.logWarning(error.message)
                }
              })
            )
          )
        )
      }),
    { concurrency: options.concurrency, discard: true }
  )

  return { rateLimited: yield* Ref.get(rateLimited) }
})
