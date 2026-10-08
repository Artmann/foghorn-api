import { BaseModel } from 'esix'

import type { SiteDto } from '../api/schemas'
import { getJobStatus, getNextRunAt, getSiteStatus } from '../lib/job-status'
import { timestampToDateTime } from '../lib/time'
import type { SiteAuditCounts } from '../services/job-queue'

export class Site extends BaseModel {
  public teamId = ''
  public domain = ''
  public sitemapPath = '/sitemap.xml'
  public lastScrapedSitemapAt: number | null = null
  public scrapeSitemapError: string | null = null
  // Set while a runner is scraping the sitemap. See `jobLeaseMs`.
  public scrapeStartedAt: number | null = null
}

export function toSiteDto(
  site: Site,
  { audits, unauditedPages }: SiteAuditCounts,
  now: number
): SiteDto {
  const sitemapStatus = getJobStatus(
    {
      error: site.scrapeSitemapError,
      lastRunAt: site.lastScrapedSitemapAt,
      startedAt: site.scrapeStartedAt
    },
    now
  )

  return {
    audits,
    createdAt: timestampToDateTime(site.createdAt),
    domain: site.domain,
    id: site.id,
    sitemap: {
      error: site.scrapeSitemapError,
      lastScrapedAt:
        site.lastScrapedSitemapAt === null
          ? null
          : timestampToDateTime(site.lastScrapedSitemapAt),
      nextScrapeAt: getNextRunAt(site.lastScrapedSitemapAt),
      status: sitemapStatus
    },
    sitemapPath: site.sitemapPath,
    status: getSiteStatus({
      hasScrapedSitemap: site.lastScrapedSitemapAt !== null,
      sitemapStatus,
      totalPages: audits.totalPages,
      unauditedPages
    }),
    teamId: site.teamId
  }
}
