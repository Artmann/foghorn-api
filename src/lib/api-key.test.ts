import { describe, expect, it } from 'vitest'

import { generateApiKey, hashApiKey, isApiKey } from './api-key'

describe('generateApiKey', () => {
  it('returns key with fh_ prefix, hash, and prefix', async () => {
    const result = await generateApiKey()

    expect(result).toEqual({
      hash: expect.stringMatching(/^[a-f0-9]{64}$/),
      key: expect.stringMatching(/^fh_/),
      prefix: result.key.substring(0, 8)
    })
  })
})

describe('hashApiKey', () => {
  it('is deterministic (same input produces same hash)', async () => {
    const hash1 = await hashApiKey('fh_test123')
    const hash2 = await hashApiKey('fh_test123')

    expect(hash1).toEqual(hash2)
  })

  it('different inputs produce different hashes', async () => {
    const hash1 = await hashApiKey('fh_test123')
    const hash2 = await hashApiKey('fh_test456')

    expect(hash1).not.toEqual(hash2)
  })
})

describe('isApiKey', () => {
  it('returns true for fh_ prefixed strings', () => {
    expect(isApiKey('fh_abc123')).toEqual(true)
  })

  it('returns false for JWT-like strings', () => {
    expect(isApiKey('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig')).toEqual(
      false
    )
  })

  it('returns false for empty strings', () => {
    expect(isApiKey('')).toEqual(false)
  })
})
