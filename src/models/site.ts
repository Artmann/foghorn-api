import { BaseModel } from 'esix'
import { z } from 'zod'

import {
  getJobStatus,
  getNextRunAt,
  getSiteStatus,
  type AuditProgress,
  type JobStatus,
  type SiteStatus
} from '../lib/job-status'
import { timestampToDateTime } from '../lib/time'

export const createSiteSchema = z.object({
  teamId: z.string().min(1, 'Team ID is required.'),
  domain: z
    .string()
    .trim()
    .min(1, 'Domain is required.')
    .max(255, 'Domain must be 255 characters or less.'),
  sitemapPath: z
    .string()
    .trim()
    .min(1, 'Sitemap path must be at least 1 character.')
    .max(255, 'Sitemap path must be 255 characters or less.')
    .optional()
})

export const updateSiteSchema = z.object({
  domain: z
    .string()
    .trim()
    .min(1, 'Domain must be at least 1 character.')
    .max(255, 'Domain must be 255 characters or less.')
    .optional(),
  sitemapPath: z
    .string()
    .trim()
    .min(1, 'Sitemap path must be at least 1 character.')
    .max(255, 'Sitemap path must be 255 characters or less.')
    .optional()
})

export interface SitemapStatusDto {
  error: string | null
  lastScrapedAt: string | null
  nextScrapeAt: string | null
  status: JobStatus
}

export interface SiteDto {
  audits: AuditProgress
  createdAt: string
  domain: string
  id: string
  sitemap: SitemapStatusDto
  sitemapPath: string
  status: SiteStatus
  teamId: string
}

export class Site extends BaseModel {
  public teamId = ''
  public domain = ''
  public sitemapPath = '/sitemap.xml'
  public lastScrapedSitemapAt: number | null = null
  public scrapeSitemapError: string | null = null
}

export function toSiteDto(site: Site, audits: AuditProgress): SiteDto {
  const sitemapStatus = getJobStatus(
    site.lastScrapedSitemapAt,
    site.scrapeSitemapError
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
    status: getSiteStatus(sitemapStatus, audits),
    teamId: site.teamId
  }
}
