import { Effect, Layer } from 'effect'
import { McpProtocol, McpServer } from 'effect/ai'
import { HttpRouter, HttpServerRequest, HttpServerResponse } from 'effect/http'

import { CurrentUser } from '../api/authentication'
import { makeAuthenticateToken } from '../http/authentication'
import { FoghornToolkitLive } from './handlers'
import { FoghornToolkit } from './tools'

const instructions = `Foghorn finds performance, accessibility, best-practices and SEO issues across a whole site with Lighthouse.

To audit a site: list_teams (or create_team), then add_site. Foghorn scrapes the sitemap and audits every page in the background, which can take minutes to hours. Check progress with get_site. While a site is "pending", report the progress to the user instead of polling in a loop. Once it is "ready", use list_issues to see what to fix, and get_page for the full report of one page.

If a site stays pending with nothing running, call get_service_status. When the job runner is offline, nothing is processed.`

function getBearerToken(authorization: string | undefined): string {
  const match = authorization?.match(/^Bearer\s+(.+)$/i)

  return match ? match[1].trim() : ''
}

// Checks the bearer token on every MCP request and provides `CurrentUser` to
// the tool handlers. Auth is per request, not per session.
const McpAuthentication = HttpRouter.middleware(
  Effect.gen(function* () {
    const authenticateToken = yield* makeAuthenticateToken

    return (httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest
        const token = getBearerToken(request.headers.authorization)

        return yield* authenticateToken(token).pipe(
          Effect.flatMap((currentUser) =>
            Effect.provideService(httpEffect, CurrentUser, currentUser)
          ),
          Effect.catchTag('Unauthorized', (error) =>
            Effect.succeed(
              HttpServerResponse.jsonUnsafe(
                { error: { code: 'Unauthorized', message: error.message } },
                {
                  headers: { 'www-authenticate': 'Bearer' },
                  status: 401
                }
              )
            )
          )
        )
      })
  })
)

// A remote MCP server at `/mcp` (Streamable HTTP). The sessionless 2026-07-28
// protocol works across Worker isolates. The older protocols keep sessions in
// memory, so a request that lands in another isolate gets a 404 and the
// client starts a new session, as the spec describes.
export const McpLive = McpServer.toolkit(FoghornToolkit).pipe(
  Layer.provideMerge(
    McpServer.layerHttp({
      allowSessionTermination: true,
      instructions,
      name: 'foghorn',
      path: '/mcp',
      protocols: [
        McpProtocol.v2026_07_28,
        McpProtocol.v2025_11_25,
        McpProtocol.v2025_06_18,
        McpProtocol.v2025_03_26
      ],
      version: '1.0.0',
      websiteUrl: 'https://github.com/artmann/foghorn-api'
    })
  ),
  Layer.provide(FoghornToolkitLive),
  Layer.provide(McpAuthentication.layer)
)
