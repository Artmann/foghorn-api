import { Hono } from 'hono'

import { internalAuthMiddleware } from '../middleware/internal-auth'
import { Site } from '../models/site'
import type { AppVariables, CloudflareBindings } from '../types/env'

const internal = new Hono<{
  Bindings: CloudflareBindings
  Variables: AppVariables
}>()

internal.use('*', internalAuthMiddleware())

internal.get('/sites/to-scrape', async (context) => {
  const limit = parseInt(context.req.query('limit') ?? '10', 10)

  const sites = await Site.all()

  sites.sort((a, b) => {
    if (a.lastScrapedSitemapAt === null && b.lastScrapedSitemapAt === null) {
      return 0
    }

    if (a.lastScrapedSitemapAt === null) {
      return -1
    }

    if (b.lastScrapedSitemapAt === null) {
      return 1
    }

    return a.lastScrapedSitemapAt - b.lastScrapedSitemapAt
  })

  const limited = sites.slice(0, limit)

  return context.json({
    sites: limited.map((site) => ({
      id: site.id,
      domain: site.domain,
      sitemapPath: site.sitemapPath
    }))
  })
})

internal.patch('/sites/:id/scrape-result', async (context) => {
  const { id } = context.req.param()
  const body = await context.req.json<{
    lastScrapedSitemapAt: number
    scrapeSitemapError: string | null
  }>()

  const site = await Site.find(id)

  if (!site) {
    return context.json({ error: { message: 'Site not found.' } }, 404)
  }

  site.lastScrapedSitemapAt = body.lastScrapedSitemapAt
  site.scrapeSitemapError = body.scrapeSitemapError

  await site.save()

  return context.json({ success: true })
})

export default internal
