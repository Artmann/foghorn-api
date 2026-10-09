import { describe, expect, it } from 'vitest'

import {
  getJobStatus,
  getNextRunAt,
  getSiteStatus,
  isDue,
  isRunning,
  jobCooldownMs,
  jobLeaseMs
} from './job-status'

const now = Date.UTC(2026, 9, 8, 12, 0, 0)

describe('getJobStatus', () => {
  it('is pending when the job has never run', () => {
    expect(
      getJobStatus({ error: null, lastRunAt: null, startedAt: null }, now)
    ).toEqual('pending')
  })

  it('is running while the lease is active', () => {
    expect(
      getJobStatus({ error: null, lastRunAt: null, startedAt: now - 1000 }, now)
    ).toEqual('running')
  })

  it('falls back to the last result when the lease has expired', () => {
    expect(
      getJobStatus(
        { error: null, lastRunAt: null, startedAt: now - jobLeaseMs - 1000 },
        now
      )
    ).toEqual('pending')
  })

  it('is failed when the last run had an error', () => {
    expect(
      getJobStatus(
        { error: 'HTTP 404 fetching sitemap', lastRunAt: now, startedAt: null },
        now
      )
    ).toEqual('failed')
  })

  it('is completed when the last run succeeded', () => {
    expect(
      getJobStatus({ error: null, lastRunAt: now, startedAt: null }, now)
    ).toEqual('completed')
  })
})

describe('getNextRunAt', () => {
  it('is null when the job has never run', () => {
    expect(getNextRunAt(null)).toEqual(null)
  })

  it('is the last run plus the cooldown', () => {
    expect(getNextRunAt(now)).toEqual('2026-10-08T16:00:00.000Z')
  })
})

describe('getSiteStatus', () => {
  const scraped = {
    hasScrapedSitemap: true,
    sitemapStatus: 'completed' as const,
    totalPages: 2,
    unauditedPages: 0
  }

  it('is pending until the sitemap has been scraped', () => {
    expect(
      getSiteStatus({
        hasScrapedSitemap: false,
        sitemapStatus: 'running',
        totalPages: 0,
        unauditedPages: 0
      })
    ).toEqual('pending')
  })

  it('is pending while pages have never been audited', () => {
    expect(getSiteStatus({ ...scraped, unauditedPages: 1 })).toEqual('pending')
  })

  it('stays ready while a later refresh is running', () => {
    expect(getSiteStatus({ ...scraped, sitemapStatus: 'running' })).toEqual(
      'ready'
    )
  })

  it('is failed when the sitemap failed and there are no pages', () => {
    expect(
      getSiteStatus({ ...scraped, sitemapStatus: 'failed', totalPages: 0 })
    ).toEqual('failed')
  })

  it('is ready when the sitemap failed but earlier pages are audited', () => {
    expect(getSiteStatus({ ...scraped, sitemapStatus: 'failed' })).toEqual(
      'ready'
    )
  })

  it('is ready when every page has been audited', () => {
    expect(getSiteStatus(scraped)).toEqual('ready')
  })
})

describe('isDue', () => {
  it('is due when the job has never run', () => {
    expect(isDue(null, now)).toEqual(true)
  })

  it('is not due within the cooldown', () => {
    expect(isDue(now - jobCooldownMs + 1000, now)).toEqual(false)
  })

  it('is due after the cooldown', () => {
    expect(isDue(now - jobCooldownMs - 1000, now)).toEqual(true)
  })
})

describe('isRunning', () => {
  it('is not running without a start time', () => {
    expect(isRunning(null, now)).toEqual(false)
  })

  it('is running within the lease', () => {
    expect(isRunning(now - jobLeaseMs + 1000, now)).toEqual(true)
  })

  it('is not running after the lease', () => {
    expect(isRunning(now - jobLeaseMs - 1000, now)).toEqual(false)
  })
})
