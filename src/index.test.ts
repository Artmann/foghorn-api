import { describe, expect, it } from 'vitest'

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
      service: 'foghorn-api',
      status: 'ok'
    })
  })
})
