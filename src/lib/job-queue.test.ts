import { connectionHandler } from 'esix'
import { beforeEach, describe, expect, it } from 'vitest'

import { Page } from '../models/page'
import { Site } from '../models/site'
import {
  createTestPage,
  createTestSite,
  createTestTeam,
  createTestUser
} from '../test-helpers'
import {
  countSiteAudits,
  findPagesDueForAudit,
  findSitesDueForScrape
} from './job-queue'
import { jobCooldownMs } from './job-status'

const now = Date.UTC(2026, 9, 8, 12, 0, 0)

// The queue looks at every page and site, so start each test from empty
// collections.
beforeEach(async () => {
  const database = await connectionHandler.getConnection()

  await database.collection('pages').deleteMany({})
  await database.collection('sites').deleteMany({})
})

async function setupSite() {
  const { user } = await createTestUser()
  const team = await createTestTeam(user.id)

  return createTestSite(team.id)
}

async function markAudited(
  page: Page,
  lastAuditedAt: number,
  auditError: string | null = null
) {
  page.lastAuditedAt = lastAuditedAt
  page.auditError = auditError
  await page.save()
}

async function markScraped(site: Site, lastScrapedSitemapAt: number) {
  site.lastScrapedSitemapAt = lastScrapedSitemapAt
  await site.save()
}

describe('countSiteAudits', () => {
  it('counts completed, failed and pending pages', async () => {
    const site = await setupSite()
    const otherSite = await setupSite()

    const completed = await createTestPage(site.id, { path: '/completed' })
    const failed = await createTestPage(site.id, { path: '/failed' })
    await createTestPage(site.id, { path: '/pending' })
    await createTestPage(otherSite.id, { path: '/other' })

    await markAudited(completed, now)
    await markAudited(failed, now, 'Timeout auditing /failed')

    expect(await countSiteAudits(site.id)).toEqual({
      completedPages: 1,
      failedPages: 1,
      pendingPages: 1,
      totalPages: 3
    })
  })

  it('returns zeros for a site without pages', async () => {
    const site = await setupSite()

    expect(await countSiteAudits(site.id)).toEqual({
      completedPages: 0,
      failedPages: 0,
      pendingPages: 0,
      totalPages: 0
    })
  })
})

describe('findPagesDueForAudit', () => {
  it('returns never audited pages first, then stale ones, and skips recent ones', async () => {
    const site = await setupSite()

    const recent = await createTestPage(site.id, { path: '/recent' })
    const stale = await createTestPage(site.id, { path: '/stale' })
    const older = await createTestPage(site.id, { path: '/older' })
    const fresh = await createTestPage(site.id, { path: '/fresh' })

    await markAudited(recent, now - 60_000)
    await markAudited(stale, now - jobCooldownMs - 60_000)
    await markAudited(older, now - jobCooldownMs - 120_000)

    const pages = await findPagesDueForAudit(now, 10)

    expect(pages.map((page) => page.id)).toEqual([fresh.id, older.id, stale.id])
  })

  it('respects the limit', async () => {
    const site = await setupSite()

    await createTestPage(site.id, { path: '/one' })
    await createTestPage(site.id, { path: '/two' })
    await createTestPage(site.id, { path: '/three' })

    expect(await findPagesDueForAudit(now, 2)).toHaveLength(2)
  })
})

describe('findSitesDueForScrape', () => {
  it('returns never scraped sites first, then stale ones, and skips recent ones', async () => {
    const recent = await setupSite()
    const stale = await setupSite()
    const fresh = await setupSite()

    await markScraped(recent, now - 60_000)
    await markScraped(stale, now - jobCooldownMs - 60_000)

    const sites = await findSitesDueForScrape(now, 10)

    expect(sites.map((site) => site.id)).toEqual([fresh.id, stale.id])
  })
})
