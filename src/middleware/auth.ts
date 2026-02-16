import type { Context, MiddlewareHandler } from 'hono'
import { verify } from 'hono/jwt'

import { hashApiKey, isApiKey } from '../lib/api-key'
import { ApiError } from '../lib/api-error'
import { ApiKey } from '../models/api-key'
import type { AppVariables, CloudflareBindings } from '../types/env'

type AppContext = Context<{
  Bindings: CloudflareBindings
  Variables: AppVariables
}>

export const authMiddleware = (): MiddlewareHandler<{
  Bindings: CloudflareBindings
  Variables: AppVariables
}> => {
  return async (context, next) => {
    const authHeader = context.req.header('Authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError('Missing authorization header.', 401)
    }

    const token = authHeader.slice(7)

    if (isApiKey(token)) {
      const userId = await authenticateWithApiKey(context as AppContext, token)

      context.set('auth', { authType: 'api-key', userId })
    } else {
      const userId = await authenticateWithJwt(context as AppContext, token)

      context.set('auth', { authType: 'jwt', userId })
    }

    await next()
  }
}

async function authenticateWithApiKey(
  context: AppContext,
  token: string
): Promise<string> {
  try {
    const keyHash = await hashApiKey(token)
    const apiKey = await ApiKey.findBy('keyHash', keyHash)

    if (!apiKey) {
      throw new ApiError('Invalid API key.', 401)
    }

    if (apiKey.expiresAt && apiKey.expiresAt < Date.now()) {
      throw new ApiError('API key has expired.', 401)
    }

    context.executionCtx.waitUntil(
      (async () => {
        apiKey.lastUsedAt = Date.now()
        await apiKey.save()
      })()
    )

    return apiKey.userId
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }
    throw new ApiError('API key authentication failed.', 401)
  }
}

async function authenticateWithJwt(
  context: AppContext,
  token: string
): Promise<string> {
  try {
    const payload = await verify(token, context.env.JWT_SECRET, 'HS256')
    const userId = payload.sub as string

    if (!userId) {
      throw new ApiError('Invalid token payload.', 401)
    }

    return userId
  } catch (error) {
    if (error instanceof ApiError) {
      throw error
    }
    throw new ApiError('Invalid or expired token.', 401)
  }
}
