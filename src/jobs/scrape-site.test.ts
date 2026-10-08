import { describe, expect, it, vi } from 'vitest'

import { Page } from '../models/page'
import { Site } from '../models/site'
import {
  createTestPage,
  createTestSite,
  createTestTeam,
  createTestUser,
  runWithServices
} from '../test-helpers'
import { maxPagesPerSite, scrapeSite } from './scrape-site'

function scrape(site: Site, maxPages?: number) {
  return runWithServices(scrapeSite(site, maxPages))
}

function buildSitemapXml(urls: string[]): string {
  const entries = urls.map((u) => `<url><loc>${u}</loc></url>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><urlset>${entries}</urlset>`
}

function mockSitemap(urls: string[]) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
    new Response(buildSitemapXml(urls), { status: 200 })
  )
}

async function setupSite(domain = 'example.com') {
  const { user } = await createTestUser()
  const team = await createTestTeam(user.id)

  return createTestSite(team.id, { domain, sitemapPath: '/sitemap.xml' })
}

async function getPageUrls(siteId: string) {
  const pages = await Page.where('siteId', siteId).get()

  return pages.map((page) => page.url).sort()
}

async function reloadSite(site: Site) {
  const reloaded = await Site.find(site.id)

  return {
    lastScrapedSitemapAt: reloaded?.lastScrapedSitemapAt,
    scrapeSitemapError: reloaded?.scrapeSitemapError,
    scrapeStartedAt: reloaded?.scrapeStartedAt
  }
}

describe('scrapeSite', () => {
  it('allows 250 pages per site', () => {
    expect(maxPagesPerSite).toEqual(250)
  })

  it('creates pages from the sitemap and records the scrape', async () => {
    const site = await setupSite()

    mockSitemap(['https://example.com/', 'https://example.com/about'])

    await scrape(site)

    expect(await getPageUrls(site.id)).toEqual([
      'https://example.com/',
      'https://example.com/about'
    ])
    expect(await reloadSite(site)).toEqual({
      lastScrapedSitemapAt: expect.any(Number),
      scrapeSitemapError: null,
      scrapeStartedAt: null
    })
  })

  it('limits pages scraped per site', async () => {
    const site = await setupSite()

    for (let i = 0; i < 3; i++) {
      await createTestPage(site.id, {
        path: `/existing-${i}`,
        url: `https://example.com/existing-${i}`
      })
    }

    // 3 existing pages are still in the sitemap and 5 are new, but maxPages
    // is 5, so only 2 new pages fit.
    const existingUrls = Array.from(
      { length: 3 },
      (_, i) => `https://example.com/existing-${i}`
    )
    const newUrls = Array.from(
      { length: 5 },
      (_, i) => `https://example.com/new-${i}`
    )

    mockSitemap([...existingUrls, ...newUrls])

    await scrape(site, 5)

    expect(await getPageUrls(site.id)).toEqual([
      ...existingUrls,
      'https://example.com/new-0',
      'https://example.com/new-1'
    ])
  })

  it('creates no pages when site already at limit', async () => {
    const site = await setupSite('full.example.com')
    const existingUrls = Array.from(
      { length: 3 },
      (_, i) => `https://full.example.com/page-${i}`
    )

    for (const url of existingUrls) {
      await createTestPage(site.id, { path: new URL(url).pathname, url })
    }

    mockSitemap([...existingUrls, 'https://full.example.com/extra-1'])

    await scrape(site, 3)

    expect(await getPageUrls(site.id)).toEqual(existingUrls)
  })

  it('removes pages that are no longer in the sitemap', async () => {
    const site = await setupSite()

    await createTestPage(site.id, {
      path: '/kept',
      url: 'https://example.com/kept'
    })
    await createTestPage(site.id, {
      path: '/removed',
      url: 'https://example.com/removed'
    })

    mockSitemap(['https://example.com/kept', 'https://example.com/new'])

    await scrape(site)

    expect(await getPageUrls(site.id)).toEqual([
      'https://example.com/kept',
      'https://example.com/new'
    ])
  })

  it('replaces pages from an old domain', async () => {
    const site = await setupSite('new.example.com')

    await createTestPage(site.id, {
      path: '/about',
      url: 'https://old.example.com/about'
    })

    mockSitemap(['https://new.example.com/about'])

    await scrape(site)

    expect(await getPageUrls(site.id)).toEqual([
      'https://new.example.com/about'
    ])
  })

  it('keeps pages and records an error when the sitemap is empty', async () => {
    const site = await setupSite()

    await createTestPage(site.id, {
      path: '/about',
      url: 'https://example.com/about'
    })

    mockSitemap([])

    await scrape(site)

    expect(await getPageUrls(site.id)).toEqual(['https://example.com/about'])
    expect(await reloadSite(site)).toEqual({
      lastScrapedSitemapAt: expect.any(Number),
      scrapeSitemapError:
        'The sitemap at https://example.com/sitemap.xml has no URLs. Check that the sitemap path points to the right file.',
      scrapeStartedAt: null
    })
  })

  it('keeps pages and records an error when the sitemap fails', async () => {
    const site = await setupSite()

    await createTestPage(site.id, {
      path: '/about',
      url: 'https://example.com/about'
    })

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Not found', { status: 404 })
    )

    await scrape(site)

    expect(await getPageUrls(site.id)).toEqual(['https://example.com/about'])
    expect(await reloadSite(site)).toEqual({
      lastScrapedSitemapAt: expect.any(Number),
      scrapeSitemapError: 'HTTP 404 fetching https://example.com/sitemap.xml',
      scrapeStartedAt: null
    })
  })
})
