import { Cause, Clock, Effect, Option, SchemaIssue } from 'effect'
import {
  HttpRouter,
  HttpServerError,
  HttpServerRequest,
  HttpServerResponse
} from 'effect/http'
import { HttpApiError } from 'effect/http-api'

import { checkRateLimit, type RateLimit } from '../lib/rate-limit'

const rateLimits: { limit: RateLimit; prefix: string }[] = [
  { limit: { max: 10, windowMs: 60_000 }, prefix: '/auth' },
  { limit: { max: 60, windowMs: 60_000 }, prefix: '/api-keys' },
  { limit: { max: 60, windowMs: 60_000 }, prefix: '/issues' },
  { limit: { max: 60, windowMs: 60_000 }, prefix: '/pages' },
  { limit: { max: 60, windowMs: 60_000 }, prefix: '/sites' },
  { limit: { max: 60, windowMs: 60_000 }, prefix: '/teams' }
]

// The same defaults as Hono's `secureHeaders()`, which the API used before.
const securityHeaders: Record<string, string> = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-origin',
  'origin-agent-cluster': '?1',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=15552000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-dns-prefetch-control': 'off',
  'x-download-options': 'noopen',
  'x-frame-options': 'SAMEORIGIN',
  'x-permitted-cross-domain-policies': 'none',
  'x-xss-protection': '0'
}

const internalErrorMessage =
  'An unexpected error occurred. Please try again later.'

function errorResponse(code: string, message: string, status: number) {
  return HttpServerResponse.jsonUnsafe({ error: { code, message } }, { status })
}

function getPath(request: HttpServerRequest.HttpServerRequest): string {
  return new URL(request.url, 'http://localhost').pathname
}

function getClientIp(request: HttpServerRequest.HttpServerRequest): string {
  return (
    request.headers['cf-connecting-ip'] ??
    request.headers['x-forwarded-for']?.split(',')[0]?.trim() ??
    Option.getOrElse(request.remoteAddress, () => 'unknown')
  )
}

function formatValidationError(error: HttpApiError.HttpApiSchemaError) {
  const issues = SchemaIssue.makeFormatterStandardSchemaV1()(
    error.cause.issue
  ).issues
  const messages = [...new Set(issues.map((issue) => issue.message))]

  return messages.join(' ')
}

// Rejects requests over the per-IP limit for their route prefix.
const rateLimit = <E, R>(
  httpEffect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const path = getPath(request)
    const rule = rateLimits.find(
      ({ prefix }) => path === prefix || path.startsWith(`${prefix}/`)
    )

    if (rule) {
      const result = checkRateLimit(
        `${getClientIp(request)}:${rule.prefix}`,
        rule.limit,
        yield* Clock.currentTimeMillis
      )

      if (!result.allowed) {
        return errorResponse(
          'RateLimited',
          `Too many requests. Please try again in ${result.retryAfterSeconds} seconds.`,
          429
        ).pipe(
          HttpServerResponse.setHeader(
            'retry-after',
            String(result.retryAfterSeconds)
          )
        )
      }
    }

    return yield* httpEffect
  })

// Turns validation failures, unknown routes and unexpected errors into JSON
// responses with the `{ error: { code, message } }` shape.
const handleErrors = <E, R>(
  httpEffect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
) =>
  httpEffect.pipe(
    Effect.catchCause((cause) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest

        for (const reason of cause.reasons) {
          if (Cause.isDieReason(reason)) {
            if (HttpApiError.HttpApiSchemaError.is(reason.defect)) {
              return errorResponse(
                'ValidationFailed',
                formatValidationError(reason.defect),
                400
              )
            }
          }

          if (Cause.isFailReason(reason)) {
            const error = reason.error

            if (
              error instanceof HttpServerError.HttpServerError &&
              error.reason._tag === 'RouteNotFound'
            ) {
              return errorResponse(
                'RouteNotFound',
                `There is no ${request.method} ${getPath(request)} endpoint. See GET /openapi for the available endpoints.`,
                404
              )
            }

            if (
              error instanceof HttpServerError.HttpServerError &&
              error.reason._tag === 'RequestParseError'
            ) {
              return errorResponse(
                'ValidationFailed',
                'The request body could not be read. Send valid JSON.',
                400
              )
            }
          }
        }

        if (Cause.hasInterruptsOnly(cause)) {
          return yield* Effect.failCause(cause)
        }

        yield* Effect.logError('Unhandled error').pipe(
          Effect.annotateLogs({
            cause: Cause.pretty(cause),
            method: request.method,
            path: getPath(request)
          })
        )

        return errorResponse('InternalError', internalErrorMessage, 500)
      })
    )
  )

// Logs every request with its status and duration.
const logRequest = <E, R>(
  httpEffect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
) =>
  Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest
    const startedAt = yield* Clock.currentTimeMillis
    const response = yield* httpEffect
    const duration = (yield* Clock.currentTimeMillis) - startedAt
    const fields = {
      duration,
      method: request.method,
      path: getPath(request),
      status: response.status
    }
    const log =
      response.status >= 500
        ? Effect.logError('HTTP request')
        : response.status >= 400
          ? Effect.logWarning('HTTP request')
          : Effect.logInfo('HTTP request')

    yield* log.pipe(Effect.annotateLogs(fields))

    return response
  })

const addSecurityHeaders = <E, R>(
  httpEffect: Effect.Effect<HttpServerResponse.HttpServerResponse, E, R>
) => Effect.map(httpEffect, HttpServerResponse.setHeaders(securityHeaders))

export const AppMiddleware = HttpRouter.middleware(
  (httpEffect) =>
    httpEffect.pipe(rateLimit, handleErrors, logRequest, addSecurityHeaders),
  { global: true }
)
