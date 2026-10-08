import { BaseModel } from 'esix'

import { getJobStatus, getNextRunAt, type JobStatus } from '../lib/job-status'
import { timestampToDateTime } from '../lib/time'

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
  max: number
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

export interface PageDto {
  auditError: string | null
  auditReport: PageAuditReport | null
  auditStatus: JobStatus
  createdAt: string
  id: string
  lastAuditedAt: string | null
  nextAuditAt: string | null
  path: string
  siteId: string
  url: string
}

export class Page extends BaseModel {
  public siteId = ''
  public path = ''
  public url = ''
  public lastAuditedAt: number | null = null
  public auditError: string | null = null
  public auditReport: PageAuditReport | null = null
}

export function toPageDto(page: Page): PageDto {
  return {
    auditError: page.auditError,
    auditReport: page.auditReport,
    auditStatus: getJobStatus(page.lastAuditedAt, page.auditError),
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
