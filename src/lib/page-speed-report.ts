import type {
  AuditResult,
  CategoryResult,
  FieldMetric,
  PageAuditReport
} from '../models/page'

type JsonRecord = Record<string, unknown>

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function extractFieldData(
  loadingExperience: unknown
): Record<string, FieldMetric> | null {
  if (!isRecord(loadingExperience) || !isRecord(loadingExperience.metrics)) {
    return null
  }

  const fieldData: Record<string, FieldMetric> = {}

  for (const [key, value] of Object.entries(loadingExperience.metrics)) {
    if (!isRecord(value)) {
      continue
    }

    fieldData[key] = {
      category: value.category as string,
      distributions: value.distributions as FieldMetric['distributions'],
      percentile: value.percentile as number
    }
  }

  return fieldData
}

function extractCategory(
  categoryData: unknown,
  allAudits: JsonRecord
): CategoryResult {
  if (!isRecord(categoryData)) {
    return { audits: [], score: null }
  }

  const auditRefs = Array.isArray(categoryData.auditRefs)
    ? categoryData.auditRefs
    : []
  const audits: AuditResult[] = []

  for (const ref of auditRefs) {
    const audit = isRecord(ref) ? allAudits[String(ref.id)] : undefined

    if (!isRecord(audit)) {
      continue
    }

    const result: AuditResult = {
      id: audit.id as string,
      score: (audit.score as number | null) ?? null,
      title: audit.title as string
    }

    if (audit.displayValue !== undefined) {
      result.displayValue = audit.displayValue as string
    }

    if (audit.numericValue !== undefined) {
      result.numericValue = audit.numericValue as number
    }

    audits.push(result)
  }

  return {
    audits,
    score: (categoryData.score as number | null) ?? null
  }
}

// Turns a PageSpeed Insights API response into the report stored on a page.
// Returns null when the response has no Lighthouse result.
export function toPageAuditReport(
  data: unknown,
  durationMs: number
): PageAuditReport | null {
  if (!isRecord(data) || !isRecord(data.lighthouseResult)) {
    return null
  }

  const lighthouse = data.lighthouseResult
  const categories = isRecord(lighthouse.categories)
    ? lighthouse.categories
    : {}
  const allAudits = isRecord(lighthouse.audits) ? lighthouse.audits : {}

  return {
    accessibility: extractCategory(categories.accessibility, allAudits),
    bestPractices: extractCategory(categories['best-practices'], allAudits),
    durationMs,
    fetchTime: lighthouse.fetchTime as string,
    fieldData: extractFieldData(data.loadingExperience),
    finalUrl: lighthouse.finalUrl as string,
    performance: extractCategory(categories.performance, allAudits),
    seo: extractCategory(categories.seo, allAudits)
  }
}
