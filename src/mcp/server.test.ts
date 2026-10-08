import { describe, expect, it } from 'vitest'

import { Page } from '../models/page'
import { Site } from '../models/site'
import {
  app,
  createAuthToken,
  createTestApiKey,
  createTestPage,
  createTestSite,
  createTestTeam,
  createTestUser
} from '../test-helpers'

const protocolVersion = '2025-06-18'

interface JsonRpcResponse {
  error?: { code: number; message: string }
  id?: number
  result?: Record<string, unknown>
}

interface ToolResult {
  content: { text: string; type: string }[]
  isError: boolean
  structuredContent?: Record<string, unknown>
}

function post(
  body: unknown,
  { sessionId, token }: { sessionId?: string; token?: string }
) {
  const headers: Record<string, string> = {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json',
    'mcp-protocol-version': protocolVersion
  }

  if (token) {
    headers.authorization = `Bearer ${token}`
  }

  if (sessionId) {
    headers['mcp-session-id'] = sessionId
  }

  return app.request('/mcp', {
    body: JSON.stringify(body),
    headers,
    method: 'POST'
  })
}

// Starts a session like an MCP client does and returns a function that sends
// JSON-RPC requests in it.
async function connect(token: string) {
  const response = await post(
    {
      id: 1,
      jsonrpc: '2.0',
      method: 'initialize',
      params: {
        capabilities: {},
        clientInfo: { name: 'test', version: '1.0.0' },
        protocolVersion
      }
    },
    { token }
  )
  const sessionId = response.headers.get('mcp-session-id') ?? undefined
  const initialized = (await response.json()) as JsonRpcResponse

  await post(
    { jsonrpc: '2.0', method: 'notifications/initialized' },
    { sessionId, token }
  )

  let nextId = 2

  const request = async (method: string, params: unknown = {}) => {
    const reply = await post(
      { id: nextId++, jsonrpc: '2.0', method, params },
      { sessionId, token }
    )

    return (await reply.json()) as JsonRpcResponse
  }

  const callTool = async (name: string, args: Record<string, unknown> = {}) => {
    const reply = await request('tools/call', { arguments: args, name })

    return reply.result as unknown as ToolResult
  }

  return { callTool, initialized, request, sessionId }
}

async function setupUser(email?: string) {
  const { user } = await createTestUser(email ? { email } : {})
  const token = await createAuthToken(user.id, user.email)

  return { token, user }
}

