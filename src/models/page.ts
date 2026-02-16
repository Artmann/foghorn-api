import { BaseModel } from 'esix'

import { timestampToDateTime } from '../lib/time'

export interface PageDto {
  createdAt: string
  id: string
  siteId: string
  path: string
  url: string
  lastAuditedAt: string | null
  auditError: string | null
}

export class Page extends BaseModel {
  public siteId = ''
  public path = ''
  public url = ''
  public lastAuditedAt: number | null = null
  public auditError: string | null = null
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
    auditError: page.auditError
  }
}
