import { connectionHandler } from 'esix'

import { makeApp } from './http/app'
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
    app ??= makeApp({ ...env })

    try {
      return await app.handler(request)
    } finally {
      // Workers can't reuse a socket across requests, so each request closes
      // the connection it opened before it ends.
      context.waitUntil(
        Promise.all([connectionHandler.closeConnections(), flushLogs()])
      )
    }
  }
}
