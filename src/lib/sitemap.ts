import { XMLParser } from 'fast-xml-parser'

export type ParsedSitemap =
  | { kind: 'index'; sitemaps: string[] }
  | { kind: 'unknown' }
  | { kind: 'urlset'; urls: string[] }

function toArray(value: unknown): unknown[] {
  if (value === undefined || value === null) {
    return []
  }

  return Array.isArray(value) ? value : [value]
}

function locations(entries: unknown): string[] {
  const result: string[] = []

  for (const entry of toArray(entries)) {
    if (typeof entry === 'object' && entry !== null && 'loc' in entry) {
      const location = (entry as { loc: unknown }).loc

      if (location !== undefined && location !== null && location !== '') {
        result.push(String(location))
      }
    }
  }

  return result
}

// Parses a sitemap or a sitemap index (https://www.sitemaps.org/protocol.html).
export function parseSitemap(xml: string): ParsedSitemap {
  let parsed: unknown

  try {
    parsed = new XMLParser().parse(xml)
  } catch {
    return { kind: 'unknown' }
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return { kind: 'unknown' }
  }

  const document = parsed as {
    sitemapindex?: { sitemap?: unknown }
    urlset?: { url?: unknown }
  }

  if (document.sitemapindex) {
    return { kind: 'index', sitemaps: locations(document.sitemapindex.sitemap) }
  }

  if (document.urlset) {
    return { kind: 'urlset', urls: locations(document.urlset.url) }
  }

  return { kind: 'unknown' }
}
