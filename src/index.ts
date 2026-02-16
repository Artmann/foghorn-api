import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { log } from 'tiny-typescript-logger'

import { ApiError } from './lib/api-error'
import { openapiSpec } from './openapi-spec'
import apiKeys from './routes/api-keys'
import auth from './routes/auth'
import type { AppVariables, CloudflareBindings } from './types/env'

const app = new Hono<{
  Bindings: CloudflareBindings
  Variables: AppVariables
}>()

// Global middleware.
app.use('*', logger())
app.use('*', secureHeaders())
app.use('*', cors())

// Error handling.
app.onError((error, context) => {
  if (error instanceof ApiError) {
    return context.json(
      { error: { message: error.message } },
      error.statusCode as ContentfulStatusCode
    )
  }

  log.error(error)

  return context.json(
    {
      error: {
        message: 'An unexpected error occurred. Please try again later.'
      }
    },
    500
  )
})

// Health check.
app.get('/', (context) => {
  return context.json({ service: 'foghorn-api', status: 'ok' })
})

// Routes.
app.route('/auth', auth)
app.route('/api-keys', apiKeys)

app.get('/openapi', (context) => {
  return context.json(openapiSpec)
})

export default app
