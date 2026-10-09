import { Predicate } from 'effect'
import { BaseModel } from 'esix'

import type { CategoryScores, PageDto, PageSummaryDto } from '../api/schemas'
import { getJobStatus, getNextRunAt } from '../lib/job-status'
import { timestampToDateTime } from '../lib/time'
import type { StoredDocument } from '../services/database'

export interface AuditResult {
  id: string
  title: string
  score: number | null
  displayValue?: string
  numericValue?: number
}

export interface CategoryResult {
  score: number | null
  audits: AuditResult[]
}

export interface FieldMetricDistribution {
  min: number
  // The last bucket has no upper bound.
  max?: number
  proportion: number
}

export interface FieldMetric {
  percentile: number
  distributions: FieldMetricDistribution[]
  category: string
}

export interface PageAuditReport {
  fetchTime: string
  finalUrl: string
  durationMs: number
  performance: CategoryResult
  accessibility: CategoryResult
  bestPractices: CategoryResult
  seo: CategoryResult
  fieldData: Record<string, FieldMetric> | null
}

export class Page extends BaseModel {
  public siteId = ''
  public path = ''
  public url = ''
  public lastAuditedAt: number | null = null
  public auditError: string | null = null
  public auditReport: PageAuditReport | null = null
  // Set while a runner is auditing the page. See `jobLeaseMs`.
  public auditStartedAt: number | null = null
}

// The fields a page list needs. Lists read raw documents with a projection, so
// they never load full audit reports.
export interface PageSummaryFields {
  auditError: string | null
  auditStartedAt: number | null
  createdAt: number
  id: string
  lastAuditedAt: number | null
  path: string
  scores: CategoryScores | null
  siteId: string
  url: string
}

// Leaves out every audit and the field data, which make up almost all of a
// report.
export const pageSummaryProjection = {
  'auditReport.accessibility.audits': 0,
  'auditReport.bestPractices.audits': 0,
  'auditReport.fieldData': 0,
  'auditReport.performance.audits': 0,
  'auditReport.seo.audits': 0
}

function numberOrNull(value: unknown): number | null {
  return Predicate.isNumber(value) ? value : null
}

function stringOrNull(value: unknown): string | null {
  return Predicate.isString(value) ? value : null
}

function readScore(report: object, category: keyof CategoryScores) {
  const result: unknown = Reflect.get(report, category)

  return Predicate.isObject(result)
    ? numberOrNull(Reflect.get(result, 'score'))
    : null
}

// Older documents can miss fields that were added later, so every field has
// a fallback.
export function readPageSummary(document: StoredDocument): PageSummaryFields {
  const report = document.auditReport

  return {
    auditError: stringOrNull(document.auditError),
    auditStartedAt: numberOrNull(document.auditStartedAt),
    createdAt: numberOrNull(document.createdAt) ?? 0,
    id: String(document._id),
    lastAuditedAt: numberOrNull(document.lastAuditedAt),
    path: stringOrNull(document.path) ?? '',
    scores: Predicate.isObject(report)
      ? {
          accessibility: readScore(report, 'accessibility'),
          bestPractices: readScore(report, 'bestPractices'),
          performance: readScore(report, 'performance'),
          seo: readScore(report, 'seo')
        }
      : null,
    siteId: stringOrNull(document.siteId) ?? '',
    url: stringOrNull(document.url) ?? ''
  }
}

function getAuditStatus(
  page: {
    auditError: string | null
    auditStartedAt: number | null
    lastAuditedAt: number | null
  },
  now: number
) {
  return getJobStatus(
    {
      error: page.auditError,
      lastRunAt: page.lastAuditedAt,
      startedAt: page.auditStartedAt
    },
    now
  )
}

export function toPageSummaryDto(
  page: PageSummaryFields,
  now: number
): PageSummaryDto {
  return {
    auditError: page.auditError,
    auditStatus: getAuditStatus(page, now),
    createdAt: timestampToDateTime(page.createdAt),
    id: page.id,
    lastAuditedAt:
      page.lastAuditedAt === null
        ? null
        : timestampToDateTime(page.lastAuditedAt),
    nextAuditAt: getNextRunAt(page.lastAuditedAt),
    path: page.path,
    scores: page.scores,
    siteId: page.siteId,
    url: page.url
  }
}

export function toPageDto(page: Page, now: number): PageDto {
  return {
    auditError: page.auditError,
    auditReport: page.auditReport,
    auditStatus: getAuditStatus(page, now),
    createdAt: timestampToDateTime(page.createdAt),
    id: page.id,
    lastAuditedAt:
      page.lastAuditedAt === null
        ? null
        : timestampToDateTime(page.lastAuditedAt),
    nextAuditAt: getNextRunAt(page.lastAuditedAt),
    path: page.path,
    siteId: page.siteId,
    url: page.url
  }
}
