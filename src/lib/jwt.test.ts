import { describe, expect, it } from 'vitest'

import { signJwt, verifyJwt } from './jwt'

const secret = 'test-jwt-secret-that-is-long-enough-for-hs256-signing'
const now = 1_790_000_000

describe('signJwt and verifyJwt', () => {
  it('round-trips a payload', async () => {
    const token = await signJwt(
      { email: 'a@example.com', exp: now + 60, iat: now, sub: 'user-1' },
      secret
    )

    expect(await verifyJwt(token, secret, now)).toEqual({
      payload: {
        email: 'a@example.com',
        exp: now + 60,
        iat: now,
        sub: 'user-1'
      },
      valid: true
    })
  })

  it('accepts tokens signed by the previous implementation', async () => {
    // Signed by `hono/jwt`, which the API used before.
    const token =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE3OTAwMDAwNjAsInN1YiI6InVzZXItMSJ9.pu9CiWostF6gg0l64805jr_tY3zJWPtPFdt--0sa1_o'

    expect(await verifyJwt(token, secret, now)).toEqual({
      payload: { exp: now + 60, sub: 'user-1' },
      valid: true
    })
  })

  it('rejects expired tokens', async () => {
    const token = await signJwt({ exp: now - 1, sub: 'user-1' }, secret)

    expect(await verifyJwt(token, secret, now)).toEqual({
      reason: 'expired',
      valid: false
    })
  })

  it('rejects tokens signed with another secret', async () => {
    const token = await signJwt({ exp: now + 60, sub: 'user-1' }, 'other')

    expect(await verifyJwt(token, secret, now)).toEqual({
      reason: 'invalid',
      valid: false
    })
  })

  it('rejects malformed tokens', async () => {
    for (const token of ['', 'abc', 'a.b.c', 'a.b']) {
      expect(await verifyJwt(token, secret, now)).toEqual({
        reason: 'invalid',
        valid: false
      })
    }
  })

  it('rejects a tampered payload', async () => {
    const token = await signJwt({ exp: now + 60, sub: 'user-1' }, secret)
    const [header, , signature] = token.split('.')
    const forged = btoa(
      JSON.stringify({ exp: now + 60, sub: 'admin' })
    ).replace(/=+$/, '')

    expect(
      await verifyJwt(`${header}.${forged}.${signature}`, secret, now)
    ).toEqual({ reason: 'invalid', valid: false })
  })
})
