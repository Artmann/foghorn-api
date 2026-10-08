import 'dotenv/config'

import { program } from 'commander'
import { connectionHandler } from 'esix'

import { findPagesDueForAudit, findSitesDueForScrape } from '../lib/job-queue'
import { Logger } from '../lib/logger'
import { runPool } from '../lib/run-pool'
import { sleep } from '../lib/sleep'
import { auditPages } from './run-audits'
import { scrapeSite } from './scrape-sitemaps'

program
  .description(
    'Keep scraping sitemaps and auditing pages that are due. Runs until stopped.'
  )
  .option('--batch-size <number>', 'sites and pages to pick up per cycle', '10')
  .option('--concurrency <number>', 'number of concurrent workers (max 5)', '5')
  .option('--delay <number>', 'delay in seconds between audits per worker', '3')
  .option(
    '--idle-delay <number>',
    'seconds to wait when there is nothing to do',
    '60'
  )
  .option('--once', 'run a single cycle and exit')
  .option(
    '--rate-limit-delay <number>',
    'seconds to wait when PageSpeed Insights rate limits us',
    '300'
  )
  .parse()

const options = program.opts()
const batchSize = parseInt(options.batchSize, 10)
const concurrency = Math.min(parseInt(options.concurrency, 10), 5)
const delayMs = Math.max(parseFloat(options.delay), 0) * 1000
const idleDelayMs = Math.max(parseFloat(options.idleDelay), 0) * 1000
const rateLimitDelayMs = Math.max(parseFloat(options.rateLimitDelay), 0) * 1000
const runOnce = options.once === true

const logger = new Logger(process.env.AXIOM_TOKEN)
const stopController = new AbortController()

function describeDatabase(): string {
  const database = process.env.DB_DATABASE ?? ''

  try {
    const host = new URL(process.env.DB_URL ?? '').host

    return `${database} on ${host}`
  } catch {
    return database
  }
}

function requireEnvironment(): void {
  const missing = ['DB_URL', 'DB_DATABASE'].filter((name) => !process.env[name])

  if (missing.length > 0) {
    throw new Error(
      `Missing environment variables: ${missing.join(', ')}. Add them to .env.production (see .env.example).`
    )
  }

  if (!process.env.PAGESPEED_API_KEY) {
    logger.warn(
      'PAGESPEED_API_KEY is not set. PageSpeed Insights will rate limit audits quickly. Create a key in Google Cloud and add it to .env.production.'
    )
  }
}

interface CycleResult {
  rateLimited: boolean
  workCount: number
}

// Runs one cycle and returns how many sites and pages it picked up.
async function runCycle(signal: AbortSignal): Promise<CycleResult> {
  const sites = await findSitesDueForScrape(Date.now(), batchSize)

  if (sites.length > 0) {
    logger.info(`Scraping ${sites.length} sitemaps.`)

    await runPool(sites, { concurrency, signal }, (site) =>
      scrapeSite(site, logger)
    )
  }

  if (signal.aborted) {
    return { rateLimited: false, workCount: sites.length }
  }

  // Look for pages after scraping so new pages are audited in the same cycle.
  const pages = await findPagesDueForAudit(Date.now(), batchSize)

  if (pages.length === 0) {
    return { rateLimited: false, workCount: sites.length }
  }

  logger.info(`Auditing ${pages.length} pages.`)

  const { rateLimited } = await auditPages(pages, logger, {
    concurrency,
    delayMs,
    signal
  })

  return { rateLimited, workCount: sites.length + pages.length }
}

async function main(): Promise<void> {
  requireEnvironment()

  logger.info(`Job runner started against ${describeDatabase()}.`, {
    batchSize,
    concurrency,
    delayMs,
    idleDelayMs,
    rateLimitDelayMs
  })

  const signal = stopController.signal

  while (!signal.aborted) {
    let result: CycleResult = { rateLimited: false, workCount: 0 }

    try {
      result = await runCycle(signal)
    } catch (error) {
      logger.error('Job cycle failed. Retrying after the idle delay.', {
        error: error instanceof Error ? error.message : String(error)
      })
    }

    await logger.flush()

    if (runOnce) {
      break
    }

    if (result.rateLimited) {
      logger.warn(
        `Pausing audits for ${rateLimitDelayMs / 1000} seconds because of rate limiting.`
      )
      await sleep(rateLimitDelayMs, signal)
    } else if (result.workCount === 0) {
      await sleep(idleDelayMs, signal)
    }
  }

  logger.info('Job runner stopped.')
}

function stop(signalName: string): void {
  if (stopController.signal.aborted) {
    logger.warn(`Received ${signalName} again. Exiting without waiting.`)
    process.exit(1)
  }

  logger.info(
    `Received ${signalName}. Finishing the current work before stopping.`
  )
  stopController.abort()
}

const onSigint = () => stop('SIGINT')
const onSigterm = () => stop('SIGTERM')

process.on('SIGINT', onSigint)
process.on('SIGTERM', onSigterm)

try {
  await main()
} catch (error) {
  logger.error('Job runner crashed.', {
    error: error instanceof Error ? error.message : String(error)
  })
  process.exitCode = 1
} finally {
  process.off('SIGINT', onSigint)
  process.off('SIGTERM', onSigterm)
  await logger.flush()
  await connectionHandler.closeConnections()
}
