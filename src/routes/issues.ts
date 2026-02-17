import { Hono } from 'hono'

import { ApiError } from '../lib/api-error'
import { authMiddleware } from '../middleware/auth'
import type { CategoryResult } from '../models/page'
import { Page } from '../models/page'
import { Site } from '../models/site'
import { Team } from '../models/team'
import { TeamMember } from '../models/team-member'
import type { AppVariables, CloudflareBindings } from '../types/env'

const validCategories = [
  'performance',
  'accessibility',
  'bestPractices',
  'seo'
] as const

type Category = (typeof validCategories)[number]

interface IssuePage {
  pageId: string
  url: string
  path: string
  score: number
  displayValue: string | null
}

interface Issue {
  auditId: string
  title: string
  category: string
  pages: IssuePage[]
}

const issues = new Hono<{
  Bindings: CloudflareBindings
  Variables: AppVariables
}>()

issues.use('*', authMiddleware())

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

issues.get('/', async (context) => {
  const auth = context.get('auth')
  const siteId = context.req.query('siteId')
  const category = context.req.query('category')

  if (category && !validCategories.includes(category as Category)) {
    throw new ApiError(
      `Invalid category. Must be one of: ${validCategories.join(', ')}`,
      400
    )
  }

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

  const categoriesToCheck: Category[] = category
    ? [category as Category]
    : [...validCategories]

  const issueMap = new Map<string, Issue>()

  for (const page of allPages) {
    if (!page.auditReport) {
      continue
    }

    for (const cat of categoriesToCheck) {
      const categoryResult: CategoryResult | undefined = page.auditReport[cat]

      if (!categoryResult) {
        continue
      }

      for (const audit of categoryResult.audits) {
        if (audit.score === null || audit.score >= 1) {
          continue
        }

        const key = audit.id

        if (!issueMap.has(key)) {
          issueMap.set(key, {
            auditId: audit.id,
            title: audit.title,
            category: cat,
            pages: []
          })
        }

        issueMap.get(key)!.pages.push({
          pageId: page.id,
          url: page.url,
          path: page.path,
          score: audit.score,
          displayValue: audit.displayValue ?? null
        })
      }
    }
  }

  const result = Array.from(issueMap.values())

  // Sort pages within each issue by score ascending (worst first).
  for (const issue of result) {
    issue.pages.sort((a, b) => a.score - b.score)
  }

  // Sort issues by page count descending (most widespread first).
  result.sort((a, b) => b.pages.length - a.pages.length)

  return context.json({ issues: result })
})

export default issues
