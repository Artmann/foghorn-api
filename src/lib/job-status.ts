import { timestampToDateTime } from './time'

// How long to wait before scraping a sitemap or auditing a page again.
export const jobCooldownMs = 4 * 60 * 60 * 1000

// How long a job counts as running after it started. If the runner crashes,
// the job goes back to its previous status once the lease expires.
export const jobLeaseMs = 10 * 60 * 1000

export type JobStatus = 'completed' | 'failed' | 'pending' | 'running'

export type SiteStatus = 'failed' | 'pending' | 'ready'

export interface AuditProgress {
  completedPages: number
  failedPages: number
  pendingPages: number
  runningPages: number
  totalPages: number
}

export interface JobState {
  error: string | null
  lastRunAt: number | null
  startedAt: number | null
}

export function getDueBefore(now: number): number {
  return now - jobCooldownMs
}

export function getJobStatus(job: JobState, now: number): JobStatus {
  if (isRunning(job.startedAt, now)) {
    return 'running'
  }

  if (job.lastRunAt === null) {
    return 'pending'
  }

  if (job.error !== null) {
    return 'failed'
  }

  return 'completed'
}

export function getLeaseCutoff(now: number): number {
  return now - jobLeaseMs
}

export function getNextRunAt(lastRunAt: number | null): string | null {
  if (lastRunAt === null) {
    return null
  }

  return timestampToDateTime(lastRunAt + jobCooldownMs)
}

// A site is pending until its sitemap has been scraped and every page has been
// audited at least once. Later refreshes don't make it pending again.
export function getSiteStatus({
  hasScrapedSitemap,
  sitemapStatus,
  totalPages,
  unauditedPages
}: {
  hasScrapedSitemap: boolean
  sitemapStatus: JobStatus
  totalPages: number
  unauditedPages: number
}): SiteStatus {
  if (!hasScrapedSitemap || unauditedPages > 0) {
    return 'pending'
  }

  if (sitemapStatus === 'failed' && totalPages === 0) {
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

export function isRunning(startedAt: number | null, now: number): boolean {
  return startedAt !== null && startedAt > getLeaseCutoff(now)
}
