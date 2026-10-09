import { Effect, References } from 'effect'
import { describe, expect, it } from 'vitest'

import { RateLimiter, type RateLimitBinding } from './rate-limiter'

function check(env: Record<string, unknown>, key: string, times = 1) {
  return Effect.runPromise(
    Effect.gen(function* () {
      const rateLimiter = yield* RateLimiter
      const results = []

      for (let count = 0; count < times; count++) {
        results.push(yield* rateLimiter.check('auth', key))
      }

      return results
    }).pipe(
      Effect.provide(RateLimiter.layer(env)),
      Effect.provideService(References.MinimumLogLevel, 'None')
    )
  )
}

describe('RateLimiter', () => {
  it('asks the binding with the key', async () => {
    const limit = vi.fn<RateLimitBinding['limit']>(() =>
      Promise.resolve({ success: true })
    )

    const results = await check(
      { AUTH_RATE_LIMITER: { limit } },
      '1.2.3.4:/auth'
    )

    expect(results).toEqual([{ allowed: true }])
    expect(limit.mock.calls).toEqual([[{ key: '1.2.3.4:/auth' }]])
  })

  it('rejects when the binding says the limit is reached', async () => {
    const binding: RateLimitBinding = {
      limit: () => Promise.resolve({ success: false })
    }

    const results = await check({ AUTH_RATE_LIMITER: binding }, 'blocked')

    expect(results).toEqual([{ allowed: false, retryAfterSeconds: 60 }])
  })

  it('counts in memory when the binding fails', async () => {
    const binding: RateLimitBinding = {
      limit: () => Promise.reject(new Error('Binding unavailable'))
    }

    const results = await check({ AUTH_RATE_LIMITER: binding }, 'failing', 11)

    expect(results.slice(0, 10)).toEqual(Array(10).fill({ allowed: true }))
    expect(results[10]).toEqual({
      allowed: false,
      retryAfterSeconds: expect.any(Number)
    })
  })

  it('counts in memory without a binding', async () => {
    const results = await check({}, 'no-binding', 11)

    expect(results.filter((result) => result.allowed)).toHaveLength(10)
  })
})
