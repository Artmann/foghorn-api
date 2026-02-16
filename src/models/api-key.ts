import { BaseModel } from 'esix'
import { z } from 'zod'

import { timestampToDateTime } from '../lib/time'

export const createApiKeySchema = z.object({
  expiresAt: z.string().datetime('Invalid date format.').optional(),
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(100, 'Name must be 100 characters or less.')
})

export interface ApiKeyDto {
  createdAt: string
  expiresAt: string | null
  id: string
  keyPrefix: string
  lastUsedAt: string | null
  name: string
}

export interface CreateApiKeyDto {
  createdAt: string
  expiresAt: string | null
  id: string
  key: string
  keyPrefix: string
  name: string
}

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
    expiresAt: apiKey.expiresAt ? timestampToDateTime(apiKey.expiresAt) : null,
    id: apiKey.id,
    keyPrefix: apiKey.keyPrefix,
    lastUsedAt: apiKey.lastUsedAt
      ? timestampToDateTime(apiKey.lastUsedAt)
      : null,
    name: apiKey.name
  }
}
