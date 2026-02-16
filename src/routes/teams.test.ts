import { describe, expect, it } from 'vitest'

import {
  app,
  createAuthToken,
  createTestTeam,
  createTestTeamMember,
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

describe('POST /teams', () => {
  it('returns 201 with TeamDto', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const response = await authenticatedRequest('/teams', {
      method: 'POST',
      body: { name: 'My Team' },
      token
    })

    expect(response.status).toEqual(201)
    expect(await response.json()).toEqual({
      team: {
        createdAt: expect.any(String),
        id: expect.any(String),
        name: 'My Team'
      }
    })
  })

  it('creator is automatically added as a member', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const createResponse = await authenticatedRequest('/teams', {
      method: 'POST',
      body: { name: 'My Team' },
      token
    })

    const { team } = (await createResponse.json()) as { team: { id: string } }

    const membersResponse = await authenticatedRequest(
      `/teams/${team.id}/members`,
      { token }
    )

    const { members } = (await membersResponse.json()) as {
      members: { userId: string }[]
    }

    expect(members).toHaveLength(1)
    expect(members[0].userId).toEqual(user.id)
  })

  it('returns 400 for missing name', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const response = await authenticatedRequest('/teams', {
      method: 'POST',
      body: {},
      token
    })

    expect(response.status).toEqual(400)
  })

  it('returns 400 for empty name', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const response = await authenticatedRequest('/teams', {
      method: 'POST',
      body: { name: '   ' },
      token
    })

    expect(response.status).toEqual(400)
  })

  it('returns 400 for name exceeding 100 chars', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const response = await authenticatedRequest('/teams', {
      method: 'POST',
      body: { name: 'a'.repeat(101) },
      token
    })

    expect(response.status).toEqual(400)
  })
})

describe('GET /teams', () => {
  it('returns teams the user belongs to', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const team = await createTestTeam(user.id, { name: 'Team Alpha' })

    const response = await authenticatedRequest('/teams', { token })

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      teams: [
        {
          createdAt: expect.any(String),
          id: team.id,
          name: 'Team Alpha'
        }
      ]
    })
  })

  it('returns only teams user belongs to', async () => {
    const { user: user1 } = await createTestUser({ email: 'user1@example.com' })
    const { user: user2 } = await createTestUser({ email: 'user2@example.com' })

    await createTestTeam(user1.id, { name: 'User1 Team' })
    await createTestTeam(user2.id, { name: 'User2 Team' })

    const token = await createAuthToken(user1.id, user1.email)
    const response = await authenticatedRequest('/teams', { token })

    const { teams } = (await response.json()) as { teams: { name: string }[] }

    expect(teams).toHaveLength(1)
    expect(teams[0].name).toEqual('User1 Team')
  })

  it('returns empty array when user has no teams', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const response = await authenticatedRequest('/teams', { token })

    expect(await response.json()).toEqual({ teams: [] })
  })
})

describe('GET /teams/:id', () => {
  it('returns team details for a member', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const team = await createTestTeam(user.id, { name: 'My Team' })

    const response = await authenticatedRequest(`/teams/${team.id}`, { token })

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      team: {
        createdAt: expect.any(String),
        id: team.id,
        name: 'My Team'
      }
    })
  })

  it('returns 403 when not a member', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' })
    const { user: other } = await createTestUser({ email: 'other@example.com' })

    const team = await createTestTeam(owner.id)

    const token = await createAuthToken(other.id, other.email)
    const response = await authenticatedRequest(`/teams/${team.id}`, { token })

    expect(response.status).toEqual(403)
  })

  it('returns 404 for non-existent team', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const response = await authenticatedRequest(
      '/teams/000000000000000000000000',
      { token }
    )

    expect(response.status).toEqual(404)
  })
})

describe('PUT /teams/:id', () => {
  it('updates team name', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const team = await createTestTeam(user.id, { name: 'Old Name' })

    const response = await authenticatedRequest(`/teams/${team.id}`, {
      method: 'PUT',
      body: { name: 'New Name' },
      token
    })

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      team: {
        createdAt: expect.any(String),
        id: team.id,
        name: 'New Name'
      }
    })
  })

  it('returns 403 when not a member', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' })
    const { user: other } = await createTestUser({ email: 'other@example.com' })

    const team = await createTestTeam(owner.id)

    const token = await createAuthToken(other.id, other.email)
    const response = await authenticatedRequest(`/teams/${team.id}`, {
      method: 'PUT',
      body: { name: 'Hacked' },
      token
    })

    expect(response.status).toEqual(403)
  })

  it('returns 400 for invalid name', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const team = await createTestTeam(user.id)

    const response = await authenticatedRequest(`/teams/${team.id}`, {
      method: 'PUT',
      body: { name: '' },
      token
    })

    expect(response.status).toEqual(400)
  })
})

describe('DELETE /teams/:id', () => {
  it('deletes team and all memberships', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const team = await createTestTeam(user.id)

    const deleteResponse = await authenticatedRequest(`/teams/${team.id}`, {
      method: 'DELETE',
      token
    })

    expect(deleteResponse.status).toEqual(200)
    expect(await deleteResponse.json()).toEqual({ success: true })

    // Team should no longer exist.
    const getResponse = await authenticatedRequest(`/teams/${team.id}`, {
      token
    })

    expect(getResponse.status).toEqual(404)
  })

  it('returns 403 when not a member', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' })
    const { user: other } = await createTestUser({ email: 'other@example.com' })

    const team = await createTestTeam(owner.id)

    const token = await createAuthToken(other.id, other.email)
    const response = await authenticatedRequest(`/teams/${team.id}`, {
      method: 'DELETE',
      token
    })

    expect(response.status).toEqual(403)
  })
})

