import { describe, expect, it, vi } from 'vitest'

import { Logger } from '../lib/logger'
import { Page } from '../models/page'
import {
  createTestPage,
  createTestSite,
  createTestTeam,
  createTestUser
} from '../test-helpers'
import { auditPages } from './run-audits'

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  flush: vi.fn()
} as unknown as Logger

const pageSpeedResponse = {
  lighthouseResult: {
    fetchTime: '2026-10-08T12:00:00.000Z',
    finalUrl: 'https://example.com/',
    categories: {
      performance: {
        score: 0.9,
        auditRefs: [{ id: 'largest-contentful-paint' }]
      },
      accessibility: { score: 1, auditRefs: [] },
      'best-practices': { score: 1, auditRefs: [] },
      seo: { score: 1, auditRefs: [] }
    },
    audits: {
      'largest-contentful-paint': {
        id: 'largest-contentful-paint',
        title: 'Largest Contentful Paint',
        score: 0.8,
        displayValue: '2.1 s',
        numericValue: 2100
      }
    }
  }
}

async function setupPages(count: number) {
  const { user } = await createTestUser()
  const team = await createTestTeam(user.id)
  const site = await createTestSite(team.id)
  const pages: Page[] = []

  for (let index = 0; index < count; index++) {
    pages.push(
      await createTestPage(site.id, {
        path: `/page-${index}`,
        url: `https://example.com/page-${index}`
      })
    )
  }

  return pages
}

async function reload(page: Page) {
  const reloaded = await Page.find(page.id)

  return {
    auditError: reloaded?.auditError,
    auditReport: reloaded?.auditReport,
    lastAuditedAt: reloaded?.lastAuditedAt
  }
}

describe('auditPages', () => {
  it('stores the report and marks the page as audited', async () => {
    const [page] = await setupPages(1)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json(pageSpeedResponse)
    )

    const result = await auditPages([page], mockLogger, {
      concurrency: 1,
      delayMs: 0
    })

    expect(result).toEqual({ rateLimited: false })
    expect(await reload(page)).toEqual({
      auditError: null,
      auditReport: {
        accessibility: { audits: [], score: 1 },
        bestPractices: { audits: [], score: 1 },
        durationMs: expect.any(Number),
        fetchTime: '2026-10-08T12:00:00.000Z',
        fieldData: null,
        finalUrl: 'https://example.com/',
        performance: {
          audits: [
            {
              displayValue: '2.1 s',
              id: 'largest-contentful-paint',
              numericValue: 2100,
              score: 0.8,
              title: 'Largest Contentful Paint'
            }
          ],
          score: 0.9
        },
        seo: { audits: [], score: 1 }
      },
      lastAuditedAt: expect.any(Number)
    })
  })

  it('records the error when PageSpeed fails', async () => {
    const [page] = await setupPages(1)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal error', { status: 500 })
    )

    const result = await auditPages([page], mockLogger, {
      concurrency: 1,
      delayMs: 0
    })

    expect(result).toEqual({ rateLimited: false })
    expect(await reload(page)).toEqual({
      auditError: 'HTTP 500 auditing https://example.com/page-0',
      auditReport: null,
      lastAuditedAt: expect.any(Number)
    })
  })

  it('stops and leaves pages pending when PageSpeed rate limits', async () => {
    const pages = await setupPages(3)

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('Too many requests', { status: 429 }))

    const result = await auditPages(pages, mockLogger, {
      concurrency: 1,
      delayMs: 0
    })

    expect(result).toEqual({ rateLimited: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    for (const page of pages) {
      expect(await reload(page)).toEqual({
        auditError: null,
        auditReport: null,
        lastAuditedAt: null
      })
    }
  })
})
