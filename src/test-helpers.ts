import { ConfigProvider, Effect, Layer, References, type Scope } from 'effect'
import { connectionHandler } from 'esix'
import { FetchHttpClient } from 'effect/http'

import worker from './index'
import { generateApiKey } from './lib/api-key'
import { hashPassword } from './lib/crypto'
import { signJwt } from './lib/jwt'
import { resetRateLimiter } from './lib/rate-limit'
import { ApiKey } from './models/api-key'
import { Page } from './models/page'
import { Site } from './models/site'
import { Team } from './models/team'
import { TeamMember } from './models/team-member'
import { User } from './models/user'
import { Database } from './services/database'
import { JobQueue } from './services/job-queue'
import { JobRunners } from './services/job-runners'
import { PageSpeed } from './services/page-speed'
import { SitemapReader } from './services/sitemap-reader'
import type { CloudflareBindings } from './types/env'

export const testJwtSecret =
  'test-jwt-secret-that-is-long-enough-for-hs256-signing'

export const testEnvironment: CloudflareBindings = {
  AXIOM_TOKEN: 'test-axiom-token',
  DB_DATABASE: 'test-foghorn',
  DB_URL: 'mongodb://127.0.0.1:27017/',
  JWT_SECRET: testJwtSecret,
  LOG_LEVEL: 'none'
}

// Sends a request through the Worker's fetch handler, like Hono's
// `app.request()`.
export const app = {
  request(
    path: string,
    init: RequestInit = {},
    environment: CloudflareBindings = testEnvironment,
    context: ExecutionContext = mockExecutionContext
  ): Promise<Response> {
    return worker.fetch(
      new Request(new URL(path, 'http://localhost'), init),
      environment,
      context
    )
  }
}

export const mockExecutionContext = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {}
} as unknown as ExecutionContext & {
  waitUntil: ReturnType<typeof vi.fn>
  passThroughOnException: ReturnType<typeof vi.fn>
}

export type TestServices =
  | Database
  | JobQueue
  | JobRunners
  | PageSpeed
  | SitemapReader

// Runs an effect with the job services against the mock database. HTTP calls
// go through `fetch`, which tests can mock. PageSpeed doesn't retry, so failing
// requests don't slow tests down.
export function runWithServices<A, E>(
  effect: Effect.Effect<A, E, Scope.Scope | TestServices>,
  options: { fetch?: typeof globalThis.fetch } = {}
): Promise<A> {
  const ServicesLive = Layer.mergeAll(
    JobQueue.layer,
    JobRunners.layer,
    PageSpeed.layerWith({ retries: 0 }),
    SitemapReader.layer
  ).pipe(
    Layer.provideMerge(Database.layer),
    Layer.provide(FetchHttpClient.layer),
    Layer.provide(
      Layer.succeed(
        FetchHttpClient.Fetch,
        options.fetch ?? ((input, init) => globalThis.fetch(input, init))
      )
    ),
    Layer.provide(
      ConfigProvider.layer(ConfigProvider.fromUnknown({ ...testEnvironment }))
    ),
    Layer.provideMerge(Layer.succeed(References.MinimumLogLevel, 'None'))
  )

  return Effect.runPromise(
    effect.pipe(Effect.provide(ServicesLive), Effect.scoped)
  )
}

afterEach(async () => {
  await connectionHandler.closeConnections()
  vi.restoreAllMocks()
  mockExecutionContext.waitUntil.mockReset()
  mockExecutionContext.passThroughOnException.mockReset()
  resetRateLimiter()
})

export async function createTestUser(
  overrides: { email?: string; password?: string } = {}
) {
  const password = overrides.password ?? 'testpassword123'
  const email = overrides.email ?? `test-${Date.now()}@example.com`

  const { hash: passwordHash, salt: passwordSalt } =
    await hashPassword(password)
  const user = await User.create({ email, passwordHash, passwordSalt })

  return { password, user }
}

export async function createAuthToken(
  userId: string,
  email: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)

  const payload = {
    sub: userId,
    email,
    iat: now,
    exp: now + 86400
  }

  return signJwt(payload, testJwtSecret)
}

export async function createExpiredToken(
  userId: string,
  email: string
): Promise<string> {
  const past = Math.floor(Date.now() / 1000) - 3600

  const payload = {
    sub: userId,
    email,
    iat: past - 86400,
    exp: past
  }

  return signJwt(payload, testJwtSecret)
}

export async function createTestTeam(
  userId: string,
  overrides: { name?: string } = {}
) {
  const name = overrides.name ?? `Test Team ${Date.now()}`
  const team = await Team.create({ name })
  await TeamMember.create({ teamId: team.id, userId })

  return team
}

export async function createTestTeamMember(teamId: string, userId: string) {
  return TeamMember.create({ teamId, userId })
}

export async function createTestSite(
  teamId: string,
  overrides: { domain?: string; sitemapPath?: string } = {}
) {
  const domain = overrides.domain ?? `test-${Date.now()}.example.com`
  const sitemapPath = overrides.sitemapPath ?? '/sitemap.xml'

  return Site.create({ teamId, domain, sitemapPath })
}

export async function createTestPage(
  siteId: string,
  overrides: { path?: string; url?: string } = {}
) {
  const path = overrides.path ?? '/'
  const url = overrides.url ?? `https://example.com${path}`

  return Page.create({ siteId, path, url })
}

export async function createTestApiKey(
  userId: string,
  name = 'Test Key',
  overrides: { expiresAt?: number | null } = {}
) {
  const { key, hash: keyHash, prefix: keyPrefix } = await generateApiKey()

  const apiKey = await ApiKey.create({
    expiresAt: overrides.expiresAt ?? null,
    keyHash,
    keyPrefix,
    lastUsedAt: null,
    name,
    userId
  })

  return { apiKey, key }
}