describe('MCP endpoint', () => {
  it('rejects requests without a token', async () => {
    const response = await post(
      { id: 1, jsonrpc: '2.0', method: 'tools/list' },
      {}
    )

    expect(response.status).toEqual(401)
    expect(response.headers.get('www-authenticate')).toEqual('Bearer')
    expect(await response.json()).toEqual({
      error: {
        code: 'Unauthorized',
        message:
          'Missing authorization header. Send "Authorization: Bearer <token>" with a JWT or an API key.'
      }
    })
  })

  it('rejects an invalid API key', async () => {
    const response = await post(
      { id: 1, jsonrpc: '2.0', method: 'tools/list' },
      { token: 'fh_not-a-real-key' }
    )

    expect(response.status).toEqual(401)
  })

  it('introduces itself with instructions', async () => {
    const { token } = await setupUser()
    const { initialized } = await connect(token)

    expect(initialized.result).toEqual(
      expect.objectContaining({
        instructions: expect.stringContaining('add_site'),
        serverInfo: expect.objectContaining({ name: 'foghorn' })
      })
    )
  })

  it('lists the tools', async () => {
    const { token } = await setupUser()
    const { request } = await connect(token)
    const response = await request('tools/list')
    const tools = response.result?.tools as { name: string }[]

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      'add_site',
      'create_team',
      'get_page',
      'get_service_status',
      'get_site',
      'list_issues',
      'list_pages',
      'list_sites',
      'list_teams',
      'update_site'
    ])
  })

  it('works with an API key', async () => {
    const { user } = await createTestUser()
    const { key } = await createTestApiKey(user.id)
    const team = await createTestTeam(user.id, { name: 'Key Team' })
    const { callTool } = await connect(key)

    const result = await callTool('list_teams')

    expect(result.structuredContent).toEqual({
      teams: [{ createdAt: expect.any(String), id: team.id, name: 'Key Team' }]
    })
  })

  it('adds a site and reports it as pending', async () => {
    const { token, user } = await setupUser()
    const team = await createTestTeam(user.id)
    const { callTool } = await connect(token)

    const result = await callTool('add_site', {
      domain: 'www.example.com',
      teamId: team.id
    })

    expect(result.isError).toEqual(false)
    expect(result.structuredContent).toEqual({
      site: expect.objectContaining({
        domain: 'www.example.com',
        sitemapPath: '/sitemap.xml',
        status: 'pending',
        teamId: team.id
      })
    })

    const sites = await Site.where('teamId', team.id).get()

    expect(sites.map((site) => site.domain)).toEqual(['www.example.com'])
  })

  it('explains failures to the agent', async () => {
    const { user: owner } = await setupUser('owner@example.com')
    const { token } = await setupUser('stranger@example.com')
    const team = await createTestTeam(owner.id)
    const site = await createTestSite(team.id)
    const { callTool } = await connect(token)

    const result = await callTool('get_site', { siteId: site.id })

    expect(result).toEqual({
      content: [
        {
          text: 'You are not a member of this team. Ask a team member to add you.',
          type: 'text'
        }
      ],
      isError: true
    })
  })

  it('rejects invalid tool arguments', async () => {
    const { token, user } = await setupUser()
    const team = await createTestTeam(user.id)
    const { request } = await connect(token)

    const response = await request('tools/call', {
      arguments: { teamId: team.id },
      name: 'add_site'
    })

    expect(response.error).toEqual(
      expect.objectContaining({
        code: -32602,
        message: expect.stringContaining('Domain is required.')
      })
    )
  })

  it('lists pages with their scores', async () => {
    const { token, user } = await setupUser()
    const team = await createTestTeam(user.id)
    const site = await createTestSite(team.id)
    const audited = await createTestPage(site.id, {
      path: '/audited',
      url: 'https://example.com/audited'
    })

    await createTestPage(site.id, {
      path: '/waiting',
      url: 'https://example.com/waiting'
    })

    audited.lastAuditedAt = Date.UTC(2026, 9, 8, 12, 0, 0)
    audited.auditReport = {
      accessibility: { audits: [], score: 0.9 },
      bestPractices: { audits: [], score: 1 },
      durationMs: 1000,
      fetchTime: '2026-10-08T12:00:00.000Z',
      fieldData: null,
      finalUrl: 'https://example.com/audited',
      performance: { audits: [], score: 0.5 },
      seo: { audits: [], score: 0.8 }
    }
    await audited.save()

    const { callTool } = await connect(token)
    const result = await callTool('list_pages', { siteId: site.id })
    const pages = result.structuredContent?.pages as Page[]

    expect([...pages].sort((a, b) => a.path.localeCompare(b.path))).toEqual([
      {
        auditStatus: 'completed',
        id: audited.id,
        lastAuditedAt: '2026-10-08T12:00:00.000Z',
        path: '/audited',
        scores: {
          accessibility: 0.9,
          bestPractices: 1,
          performance: 0.5,
          seo: 0.8
        },
        url: 'https://example.com/audited'
      },
      {
        auditStatus: 'pending',
        id: expect.any(String),
        lastAuditedAt: null,
        path: '/waiting',
        scores: null,
        url: 'https://example.com/waiting'
      }
    ])
  })

  it('acts as the user of each request, not of the session', async () => {
    const { token: ownerToken, user: owner } = await setupUser('a@example.com')
    const { user: other } = await setupUser('b@example.com')
    await createTestTeam(owner.id, { name: 'Owner Team' })

    const { sessionId } = await connect(ownerToken)
    const otherToken = await createAuthToken(other.id, other.email)

    // Another user's token on the owner's session.
    const response = await post(
      {
        id: 9,
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { arguments: {}, name: 'list_teams' }
      },
      { sessionId, token: otherToken }
    )
    const body = (await response.json()) as JsonRpcResponse

    expect(sessionId).toEqual(expect.any(String))
    expect(body.result?.structuredContent).toEqual({ teams: [] })
  })
})
