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
  })
})
