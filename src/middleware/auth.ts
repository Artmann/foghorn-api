import { Context, MiddlewareHandler } from 'hono'
import { verify } from 'hono/jwt'
import type { CloudflareBindings, AppVariables } from '../types/env'
import { createMongoClient } from '../lib/mongodb'
import { hashApiKey, isApiKey } from '../lib/api-key'
import type { ApiKey } from '../models/api-key'

type AppContext = Context<{ Bindings: CloudflareBindings; Variables: AppVariables }>

export const authMiddleware = (): MiddlewareHandler<{
  Bindings: CloudflareBindings
  Variables: AppVariables
}> => {
  return async (c, next) => {
    const authHeader = c.req.header('Authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json({ error: 'Missing authorization header' }, 401)
    }

    const token = authHeader.slice(7)

    if (isApiKey(token)) {
      const result = await authenticateWithApiKey(c as AppContext, token)
      if (!result.success) {
        return c.json({ error: result.error }, 401)
      }
      c.set('auth', { userId: result.userId, authType: 'api-key' })
    } else {
      const result = await authenticateWithJwt(c as AppContext, token)
      if (!result.success) {
        return c.json({ error: result.error }, 401)
      }
      c.set('auth', { userId: result.userId, authType: 'jwt' })
    }

    await next()
  }
}

async function authenticateWithApiKey(
  c: AppContext,
  token: string
): Promise<{ success: true; userId: string } | { success: false; error: string }> {
  try {
    const keyHash = await hashApiKey(token)
    const db = createMongoClient(c.env)

    const apiKey = await db.findOne<ApiKey>('apiKeys', { keyHash })

    if (!apiKey) {
      return { success: false, error: 'Invalid API key' }
    }

    c.executionCtx.waitUntil(
      db.updateOne('apiKeys', { _id: { $oid: apiKey._id } }, { $set: { lastUsedAt: new Date().toISOString() } })
    )

    return { success: true, userId: apiKey.userId }
  } catch {
    return { success: false, error: 'API key authentication failed' }
  }
}

async function authenticateWithJwt(
  c: AppContext,
  token: string
): Promise<{ success: true; userId: string } | { success: false; error: string }> {
  try {
    const payload = await verify(token, c.env.JWT_SECRET, 'HS256')
    const userId = payload.sub as string

    if (!userId) {
      return { success: false, error: 'Invalid token payload' }
    }

    return { success: true, userId }
  } catch {
    return { success: false, error: 'Invalid or expired token' }
  }
}
