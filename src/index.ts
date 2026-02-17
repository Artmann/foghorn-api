import { Hono } from 'hono'
import type { ContentfulStatusCode } from 'hono/utils/http-status'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'

import { connectionHandler } from 'esix'

import { ApiError } from './lib/api-error'
import { rateLimiter } from './middleware/rate-limit'
import { Logger } from './lib/logger'
import { openapiSpec } from './openapi-spec'
import apiKeys from './routes/api-keys'
import auth from './routes/auth'
import internal from './routes/internal'
import issues from './routes/issues'
import pages from './routes/pages'
import sites from './routes/sites'
import teams from './routes/teams'
import type { AppVariables, CloudflareBindings } from './types/env'

const app = new Hono<{
  Bindings: CloudflareBindings
  Variables: AppVariables
}>()

// Bridge Cloudflare env bindings into process.env for libraries that depend on it (e.g. esix).
// Close stale DB connections so each request gets a fresh connection in the Workers runtime.
app.use('*', async (context, next) => {
  process.env.DB_URL = context.env.DB_URL
  process.env.DB_DATABASE = context.env.DB_DATABASE
  await connectionHandler.closeConnections()
  await next()
})

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

// Rate limiting.
app.use('/auth/*', rateLimiter({ max: 10, windowMs: 60_000 }))
app.use('/teams/*', rateLimiter({ max: 60, windowMs: 60_000 }))
app.use('/sites/*', rateLimiter({ max: 60, windowMs: 60_000 }))
app.use('/pages/*', rateLimiter({ max: 60, windowMs: 60_000 }))
app.use('/issues/*', rateLimiter({ max: 60, windowMs: 60_000 }))
app.use('/api-keys/*', rateLimiter({ max: 60, windowMs: 60_000 }))

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
app.route('/internal', internal)
app.route('/teams', teams)
app.route('/issues', issues)
app.route('/pages', pages)
app.route('/sites', sites)

app.get('/openapi', (context) => {
  return context.json(openapiSpec)
})

export default app
