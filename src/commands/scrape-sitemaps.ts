import 'dotenv/config'

import { program } from 'commander'
import dayjs from 'dayjs'
import { connectionHandler } from 'esix'
import { XMLParser } from 'fast-xml-parser'

import {
  findPageUrls,
  findSitesDueForScrape,
  markScrapeFinished,
  markScrapeStarted
} from '../lib/job-queue'
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

  await markScrapeStarted(site.id, dayjs().valueOf())

  let scrapeSitemapError: string | null = null

  try {
    const sitemapUrl = `https://${site.domain}${site.sitemapPath}`
    const urls = await fetchSitemap(sitemapUrl)

    // An empty sitemap is almost always a broken one. Don't delete every page
    // because of it.
    if (urls.length === 0) {
      throw new Error(
        `The sitemap at ${sitemapUrl} has no URLs. Check that the sitemap path points to the right file.`
      )
    }

    const { added, removed } = await syncPages(site, urls, maxPages)

    logger.info(
      `Found ${urls.length} URLs for ${site.domain}. Added ${added} pages and removed ${removed}.`
    )
  } catch (error) {
    scrapeSitemapError =
      error instanceof Error ? error.message : 'Unknown error'

    logger.error(`Error scraping ${site.domain}: ${scrapeSitemapError}`)
  }

  await markScrapeFinished(site, {
    lastScrapedSitemapAt: dayjs().valueOf(),
    scrapeSitemapError
  })
}

// Makes the site's pages match the sitemap: removes pages that are no longer
// in it (or belong to an old domain) and adds new ones up to `maxPages`.
async function syncPages(
  site: Site,
  urls: string[],
  maxPages: number
): Promise<{ added: number; removed: number }> {
  const sitemapUrls = new Set(urls)
  const existingPages = await findPageUrls(site.id)

  const removedIds = existingPages
    .filter((page) => !sitemapUrls.has(page.url))
    .map((page) => page.id)

  if (removedIds.length > 0) {
    await Page.whereIn('id', removedIds).delete()
  }

  const keptPaths = new Set(
    existingPages
      .filter((page) => sitemapUrls.has(page.url))
      .map((page) => page.path)
  )

  // Keep the first URL for each path, in sitemap order.
  const newPages = new Map<string, string>()

  for (const url of urls) {
    const path = new URL(url).pathname

    if (!keptPaths.has(path) && !newPages.has(path)) {
      newPages.set(path, url)
    }
  }

  const remainingSlots = Math.max(0, maxPages - keptPaths.size)
  const pagesToAdd = [...newPages].slice(0, remainingSlots)

  for (const [path, url] of pagesToAdd) {
    await Page.create({ siteId: site.id, path, url })
  }

  return { added: pagesToAdd.length, removed: removedIds.length }
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
