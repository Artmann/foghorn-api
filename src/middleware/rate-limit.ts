import type { MiddlewareHandler } from 'hono'

const hits = new Map<string, number>()

let lastCleanup = Date.now()

function cleanup(windowMs: number) {
  const now = Date.now()

  if (now - lastCleanup < windowMs) return

  const currentBucket = Math.floor(now / windowMs)

  for (const key of hits.keys()) {
    const bucket = Number(key.split(':').pop())

    if (bucket < currentBucket) {
      hits.delete(key)
    }
  }

  lastCleanup = now
}

export function rateLimiter({
  max,
  windowMs
}: {
  max: number
  windowMs: number
}): MiddlewareHandler {
  return async (context, next) => {
    const ip =
      context.req.header('cf-connecting-ip') ||
      context.req.header('x-forwarded-for') ||
      'unknown'

    const bucket = Math.floor(Date.now() / windowMs)
    const key = `${ip}:${bucket}`

    cleanup(windowMs)

    const current = hits.get(key) || 0

    if (current >= max) {
      const secondsLeft =
        Math.ceil((bucket + 1) * (windowMs / 1000)) -
        Math.floor(Date.now() / 1000)

      return context.json(
        { error: { message: 'Too many requests. Please try again later.' } },
        429,
        { 'Retry-After': String(secondsLeft) }
      )
    }

    hits.set(key, current + 1)

    await next()
  }
}

/** Clear all rate limit state. For testing only. */
export function resetRateLimiter() {
  hits.clear()
  lastCleanup = Date.now()
}
