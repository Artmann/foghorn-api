import { zValidator } from '@hono/zod-validator'
import type { ZodType } from 'zod'

import { ApiError } from './api-error'

export function jsonValidator<T extends ZodType>(schema: T) {
  return zValidator('json', schema, (result) => {
    if (!result.success) {
      throw new ApiError(result.error.issues[0].message, 400)
    }
  })
}
