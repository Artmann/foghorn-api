import { Clock, Context, Duration, Effect, Layer, Predicate } from 'effect'

import {
  checkRateLimit,
  type RateLimit,
  type RateLimitResult
} from '../lib/rate-limit'

export type RateLimitRule = 'api' | 'auth' | 'mcp'

// Keep these in sync with `ratelimits` in `wrangler.jsonc`. The Workers
// binding only supports windows of 10 or 60 seconds.
export const rateLimitRules: Record<RateLimitRule, RateLimit> = {
  api: { max: 60, windowMs: 60_000 },
  auth: { max: 10, windowMs: 60_000 },
  mcp: { max: 120, windowMs: 60_000 }
}

const bindingNames: Record<RateLimitRule, string> = {
  api: 'API_RATE_LIMITER',
  auth: 'AUTH_RATE_LIMITER',
  mcp: 'MCP_RATE_LIMITER'
}

// The Workers rate limiting binding. Counts are shared by every isolate in a
// Cloudflare location, unlike the in-memory fallback.
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

export interface RateLimiterShape {
  readonly check: (
    rule: RateLimitRule,
    key: string
  ) => Effect.Effect<RateLimitResult>
}

function isRateLimitBinding(value: unknown): value is RateLimitBinding {
  return (
    Predicate.isObject(value) &&
    Predicate.isFunction(Reflect.get(value, 'limit'))
  )
}

export class RateLimiter extends Context.Service<
  RateLimiter,
  RateLimiterShape
>()('foghorn/services/RateLimiter') {
  // Uses the Workers bindings found in `env`. Rules without a binding (tests,
  // local runs without Wrangler) are counted in memory per isolate.
  static layer(env: Record<string, unknown>) {
    return Layer.succeed(
      RateLimiter,
      RateLimiter.of({
        check: (rule, key) => {
          const limit = rateLimitRules[rule]
          const binding = env[bindingNames[rule]]
          const inMemory = Effect.map(Clock.currentTimeMillis, (now) =>
            checkRateLimit(`${rule}:${key}`, limit, now)
          )

          if (!isRateLimitBinding(binding)) {
            return inMemory
          }

          return Effect.tryPromise(() => binding.limit({ key })).pipe(
            Effect.timeout(Duration.seconds(1)),
            Effect.map(
              ({ success }): RateLimitResult =>
                success
                  ? { allowed: true }
                  : {
                      allowed: false,
                      // The binding doesn't say when the window ends.
                      retryAfterSeconds: limit.windowMs / 1000
                    }
            ),
            // Don't fail requests when the binding is unavailable. Fall back to
            // counting in this isolate.
            Effect.catch((error) =>
              Effect.logWarning('Rate limit binding failed').pipe(
                Effect.annotateLogs({ error: String(error), rule }),
                Effect.andThen(inMemory)
              )
            )
          )
        }
      })
    )
  }
}
