import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { secureHeaders } from 'hono/secure-headers'
import { HTTPException } from 'hono/http-exception'
import type { CloudflareBindings, AppVariables } from './types/env'
import auth from './routes/auth'
import apiKeys from './routes/api-keys'

const app = new Hono<{ Bindings: CloudflareBindings; Variables: AppVariables }>()

// Global middleware
app.use('*', logger())
app.use('*', secureHeaders())
app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  })
)

// Error handling
app.onError((err, c) => {
  console.error(`Error: ${err.message}`)
  if (err instanceof HTTPException) {
    return err.getResponse()
  }
  return c.json({ error: 'Internal Server Error' }, 500)
})

// Health check
app.get('/', (c) => {
  return c.json({ status: 'ok', service: 'foghorn-api' })
})

app.get('/health', (c) => {
  return c.json({ status: 'healthy' })
})

// Routes
app.route('/auth', auth)
app.route('/api-keys', apiKeys)

export default app
