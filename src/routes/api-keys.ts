import { Hono } from 'hono'

import { generateApiKey } from '../lib/api-key'
import { ApiError } from '../lib/api-error'
import { timestampToDateTime } from '../lib/time'
import { jsonValidator } from '../lib/validation'
import { authMiddleware } from '../middleware/auth'
import { ApiKey, createApiKeySchema, toApiKeyDto } from '../models/api-key'
import type { CreateApiKeyDto } from '../models/api-key'
import type { AppVariables, CloudflareBindings } from '../types/env'

const apiKeys = new Hono<{
  Bindings: CloudflareBindings
  Variables: AppVariables
}>()

apiKeys.use('*', authMiddleware())

apiKeys.post('/', jsonValidator(createApiKeySchema), async (context) => {
  const { expiresAt, name } = context.req.valid('json')

  const auth = context.get('auth')
  const logger = context.get('logger')
  const { key, hash: keyHash, prefix: keyPrefix } = await generateApiKey()

  const apiKey = await ApiKey.create({
    expiresAt: expiresAt ? new Date(expiresAt).getTime() : null,
    keyHash,
    keyPrefix,
    lastUsedAt: null,
    name,
    userId: auth.userId
  })

  const response: CreateApiKeyDto = {
    createdAt: timestampToDateTime(apiKey.createdAt),
    expiresAt: apiKey.expiresAt ? timestampToDateTime(apiKey.expiresAt) : null,
    id: apiKey.id,
    key,
    keyPrefix,
    name
  }

  logger.info('API key created', { userId: auth.userId, keyPrefix })

  return context.json({ apiKey: response }, 201)
})

apiKeys.get('/', async (context) => {
  const auth = context.get('auth')
  const keys = await ApiKey.where('userId', auth.userId).get()

  return context.json({ apiKeys: keys.map(toApiKeyDto) })
})

apiKeys.delete('/:id', async (context) => {
  const auth = context.get('auth')
  const logger = context.get('logger')
  const keyId = context.req.param('id')

  const apiKey = await ApiKey.find(keyId)

  if (!apiKey || apiKey.userId !== auth.userId) {
    logger.warn('API key not found on delete', { userId: auth.userId, keyId })
    throw new ApiError('API key not found.', 404)
  }

  await apiKey.delete()

  logger.info('API key deleted', { userId: auth.userId, keyId })

  return context.json({ success: true })
})

export default apiKeys
