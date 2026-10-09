import { Context } from 'effect'

import { makeApp } from './http/app'
import { wantsLandingPage } from './http/landing-page'
import { DatabaseConnection, makeDatabaseConnection } from './services/database'
import { flushLogs } from './services/logging'
import type { CloudflareBindings } from './types/env'

// The app is built once per isolate. The bindings don't change between
// requests, so the first request's `env` is used for the life of the isolate.
let app: ReturnType<typeof makeApp> | undefined

export default {
  async fetch(
    request: Request,
    env: CloudflareBindings,
    context: ExecutionContext
  ): Promise<Response> {
    if (env.ASSETS && wantsLandingPage(request)) {
      return env.ASSETS.fetch(request)
    }

    app ??= makeApp({ ...env })

    // Workers can't reuse a socket across requests, so each request opens its
    // own database connection and closes it before the request ends.
    const connection = makeDatabaseConnection()

    try {
      return await app.handler(
        request,
        Context.make(DatabaseConnection, connection)
      )
    } finally {
      context.waitUntil(Promise.all([connection.close(), flushLogs()]))
    }
  }
}
