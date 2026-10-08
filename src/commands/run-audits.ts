import 'dotenv/config'

import { program } from 'commander'
import dayjs from 'dayjs'
import { connectionHandler } from 'esix'

import {
  findPagesDueForAudit,
  markAuditFinished,
  markAuditReleased,
  markAuditStarted
} from '../lib/job-queue'
import { Logger } from '../lib/logger'
import { runPool } from '../lib/run-pool'
import {
  type AuditResult,
  type CategoryResult,
  type FieldMetric,
  type Page,
  type PageAuditReport
} from '../models/page'

export class PageSpeedRateLimitError extends Error {
  constructor() {
    super(
      'PageSpeed Insights is rate limiting requests. Set PAGESPEED_API_KEY or lower the concurrency.'
    )
    this.name = 'PageSpeedRateLimitError'
  }
}

function extractFieldData(
  loadingExperience: Record<string, unknown> | undefined
): Record<string, FieldMetric> | null {
  if (!loadingExperience) {
    return null
  }

  const metrics = loadingExperience.metrics as
    | Record<string, Record<string, unknown>>
    | undefined

  if (!metrics) {
    return null
  }

  const fieldData: Record<string, FieldMetric> = {}

  for (const [key, value] of Object.entries(metrics)) {
    fieldData[key] = {
      percentile: value.percentile as number,
      distributions: value.distributions as FieldMetric['distributions'],
      category: value.category as string
    }
  }

  return fieldData
}

function extractCategory(
  categoryData: Record<string, unknown> | undefined,
  allAudits: Record<string, Record<string, unknown>>
): CategoryResult {
  if (!categoryData) {
    return { score: null, audits: [] }
  }

  const auditRefs = (categoryData.auditRefs as { id: string }[]) ?? []
  const audits: AuditResult[] = []

  for (const ref of auditRefs) {
    const audit = allAudits[ref.id]

    if (!audit) {
      continue
    }

    const result: AuditResult = {
      id: audit.id as string,
      title: audit.title as string,
      score: audit.score as number | null
    }

    if (audit.displayValue !== undefined) {
      result.displayValue = audit.displayValue as string
    }

    if (audit.numericValue !== undefined) {
      result.numericValue = audit.numericValue as number
    }

    audits.push(result)
  }

  return {
    score: categoryData.score as number | null,
    audits
  }
}

export async function auditPage(page: Page, logger: Logger): Promise<void> {
  logger.info(`Auditing ${page.url}...`)

  await markAuditStarted(page.id, dayjs().valueOf())

  try {
    const params = new URLSearchParams({
      url: page.url,
      strategy: 'mobile',
      category: 'performance'
    })

    params.append('category', 'accessibility')
    params.append('category', 'best-practices')
    params.append('category', 'seo')

    const pageSpeedApiKey = process.env.PAGESPEED_API_KEY

    if (pageSpeedApiKey) {
      params.set('key', pageSpeedApiKey)
    }

    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`

    const startMs = Date.now()

    let response: Response

    try {
      response = await fetch(apiUrl, { signal: AbortSignal.timeout(60_000) })
    } catch (error) {
      if (
        error instanceof DOMException &&
        (error.name === 'AbortError' || error.name === 'TimeoutError')
      ) {
        throw new Error(`Timeout auditing ${page.url}`)
      }

      throw error
    }

    const durationMs = Date.now() - startMs

    if (response.status === 429) {
      throw new PageSpeedRateLimitError()
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} auditing ${page.url}`)
    }

    const data = (await response.json()) as Record<string, unknown>
    const lighthouse = data.lighthouseResult as Record<string, unknown>
    const categories = lighthouse.categories as Record<
      string,
      Record<string, unknown>
    >
    const allAudits = lighthouse.audits as Record<
      string,
      Record<string, unknown>
    >

    const report: PageAuditReport = {
      fetchTime: lighthouse.fetchTime as string,
      finalUrl: lighthouse.finalUrl as string,
      durationMs,
      performance: extractCategory(categories.performance, allAudits),
      accessibility: extractCategory(categories.accessibility, allAudits),
      bestPractices: extractCategory(categories['best-practices'], allAudits),
      seo: extractCategory(categories.seo, allAudits),
      fieldData: extractFieldData(
        data.loadingExperience as Record<string, unknown> | undefined
      )
    }

    await markAuditFinished(page.id, {
      auditError: null,
      auditReport: report,
      lastAuditedAt: dayjs().valueOf()
    })

    logger.info(
      `Audited ${page.url} in ${durationMs}ms (performance: ${report.performance.score})`
    )
  } catch (error) {
    // Being rate limited says nothing about the page, so leave it as is and
    // let the caller back off.
    if (error instanceof PageSpeedRateLimitError) {
      await markAuditReleased(page.id)

      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown error'

    logger.error(`Error auditing ${page.url}: ${message}`)

    await markAuditFinished(page.id, {
      auditError: message,
      lastAuditedAt: dayjs().valueOf()
    })
  }
}

// Audits the pages in parallel. Stops picking up new pages when `signal`
// aborts or PageSpeed starts rate limiting.
export async function auditPages(
  pages: Page[],
  logger: Logger,
  options: { concurrency: number; delayMs: number; signal?: AbortSignal }
): Promise<{ rateLimited: boolean }> {
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  let rateLimited = false

  options.signal?.addEventListener('abort', onAbort, { once: true })

  try {
    await runPool(
      pages,
      {
        concurrency: options.concurrency,
        delayMs: options.delayMs,
        signal: controller.signal
      },
      async (page) => {
        try {
          await auditPage(page, logger)
        } catch (error) {
          if (!(error instanceof PageSpeedRateLimitError)) {
            throw error
          }

          if (!rateLimited) {
            logger.warn(error.message)
          }

          rateLimited = true
          controller.abort()
        }
      }
    )
  } finally {
    options.signal?.removeEventListener('abort', onAbort)
  }

  return { rateLimited }
}

if (import.meta.main) {
  program
    .description('Run PageSpeed Insights audits on pages that are due')
    .option('--limit <number>', 'maximum number of pages to audit', '10')
    .option(
      '--concurrency <number>',
      'number of concurrent workers (max 5)',
      '5'
    )
    .option(
      '--delay <number>',
      'delay in seconds between audits per worker',
      '3'
    )
    .parse()

  const options = program.opts()
  const limit = parseInt(options.limit, 10)
  const concurrency = Math.min(parseInt(options.concurrency, 10), 5)
  const delayMs = Math.max(parseFloat(options.delay), 0) * 1000
  const logger = new Logger(process.env.AXIOM_TOKEN)

  async function main(): Promise<void> {
    logger.info(
      `Fetching up to ${limit} pages to audit (concurrency: ${concurrency})...`
    )

    const pages = await findPagesDueForAudit(Date.now(), limit)

    if (pages.length === 0) {
      logger.info('No pages are due for an audit.')
    } else {
      logger.info(`Found ${pages.length} pages to audit.`)

      const { rateLimited } = await auditPages(pages, logger, {
        concurrency,
        delayMs
      })

      logger.info(
        rateLimited ? 'Stopped early because of rate limiting.' : 'Done.'
      )
    }

    await logger.flush()
    await connectionHandler.closeConnections()
  }

  main().catch(async (error) => {
    logger.error('Fatal error', { error: String(error) })
    await logger.flush()
    await connectionHandler.closeConnections()
    process.exit(1)
  })
}
