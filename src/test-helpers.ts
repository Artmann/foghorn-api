import { connectionHandler } from 'esix'
import { sign } from 'hono/jwt'

import { generateApiKey } from './lib/api-key'
import { resetRateLimiter } from './middleware/rate-limit'
import { hashPassword } from './lib/crypto'
import app from './index'
import { ApiKey } from './models/api-key'
import { Page } from './models/page'
import { Site } from './models/site'
import { Team } from './models/team'
import { TeamMember } from './models/team-member'
import { User } from './models/user'
import type { CloudflareBindings } from './types/env'

export { app }

export const testJwtSecret =
  'test-jwt-secret-that-is-long-enough-for-hs256-signing'

export const testEnvironment: CloudflareBindings = {
  AXIOM_TOKEN: 'test-axiom-token',
  DB_DATABASE: 'test-foghorn',
  DB_URL: 'mongodb://127.0.0.1:27017/',
  INTERNAL_API_KEY: 'test-internal-api-key',
  JWT_SECRET: testJwtSecret
}

export const mockExecutionContext = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {}
} as unknown as ExecutionContext & {
  waitUntil: ReturnType<typeof vi.fn>
  passThroughOnException: ReturnType<typeof vi.fn>
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

  return sign(payload, testJwtSecret, 'HS256')
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

  return sign(payload, testJwtSecret, 'HS256')
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
