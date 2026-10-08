import { Hono } from 'hono'

import { ApiError } from '../lib/api-error'
import { countSiteAudits } from '../lib/job-queue'
import { jsonValidator } from '../lib/validation'
import { authMiddleware } from '../middleware/auth'
import {
  Site,
  createSiteSchema,
  toSiteDto,
  updateSiteSchema,
  type SiteDto
} from '../models/site'
import { Team } from '../models/team'
import { TeamMember } from '../models/team-member'
import type { AppVariables, CloudflareBindings } from '../types/env'

const sites = new Hono<{
  Bindings: CloudflareBindings
  Variables: AppVariables
}>()

sites.use('*', authMiddleware())

async function requireTeamMembership(
  teamId: string,
  userId: string
): Promise<Team> {
  const team = await Team.find(teamId)

  if (!team) {
    throw new ApiError('Team not found.', 404)
  }

  const members = await TeamMember.where('teamId', teamId).get()
  const isMember = members.some((m) => m.userId === userId)

  if (!isMember) {
    throw new ApiError('You are not a member of this team.', 403)
  }

  return team
}

async function buildSiteDto(site: Site): Promise<SiteDto> {
  const now = Date.now()

  return toSiteDto(site, await countSiteAudits(site.id, now), now)
}

// Create a site.
sites.post('/', jsonValidator(createSiteSchema), async (context) => {
  const auth = context.get('auth')
  const logger = context.get('logger')
  const { teamId, domain, sitemapPath } = context.req.valid('json')

  await requireTeamMembership(teamId, auth.userId)

  const existingSites = await Site.where('teamId', teamId).get()
  if (existingSites.length >= 10) {
    throw new ApiError('This team has reached the maximum of 10 sites.', 409)
  }

  const site = await Site.create({
    teamId,
    domain,
    sitemapPath: sitemapPath ?? '/sitemap.xml'
  })

  logger.info('Site created', { siteId: site.id, teamId, userId: auth.userId })

  return context.json({ site: await buildSiteDto(site) }, 201)
})

// List sites the user has access to, optionally filtered by teamId.
sites.get('/', async (context) => {
  const auth = context.get('auth')
  const teamId = context.req.query('teamId')

  if (teamId) {
    await requireTeamMembership(teamId, auth.userId)

    const siteList = await Site.where('teamId', teamId).get()

    return context.json({
      sites: await Promise.all(siteList.map(buildSiteDto))
    })
  }

  const memberships = await TeamMember.where('userId', auth.userId).get()
  const teamIds = memberships.map((m) => m.teamId)

  const allSites: Site[] = []
  for (const id of teamIds) {
    const teamSites = await Site.where('teamId', id).get()
    allSites.push(...teamSites)
  }

  return context.json({ sites: await Promise.all(allSites.map(buildSiteDto)) })
})

// Get a single site.
sites.get('/:id', async (context) => {
  const auth = context.get('auth')
  const siteId = context.req.param('id')

  const site = await Site.find(siteId)

  if (!site) {
    throw new ApiError('Site not found.', 404)
  }

  await requireTeamMembership(site.teamId, auth.userId)

  return context.json({ site: await buildSiteDto(site) })
})

// Update a site.
sites.put('/:id', jsonValidator(updateSiteSchema), async (context) => {
  const auth = context.get('auth')
  const logger = context.get('logger')
  const siteId = context.req.param('id')
  const data = context.req.valid('json')

  const site = await Site.find(siteId)

  if (!site) {
    throw new ApiError('Site not found.', 404)
  }

  await requireTeamMembership(site.teamId, auth.userId)

  const sitemapChanged =
    (data.domain !== undefined && data.domain !== site.domain) ||
    (data.sitemapPath !== undefined && data.sitemapPath !== site.sitemapPath)

  if (data.domain !== undefined) {
    site.domain = data.domain
  }

  if (data.sitemapPath !== undefined) {
    site.sitemapPath = data.sitemapPath
  }

  // Queue a new scrape so the change is picked up on the next job run.
  if (sitemapChanged) {
    site.lastScrapedSitemapAt = null
    site.scrapeSitemapError = null
  }

  await site.save()

  logger.info('Site updated', {
    siteId: site.id,
    teamId: site.teamId,
    userId: auth.userId
  })

  return context.json({ site: await buildSiteDto(site) })
})

// Delete a site.
sites.delete('/:id', async (context) => {
  const auth = context.get('auth')
  const logger = context.get('logger')
  const siteId = context.req.param('id')

  const site = await Site.find(siteId)

  if (!site) {
    throw new ApiError('Site not found.', 404)
  }

  await requireTeamMembership(site.teamId, auth.userId)

  await site.delete()

  logger.info('Site deleted', {
    siteId: site.id,
    teamId: site.teamId,
    userId: auth.userId
  })

  return context.json({ success: true })
})

export default sites
