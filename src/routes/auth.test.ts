import { describe, expect, it } from 'vitest'

import {
  app,
  createTestUser,
  mockExecutionContext,
  testEnvironment
} from '../test-helpers'

function jsonRequest(path: string, body: Record<string, unknown>) {
  return app.request(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    },
    testEnvironment,
    mockExecutionContext
  )
}

describe('POST /auth/sign-up', () => {
  it('creates user and returns 201 with UserDto shape', async () => {
    const response = await jsonRequest('/auth/sign-up', {
      email: 'new@example.com',
      password: 'password123'
    })

    expect(response.status).toEqual(201)
    expect(await response.json()).toEqual({
      user: {
        createdAt: expect.any(String),
        email: 'new@example.com',
        id: expect.any(String)
      }
    })
  })

  it('normalizes email to lowercase', async () => {
    const response = await jsonRequest('/auth/sign-up', {
      email: 'UPPER@EXAMPLE.COM',
      password: 'password123'
    })

    expect(response.status).toEqual(201)
    expect(await response.json()).toEqual({
      user: {
        createdAt: expect.any(String),
        email: 'upper@example.com',
        id: expect.any(String)
      }
    })
  })

  it('returns 400 for invalid email format', async () => {
    const response = await jsonRequest('/auth/sign-up', {
      email: 'not-an-email',
      password: 'password123'
    })

    expect(response.status).toEqual(400)
  })

  it('returns 400 for password shorter than 8 chars', async () => {
    const response = await jsonRequest('/auth/sign-up', {
      email: 'short@example.com',
      password: 'short'
    })

    expect(response.status).toEqual(400)
  })

  it('returns 409 for duplicate email', async () => {
    await createTestUser({ email: 'dup@example.com' })

    const response = await jsonRequest('/auth/sign-up', {
      email: 'dup@example.com',
      password: 'password123'
    })

    expect(response.status).toEqual(409)
  })
})

describe('POST /auth/sign-in', () => {
  it('returns 200 with token, expiresIn, and user', async () => {
    const { user } = await createTestUser({
      email: 'signin@example.com',
      password: 'password123'
    })

    const response = await jsonRequest('/auth/sign-in', {
      email: 'signin@example.com',
      password: 'password123'
    })

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      expiresIn: 86400,
      token: expect.any(String),
      user: {
        createdAt: expect.any(String),
        email: 'signin@example.com',
        id: user.id
      }
    })
  })

  it('token is a valid JWT (three dot-separated segments)', async () => {
    await createTestUser({ email: 'jwt@example.com', password: 'password123' })

    const response = await jsonRequest('/auth/sign-in', {
      email: 'jwt@example.com',
      password: 'password123'
    })

    const body = (await response.json()) as { token: string }
    const parts = body.token.split('.')

    expect(parts).toHaveLength(3)
  })

  it('token contains correct sub, email, iat, exp claims', async () => {
    const { user } = await createTestUser({
      email: 'claims@example.com',
      password: 'password123'
    })

    const response = await jsonRequest('/auth/sign-in', {
      email: 'claims@example.com',
      password: 'password123'
    })

    const { token } = (await response.json()) as { token: string }
    const payload = JSON.parse(atob(token.split('.')[1]))

    expect(payload).toEqual({
      email: 'claims@example.com',
      exp: expect.any(Number),
      iat: expect.any(Number),
      sub: user.id
    })
    expect(payload.exp - payload.iat).toEqual(86400)
  })

  it('returns 400 for missing email/password', async () => {
    const response = await jsonRequest('/auth/sign-in', {
      email: 'test@example.com'
    })

    expect(response.status).toEqual(400)
  })

  it('returns 401 for non-existent email', async () => {
    const response = await jsonRequest('/auth/sign-in', {
      email: 'nobody@example.com',
      password: 'password123'
    })

    expect(response.status).toEqual(401)
  })

  it('returns 401 for wrong password', async () => {
    await createTestUser({
      email: 'wrong@example.com',
      password: 'password123'
    })

    const response = await jsonRequest('/auth/sign-in', {
      email: 'wrong@example.com',
      password: 'wrongpassword'
    })

    expect(response.status).toEqual(401)
  })

  it('uses generic error message (no email enumeration)', async () => {
    const response = await jsonRequest('/auth/sign-in', {
      email: 'nobody@example.com',
      password: 'password123'
    })

    expect(await response.json()).toEqual({
      error: { message: 'Invalid credentials.' }
    })
  })
})
