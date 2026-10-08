import { describe, expect, it } from 'vitest'

import { JobRunner } from './models/job-runner'
import { app, mockExecutionContext, testEnvironment } from './test-helpers'

describe('GET /', () => {
  it('returns health check', async () => {
    const response = await app.request(
      '/',
      {},
      testEnvironment,
      mockExecutionContext
    )

    expect(response.status).toEqual(200)
    expect(await response.json()).toEqual({
      jobRunner: { lastSeenAt: null, status: 'offline' },
      service: 'foghorn-api',
      status: 'ok'
    })
  })

  it('shows when a job runner is online', async () => {
    const now = Date.now()

    await JobRunner.create({
      lastSeenAt: now,
      name: 'runner-1',
      startedAt: now,
      stoppedAt: null
    })

    const response = await app.request(
      '/',
      {},
      testEnvironment,
      mockExecutionContext
    )

    expect(await response.json()).toEqual({
      jobRunner: { lastSeenAt: new Date(now).toISOString(), status: 'online' },
      service: 'foghorn-api',
      status: 'ok'
    })
  })
})

describe('GET /openapi', () => {
  it('returns the OpenAPI spec', async () => {
    const response = await app.request(
      '/openapi',
      {},
      testEnvironment,
      mockExecutionContext
    )

    expect(response.status).toEqual(200)

    const body = (await response.json()) as Record<string, unknown>

    expect(body.openapi).toEqual('3.1.0')
    expect(body.paths).toHaveProperty('/')
    expect(body.paths).toHaveProperty('/auth/sign-up')
    expect(body.paths).toHaveProperty('/auth/sign-in')
    expect(body.paths).toHaveProperty('/api-keys')
    expect(body.paths).toHaveProperty('/api-keys/{id}')
    expect(body.paths).toHaveProperty('/sites/{id}')
    expect(body.paths).toHaveProperty('/issues')
  })

  it('documents the error responses', async () => {
    const response = await app.request('/openapi')
    const body = (await response.json()) as {
      paths: Record<string, Record<string, { responses: object }>>
    }

    expect(Object.keys(body.paths['/sites/{id}'].get.responses).sort()).toEqual(
      ['200', '401', '403', '404'].sort()
    )
  })
})

describe('errors', () => {
  it('returns validation failures as JSON with the field message', async () => {
    const response = await app.request('/auth/sign-up', {
      body: JSON.stringify({ email: 'not-an-email', password: 'password123' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })

    expect(response.status).toEqual(400)
    expect(await response.json()).toEqual({
      error: { code: 'ValidationFailed', message: 'Invalid email format.' }
    })
  })

  it('explains a missing field', async () => {
    const response = await app.request('/auth/sign-up', {
      body: JSON.stringify({ email: 'person@example.com' }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })

    expect(await response.json()).toEqual({
      error: { code: 'ValidationFailed', message: 'Password is required.' }
    })
  })

  it('rejects a body that is not JSON', async () => {
    const response = await app.request('/auth/sign-in', {
      body: '{not json',
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    })

    expect(response.status).toEqual(400)
    expect(await response.json()).toEqual({
      error: {
        code: 'ValidationFailed',
        message: expect.any(String)
      }
    })
  })

  it('returns unknown routes as JSON', async () => {
    const response = await app.request('/nope')

    expect(response.status).toEqual(404)
    expect(await response.json()).toEqual({
      error: {
        code: 'RouteNotFound',
        message:
          'There is no GET /nope endpoint. See GET /openapi for the available endpoints.'
      }
    })
  })

  it('returns a missing token as JSON', async () => {
    const response = await app.request('/sites')

    expect(response.status).toEqual(401)
    expect(await response.json()).toEqual({
      error: {
        code: 'Unauthorized',
        message:
          'Missing authorization header. Send "Authorization: Bearer <token>" with a JWT or an API key.'
      }
    })
  })
})

describe('rate limiting', () => {
  it('limits auth requests per IP', async () => {
    const signIn = () =>
      app.request('/auth/sign-in', {
        body: JSON.stringify({ email: 'a@example.com', password: 'x' }),
        headers: {
          'Content-Type': 'application/json',
          'cf-connecting-ip': '10.1.1.1'
        },
        method: 'POST'
      })

    for (let index = 0; index < 10; index++) {
      await signIn()
    }

    const response = await signIn()

    expect(response.status).toEqual(429)
    expect(Number(response.headers.get('retry-after'))).toBeGreaterThan(0)
    expect(await response.json()).toEqual({
      error: {
        code: 'RateLimited',
        message: expect.stringContaining('Too many requests.')
      }
    })
  })
})

describe('security headers', () => {
  it('sets security headers on every response', async () => {
    const response = await app.request('/')

    expect({
      contentTypeOptions: response.headers.get('x-content-type-options'),
      frameOptions: response.headers.get('x-frame-options')
    }).toEqual({ contentTypeOptions: 'nosniff', frameOptions: 'SAMEORIGIN' })
  })
})
