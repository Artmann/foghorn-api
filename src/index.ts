import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'

import { ApiError } from './lib/api-error'
import { Logger } from './lib/logger'
import { openapiSpec } from './openapi-spec'
import apiKeys from './routes/api-keys'
import auth from './routes/auth'
import teams from './routes/teams'
import type { AppVariables, CloudflareBindings } from './types/env'

const app = new Hono<{
  Bindings: CloudflareBindings
  Variables: AppVariables
}>()

// Global middleware.
app.use('*', logger())
app.use('*', secureHeaders())
app.use('*', cors())

// Logger middleware.
app.use('*', async (context, next) => {
  const log = new Logger(context.env.AXIOM_TOKEN)
  context.set('logger', log)
  const start = Date.now()

  await next()

  const duration = Date.now() - start
  const level =
    context.res.status >= 500
      ? 'error'
      : context.res.status >= 400
        ? 'warn'
        : 'info'

  log[level]('HTTP request', {
    method: context.req.method,
    path: context.req.path,
    status: context.res.status,
    duration
  })

  context.executionCtx.waitUntil(log.flush())
})

// Error handling.
app.onError((error, context) => {
  if (error instanceof ApiError) {
    return context.json(
      { error: { message: error.message } },
      error.statusCode as ContentfulStatusCode
    )
  }

  const log = new Logger(context.env.AXIOM_TOKEN)
  log.error(error.message, {
    method: context.req.method,
    path: context.req.path
  })
  context.executionCtx.waitUntil(log.flush())

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
app.route('/teams', teams)

app.get('/openapi', (context) => {
  return context.json(openapiSpec)
})

export default app
