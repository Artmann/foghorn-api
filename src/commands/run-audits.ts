import 'dotenv/config'

import { program } from 'commander'
import dayjs from 'dayjs'
import { connectionHandler } from 'esix'

import { Logger } from '../lib/logger'
import {
  Page,
  type AuditResult,
  type CategoryResult,
  type FieldMetric,
  type PageAuditReport
} from '../models/page'

program
  .description('Run PageSpeed Insights audits on pages')
  .option('--limit <number>', 'maximum number of pages to audit', '10')
  .option('--concurrency <number>', 'number of concurrent workers (max 5)', '5')
  .option('--delay <number>', 'delay in seconds between audits per worker', '3')
  .parse()

const opts = program.opts()
const limit = parseInt(opts.limit, 10)
const concurrency = Math.min(parseInt(opts.concurrency, 10), 5)
const delayMs = Math.max(parseFloat(opts.delay), 0) * 1000
const logger = new Logger(process.env.AXIOM_TOKEN)

const PAGESPEED_API_KEY = process.env.PAGESPEED_API_KEY

function extractFieldData(
  loadingExperience: Record<string, unknown> | undefined
): Record<string, FieldMetric> | null {
  if (!loadingExperience) return null

  const metrics = loadingExperience.metrics as
    | Record<string, Record<string, unknown>>
    | undefined

  if (!metrics) return null

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
    if (!audit) continue

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

async function auditPage(page: Page): Promise<void> {
  logger.info(`Auditing ${page.url}...`)

  try {
    const params = new URLSearchParams({
      url: page.url,
      strategy: 'mobile',
      category: 'performance'
    })

    params.append('category', 'accessibility')
    params.append('category', 'best-practices')
    params.append('category', 'seo')

    if (PAGESPEED_API_KEY) {
      params.set('key', PAGESPEED_API_KEY)
    }

    const apiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`

    const startMs = Date.now()

    let response: Response

    try {
      response = await fetch(apiUrl, { signal: AbortSignal.timeout(60_000) })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new Error(`Timeout auditing ${page.url}`)
      }
      throw error
    }

    const durationMs = Date.now() - startMs

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

    page.auditReport = report
    page.lastAuditedAt = dayjs().valueOf()
    page.auditError = null
    await page.save()

    logger.info(
      `Audited ${page.url} in ${durationMs}ms (performance: ${report.performance.score})`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    logger.error(`Error auditing ${page.url}: ${message}`)

    page.lastAuditedAt = dayjs().valueOf()
    page.auditError = message
    await page.save()
  }
}

async function runPool(pages: Page[], concurrency: number): Promise<void> {
  let index = 0

  async function worker(): Promise<void> {
    let first = true

    while (index < pages.length) {
      if (!first && delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
      first = false

      const page = pages[index++]

      await auditPage(page)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, pages.length) }, () => worker())
  )
}

async function main(): Promise<void> {
  logger.info(
    `Fetching up to ${limit} pages to audit (concurrency: ${concurrency})...`
  )

  const pages = await Page.all()

  pages.sort((a, b) => {
    if (a.lastAuditedAt === null && b.lastAuditedAt === null) return 0
    if (a.lastAuditedAt === null) return -1
    if (b.lastAuditedAt === null) return 1
    return a.lastAuditedAt - b.lastAuditedAt
  })

  const pagesToAudit = pages.slice(0, limit)

  if (pagesToAudit.length === 0) {
    logger.info('No pages to audit.')
    await connectionHandler.closeConnections()
    return
  }

  logger.info(`Found ${pagesToAudit.length} pages to audit.`)

  await runPool(pagesToAudit, concurrency)

  logger.info('Done.')

  await logger.flush()
  await connectionHandler.closeConnections()
}

main().catch(async (error) => {
  logger.error('Fatal error', { error: String(error) })
  await logger.flush()
  await connectionHandler.closeConnections()
  process.exit(1)
})
