import { describe, expect, it } from 'vitest'
import { sign } from 'hono/jwt'

import {
  app,
  createAuthToken,
  createExpiredToken,
  createTestApiKey,
  createTestUser,
  mockExecutionContext,
  testEnvironment,
  testJwtSecret
} from '../test-helpers'

function apiKeysRequest(token: string) {
  return app.request(
    '/api-keys',
    { headers: { Authorization: `Bearer ${token}` } },
    testEnvironment,
    mockExecutionContext
  )
}

describe('JWT authentication', () => {
  it('accepts valid JWT token', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const response = await apiKeysRequest(token)

    expect(response.status).toEqual(200)
  })

  it('rejects expired JWT', async () => {
    const { user } = await createTestUser()
    const token = await createExpiredToken(user.id, user.email)

    const response = await apiKeysRequest(token)

    expect(response.status).toEqual(401)
  })

  it('rejects JWT signed with wrong secret', async () => {
    const { user } = await createTestUser()
    const now = Math.floor(Date.now() / 1000)

    const token = await sign(
      { sub: user.id, email: user.email, iat: now, exp: now + 86400 },
      'wrong-secret-key',
      'HS256'
    )

    const response = await apiKeysRequest(token)

    expect(response.status).toEqual(401)
  })

  it('rejects JWT with tampered payload', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    const parts = token.split('.')
    const payload = JSON.parse(atob(parts[1]))

    payload.sub = 'tampered-user-id'
    parts[1] = btoa(JSON.stringify(payload))

    const tampered = parts.join('.')
    const response = await apiKeysRequest(tampered)

    expect(response.status).toEqual(401)
  })

  it('rejects JWT without sub claim', async () => {
    const now = Math.floor(Date.now() / 1000)

    const token = await sign(
      { email: 'test@example.com', iat: now, exp: now + 86400 },
      testJwtSecret,
      'HS256'
    )

    const response = await apiKeysRequest(token)

    expect(response.status).toEqual(401)
  })

  it('rejects JWT with empty sub claim', async () => {
    const now = Math.floor(Date.now() / 1000)

    const token = await sign(
      { sub: '', email: 'test@example.com', iat: now, exp: now + 86400 },
      testJwtSecret,
      'HS256'
    )

    const response = await apiKeysRequest(token)

    expect(response.status).toEqual(401)
  })

  it('rejects malformed JWT', async () => {
    const response = await apiKeysRequest('not.a.valid.jwt')

    expect(response.status).toEqual(401)
  })

  it('rejects JWT with invalid base64 in payload', async () => {
    const response = await apiKeysRequest(
      'eyJhbGciOiJIUzI1NiJ9.!!!invalid!!!.signature'
    )

    expect(response.status).toEqual(401)
  })

  it('rejects alg:none attack', async () => {
    const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
    const payload = btoa(
      JSON.stringify({
        sub: 'attacker',
        email: 'attacker@example.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 86400
      })
    )

    const token = `${header}.${payload}.`
    const response = await apiKeysRequest(token)

    expect(response.status).toEqual(401)
  })

  it('rejects empty Bearer token', async () => {
    const response = await app.request(
      '/api-keys',
      { headers: { Authorization: 'Bearer ' } },
      testEnvironment,
      mockExecutionContext
    )

    expect(response.status).toEqual(401)
  })
})

describe('API key authentication', () => {
  it('accepts valid API key', async () => {
    const { user } = await createTestUser()
    const { key } = await createTestApiKey(user.id)

    const response = await apiKeysRequest(key)

    expect(response.status).toEqual(200)
  })

  it('rejects unknown API key', async () => {
    const response = await apiKeysRequest('fh_unknownkey1234567890')

    expect(response.status).toEqual(401)
  })

  it('calls waitUntil for background lastUsedAt update', async () => {
    const { user } = await createTestUser()
    const { key } = await createTestApiKey(user.id)

    await apiKeysRequest(key)

    expect(mockExecutionContext.waitUntil).toHaveBeenCalledTimes(2)
  })

  it('updates lastUsedAt via waitUntil promise', async () => {
    const { user } = await createTestUser()
    const { apiKey, key } = await createTestApiKey(user.id)

    expect(apiKey.lastUsedAt).toBeNull()

    await apiKeysRequest(key)

    const waitUntilPromise = mockExecutionContext.waitUntil.mock.calls[0][0]

    await waitUntilPromise
  })

  it('rejects expired API key', async () => {
    const { user } = await createTestUser()
    const pastTimestamp = Date.now() - 3600_000
    const { key } = await createTestApiKey(user.id, 'Expired Key', {
      expiresAt: pastTimestamp
    })

    const response = await apiKeysRequest(key)

    expect(response.status).toEqual(401)
    expect(await response.json()).toEqual({
      error: { message: 'API key has expired.' }
    })
  })
})

describe('header parsing', () => {
  it('returns 401 without Authorization header', async () => {
    const response = await app.request(
      '/api-keys',
      {},
      testEnvironment,
      mockExecutionContext
    )

    expect(response.status).toEqual(401)
  })

  it('returns 401 with non-Bearer scheme', async () => {
    const response = await app.request(
      '/api-keys',
      { headers: { Authorization: 'Basic dXNlcjpwYXNz' } },
      testEnvironment,
      mockExecutionContext
    )

    expect(response.status).toEqual(401)
  })
})
