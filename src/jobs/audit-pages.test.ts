import { Effect, Fiber } from 'effect'
import { describe, expect, it, vi } from 'vitest'

import { Page } from '../models/page'
import {
  createTestPage,
  createTestSite,
  createTestTeam,
  createTestUser,
  runWithServices
} from '../test-helpers'
import { auditPages } from './audit-pages'

function audit(pages: Page[]) {
  return runWithServices(auditPages(pages, { concurrency: 1, delay: 0 }))
}

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
    auditStartedAt: reloaded?.auditStartedAt,
    lastAuditedAt: reloaded?.lastAuditedAt
  }
}

describe('auditPages', () => {
  it('stores the report and marks the page as audited', async () => {
    const [page] = await setupPages(1)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json(pageSpeedResponse)
    )

    const result = await audit([page])

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
      auditStartedAt: null,
      lastAuditedAt: expect.any(Number)
    })
  })

  it('records the error when PageSpeed fails', async () => {
    const [page] = await setupPages(1)

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response('Internal error', { status: 500 })
    )

    const result = await audit([page])

    expect(result).toEqual({ rateLimited: false })
    expect(await reload(page)).toEqual({
      auditError: 'HTTP 500 auditing https://example.com/page-0',
      auditReport: null,
      auditStartedAt: null,
      lastAuditedAt: expect.any(Number)
    })
  })

  it('keeps the last successful report when a later audit fails', async () => {
    const [page] = await setupPages(1)

    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json(pageSpeedResponse))
      .mockResolvedValueOnce(new Response('Not found', { status: 404 }))

    await audit([page])
    await audit([page])

    const reloaded = await reload(page)

    expect({
      auditError: reloaded.auditError,
      performanceScore: reloaded.auditReport?.performance.score
    }).toEqual({
      auditError: 'HTTP 404 auditing https://example.com/page-0',
      performanceScore: 0.9
    })
  })

  it('records a network error as a failed audit', async () => {
    const [page] = await setupPages(1)

    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(
      new TypeError('fetch failed')
    )

    await audit([page])

    expect((await reload(page)).auditError).toEqual(
      expect.stringContaining(
        'Could not reach PageSpeed Insights while auditing https://example.com/page-0'
      )
    )
  })

  it('finishes an audit that has started when it is interrupted', async () => {
    const [page] = await setupPages(1)
    let markStarted = () => {}
    const started = new Promise<void>((resolve) => {
      markStarted = resolve
    })

    vi.spyOn(globalThis, 'fetch').mockImplementationOnce(async () => {
      markStarted()
      await new Promise((resolve) => setTimeout(resolve, 100))

      return Response.json(pageSpeedResponse)
    })

    await runWithServices(
      Effect.gen(function* () {
        const fiber = yield* Effect.forkChild(
          auditPages([page], { concurrency: 1, delay: 0 })
        )

        yield* Effect.promise(() => started)
        yield* Fiber.interrupt(fiber)
      })
    )

    const reloaded = await reload(page)

    expect({
      auditStartedAt: reloaded.auditStartedAt,
      performanceScore: reloaded.auditReport?.performance.score
    }).toEqual({ auditStartedAt: null, performanceScore: 0.9 })
  })

  it('stops and leaves pages pending when PageSpeed rate limits', async () => {
    const pages = await setupPages(3)

    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('Too many requests', { status: 429 }))

    const result = await audit(pages)

    expect(result).toEqual({ rateLimited: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    for (const page of pages) {
      expect(await reload(page)).toEqual({
        auditError: null,
        auditReport: null,
        auditStartedAt: null,
        lastAuditedAt: null
      })
    }
  })
})
