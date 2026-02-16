import { Hono } from 'hono'

import { ApiError } from '../lib/api-error'
import { jsonValidator } from '../lib/validation'
import { authMiddleware } from '../middleware/auth'
import {
  Site,
  createSiteSchema,
  toSiteDto,
  updateSiteSchema
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

// Create a site.
sites.post('/', jsonValidator(createSiteSchema), async (context) => {
  const auth = context.get('auth')
  const logger = context.get('logger')
  const { teamId, domain, sitemapPath } = context.req.valid('json')

  await requireTeamMembership(teamId, auth.userId)

  const site = await Site.create({
    teamId,
    domain,
    sitemapPath: sitemapPath ?? '/sitemap.xml'
  })

  logger.info('Site created', { siteId: site.id, teamId, userId: auth.userId })

  return context.json({ site: toSiteDto(site) }, 201)
})

// List sites the user has access to, optionally filtered by teamId.
sites.get('/', async (context) => {
  const auth = context.get('auth')
  const teamId = context.req.query('teamId')

  if (teamId) {
    await requireTeamMembership(teamId, auth.userId)

    const siteList = await Site.where('teamId', teamId).get()

    return context.json({ sites: siteList.map(toSiteDto) })
  }

  const memberships = await TeamMember.where('userId', auth.userId).get()
  const teamIds = memberships.map((m) => m.teamId)

  const allSites: Site[] = []
  for (const id of teamIds) {
    const teamSites = await Site.where('teamId', id).get()
    allSites.push(...teamSites)
  }

  return context.json({ sites: allSites.map(toSiteDto) })
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

  return context.json({ site: toSiteDto(site) })
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

  if (data.domain !== undefined) {
    site.domain = data.domain
  }

  if (data.sitemapPath !== undefined) {
    site.sitemapPath = data.sitemapPath
  }

  await site.save()

  logger.info('Site updated', {
    siteId: site.id,
    teamId: site.teamId,
    userId: auth.userId
  })

  return context.json({ site: toSiteDto(site) })
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
