import { Hono } from 'hono'

import { ApiError } from '../lib/api-error'
import { authMiddleware } from '../middleware/auth'
import { Page, toPageDto } from '../models/page'
import { Site } from '../models/site'
import { Team } from '../models/team'
import { TeamMember } from '../models/team-member'
import type { AppVariables, CloudflareBindings } from '../types/env'

const pages = new Hono<{
  Bindings: CloudflareBindings
  Variables: AppVariables
}>()

pages.use('*', authMiddleware())

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

// List pages the user has access to, optionally filtered by siteId.
pages.get('/', async (context) => {
  const auth = context.get('auth')
  const siteId = context.req.query('siteId')
  const search = context.req.query('search')

  let allPages: Page[]

  if (siteId) {
    const site = await Site.find(siteId)

    if (!site) {
      throw new ApiError('Site not found.', 404)
    }

    await requireTeamMembership(site.teamId, auth.userId)

    allPages = await Page.where('siteId', siteId).get()
  } else {
    const memberships = await TeamMember.where('userId', auth.userId).get()
    const teamIds = memberships.map((m) => m.teamId)

    const allSites: Site[] = []
    for (const id of teamIds) {
      const teamSites = await Site.where('teamId', id).get()
      allSites.push(...teamSites)
    }

    allPages = []
    for (const site of allSites) {
      const sitePages = await Page.where('siteId', site.id).get()
      allPages.push(...sitePages)
    }
  }

  if (search) {
    const regex = new RegExp(search, 'i')
    allPages = allPages.filter((p) => regex.test(p.url) || regex.test(p.path))
  }

  return context.json({ pages: allPages.map(toPageDto) })
})

// Get a single page.
pages.get('/:id', async (context) => {
  const auth = context.get('auth')
  const pageId = context.req.param('id')

  const page = await Page.find(pageId)

  if (!page) {
    throw new ApiError('Page not found.', 404)
  }

  const site = await Site.find(page.siteId)

  if (!site) {
    throw new ApiError('Site not found.', 404)
  }

  await requireTeamMembership(site.teamId, auth.userId)

  return context.json({ page: toPageDto(page) })
})

export default pages
