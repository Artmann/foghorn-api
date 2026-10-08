import 'dotenv/config'

import { program } from 'commander'
import dayjs from 'dayjs'
import { connectionHandler } from 'esix'
import { XMLParser } from 'fast-xml-parser'

import { findSitesDueForScrape } from '../lib/job-queue'
import { Logger } from '../lib/logger'
import { runPool } from '../lib/run-pool'
import { Page } from '../models/page'
import type { Site } from '../models/site'

export const MAX_PAGES_PER_SITE = 250

export async function fetchSitemap(
  url: string,
  depth: number = 0
): Promise<string[]> {
  if (depth > 3) {
    return []
  }

  let response: Response

  try {
    response = await fetch(url, { signal: AbortSignal.timeout(15_000) })
  } catch (error) {
    if (
      error instanceof DOMException &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    ) {
      throw new Error(`Timeout fetching ${url}`)
    }
    throw error
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} fetching ${url}`)
  }

  const xml = await response.text()
  const parser = new XMLParser()
  const parsed = parser.parse(xml)

  const pages: string[] = []

  if (parsed.sitemapindex?.sitemap) {
    const sitemaps = Array.isArray(parsed.sitemapindex.sitemap)
      ? parsed.sitemapindex.sitemap
      : [parsed.sitemapindex.sitemap]

    for (const sitemap of sitemaps) {
      if (sitemap.loc) {
        const nested = await fetchSitemap(String(sitemap.loc), depth + 1)
        pages.push(...nested)
      }
    }
  } else if (parsed.urlset?.url) {
    const urls = Array.isArray(parsed.urlset.url)
      ? parsed.urlset.url
      : [parsed.urlset.url]

    for (const entry of urls) {
      if (entry.loc) {
        pages.push(String(entry.loc))
      }
    }
  }

  return pages
}

export async function scrapeSite(
  site: Site,
  logger: Logger,
  maxPages = MAX_PAGES_PER_SITE
): Promise<void> {
  logger.info(`Scraping ${site.domain}${site.sitemapPath}...`)

  try {
    const url = `https://${site.domain}${site.sitemapPath}`
    const allPages = await fetchSitemap(url)

    const existingPages = await Page.where('siteId', site.id).get()
    const remainingSlots = Math.max(0, maxPages - existingPages.length)
    const pages = allPages.slice(0, remainingSlots)

    for (const pageUrl of pages) {
      const path = new URL(pageUrl).pathname

      const existing = await Page.where('siteId', site.id)
        .where('path', path)
        .first()

      if (!existing) {
        await Page.create({ siteId: site.id, path, url: pageUrl })
      }
    }

    logger.info(`Found ${pages.length} pages for ${site.domain}`)

    site.lastScrapedSitemapAt = dayjs().valueOf()
    site.scrapeSitemapError = null
    await site.save()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'

    logger.error(`Error scraping ${site.domain}: ${message}`)

    site.lastScrapedSitemapAt = dayjs().valueOf()
    site.scrapeSitemapError = message
    await site.save()
  }
}

if (import.meta.main) {
  program
    .description('Scrape sitemaps for sites that are due')
    .option('--limit <number>', 'maximum number of sites to scrape', '10')
    .option(
      '--concurrency <number>',
      'number of concurrent workers (max 5)',
      '5'
    )
    .parse()

  const options = program.opts()
  const limit = parseInt(options.limit, 10)
  const concurrency = Math.min(parseInt(options.concurrency, 10), 5)
  const logger = new Logger(process.env.AXIOM_TOKEN)

  async function main(): Promise<void> {
    logger.info(
      `Fetching up to ${limit} sites to scrape (concurrency: ${concurrency})...`
    )

    const sites = await findSitesDueForScrape(Date.now(), limit)

    if (sites.length === 0) {
      logger.info('No sites are due for a scrape.')
    } else {
      logger.info(`Found ${sites.length} sites to scrape.`)

      await runPool(sites, { concurrency }, (site) => scrapeSite(site, logger))

      logger.info('Done.')
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
