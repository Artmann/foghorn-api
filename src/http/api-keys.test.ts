import { describe, expect, it } from 'vitest'

import {
  app,
  createAuthToken,
  createTestApiKey,
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

describe('POST /api-keys', () => {
  it('returns 201 with CreateApiKeyDto', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const response = await authenticatedRequest('/api-keys', {
      method: 'POST',
      body: { name: 'My API Key' },
      token
    })

    expect(response.status).toEqual(201)
    expect(await response.json()).toEqual({
      apiKey: {
        createdAt: expect.any(String),
        expiresAt: null,
        id: expect.any(String),
        key: expect.stringMatching(/^fh_/),
        keyPrefix: expect.any(String),
        name: 'My API Key'
      }
    })
  })

  it('key starts with fh_', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const response = await authenticatedRequest('/api-keys', {
      method: 'POST',
      body: { name: 'Test Key' },
      token
    })

    const body = (await response.json()) as { apiKey: { key: string } }

    expect(body.apiKey.key).toMatch(/^fh_/)
  })

  it('returns null expiresAt when not provided', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const response = await authenticatedRequest('/api-keys', {
      method: 'POST',
      body: { name: 'No Expiry' },
      token
    })

    const body = (await response.json()) as {
      apiKey: { expiresAt: string | null }
    }

    expect(body.apiKey.expiresAt).toBeNull()
  })

  it('returns expiresAt as ISO string when provided', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const futureDate = '2030-01-01T00:00:00.000Z'

    const response = await authenticatedRequest('/api-keys', {
      method: 'POST',
      body: { name: 'Expiring Key', expiresAt: futureDate },
      token
    })

    expect(response.status).toEqual(201)

    const body = (await response.json()) as { apiKey: { expiresAt: string } }

    expect(body.apiKey.expiresAt).toEqual(futureDate)
  })

  it('returns 400 for invalid expiresAt format', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const response = await authenticatedRequest('/api-keys', {
      method: 'POST',
      body: { name: 'Bad Date', expiresAt: 'not-a-date' },
      token
    })

    expect(response.status).toEqual(400)
  })

  it('returns 400 for missing name', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const response = await authenticatedRequest('/api-keys', {
      method: 'POST',
      body: {},
      token
    })

    expect(response.status).toEqual(400)
  })

  it('returns 400 for empty name', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const response = await authenticatedRequest('/api-keys', {
      method: 'POST',
      body: { name: '   ' },
      token
    })

    expect(response.status).toEqual(400)
  })

  it('returns 400 for name exceeding 100 chars', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const response = await authenticatedRequest('/api-keys', {
      method: 'POST',
      body: { name: 'a'.repeat(101) },
      token
    })

    expect(response.status).toEqual(400)
  })

  it('returns 401 without auth', async () => {
    const response = await app.request(
      '/api-keys',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test' })
      },
      testEnvironment,
      mockExecutionContext
    )

    expect(response.status).toEqual(401)
  })
})

describe('GET /api-keys', () => {
  it('returns array of ApiKeyDto objects', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    await createTestApiKey(user.id, 'Key 1')

    const response = await authenticatedRequest('/api-keys', { token })

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      apiKeys: [
        {
          createdAt: expect.any(String),
          expiresAt: null,
          id: expect.any(String),
          keyPrefix: expect.any(String),
          lastUsedAt: null,
          name: 'Key 1'
        }
      ]
    })
  })

  it('returns empty array when user has no keys', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const response = await authenticatedRequest('/api-keys', { token })

    expect(await response.json()).toEqual({ apiKeys: [] })
  })

  it('only returns keys for authenticated user', async () => {
    const { user: user1 } = await createTestUser({ email: 'user1@example.com' })
    const { user: user2 } = await createTestUser({ email: 'user2@example.com' })

    await createTestApiKey(user1.id, 'User1 Key')
    await createTestApiKey(user2.id, 'User2 Key')

    const token = await createAuthToken(user1.id, user1.email)
    const response = await authenticatedRequest('/api-keys', { token })

    expect(await response.json()).toEqual({
      apiKeys: [
        {
          createdAt: expect.any(String),
          expiresAt: null,
          id: expect.any(String),
          keyPrefix: expect.any(String),
          lastUsedAt: null,
          name: 'User1 Key'
        }
      ]
    })
  })

  it('does not include keyHash in response', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    await createTestApiKey(user.id)

    const response = await authenticatedRequest('/api-keys', { token })
    const body = (await response.json()) as { apiKeys: unknown[] }

    expect(body.apiKeys[0]).not.toHaveProperty('keyHash')
  })

  it('returns 401 without auth', async () => {
    const response = await app.request(
      '/api-keys',
      {},
      testEnvironment,
      mockExecutionContext
    )

    expect(response.status).toEqual(401)
  })
})

describe('DELETE /api-keys/:id', () => {
  it('returns success and key no longer in list', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)
    const { apiKey } = await createTestApiKey(user.id)

    const deleteResponse = await authenticatedRequest(
      `/api-keys/${apiKey.id}`,
      {
        method: 'DELETE',
        token
      }
    )

    expect(deleteResponse.status).toEqual(200)
    expect(await deleteResponse.json()).toEqual({ success: true })

    const listResponse = await authenticatedRequest('/api-keys', { token })

    expect(await listResponse.json()).toEqual({ apiKeys: [] })
  })

  it('returns 404 for non-existent key', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const response = await authenticatedRequest(
      '/api-keys/000000000000000000000000',
      {
        method: 'DELETE',
        token
      }
    )

    expect(response.status).toEqual(404)
  })

  it('returns 404 for key belonging to another user', async () => {
    const { user: user1 } = await createTestUser({ email: 'owner@example.com' })
    const { user: user2 } = await createTestUser({ email: 'other@example.com' })
    const { apiKey } = await createTestApiKey(user1.id)

    const token = await createAuthToken(user2.id, user2.email)
    const response = await authenticatedRequest(`/api-keys/${apiKey.id}`, {
      method: 'DELETE',
      token
    })

    expect(response.status).toEqual(404)
  })

  it('returns 401 without auth', async () => {
    const response = await app.request(
      '/api-keys/someid',
      { method: 'DELETE' },
      testEnvironment,
      mockExecutionContext
    )

    expect(response.status).toEqual(401)
  })
})
