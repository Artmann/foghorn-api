import { describe, expect, it } from 'vitest'

import {
  app,
  createAuthToken,
  createTestPage,
  createTestSite,
  createTestTeam,
  createTestUser,
  mockExecutionContext,
  testEnvironment
} from '../test-helpers'

async function authenticatedRequest(path: string, options: { token: string }) {
  return app.request(
    path,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${options.token}`,
        'Content-Type': 'application/json'
      }
    },
    testEnvironment,
    mockExecutionContext
  )
}

async function setup() {
  const { user } = await createTestUser()
  const token = await createAuthToken(user.id, user.email)
  const team = await createTestTeam(user.id)
  const site = await createTestSite(team.id)

  return { site, token }
}

describe('GET /pages/:id', () => {
  it('shows a page that has not been audited as pending', async () => {
    const { site, token } = await setup()
    const page = await createTestPage(site.id, {
      path: '/about',
      url: 'https://example.com/about'
    })

    const response = await authenticatedRequest(`/pages/${page.id}`, { token })

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      page: {
        auditError: null,
        auditReport: null,
        auditStatus: 'pending',
        createdAt: expect.any(String),
        id: page.id,
        lastAuditedAt: null,
        nextAuditAt: null,
        path: '/about',
        siteId: site.id,
        url: 'https://example.com/about'
      }
    })
  })

  it('shows a failed audit with its error and next attempt', async () => {
    const { site, token } = await setup()
    const page = await createTestPage(site.id, {
      path: '/slow',
      url: 'https://example.com/slow'
    })

    page.lastAuditedAt = Date.UTC(2026, 9, 8, 12, 0, 0)
    page.auditError = 'Timeout auditing https://example.com/slow'
    await page.save()

    const response = await authenticatedRequest(`/pages/${page.id}`, { token })

    expect(await response.json()).toEqual({
      page: {
        auditError: 'Timeout auditing https://example.com/slow',
        auditReport: null,
        auditStatus: 'failed',
        createdAt: expect.any(String),
        id: page.id,
        lastAuditedAt: '2026-10-08T12:00:00.000Z',
        nextAuditAt: '2026-10-08T16:00:00.000Z',
        path: '/slow',
        siteId: site.id,
        url: 'https://example.com/slow'
      }
    })
  })
})

describe('GET /pages/:id while running', () => {
  it('shows a page that is being audited as running', async () => {
    const { site, token } = await setup()
    const page = await createTestPage(site.id)

    page.auditStartedAt = Date.now()
    await page.save()

    const response = await authenticatedRequest(`/pages/${page.id}`, { token })
    const body = (await response.json()) as { page: { auditStatus: string } }

    expect(body.page.auditStatus).toEqual('running')
  })
})

describe('GET /pages', () => {
  it('includes the audit status of each page', async () => {
    const { site, token } = await setup()
    const audited = await createTestPage(site.id, { path: '/audited' })
    await createTestPage(site.id, { path: '/waiting' })

    audited.lastAuditedAt = Date.UTC(2026, 9, 8, 12, 0, 0)
    await audited.save()

    const response = await authenticatedRequest(`/pages?siteId=${site.id}`, {
      token
    })
    const { pages } = (await response.json()) as {
      pages: { auditStatus: string; path: string }[]
    }

    expect(
      pages.map((page) => ({ auditStatus: page.auditStatus, path: page.path }))
    ).toEqual([
      { auditStatus: 'completed', path: '/audited' },
      { auditStatus: 'pending', path: '/waiting' }
    ])
  })

  it('returns scores instead of the audit report', async () => {
    const { site, token } = await setup()
    const page = await createTestPage(site.id, {
      path: '/audited',
      url: 'https://example.com/audited'
    })

    page.lastAuditedAt = Date.UTC(2026, 9, 8, 12, 0, 0)
    page.auditReport = {
      accessibility: {
        audits: [{ id: 'color-contrast', score: 0, title: 'Color Contrast' }],
        score: 0.9
      },
      bestPractices: { audits: [], score: 1 },
      durationMs: 1000,
      fetchTime: '2026-10-08T12:00:00.000Z',
      fieldData: null,
      finalUrl: 'https://example.com/audited',
      performance: { audits: [], score: 0.5 },
      seo: { audits: [], score: null }
    }
    await page.save()

    const response = await authenticatedRequest(`/pages?siteId=${site.id}`, {
      token
    })

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      pages: [
        {
          auditError: null,
          auditStatus: 'completed',
          createdAt: expect.any(String),
          id: page.id,
          lastAuditedAt: '2026-10-08T12:00:00.000Z',
          nextAuditAt: '2026-10-08T16:00:00.000Z',
          path: '/audited',
          scores: {
            accessibility: 0.9,
            bestPractices: 1,
            performance: 0.5,
            seo: null
          },
          siteId: site.id,
          url: 'https://example.com/audited'
        }
      ],
      pagination: { limit: 50, nextOffset: null, offset: 0, total: 1 }
    })
  })

  it('pages through pages sorted by URL', async () => {
    const { site, token } = await setup()

    for (const path of ['/c', '/a', '/b']) {
      await createTestPage(site.id, { path, url: `https://example.com${path}` })
    }

    const first = await authenticatedRequest(
      `/pages?siteId=${site.id}&limit=2`,
      { token }
    )
    const second = await authenticatedRequest(
      `/pages?siteId=${site.id}&limit=2&offset=2`,
      { token }
    )
    const firstBody = (await first.json()) as {
      pages: { path: string }[]
      pagination: unknown
    }
    const secondBody = (await second.json()) as {
      pages: { path: string }[]
      pagination: unknown
    }

    expect({
      first: firstBody.pages.map((page) => page.path),
      firstPagination: firstBody.pagination,
      second: secondBody.pages.map((page) => page.path),
      secondPagination: secondBody.pagination
    }).toEqual({
      first: ['/a', '/b'],
      firstPagination: { limit: 2, nextOffset: 2, offset: 0, total: 3 },
      second: ['/c'],
      secondPagination: { limit: 2, nextOffset: null, offset: 2, total: 3 }
    })
  })

  it('searches the URL and path as plain text', async () => {
    const { site, token } = await setup()

    await createTestPage(site.id, {
      path: '/blog/c++',
      url: 'https://example.com/blog/c++'
    })
    await createTestPage(site.id, {
      path: '/blog/cpp',
      url: 'https://example.com/blog/cpp'
    })

    const response = await authenticatedRequest(
      `/pages?siteId=${site.id}&search=${encodeURIComponent('BLOG/C++')}`,
      { token }
    )
    const { pages } = (await response.json()) as { pages: { path: string }[] }

    expect(pages.map((page) => page.path)).toEqual(['/blog/c++'])
  })

  it('rejects an offset that is not a whole number', async () => {
    const { token } = await setup()

    const response = await authenticatedRequest('/pages?offset=-1', { token })

    expect(response.status).toEqual(400)
    expect(await response.json()).toEqual({
      error: {
        code: 'ValidationFailed',
        message: 'Offset must be a whole number from 0 to 100000.'
      }
    })
  })
})
