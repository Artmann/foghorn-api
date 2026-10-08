import { BaseModel } from 'esix'

import type { ApiKeyDto } from '../api/schemas'
import { timestampToDateTime } from '../lib/time'

export class ApiKey extends BaseModel {
  public expiresAt: number | null = null
  public keyHash = ''
  public keyPrefix = ''
  public lastUsedAt: number | null = null
  public name = ''
  public userId = ''
}

export function toApiKeyDto(apiKey: ApiKey): ApiKeyDto {
  return {
    createdAt: timestampToDateTime(apiKey.createdAt),
    expiresAt:
      apiKey.expiresAt === null ? null : timestampToDateTime(apiKey.expiresAt),
    id: apiKey.id,
    keyPrefix: apiKey.keyPrefix,
    lastUsedAt:
      apiKey.lastUsedAt === null
        ? null
        : timestampToDateTime(apiKey.lastUsedAt),
    name: apiKey.name
  }
}
