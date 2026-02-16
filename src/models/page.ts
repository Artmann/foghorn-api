import { BaseModel } from 'esix'

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
  createdAt: string
  id: string
  siteId: string
  path: string
  url: string
  lastAuditedAt: string | null
  auditError: string | null
  auditReport: PageAuditReport | null
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
    createdAt: timestampToDateTime(page.createdAt),
    id: page.id,
    siteId: page.siteId,
    path: page.path,
    url: page.url,
    lastAuditedAt: page.lastAuditedAt
      ? timestampToDateTime(page.lastAuditedAt)
      : null,
    auditError: page.auditError,
    auditReport: page.auditReport
  }
}
