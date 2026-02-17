import { describe, expect, it } from 'vitest'

import type { PageAuditReport } from '../models/page'
import type { Page } from '../models/page'
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

function makeAuditReport(
  overrides: Partial<PageAuditReport> = {}
): PageAuditReport {
  return {
    fetchTime: '2025-01-01T00:00:00Z',
    finalUrl: 'https://example.com',
    durationMs: 1000,
    performance: { score: 1, audits: [] },
    accessibility: { score: 1, audits: [] },
    bestPractices: { score: 1, audits: [] },
    seo: { score: 1, audits: [] },
    fieldData: null,
    ...overrides
  }
}

async function setAuditReport(page: Page, report: PageAuditReport) {
  page.auditReport = report
  await page.save()
}

interface IssueResponse {
  issues: {
    auditId: string
    title: string
    category: string
    pages: {
      pageId: string
      url: string
      path: string
      score: number
      displayValue: string | null
    }[]
  }[]
}

describe('GET /issues', () => {
  it('returns 404 when site does not exist (with siteId filter)', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const response = await authenticatedRequest(
      '/issues?siteId=000000000000000000000000',
      { token }
    )

    expect(response.status).toEqual(404)
  })

  it('returns 403 when not a team member (with siteId filter)', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@test.com' })
    const { user: other } = await createTestUser({ email: 'other@test.com' })
    const team = await createTestTeam(owner.id)
    const site = await createTestSite(team.id)

    const token = await createAuthToken(other.id, other.email)
    const response = await authenticatedRequest(`/issues?siteId=${site.id}`, {
      token
    })

    expect(response.status).toEqual(403)
  })

  it('returns 400 for invalid category value', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const response = await authenticatedRequest('/issues?category=invalid', {
      token
    })

    expect(response.status).toEqual(400)
  })

  it('returns empty issues when no pages exist', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)
    const site = await createTestSite(team.id)

    const response = await authenticatedRequest(`/issues?siteId=${site.id}`, {
      token
    })

    expect(response.status).toEqual(200)
    const body = (await response.json()) as IssueResponse
    expect(body.issues).toEqual([])
  })

  it('returns empty issues when pages have no audit reports', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)
    const site = await createTestSite(team.id)
    await createTestPage(site.id)

    const response = await authenticatedRequest(`/issues?siteId=${site.id}`, {
      token
    })

    expect(response.status).toEqual(200)
    const body = (await response.json()) as IssueResponse
    expect(body.issues).toEqual([])
  })

  it('returns empty issues when all audits pass', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)
    const site = await createTestSite(team.id)
    const page = await createTestPage(site.id)

    await setAuditReport(
      page,
      makeAuditReport({
        accessibility: {
          score: 1,
          audits: [{ id: 'color-contrast', title: 'Color Contrast', score: 1 }]
        }
      })
    )

    const response = await authenticatedRequest(`/issues?siteId=${site.id}`, {
      token
    })

    expect(response.status).toEqual(200)
    const body = (await response.json()) as IssueResponse
    expect(body.issues).toEqual([])
  })

  it('skips null-score audits', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)
    const site = await createTestSite(team.id)
    const page = await createTestPage(site.id)

    await setAuditReport(
      page,
      makeAuditReport({
        accessibility: {
          score: null,
          audits: [
            { id: 'informational-audit', title: 'Info Audit', score: null }
          ]
        }
      })
    )

    const response = await authenticatedRequest(`/issues?siteId=${site.id}`, {
      token
    })

    expect(response.status).toEqual(200)
    const body = (await response.json()) as IssueResponse
    expect(body.issues).toEqual([])
  })

  it('groups failing audits by audit ID across pages', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)
    const site = await createTestSite(team.id)

    const page1 = await createTestPage(site.id, {
      path: '/page1',
      url: 'https://example.com/page1'
    })
    const page2 = await createTestPage(site.id, {
      path: '/page2',
      url: 'https://example.com/page2'
    })

    const report = makeAuditReport({
      accessibility: {
        score: 0.5,
        audits: [{ id: 'color-contrast', title: 'Color Contrast', score: 0 }]
      }
    })

    await setAuditReport(page1, report)
    await setAuditReport(page2, report)

    const response = await authenticatedRequest(`/issues?siteId=${site.id}`, {
      token
    })

    expect(response.status).toEqual(200)
    const body = (await response.json()) as IssueResponse
    expect(body.issues).toHaveLength(1)
    expect(body.issues[0].auditId).toEqual('color-contrast')
    expect(body.issues[0].pages).toHaveLength(2)
  })

  it('sorts pages by score ascending within each issue', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)
    const site = await createTestSite(team.id)

    const page1 = await createTestPage(site.id, {
      path: '/better',
      url: 'https://example.com/better'
    })
    const page2 = await createTestPage(site.id, {
      path: '/worse',
      url: 'https://example.com/worse'
    })

    await setAuditReport(
      page1,
      makeAuditReport({
        accessibility: {
          score: 0.5,
          audits: [
            { id: 'color-contrast', title: 'Color Contrast', score: 0.5 }
          ]
        }
      })
    )

    await setAuditReport(
      page2,
      makeAuditReport({
        accessibility: {
          score: 0,
          audits: [{ id: 'color-contrast', title: 'Color Contrast', score: 0 }]
        }
      })
    )

    const response = await authenticatedRequest(`/issues?siteId=${site.id}`, {
      token
    })

    const body = (await response.json()) as IssueResponse
    expect(body.issues[0].pages[0].path).toEqual('/worse')
    expect(body.issues[0].pages[1].path).toEqual('/better')
  })

  it('sorts issues by page count descending', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)
    const site = await createTestSite(team.id)

    const page1 = await createTestPage(site.id, {
      path: '/p1',
      url: 'https://example.com/p1'
    })
    const page2 = await createTestPage(site.id, {
      path: '/p2',
      url: 'https://example.com/p2'
    })

    // color-contrast fails on both pages, image-alt fails on one page only.
    await setAuditReport(
      page1,
      makeAuditReport({
        accessibility: {
          score: 0.5,
          audits: [
            { id: 'color-contrast', title: 'Color Contrast', score: 0 },
            { id: 'image-alt', title: 'Image Alt', score: 0 }
          ]
        }
      })
    )

    await setAuditReport(
      page2,
      makeAuditReport({
        accessibility: {
          score: 0.5,
          audits: [{ id: 'color-contrast', title: 'Color Contrast', score: 0 }]
        }
      })
    )

    const response = await authenticatedRequest(`/issues?siteId=${site.id}`, {
      token
    })

    const body = (await response.json()) as IssueResponse
    expect(body.issues).toHaveLength(2)
    expect(body.issues[0].auditId).toEqual('color-contrast')
    expect(body.issues[0].pages).toHaveLength(2)
    expect(body.issues[1].auditId).toEqual('image-alt')
    expect(body.issues[1].pages).toHaveLength(1)
  })

  it('includes displayValue or null when absent', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)
    const site = await createTestSite(team.id)

    const page = await createTestPage(site.id)

    await setAuditReport(
      page,
      makeAuditReport({
        performance: {
          score: 0.5,
          audits: [
            {
              id: 'speed-index',
              title: 'Speed Index',
              score: 0.5,
              displayValue: '3.2 s'
            },
            {
              id: 'first-contentful-paint',
              title: 'First Contentful Paint',
              score: 0.3
            }
          ]
        }
      })
    )

    const response = await authenticatedRequest(`/issues?siteId=${site.id}`, {
      token
    })

    const body = (await response.json()) as IssueResponse

    const speedIndex = body.issues.find((i) => i.auditId === 'speed-index')
    expect(speedIndex!.pages[0].displayValue).toEqual('3.2 s')

    const fcp = body.issues.find((i) => i.auditId === 'first-contentful-paint')
    expect(fcp!.pages[0].displayValue).toBeNull()
  })

  it('extracts issues from all four categories', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)
    const site = await createTestSite(team.id)

    const page = await createTestPage(site.id)

    await setAuditReport(
      page,
      makeAuditReport({
        performance: {
          score: 0.5,
          audits: [{ id: 'perf-audit', title: 'Perf', score: 0.5 }]
        },
        accessibility: {
          score: 0.5,
          audits: [{ id: 'a11y-audit', title: 'A11y', score: 0.5 }]
        },
        bestPractices: {
          score: 0.5,
          audits: [{ id: 'bp-audit', title: 'BP', score: 0.5 }]
        },
        seo: {
          score: 0.5,
          audits: [{ id: 'seo-audit', title: 'SEO', score: 0.5 }]
        }
      })
    )

    const response = await authenticatedRequest(`/issues?siteId=${site.id}`, {
      token
    })

    const body = (await response.json()) as IssueResponse
    const categories = body.issues.map((i) => i.category)
    expect(categories).toContain('performance')
    expect(categories).toContain('accessibility')
    expect(categories).toContain('bestPractices')
    expect(categories).toContain('seo')
  })

  it('category filter returns only issues from that category', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)
    const site = await createTestSite(team.id)

    const page = await createTestPage(site.id)

    await setAuditReport(
      page,
      makeAuditReport({
        performance: {
          score: 0.5,
          audits: [{ id: 'perf-audit', title: 'Perf', score: 0.5 }]
        },
        accessibility: {
          score: 0.5,
          audits: [{ id: 'a11y-audit', title: 'A11y', score: 0.5 }]
        }
      })
    )

    const response = await authenticatedRequest(
      `/issues?siteId=${site.id}&category=accessibility`,
      { token }
    )

    const body = (await response.json()) as IssueResponse
    expect(body.issues).toHaveLength(1)
    expect(body.issues[0].auditId).toEqual('a11y-audit')
    expect(body.issues[0].category).toEqual('accessibility')
  })

  it('without siteId returns issues across all accessible sites', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const team1 = await createTestTeam(user.id, { name: 'Team 1' })
    const team2 = await createTestTeam(user.id, { name: 'Team 2' })
    const site1 = await createTestSite(team1.id)
    const site2 = await createTestSite(team2.id)

    const page1 = await createTestPage(site1.id, {
      path: '/s1',
      url: 'https://site1.com/s1'
    })
    const page2 = await createTestPage(site2.id, {
      path: '/s2',
      url: 'https://site2.com/s2'
    })

    const report = makeAuditReport({
      accessibility: {
        score: 0.5,
        audits: [{ id: 'color-contrast', title: 'Color Contrast', score: 0 }]
      }
    })

    await setAuditReport(page1, report)
    await setAuditReport(page2, report)

    const response = await authenticatedRequest('/issues', { token })

    expect(response.status).toEqual(200)
    const body = (await response.json()) as IssueResponse
    expect(body.issues).toHaveLength(1)
    expect(body.issues[0].pages).toHaveLength(2)
  })

  it('does not include issues from sites user has no access to', async () => {
    const { user } = await createTestUser({ email: 'me@test.com' })
    const { user: other } = await createTestUser({ email: 'them@test.com' })
    const token = await createAuthToken(user.id, user.email)

    const myTeam = await createTestTeam(user.id, { name: 'My Team' })
    const otherTeam = await createTestTeam(other.id, { name: 'Other Team' })

    const mySite = await createTestSite(myTeam.id)
    const otherSite = await createTestSite(otherTeam.id)

    const myPage = await createTestPage(mySite.id, {
      path: '/mine',
      url: 'https://mine.com/mine'
    })
    const otherPage = await createTestPage(otherSite.id, {
      path: '/theirs',
      url: 'https://theirs.com/theirs'
    })

    const report = makeAuditReport({
      accessibility: {
        score: 0.5,
        audits: [{ id: 'color-contrast', title: 'Color Contrast', score: 0 }]
      }
    })

    await setAuditReport(myPage, report)
    await setAuditReport(otherPage, report)

    const response = await authenticatedRequest('/issues', { token })

    const body = (await response.json()) as IssueResponse
    expect(body.issues).toHaveLength(1)
    expect(body.issues[0].pages).toHaveLength(1)
    expect(body.issues[0].pages[0].path).toEqual('/mine')
  })
})
