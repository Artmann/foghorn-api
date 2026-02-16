import { timingSafeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'

import { ApiError } from '../lib/api-error'
import type { AppVariables, CloudflareBindings } from '../types/env'

export const internalAuthMiddleware = (): MiddlewareHandler<{
  Bindings: CloudflareBindings
  Variables: AppVariables
}> => {
  return async (context, next) => {
    const authHeader = context.req.header('Authorization')

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError('Missing authorization header.', 401)
    }

    const token = authHeader.slice(7)
    const expected = context.env.INTERNAL_API_KEY

    if (!expected) {
      throw new ApiError('Internal API key not configured.', 401)
    }

    const tokenBuffer = Buffer.from(token)
    const expectedBuffer = Buffer.from(expected)

    if (
      tokenBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(tokenBuffer, expectedBuffer)
    ) {
      throw new ApiError('Invalid internal API key.', 401)
    }

    await next()
  }
}
