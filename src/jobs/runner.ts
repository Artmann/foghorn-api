import { hostname } from 'node:os'

import { Clock, type Duration, Effect } from 'effect'

import { JobQueue } from '../services/job-queue'
import { JobRunners } from '../services/job-runners'
import { auditPages } from './audit-pages'
import { scrapeSite } from './scrape-site'

export interface RunnerOptions {
  // Sites and pages to pick up per cycle.
  readonly batchSize: number
  readonly concurrency: number
  // Pause between audits per worker.
  readonly delay: Duration.Input
  // Pause when there is nothing to do.
  readonly idleDelay: Duration.Input
  readonly once: boolean
  readonly only: 'all' | 'audits' | 'sitemaps'
  // Pause after PageSpeed rate limits us.
  readonly rateLimitDelay: Duration.Input
}

export interface CycleResult {
  readonly rateLimited: boolean
  readonly workCount: number
}

// Scrapes the sitemaps that are due, then audits the pages that are due. Pages
// are looked up after scraping so new pages are audited in the same cycle.
export const runCycle = Effect.fn('runCycle')(function* (
  options: RunnerOptions
) {
  const jobQueue = yield* JobQueue
  let workCount = 0

  if (options.only !== 'audits') {
    const sites = yield* jobQueue.findSitesDueForScrape(
      yield* Clock.currentTimeMillis,
      options.batchSize
    )

    if (sites.length > 0) {
      yield* Effect.logInfo(`Scraping ${sites.length} sitemaps.`)
      yield* Effect.forEach(
        sites,
        (site) => Effect.uninterruptible(scrapeSite(site)),
        { concurrency: options.concurrency, discard: true }
      )
    }

    workCount += sites.length
  }

  if (options.only === 'sitemaps') {
    return { rateLimited: false, workCount }
  }

  const pages = yield* jobQueue.findPagesDueForAudit(
    yield* Clock.currentTimeMillis,
    options.batchSize
  )

  if (pages.length === 0) {
    return { rateLimited: false, workCount }
  }

  yield* Effect.logInfo(`Auditing ${pages.length} pages.`)

  const { rateLimited } = yield* auditPages(pages, options)

  return { rateLimited, workCount: workCount + pages.length }
})

// Runs cycles until interrupted. Records a heartbeat so the API can tell
// whether anything is processing jobs.
export const runJobs = Effect.fn('runJobs')(function* (options: RunnerOptions) {
  const jobRunners = yield* JobRunners

  yield* jobRunners.heartbeat(hostname())

  while (true) {
    const result = yield* runCycle(options).pipe(
      Effect.catchTags({
        DatabaseError: (error) =>
          Effect.logError(
            'Job cycle failed. Retrying after the idle delay.'
          ).pipe(
            Effect.annotateLogs({ error: error.message }),
            Effect.as({ rateLimited: false, workCount: 0 })
          )
      })
    )

    if (options.once) {
      return
    }

    if (result.rateLimited) {
      yield* Effect.logWarning(
        'Pausing audits because PageSpeed Insights is rate limiting requests.'
      )
      yield* Effect.sleep(options.rateLimitDelay)
    } else if (result.workCount === 0) {
      yield* Effect.sleep(options.idleDelay)
    }
  }
}, Effect.scoped)
