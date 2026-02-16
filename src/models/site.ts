import { BaseModel } from 'esix'
import { z } from 'zod'

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

export interface SiteDto {
  createdAt: string
  domain: string
  id: string
  lastScrapedSitemapAt: string | null
  scrapeSitemapError: string | null
  sitemapPath: string
  teamId: string
}

export class Site extends BaseModel {
  public teamId = ''
  public domain = ''
  public sitemapPath = '/sitemap.xml'
  public lastScrapedSitemapAt: number | null = null
  public scrapeSitemapError: string | null = null
}

export function toSiteDto(site: Site): SiteDto {
  return {
    createdAt: timestampToDateTime(site.createdAt),
    domain: site.domain,
    id: site.id,
    lastScrapedSitemapAt: site.lastScrapedSitemapAt
      ? timestampToDateTime(site.lastScrapedSitemapAt)
      : null,
    scrapeSitemapError: site.scrapeSitemapError,
    sitemapPath: site.sitemapPath,
    teamId: site.teamId
  }
}
