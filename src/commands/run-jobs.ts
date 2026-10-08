import { BunRuntime, BunServices } from '@effect/platform-bun'
import { Config, Duration, Effect, Layer, Option } from 'effect'
import { Command, Flag } from 'effect/cli'
import { FetchHttpClient } from 'effect/http'

import { runJobs } from '../jobs/runner'
import { Database } from '../services/database'
import { JobQueue } from '../services/job-queue'
import { JobRunners } from '../services/job-runners'
import { LoggingLive } from '../services/logging'
import { PageSpeed } from '../services/page-speed'
import { SitemapReader } from '../services/sitemap-reader'

const JobsLive = Layer.mergeAll(
  JobQueue.layer,
  JobRunners.layer,
  PageSpeed.layer,
  SitemapReader.layer
).pipe(
  Layer.provideMerge(Database.layer),
  Layer.provide(FetchHttpClient.layer),
  Layer.provideMerge(LoggingLive)
)

// Fails with a clear message instead of a config error deep in a layer.
const checkEnvironment = Effect.gen(function* () {
  const missing: string[] = []

  for (const name of ['DB_URL', 'DB_DATABASE']) {
    const value = yield* Config.option(Config.String(name))

    if (Option.isNone(value) || value.value.length === 0) {
      missing.push(name)
    }
  }

  if (missing.length > 0) {
    return yield* Effect.fail(
      new Error(
        `Missing environment variables: ${missing.join(', ')}. Add them to .env.production (see .env.example).`
      )
    )
  }

  const pageSpeedKey = yield* Config.option(Config.String('PAGESPEED_API_KEY'))

  if (Option.isNone(pageSpeedKey) || pageSpeedKey.value.length === 0) {
    yield* Effect.logWarning(
      'PAGESPEED_API_KEY is not set. PageSpeed Insights will rate limit audits quickly. Create a key in Google Cloud and add it to .env.production.'
    )
  }

  const database = yield* Config.String('DB_DATABASE')
  const url = yield* Config.String('DB_URL')
  yield* Effect.logInfo(`Job runner using ${database} on ${getHost(url)}.`)
})

function getHost(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'the configured host'
  }
}

const command = Command.make(
  'run-jobs',
  {
    batchSize: Flag.Int('batch-size').pipe(
      Flag.withDescription('Sites and pages to pick up per cycle'),
      Flag.withDefault(10)
    ),
    concurrency: Flag.Int('concurrency').pipe(
      Flag.withDescription('Number of concurrent workers (max 5)'),
      Flag.withDefault(5)
    ),
    delay: Flag.Finite('delay').pipe(
      Flag.withDescription('Seconds between audits per worker'),
      Flag.withDefault(3)
    ),
    idleDelay: Flag.Finite('idle-delay').pipe(
      Flag.withDescription('Seconds to wait when there is nothing to do'),
      Flag.withDefault(60)
    ),
    once: Flag.Boolean('once').pipe(
      Flag.withDescription('Run a single cycle and exit'),
      Flag.withDefault(false)
    ),
    only: Flag.Literals('only', ['all', 'sitemaps', 'audits']).pipe(
      Flag.withDescription('Only scrape sitemaps or only run audits'),
      Flag.withDefault('all')
    ),
    rateLimitDelay: Flag.Finite('rate-limit-delay').pipe(
      Flag.withDescription(
        'Seconds to pause audits after PageSpeed Insights rate limits us'
      ),
      Flag.withDefault(300)
    )
  },
  (flags) =>
    Effect.gen(function* () {
      yield* checkEnvironment

      yield* runJobs({
        batchSize: Math.max(1, flags.batchSize),
        concurrency: Math.min(Math.max(1, flags.concurrency), 5),
        delay: Duration.seconds(Math.max(0, flags.delay)),
        idleDelay: Duration.seconds(Math.max(0, flags.idleDelay)),
        once: flags.once,
        only: flags.only,
        rateLimitDelay: Duration.seconds(Math.max(0, flags.rateLimitDelay))
      }).pipe(
        Effect.provide(JobsLive),
        Effect.ensuring(Effect.logInfo('Job runner stopped.'))
      )
    })
).pipe(
  Command.withDescription(
    'Scrape sitemaps and audit pages that are due. Runs until stopped.'
  )
)

// `runMain` interrupts the program on SIGINT and SIGTERM. Audits that have
// started finish first, then the heartbeat is marked as stopped.
Command.run(command, { version: '1.0.0' }).pipe(
  Effect.provide(Layer.mergeAll(BunServices.layer, LoggingLive)),
  BunRuntime.runMain
)
