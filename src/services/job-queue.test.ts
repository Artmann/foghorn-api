import { Effect } from 'effect'
import { connectionHandler } from 'esix'
import invariant from 'tiny-invariant'
import { beforeEach, describe, expect, it } from 'vitest'

import { jobCooldownMs, jobLeaseMs } from '../lib/job-status'
import { Page } from '../models/page'
import { Site } from '../models/site'
import {
  createTestPage,
  createTestSite,
  createTestTeam,
  createTestUser,
  runWithServices
} from '../test-helpers'
import type { DatabaseError } from './database'
import {
  JobQueue,
  type AuditResult,
  type JobQueueShape,
  type ScrapeResult
} from './job-queue'

function withQueue<A>(
  use: (jobQueue: JobQueueShape) => Effect.Effect<A, DatabaseError>
) {
  return runWithServices(
    Effect.gen(function* () {
      return yield* use(yield* JobQueue)
    })
  )
}

const countSiteAudits = (siteId: string, time: number) =>
  withQueue((jobQueue) => jobQueue.countSiteAudits(siteId, time))
const findPagesDueForAudit = (time: number, limit: number) =>
  withQueue((jobQueue) => jobQueue.findPagesDueForAudit(time, limit))
const findSitesDueForScrape = (time: number, limit: number) =>
  withQueue((jobQueue) => jobQueue.findSitesDueForScrape(time, limit))
const markAuditFinished = (pageId: string, result: AuditResult) =>
  withQueue((jobQueue) => jobQueue.markAuditFinished(pageId, result))
const markAuditReleased = (pageId: string) =>
  withQueue((jobQueue) => jobQueue.markAuditReleased(pageId))
const markAuditStarted = (pageId: string, time: number) =>
  withQueue((jobQueue) => jobQueue.markAuditStarted(pageId, time))
const markScrapeFinished = (site: Site, result: ScrapeResult) =>
  withQueue((jobQueue) => jobQueue.markScrapeFinished(site, result))
const markScrapeStarted = (siteId: string, time: number) =>
  withQueue((jobQueue) => jobQueue.markScrapeStarted(siteId, time))

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

async function markAuditRunning(page: Page, auditStartedAt: number) {
  page.auditStartedAt = auditStartedAt
  await page.save()
}

async function reloadPage(page: Page) {
  const reloaded = await Page.find(page.id)

  return {
    auditError: reloaded?.auditError,
    auditReport: reloaded?.auditReport,
    auditStartedAt: reloaded?.auditStartedAt,
    lastAuditedAt: reloaded?.lastAuditedAt
  }
}

async function reloadSite(site: Site) {
  const reloaded = await Site.find(site.id)

  return {
    domain: reloaded?.domain,
    lastScrapedSitemapAt: reloaded?.lastScrapedSitemapAt,
    scrapeSitemapError: reloaded?.scrapeSitemapError,
    scrapeStartedAt: reloaded?.scrapeStartedAt
  }
}

describe('countSiteAudits', () => {
  it('counts pages by audit status', async () => {
    const site = await setupSite()
    const otherSite = await setupSite()

    const completed = await createTestPage(site.id, { path: '/completed' })
    const failed = await createTestPage(site.id, { path: '/failed' })
    const firstRun = await createTestPage(site.id, { path: '/first-run' })
    const refresh = await createTestPage(site.id, { path: '/refresh' })
    await createTestPage(site.id, { path: '/pending' })
    await createTestPage(otherSite.id, { path: '/other' })

    await markAudited(completed, now)
    await markAudited(failed, now, 'Timeout auditing /failed')
    await markAuditRunning(firstRun, now - 1000)
    await markAudited(refresh, now - jobCooldownMs - 1000)
    await markAuditRunning(refresh, now - 1000)

    expect(await countSiteAudits(site.id, now)).toEqual({
      audits: {
        completedPages: 1,
        failedPages: 1,
        pendingPages: 1,
        runningPages: 2,
        totalPages: 5
      },
      unauditedPages: 2
    })
  })

  it('treats pages with an expired lease as not running', async () => {
    const site = await setupSite()
    const page = await createTestPage(site.id)

    await markAuditRunning(page, now - jobLeaseMs - 1000)

    expect(await countSiteAudits(site.id, now)).toEqual({
      audits: {
        completedPages: 0,
        failedPages: 0,
        pendingPages: 1,
        runningPages: 0,
        totalPages: 1
      },
      unauditedPages: 1
    })
  })

  it('returns zeros for a site without pages', async () => {
    const site = await setupSite()

    expect(await countSiteAudits(site.id, now)).toEqual({
      audits: {
        completedPages: 0,
        failedPages: 0,
        pendingPages: 0,
        runningPages: 0,
        totalPages: 0
      },
      unauditedPages: 0
    })
  })
})

describe('markAuditFinished', () => {
  it('stores the result and clears the lease', async () => {
    const site = await setupSite()
    const page = await createTestPage(site.id)

    await markAuditStarted(page.id, now)
    await markAuditFinished(page.id, {
      auditError: 'HTTP 500 auditing https://example.com/',
      lastAuditedAt: now + 1000
    })

    expect(await reloadPage(page)).toEqual({
      auditError: 'HTTP 500 auditing https://example.com/',
      auditReport: null,
      auditStartedAt: null,
      lastAuditedAt: now + 1000
    })
  })
})

describe('markAuditReleased', () => {
  it('clears the lease and leaves the result alone', async () => {
    const site = await setupSite()
    const page = await createTestPage(site.id)

    await markAuditStarted(page.id, now)
    await markAuditReleased(page.id)

    expect(await reloadPage(page)).toEqual({
      auditError: null,
      auditReport: null,
      auditStartedAt: null,
      lastAuditedAt: null
    })
  })
})

describe('markScrapeFinished', () => {
  it('stores the result and clears the lease', async () => {
    const site = await setupSite()

    await markScrapeStarted(site.id, now)
    await markScrapeFinished(site, {
      lastScrapedSitemapAt: now + 1000,
      scrapeSitemapError: null
    })

    expect(await reloadSite(site)).toEqual({
      domain: site.domain,
      lastScrapedSitemapAt: now + 1000,
      scrapeSitemapError: null,
      scrapeStartedAt: null
    })
  })

  it('keeps the site queued when the domain changed during the scrape', async () => {
    const site = await setupSite()

    await markScrapeStarted(site.id, now)

    const updated = await Site.find(site.id)
    invariant(updated, 'Expected the site to exist.')
    updated.domain = 'new.example.com'
    await updated.save()

    await markScrapeFinished(site, {
      lastScrapedSitemapAt: now + 1000,
      scrapeSitemapError: null
    })

    expect(await reloadSite(site)).toEqual({
      domain: 'new.example.com',
      lastScrapedSitemapAt: null,
      scrapeSitemapError: null,
      scrapeStartedAt: null
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

  it('skips pages that are running and picks them up once the lease expires', async () => {
    const site = await setupSite()

    const running = await createTestPage(site.id, { path: '/running' })
    const abandoned = await createTestPage(site.id, { path: '/abandoned' })

    await markAuditRunning(running, now - 1000)
    await markAuditRunning(abandoned, now - jobLeaseMs - 1000)

    const pages = await findPagesDueForAudit(now, 10)

    expect(pages.map((page) => page.id)).toEqual([abandoned.id])
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
