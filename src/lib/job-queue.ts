import { connectionHandler, type BaseModel } from 'esix'

import { Page } from '../models/page'
import { Site } from '../models/site'
import { getDueBefore, type AuditProgress } from './job-status'

// Esix strips `$` operators from queries, so range and `$ne` queries go
// through the collection directly.
async function getCollection(name: 'pages' | 'sites') {
  const database = await connectionHandler.getConnection()

  return database.collection(name)
}

// Finds the ids of documents where `field` is null first, then the ones where
// it is older than `dueBefore`, oldest first.
async function findDueIds(
  collectionName: 'pages' | 'sites',
  field: string,
  dueBefore: number,
  limit: number
): Promise<string[]> {
  const collection = await getCollection(collectionName)
  const projection = { _id: 1 }

  const neverRun = await collection
    .find({ [field]: null }, { projection })
    .limit(limit)
    .toArray()

  const remaining = limit - neverRun.length

  if (remaining <= 0) {
    return neverRun.map((document) => String(document._id))
  }

  const stale = await collection
    .find({ [field]: { $lt: dueBefore } }, { projection })
    .sort({ [field]: 1 })
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

export async function countSiteAudits(siteId: string): Promise<AuditProgress> {
  const collection = await getCollection('pages')

  const [totalPages, pendingPages, failedPages] = await Promise.all([
    collection.countDocuments({ siteId }),
    collection.countDocuments({ siteId, lastAuditedAt: null }),
    collection.countDocuments({
      siteId,
      auditError: { $ne: null },
      lastAuditedAt: { $ne: null }
    })
  ])

  return {
    completedPages: totalPages - pendingPages - failedPages,
    failedPages,
    pendingPages,
    totalPages
  }
}

export async function findPagesDueForAudit(
  now: number,
  limit: number
): Promise<Page[]> {
  const ids = await findDueIds(
    'pages',
    'lastAuditedAt',
    getDueBefore(now),
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
    getDueBefore(now),
    limit
  )

  if (ids.length === 0) {
    return []
  }

  return sortByIds(await Site.whereIn('id', ids).get(), ids)
}
