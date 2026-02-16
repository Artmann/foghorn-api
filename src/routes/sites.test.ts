import { describe, expect, it } from 'vitest'

import {
  app,
  createAuthToken,
  createTestSite,
  createTestTeam,
  createTestUser,
  mockExecutionContext,
  testEnvironment
} from '../test-helpers'

async function authenticatedRequest(
  path: string,
  options: { body?: Record<string, unknown>; method?: string; token: string }
) {
  const init: RequestInit = {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${options.token}`,
      'Content-Type': 'application/json'
    }
  }

  if (options.body) {
    init.body = JSON.stringify(options.body)
  }

  return app.request(path, init, testEnvironment, mockExecutionContext)
}

describe('POST /sites', () => {
  it('creates a site with default sitemapPath', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)

    const response = await authenticatedRequest('/sites', {
      method: 'POST',
      body: { teamId: team.id, domain: 'www.bitesized.app' },
      token
    })

    expect(response.status).toEqual(201)
    expect(await response.json()).toEqual({
      site: {
        createdAt: expect.any(String),
        domain: 'www.bitesized.app',
        id: expect.any(String),
        lastScrapedSitemapAt: null,
        scrapeSitemapError: null,
        sitemapPath: '/sitemap.xml',
        teamId: team.id
      }
    })
  })

  it('creates a site with custom sitemapPath', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)

    const response = await authenticatedRequest('/sites', {
      method: 'POST',
      body: {
        teamId: team.id,
        domain: 'example.com',
        sitemapPath: '/custom-sitemap.xml'
      },
      token
    })

    expect(response.status).toEqual(201)

    const { site } = (await response.json()) as {
      site: { sitemapPath: string }
    }
    expect(site.sitemapPath).toEqual('/custom-sitemap.xml')
  })

  it('returns 400 for missing domain', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)

    const response = await authenticatedRequest('/sites', {
      method: 'POST',
      body: { teamId: team.id },
      token
    })

    expect(response.status).toEqual(400)
  })

  it('returns 400 for empty domain', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)

    const response = await authenticatedRequest('/sites', {
      method: 'POST',
      body: { teamId: team.id, domain: '   ' },
      token
    })

    expect(response.status).toEqual(400)
  })

  it('returns 400 for domain exceeding 255 chars', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)

    const response = await authenticatedRequest('/sites', {
      method: 'POST',
      body: { teamId: team.id, domain: 'a'.repeat(256) },
      token
    })

    expect(response.status).toEqual(400)
  })

  it('returns 403 when not a member', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' })
    const { user: other } = await createTestUser({ email: 'other@example.com' })
    const team = await createTestTeam(owner.id)

    const token = await createAuthToken(other.id, other.email)
    const response = await authenticatedRequest('/sites', {
      method: 'POST',
      body: { teamId: team.id, domain: 'example.com' },
      token
    })

    expect(response.status).toEqual(403)
  })

  it('returns 409 when team already has 10 sites', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)

    for (let i = 0; i < 10; i++) {
      await createTestSite(team.id, { domain: `site-${i}.example.com` })
    }

    const response = await authenticatedRequest('/sites', {
      method: 'POST',
      body: { teamId: team.id, domain: 'one-too-many.example.com' },
      token
    })

    expect(response.status).toEqual(409)
    expect(await response.json()).toEqual({
      error: { message: 'This team has reached the maximum of 10 sites.' }
    })
  })
})

describe('GET /sites', () => {
  it('returns sites for the team', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)

    await createTestSite(team.id, { domain: 'alpha.com' })
    await createTestSite(team.id, { domain: 'beta.com' })

    const response = await authenticatedRequest(`/sites?teamId=${team.id}`, {
      token
    })

    expect(response.status).toEqual(200)

    const { sites } = (await response.json()) as {
      sites: { domain: string }[]
    }

    expect(sites).toHaveLength(2)

    const domains = sites.map((s) => s.domain)
    expect(domains).toContain('alpha.com')
    expect(domains).toContain('beta.com')
  })

  it('returns only sites for the given team', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const team1 = await createTestTeam(user.id, { name: 'Team 1' })
    const team2 = await createTestTeam(user.id, { name: 'Team 2' })

    await createTestSite(team1.id, { domain: 'team1.com' })
    await createTestSite(team2.id, { domain: 'team2.com' })

    const response = await authenticatedRequest(`/sites?teamId=${team1.id}`, {
      token
    })

    const { sites } = (await response.json()) as {
      sites: { domain: string }[]
    }

    expect(sites).toHaveLength(1)
    expect(sites[0].domain).toEqual('team1.com')
  })

  it('returns all sites across teams without teamId filter', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const team1 = await createTestTeam(user.id, { name: 'Team A' })
    const team2 = await createTestTeam(user.id, { name: 'Team B' })

    await createTestSite(team1.id, { domain: 'a.com' })
    await createTestSite(team2.id, { domain: 'b.com' })

    const response = await authenticatedRequest('/sites', { token })

    expect(response.status).toEqual(200)

    const { sites } = (await response.json()) as {
      sites: { domain: string }[]
    }

    expect(sites).toHaveLength(2)

    const domains = sites.map((s) => s.domain)
    expect(domains).toContain('a.com')
    expect(domains).toContain('b.com')
  })

  it('does not return sites from teams the user is not a member of', async () => {
    const { user } = await createTestUser({ email: 'me@example.com' })
    const { user: other } = await createTestUser({ email: 'other@example.com' })
    const token = await createAuthToken(user.id, user.email)

    const myTeam = await createTestTeam(user.id, { name: 'My Team' })
    const otherTeam = await createTestTeam(other.id, { name: 'Other Team' })

    await createTestSite(myTeam.id, { domain: 'mine.com' })
    await createTestSite(otherTeam.id, { domain: 'theirs.com' })

    const response = await authenticatedRequest('/sites', { token })

    const { sites } = (await response.json()) as {
      sites: { domain: string }[]
    }

    expect(sites).toHaveLength(1)
    expect(sites[0].domain).toEqual('mine.com')
  })
})

describe('GET /sites/:id', () => {
  it('returns a single site', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)
    const site = await createTestSite(team.id, { domain: 'example.com' })

    const response = await authenticatedRequest(`/sites/${site.id}`, { token })

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      site: {
        createdAt: expect.any(String),
        domain: 'example.com',
        id: site.id,
        lastScrapedSitemapAt: null,
        scrapeSitemapError: null,
        sitemapPath: '/sitemap.xml',
        teamId: team.id
      }
    })
  })

  it('returns 403 when not a member', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' })
    const { user: other } = await createTestUser({ email: 'other@example.com' })
    const team = await createTestTeam(owner.id)
    const site = await createTestSite(team.id)

    const token = await createAuthToken(other.id, other.email)
    const response = await authenticatedRequest(`/sites/${site.id}`, { token })

    expect(response.status).toEqual(403)
  })

  it('returns 404 for non-existent site', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const response = await authenticatedRequest(
      '/sites/000000000000000000000000',
      { token }
    )

    expect(response.status).toEqual(404)
  })
})

describe('PUT /sites/:id', () => {
  it('updates domain only', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)
    const site = await createTestSite(team.id, { domain: 'old.com' })

    const response = await authenticatedRequest(`/sites/${site.id}`, {
      method: 'PUT',
      body: { domain: 'new.com' },
      token
    })

    expect(response.status).toEqual(200)

    const { site: updated } = (await response.json()) as {
      site: { domain: string; sitemapPath: string }
    }

    expect(updated.domain).toEqual('new.com')
    expect(updated.sitemapPath).toEqual('/sitemap.xml')
  })

  it('updates sitemapPath only', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)
    const site = await createTestSite(team.id, { domain: 'example.com' })

    const response = await authenticatedRequest(`/sites/${site.id}`, {
      method: 'PUT',
      body: { sitemapPath: '/new-sitemap.xml' },
      token
    })

    expect(response.status).toEqual(200)

    const { site: updated } = (await response.json()) as {
      site: { domain: string; sitemapPath: string }
    }

    expect(updated.domain).toEqual('example.com')
    expect(updated.sitemapPath).toEqual('/new-sitemap.xml')
  })

  it('returns 403 when not a member', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' })
    const { user: other } = await createTestUser({ email: 'other@example.com' })
    const team = await createTestTeam(owner.id)
    const site = await createTestSite(team.id)

    const token = await createAuthToken(other.id, other.email)
    const response = await authenticatedRequest(`/sites/${site.id}`, {
      method: 'PUT',
      body: { domain: 'hacked.com' },
      token
    })

    expect(response.status).toEqual(403)
  })
})

describe('DELETE /sites/:id', () => {
  it('deletes a site', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const team = await createTestTeam(user.id)
    const site = await createTestSite(team.id)

    const deleteResponse = await authenticatedRequest(`/sites/${site.id}`, {
      method: 'DELETE',
      token
    })

    expect(deleteResponse.status).toEqual(200)
    expect(await deleteResponse.json()).toEqual({ success: true })

    // Verify site no longer exists.
    const getResponse = await authenticatedRequest(`/sites/${site.id}`, {
      token
    })

    expect(getResponse.status).toEqual(404)
  })

  it('returns 403 when not a member', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' })
    const { user: other } = await createTestUser({ email: 'other@example.com' })
    const team = await createTestTeam(owner.id)
    const site = await createTestSite(team.id)

    const token = await createAuthToken(other.id, other.email)
    const response = await authenticatedRequest(`/sites/${site.id}`, {
      method: 'DELETE',
      token
    })

    expect(response.status).toEqual(403)
  })
})
