import { connectionHandler, type BaseModel } from 'esix'

import { Page, type PageAuditReport } from '../models/page'
import { Site } from '../models/site'
import { getDueBefore, getLeaseCutoff, type AuditProgress } from './job-status'

export interface SiteAuditCounts {
  audits: AuditProgress
  // Pages that have never been audited, including ones running right now.
  unauditedPages: number
}

// Esix stores ids as hex strings, not ObjectIds.
interface StoredDocument {
  _id: string
  [key: string]: unknown
}

// Esix strips `$` operators from queries, so range and `$ne` queries go
// through the collection directly.
async function getCollection(name: 'pages' | 'sites') {
  const database = await connectionHandler.getConnection()

  return database.collection<StoredDocument>(name)
}

function notRunning(startedField: string, now: number) {
  return {
    $or: [
      { [startedField]: null },
      { [startedField]: { $lte: getLeaseCutoff(now) } }
    ]
  }
}

// Finds the ids of documents that have never run first, then the ones that
// last ran before the cooldown, oldest first. Skips anything running.
async function findDueIds(
  collectionName: 'pages' | 'sites',
  lastRunField: string,
  startedField: string,
  now: number,
  limit: number
): Promise<string[]> {
  const collection = await getCollection(collectionName)
  const projection = { _id: 1 }

  const neverRun = await collection
    .find(
      { [lastRunField]: null, ...notRunning(startedField, now) },
      { projection }
    )
    .limit(limit)
    .toArray()

  const remaining = limit - neverRun.length

  if (remaining <= 0) {
    return neverRun.map((document) => String(document._id))
  }

  const stale = await collection
    .find(
      {
        [lastRunField]: { $lt: getDueBefore(now) },
        ...notRunning(startedField, now)
      },
      { projection }
    )
    .sort({ [lastRunField]: 1 })
    .limit(remaining)
    .toArray()

  return [...neverRun, ...stale].map((document) => String(document._id))
}

// `whereIn` doesn't keep the order of the ids, so put them back in order.
function sortByIds<T extends BaseModel>(models: T[], ids: string[]): T[] {
  const positions = new Map(ids.map((id, index) => [id, index]))

  return [...models].sort(
    (a, b) => (positions.get(a.id) ?? 0) - (positions.get(b.id) ?? 0)
  )
}

export async function countSiteAudits(
  siteId: string,
  now: number
): Promise<SiteAuditCounts> {
  const collection = await getCollection('pages')
  const idle = notRunning('auditStartedAt', now)

  const [totalPages, runningPages, pendingPages, failedPages, unauditedPages] =
    await Promise.all([
      collection.countDocuments({ siteId }),
      collection.countDocuments({
        siteId,
        auditStartedAt: { $gt: getLeaseCutoff(now) }
      }),
      collection.countDocuments({ siteId, lastAuditedAt: null, ...idle }),
      collection.countDocuments({
        siteId,
        auditError: { $ne: null },
        lastAuditedAt: { $ne: null },
        ...idle
      }),
      collection.countDocuments({ siteId, lastAuditedAt: null })
    ])

  return {
    audits: {
      completedPages: totalPages - runningPages - pendingPages - failedPages,
      failedPages,
      pendingPages,
      runningPages,
      totalPages
    },
    unauditedPages
  }
}

// Returns the site's pages without their audit reports, which can be large.
export async function findPageUrls(
  siteId: string
): Promise<{ id: string; path: string; url: string }[]> {
  const collection = await getCollection('pages')

  const documents = await collection
    .find({ siteId }, { projection: { _id: 1, path: 1, url: 1 } })
    .toArray()

  return documents.map((document) => ({
    id: String(document._id),
    path: String(document.path),
    url: String(document.url)
  }))
}

// The job state is written with `$set` so it never overwrites changes made
// through the API while the job was running.

export async function markAuditFinished(
  pageId: string,
  result: {
    auditError: string | null
    auditReport?: PageAuditReport
    lastAuditedAt: number
  }
): Promise<void> {
  const collection = await getCollection('pages')

  await collection.updateOne(
    { _id: pageId },
    { $set: { ...result, auditStartedAt: null } }
  )
}

export async function markAuditReleased(pageId: string): Promise<void> {
  const collection = await getCollection('pages')

  await collection.updateOne(
    { _id: pageId },
    { $set: { auditStartedAt: null } }
  )
}

export async function markAuditStarted(
  pageId: string,
  now: number
): Promise<void> {
  const collection = await getCollection('pages')

  await collection.updateOne({ _id: pageId }, { $set: { auditStartedAt: now } })
}

// Only records the result if the domain and sitemap path are unchanged. If
// they changed during the scrape, the site stays queued for a new scrape.
export async function markScrapeFinished(
  site: Site,
  result: { lastScrapedSitemapAt: number; scrapeSitemapError: string | null }
): Promise<void> {
  const collection = await getCollection('sites')

  const { matchedCount } = await collection.updateOne(
    { _id: site.id, domain: site.domain, sitemapPath: site.sitemapPath },
    { $set: { ...result, scrapeStartedAt: null } }
  )

  if (matchedCount === 0) {
    await collection.updateOne(
      { _id: site.id },
      { $set: { scrapeStartedAt: null } }
    )
  }
}

export async function markScrapeStarted(
  siteId: string,
  now: number
): Promise<void> {
  const collection = await getCollection('sites')

  await collection.updateOne(
    { _id: siteId },
    { $set: { scrapeStartedAt: now } }
  )
}

export async function findPagesDueForAudit(
  now: number,
  limit: number
): Promise<Page[]> {
  const ids = await findDueIds(
    'pages',
    'lastAuditedAt',
    'auditStartedAt',
    now,
    limit
  )

  if (ids.length === 0) {
    return []
  }

  return sortByIds(await Page.whereIn('id', ids).get(), ids)
}

export async function findSitesDueForScrape(
  now: number,
  limit: number
): Promise<Site[]> {
  const ids = await findDueIds(
    'sites',
    'lastScrapedSitemapAt',
    'scrapeStartedAt',
    now,
    limit
  )

  if (ids.length === 0) {
    return []
  }

  return sortByIds(await Site.whereIn('id', ids).get(), ids)
}
