import { Hono } from 'hono'
import { afterEach, describe, expect, it } from 'vitest'

import { rateLimiter, resetRateLimiter } from './rate-limit'

function createApp(max: number) {
  const app = new Hono()

  app.use('*', rateLimiter({ max, windowMs: 60_000 }))
  app.get('/test', (c) => c.json({ ok: true }))

  return app
}

function request(app: Hono, ip = '1.2.3.4') {
  return app.request('/test', {
    headers: { 'cf-connecting-ip': ip }
  })
}

afterEach(() => {
  resetRateLimiter()
})

describe('rate limiter', () => {
  it('allows requests under the limit', async () => {
    const app = createApp(3)

    const response = await request(app)

    expect(response.status).toEqual(200)
  })

  it('returns 429 when the limit is exceeded', async () => {
    const app = createApp(3)

    await request(app)
    await request(app)
    await request(app)
    const response = await request(app)

    expect(response.status).toEqual(429)
    expect(await response.json()).toEqual({
      error: { message: 'Too many requests. Please try again later.' }
    })
  })

  it('includes Retry-After header on 429 responses', async () => {
    const app = createApp(1)

    await request(app)
    const response = await request(app)

    expect(response.status).toEqual(429)
    expect(response.headers.get('Retry-After')).toBeTruthy()

    const retryAfter = Number(response.headers.get('Retry-After'))
    expect(retryAfter).toBeGreaterThan(0)
    expect(retryAfter).toBeLessThanOrEqual(60)
  })

  it('tracks different IPs independently', async () => {
    const app = createApp(1)

    const first = await request(app, '10.0.0.1')
    const second = await request(app, '10.0.0.2')

    expect(first.status).toEqual(200)
    expect(second.status).toEqual(200)
  })

  it('blocks one IP without affecting another', async () => {
    const app = createApp(1)

    await request(app, '10.0.0.1')
    const blocked = await request(app, '10.0.0.1')
    const allowed = await request(app, '10.0.0.2')

    expect(blocked.status).toEqual(429)
    expect(allowed.status).toEqual(200)
  })
})
