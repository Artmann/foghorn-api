import { describe, expect, it } from 'vitest'

import { ApiKey, toApiKeyDto } from './api-key'

describe('toApiKeyDto', () => {
  it('returns id, name, keyPrefix, createdAt, and lastUsedAt', () => {
    const apiKey = new ApiKey()
    apiKey.id = 'key123'
    apiKey.name = 'My Key'
    apiKey.keyPrefix = 'fh_abc12'
    apiKey.createdAt = 1705320600000
    apiKey.lastUsedAt = 1705407000000

    expect(toApiKeyDto(apiKey)).toEqual({
      createdAt: '2024-01-15T12:10:00.000Z',
      expiresAt: null,
      id: 'key123',
      keyPrefix: 'fh_abc12',
      lastUsedAt: '2024-01-16T12:10:00.000Z',
      name: 'My Key'
    })
  })

  it('does not include keyHash or userId', () => {
    const apiKey = new ApiKey()
    apiKey.id = 'key123'
    apiKey.name = 'My Key'
    apiKey.keyPrefix = 'fh_abc12'
    apiKey.createdAt = 1705320600000
    apiKey.lastUsedAt = null
    apiKey.keyHash = 'secret-hash'
    apiKey.userId = 'user123'

    const result = toApiKeyDto(apiKey)

    expect(result).not.toHaveProperty('keyHash')
    expect(result).not.toHaveProperty('userId')
  })

  it('handles null lastUsedAt', () => {
    const apiKey = new ApiKey()
    apiKey.id = 'key123'
    apiKey.name = 'My Key'
    apiKey.keyPrefix = 'fh_abc12'
    apiKey.createdAt = 1705320600000
    apiKey.lastUsedAt = null

    expect(toApiKeyDto(apiKey)).toEqual({
      createdAt: '2024-01-15T12:10:00.000Z',
      expiresAt: null,
      id: 'key123',
      keyPrefix: 'fh_abc12',
      lastUsedAt: null,
      name: 'My Key'
    })
  })
})
