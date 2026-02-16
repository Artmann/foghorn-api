import { Hono } from 'hono'
import type { CloudflareBindings, AppVariables } from '../types/env'
import { createMongoClient } from '../lib/mongodb'
import { generateApiKey } from '../lib/api-key'
import { authMiddleware } from '../middleware/auth'
import type { ApiKey, CreateApiKeyResponse } from '../models/api-key'
import { toApiKeyResponse } from '../models/api-key'

const apiKeys = new Hono<{ Bindings: CloudflareBindings; Variables: AppVariables }>()

apiKeys.use('*', authMiddleware())

apiKeys.post('/', async (c) => {
  const body = await c.req.json<{ name?: string }>()
  const name = body.name?.trim()

  if (!name || name.length === 0) {
    return c.json({ error: 'Name is required' }, 400)
  }

  if (name.length > 100) {
    return c.json({ error: 'Name must be 100 characters or less' }, 400)
  }

  const auth = c.get('auth')
  const { key, hash: keyHash, prefix: keyPrefix } = await generateApiKey()

  const db = createMongoClient(c.env)
  const now = new Date().toISOString()

  const apiKeyId = await db.insertOne('apiKeys', {
    name,
    keyHash,
    keyPrefix,
    userId: auth.userId,
    createdAt: now,
    lastUsedAt: null
  })

  const response: CreateApiKeyResponse = {
    id: apiKeyId,
    name,
    key,
    keyPrefix,
    createdAt: now
  }

  return c.json(response, 201)
})

apiKeys.get('/', async (c) => {
  const auth = c.get('auth')
  const db = createMongoClient(c.env)

  const result = await fetch(
    `https://data.mongodb-api.com/app/${c.env.MONGODB_APP_ID}/endpoint/data/v1/action/find`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': c.env.MONGODB_API_KEY
      },
      body: JSON.stringify({
        dataSource: c.env.MONGODB_CLUSTER,
        database: c.env.MONGODB_DATABASE,
        collection: 'apiKeys',
        filter: { userId: auth.userId },
        projection: { keyHash: 0 }
      })
    }
  )

  if (!result.ok) {
    return c.json({ error: 'Failed to fetch API keys' }, 500)
  }

  const data = (await result.json()) as { documents: ApiKey[] }
  return c.json(data.documents.map(toApiKeyResponse))
})

apiKeys.delete('/:id', async (c) => {
  const auth = c.get('auth')
  const keyId = c.req.param('id')

  const db = createMongoClient(c.env)

  const apiKey = await db.findOne<ApiKey>('apiKeys', {
    _id: { $oid: keyId },
    userId: auth.userId
  })

  if (!apiKey) {
    return c.json({ error: 'API key not found' }, 404)
  }

  await fetch(
    `https://data.mongodb-api.com/app/${c.env.MONGODB_APP_ID}/endpoint/data/v1/action/deleteOne`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': c.env.MONGODB_API_KEY
      },
      body: JSON.stringify({
        dataSource: c.env.MONGODB_CLUSTER,
        database: c.env.MONGODB_DATABASE,
        collection: 'apiKeys',
        filter: { _id: { $oid: keyId }, userId: auth.userId }
      })
    }
  )

  return c.json({ success: true })
})

export default apiKeys