describe('POST /teams/:id/members', () => {
  it('adds a member to the team', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' })
    const { user: newMember } = await createTestUser({
      email: 'new@example.com'
    })
    const token = await createAuthToken(owner.id, owner.email)

    const team = await createTestTeam(owner.id)

    const response = await authenticatedRequest(`/teams/${team.id}/members`, {
      method: 'POST',
      body: { userId: newMember.id },
      token
    })

    expect(response.status).toEqual(201)
    expect(await response.json()).toEqual({
      member: {
        createdAt: expect.any(String),
        id: expect.any(String),
        teamId: team.id,
        userId: newMember.id
      }
    })
  })

  it('returns 404 when user does not exist', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const team = await createTestTeam(user.id)

    const response = await authenticatedRequest(`/teams/${team.id}/members`, {
      method: 'POST',
      body: { userId: '000000000000000000000000' },
      token
    })

    expect(response.status).toEqual(404)
  })

  it('returns 409 when user is already a member', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' })
    const { user: member } = await createTestUser({
      email: 'member@example.com'
    })
    const token = await createAuthToken(owner.id, owner.email)

    const team = await createTestTeam(owner.id)
    await createTestTeamMember(team.id, member.id)

    const response = await authenticatedRequest(`/teams/${team.id}/members`, {
      method: 'POST',
      body: { userId: member.id },
      token
    })

    expect(response.status).toEqual(409)
  })

  it('returns 403 when requester is not a member', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' })
    const { user: outsider } = await createTestUser({
      email: 'outsider@example.com'
    })
    const { user: target } = await createTestUser({
      email: 'target@example.com'
    })

    const team = await createTestTeam(owner.id)

    const token = await createAuthToken(outsider.id, outsider.email)
    const response = await authenticatedRequest(`/teams/${team.id}/members`, {
      method: 'POST',
      body: { userId: target.id },
      token
    })

    expect(response.status).toEqual(403)
  })
})

describe('GET /teams/:id/members', () => {
  it('lists all members of a team', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' })
    const { user: member } = await createTestUser({
      email: 'member@example.com'
    })
    const token = await createAuthToken(owner.id, owner.email)

    const team = await createTestTeam(owner.id)
    await createTestTeamMember(team.id, member.id)

    const response = await authenticatedRequest(`/teams/${team.id}/members`, {
      token
    })

    expect(response.status).toEqual(200)

    const { members } = (await response.json()) as {
      members: { userId: string }[]
    }

    expect(members).toHaveLength(2)

    const userIds = members.map((m) => m.userId)
    expect(userIds).toContain(owner.id)
    expect(userIds).toContain(member.id)
  })

  it('returns 403 when not a member', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' })
    const { user: outsider } = await createTestUser({
      email: 'outsider@example.com'
    })

    const team = await createTestTeam(owner.id)

    const token = await createAuthToken(outsider.id, outsider.email)
    const response = await authenticatedRequest(`/teams/${team.id}/members`, {
      token
    })

    expect(response.status).toEqual(403)
  })
})

describe('DELETE /teams/:id/members/:userId', () => {
  it('removes a member from the team', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' })
    const { user: member } = await createTestUser({
      email: 'member@example.com'
    })
    const token = await createAuthToken(owner.id, owner.email)

    const team = await createTestTeam(owner.id)
    await createTestTeamMember(team.id, member.id)

    const deleteResponse = await authenticatedRequest(
      `/teams/${team.id}/members/${member.id}`,
      { method: 'DELETE', token }
    )

    expect(deleteResponse.status).toEqual(200)
    expect(await deleteResponse.json()).toEqual({ success: true })

    // Verify member was removed.
    const membersResponse = await authenticatedRequest(
      `/teams/${team.id}/members`,
      { token }
    )

    const { members } = (await membersResponse.json()) as {
      members: { userId: string }[]
    }

    expect(members).toHaveLength(1)
    expect(members[0].userId).toEqual(owner.id)
  })

  it('allows self-removal', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' })
    const { user: member } = await createTestUser({
      email: 'member@example.com'
    })

    const team = await createTestTeam(owner.id)
    await createTestTeamMember(team.id, member.id)

    const token = await createAuthToken(member.id, member.email)
    const response = await authenticatedRequest(
      `/teams/${team.id}/members/${member.id}`,
      { method: 'DELETE', token }
    )

    expect(response.status).toEqual(200)
  })

  it('returns 404 when member does not exist in team', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const team = await createTestTeam(user.id)

    const response = await authenticatedRequest(
      `/teams/${team.id}/members/000000000000000000000000`,
      { method: 'DELETE', token }
    )

    expect(response.status).toEqual(404)
  })

  it('returns 403 when requester is not a member', async () => {
    const { user: owner } = await createTestUser({ email: 'owner@example.com' })
    const { user: outsider } = await createTestUser({
      email: 'outsider@example.com'
    })

    const team = await createTestTeam(owner.id)

    const token = await createAuthToken(outsider.id, outsider.email)
    const response = await authenticatedRequest(
      `/teams/${team.id}/members/${owner.id}`,
      { method: 'DELETE', token }
    )

    expect(response.status).toEqual(403)
  })
})
