import { timestampToDateTime } from './time'

// How long to wait before scraping a sitemap or auditing a page again.
export const jobCooldownMs = 4 * 60 * 60 * 1000

export type JobStatus = 'completed' | 'failed' | 'pending'

export type SiteStatus = 'failed' | 'pending' | 'ready'

export interface AuditProgress {
  completedPages: number
  failedPages: number
  pendingPages: number
  totalPages: number
}

export function getDueBefore(now: number): number {
  return now - jobCooldownMs
}

export function getJobStatus(
  lastRunAt: number | null,
  error: string | null
): JobStatus {
  if (lastRunAt === null) {
    return 'pending'
  }

  if (error !== null) {
    return 'failed'
  }

  return 'completed'
}

export function getNextRunAt(lastRunAt: number | null): string | null {
  if (lastRunAt === null) {
    return null
  }

  return timestampToDateTime(lastRunAt + jobCooldownMs)
}

export function getSiteStatus(
  sitemapStatus: JobStatus,
  audits: AuditProgress
): SiteStatus {
  if (sitemapStatus === 'pending' || audits.pendingPages > 0) {
    return 'pending'
  }

  if (sitemapStatus === 'failed' && audits.totalPages === 0) {
    return 'failed'
  }

  return 'ready'
}

export function isDue(lastRunAt: number | null, now: number): boolean {
  if (lastRunAt === null) {
    return true
  }

  return lastRunAt < getDueBefore(now)
}

export function summarizeAudits(
  pages: { auditError: string | null; lastAuditedAt: number | null }[]
): AuditProgress {
  const progress: AuditProgress = {
    completedPages: 0,
    failedPages: 0,
    pendingPages: 0,
    totalPages: pages.length
  }

  for (const page of pages) {
    const status = getJobStatus(page.lastAuditedAt, page.auditError)

    if (status === 'completed') {
      progress.completedPages++
    } else if (status === 'failed') {
      progress.failedPages++
    } else {
      progress.pendingPages++
    }
  }

  return progress
}
