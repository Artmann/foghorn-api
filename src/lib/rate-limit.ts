// Fixed-window rate limiting per key (usually the client IP).
//
// The counts live in memory, so on Workers each isolate counts on its own. See
// the todo list for replacing this with a shared store.

export interface RateLimit {
  max: number
  windowMs: number
}

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

const hits = new Map<string, number>()

let lastCleanup = Date.now()

// Drops the counts of windows that have ended, so the map can't grow without
// bound.
function cleanup(windowMs: number, now: number) {
  if (now - lastCleanup < windowMs) {
    return
  }

  const currentBucket = Math.floor(now / windowMs)

  for (const key of hits.keys()) {
    const bucket = Number(key.split(':').pop())

    if (bucket < currentBucket) {
      hits.delete(key)
    }
  }

  lastCleanup = now
}

export function checkRateLimit(
  key: string,
  { max, windowMs }: RateLimit,
  now: number
): RateLimitResult {
  const bucket = Math.floor(now / windowMs)
  const bucketKey = `${key}:${windowMs}:${bucket}`

  cleanup(windowMs, now)

  const current = hits.get(bucketKey) ?? 0

  if (current >= max) {
    const windowEndsAt = (bucket + 1) * windowMs

    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((windowEndsAt - now) / 1000))
    }
  }

  hits.set(bucketKey, current + 1)

  return { allowed: true }
}

/** Clear all rate limit state. For testing only. */
export function resetRateLimiter() {
  hits.clear()
  lastCleanup = Date.now()
}
