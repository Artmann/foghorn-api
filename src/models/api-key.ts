export interface ApiKey {
  _id: string
  name: string
  keyHash: string
  keyPrefix: string
  userId: string
  createdAt: string
  lastUsedAt: string | null
}

export interface CreateApiKeyInput {
  name: string
}

export interface ApiKeyResponse {
  id: string
  name: string
  keyPrefix: string
  createdAt: string
  lastUsedAt: string | null
}

export interface CreateApiKeyResponse {
  id: string
  name: string
  key: string
  keyPrefix: string
  createdAt: string
}

export function toApiKeyResponse(apiKey: ApiKey): ApiKeyResponse {
  return {
    id: apiKey._id,
    name: apiKey.name,
    keyPrefix: apiKey.keyPrefix,
    createdAt: apiKey.createdAt,
    lastUsedAt: apiKey.lastUsedAt
  }
}
