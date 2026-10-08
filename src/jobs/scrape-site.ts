import { Clock, Effect } from 'effect'

import { Page } from '../models/page'
import type { Site } from '../models/site'
import { Database } from '../services/database'
import { JobQueue } from '../services/job-queue'
import { SitemapReader } from '../services/sitemap-reader'

export const maxPagesPerSite = 250

// Makes the site's pages match the sitemap: removes pages that are no longer
// in it (or belong to an old domain) and adds new ones up to `maxPages`.
const syncPages = Effect.fn('syncPages')(function* (
  site: Site,
  urls: string[],
  maxPages: number
) {
  const database = yield* Database
  const jobQueue = yield* JobQueue
  const sitemapUrls = new Set(urls)
  const existingPages = yield* jobQueue.findPageUrls(site.id)

  const removedIds = existingPages
    .filter((page) => !sitemapUrls.has(page.url))
    .map((page) => page.id)

  if (removedIds.length > 0) {
    yield* database.use('Page.delete', () =>
      Page.whereIn('id', removedIds).delete()
    )
  }

  const keptPaths = new Set(
    existingPages
      .filter((page) => sitemapUrls.has(page.url))
      .map((page) => page.path)
  )

  // Keep the first URL for each path, in sitemap order.
  const newPages = new Map<string, string>()

  for (const url of urls) {
    let path: string

    try {
      path = new URL(url).pathname
    } catch {
      continue
    }

    if (!keptPaths.has(path) && !newPages.has(path)) {
      newPages.set(path, url)
    }
  }

  const remainingSlots = Math.max(0, maxPages - keptPaths.size)
  const pagesToAdd = [...newPages].slice(0, remainingSlots)

  for (const [path, url] of pagesToAdd) {
    yield* database.use('Page.create', () =>
      Page.create({ path, siteId: site.id, url })
    )
  }

  return { added: pagesToAdd.length, removed: removedIds.length }
})

// Reads the site's sitemap and syncs its pages. A failed scrape is recorded on
// the site instead of failing the effect, unless the database is down.
export const scrapeSite = Effect.fn('scrapeSite')(function* (
  site: Site,
  maxPages: number = maxPagesPerSite
) {
  const jobQueue = yield* JobQueue
  const sitemapReader = yield* SitemapReader
  const sitemapUrl = `https://${site.domain}${site.sitemapPath}`

  yield* Effect.logInfo(`Scraping ${site.domain}${site.sitemapPath}...`)
  yield* jobQueue.markScrapeStarted(site.id, yield* Clock.currentTimeMillis)

  const scrapeSitemapError = yield* Effect.gen(function* () {
    const urls = yield* sitemapReader.read(sitemapUrl)

    // An empty sitemap is almost always a broken one. Don't delete every page
    // because of it.
    if (urls.length === 0) {
      return `The sitemap at ${sitemapUrl} has no URLs. Check that the sitemap path points to the right file.`
    }

    const { added, removed } = yield* syncPages(site, urls, maxPages)

    yield* Effect.logInfo(
      `Found ${urls.length} URLs for ${site.domain}. Added ${added} pages and removed ${removed}.`
    )

    return null
  }).pipe(
    Effect.catchTag('SitemapFetchFailed', (error) =>
      Effect.succeed(error.message)
    )
  )

  if (scrapeSitemapError !== null) {
    yield* Effect.logError(
      `Error scraping ${site.domain}: ${scrapeSitemapError}`
    )
  }

  yield* jobQueue.markScrapeFinished(site, {
    lastScrapedSitemapAt: yield* Clock.currentTimeMillis,
    scrapeSitemapError
  })
})
