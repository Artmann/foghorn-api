import type { RateLimitBinding } from '../services/rate-limiter'

// The Worker bindings from `wrangler.jsonc` and `wrangler secret put`. The rate
// limiters are optional so tests can leave them out.
export interface CloudflareBindings {
  API_RATE_LIMITER?: RateLimitBinding
  AUTH_RATE_LIMITER?: RateLimitBinding
  AXIOM_TOKEN?: string
  DB_DATABASE: string
  DB_URL: string
  ENVIRONMENT?: string
  JWT_SECRET: string
  LOG_LEVEL?: string
  MCP_RATE_LIMITER?: RateLimitBinding
}
