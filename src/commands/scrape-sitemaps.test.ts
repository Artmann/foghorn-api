import { describe, expect, it, vi } from 'vitest'

import { Logger } from '../lib/logger'
import { Page } from '../models/page'
import {
  createTestPage,
  createTestSite,
  createTestTeam,
  createTestUser
} from '../test-helpers'
import { MAX_PAGES_PER_SITE, scrapeSite } from './scrape-sitemaps'

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  flush: vi.fn()
} as unknown as Logger

function buildSitemapXml(urls: string[]): string {
  const entries = urls.map((u) => `<url><loc>${u}</loc></url>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><urlset>${entries}</urlset>`
}

describe('scrapeSite', () => {
  it('exports MAX_PAGES_PER_SITE as 250', () => {
    expect(MAX_PAGES_PER_SITE).toEqual(250)
  })

  it('limits pages scraped per site', async () => {
    const { user } = await createTestUser()
    const team = await createTestTeam(user.id)
    const site = await createTestSite(team.id, {
      domain: 'example.com',
      sitemapPath: '/sitemap.xml'
    })

    // Pre-fill with 3 existing pages.
    for (let i = 0; i < 3; i++) {
      await createTestPage(site.id, {
        path: `/existing-${i}`,
        url: `https://example.com/existing-${i}`
      })
    }

    // Sitemap returns 5 new URLs, but maxPages is 5 so only 2 slots remain.
    const sitemapUrls = Array.from(
      { length: 5 },
      (_, i) => `https://example.com/new-${i}`
    )

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(buildSitemapXml(sitemapUrls), { status: 200 })
    )

    await scrapeSite(site, mockLogger, 5)

    const pages = await Page.where('siteId', site.id).get()
    // 3 existing + 2 new = 5 (the max)
    expect(pages).toHaveLength(5)
  })

  it('creates no pages when site already at limit', async () => {
    const { user } = await createTestUser()
    const team = await createTestTeam(user.id)
    const site = await createTestSite(team.id, {
      domain: 'full.example.com',
      sitemapPath: '/sitemap.xml'
    })

    // Pre-fill with 3 pages, which equals our test limit.
    for (let i = 0; i < 3; i++) {
      await createTestPage(site.id, {
        path: `/page-${i}`,
        url: `https://full.example.com/page-${i}`
      })
    }

    const sitemapUrls = ['https://full.example.com/extra-1']

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(buildSitemapXml(sitemapUrls), { status: 200 })
    )

    await scrapeSite(site, mockLogger, 3)

    const pages = await Page.where('siteId', site.id).get()
    expect(pages).toHaveLength(3)
  })
})
