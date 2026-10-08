import { describe, expect, it } from 'vitest'

import {
  getJobStatus,
  getNextRunAt,
  getSiteStatus,
  isDue,
  jobCooldownMs,
  summarizeAudits
} from './job-status'

const now = Date.UTC(2026, 9, 8, 12, 0, 0)

describe('getJobStatus', () => {
  it('is pending when the job has never run', () => {
    expect(getJobStatus(null, null)).toEqual('pending')
  })

  it('is failed when the last run had an error', () => {
    expect(getJobStatus(now, 'HTTP 404 fetching sitemap')).toEqual('failed')
  })

  it('is completed when the last run succeeded', () => {
    expect(getJobStatus(now, null)).toEqual('completed')
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
  const noPages = {
    completedPages: 0,
    failedPages: 0,
    pendingPages: 0,
    totalPages: 0
  }

  it('is pending while the sitemap is pending', () => {
    expect(getSiteStatus('pending', noPages)).toEqual('pending')
  })

  it('is pending while pages are waiting for an audit', () => {
    expect(
      getSiteStatus('completed', { ...noPages, pendingPages: 1, totalPages: 1 })
    ).toEqual('pending')
  })

  it('is failed when the sitemap failed and there are no pages', () => {
    expect(getSiteStatus('failed', noPages)).toEqual('failed')
  })

  it('is ready when the sitemap failed but earlier pages are audited', () => {
    expect(
      getSiteStatus('failed', { ...noPages, completedPages: 2, totalPages: 2 })
    ).toEqual('ready')
  })

  it('is ready when every page has been audited', () => {
    expect(
      getSiteStatus('completed', {
        completedPages: 2,
        failedPages: 1,
        pendingPages: 0,
        totalPages: 3
      })
    ).toEqual('ready')
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

describe('summarizeAudits', () => {
  it('counts pages by audit status', () => {
    expect(
      summarizeAudits([
        { auditError: null, lastAuditedAt: null },
        { auditError: null, lastAuditedAt: now },
        { auditError: 'Timeout auditing /', lastAuditedAt: now }
      ])
    ).toEqual({
      completedPages: 1,
      failedPages: 1,
      pendingPages: 1,
      totalPages: 3
    })
  })
})
