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
})
