import { afterEach, describe, expect, it } from 'vitest'

import { checkRateLimit, resetRateLimiter } from './rate-limit'

const now = Date.UTC(2026, 9, 8, 12, 0, 30)
const limit = { max: 2, windowMs: 60_000 }

afterEach(() => {
  resetRateLimiter()
})

describe('checkRateLimit', () => {
  it('allows requests under the limit', () => {
    expect(checkRateLimit('1.2.3.4', limit, now)).toEqual({ allowed: true })
    expect(checkRateLimit('1.2.3.4', limit, now)).toEqual({ allowed: true })
  })

  it('blocks requests over the limit until the window ends', () => {
    checkRateLimit('1.2.3.4', limit, now)
    checkRateLimit('1.2.3.4', limit, now)

    expect(checkRateLimit('1.2.3.4', limit, now)).toEqual({
      allowed: false,
      retryAfterSeconds: 30
    })
  })

  it('allows requests again in the next window', () => {
    checkRateLimit('1.2.3.4', limit, now)
    checkRateLimit('1.2.3.4', limit, now)

    expect(checkRateLimit('1.2.3.4', limit, now + 60_000)).toEqual({
      allowed: true
    })
  })

  it('tracks different keys independently', () => {
    checkRateLimit('10.0.0.1', limit, now)
    checkRateLimit('10.0.0.1', limit, now)

    expect(checkRateLimit('10.0.0.1', limit, now)).toEqual({
      allowed: false,
      retryAfterSeconds: 30
    })
    expect(checkRateLimit('10.0.0.2', limit, now)).toEqual({ allowed: true })
  })
})
