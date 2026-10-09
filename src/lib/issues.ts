import type { IssueCategory, IssueDto } from '../api/schemas'
import type { CategoryResult } from '../models/page'

export const issueCategories: IssueCategory[] = [
  'performance',
  'accessibility',
  'bestPractices',
  'seo'
]

export interface IssueSourcePage {
  auditReport: Partial<Record<IssueCategory, CategoryResult>> | null
  id: string
  path: string
  url: string
}

type IssuePage = IssueDto['pages'][number]

interface MutableIssue {
  auditId: string
  category: IssueCategory
  pageCount: number
  pages: IssuePage[]
  title: string
}

// Adds a page to a list sorted by score, worst first, and keeps at most
// `limit` pages. Pages with the same score keep the order they were added in.
function insertWorstPages(pages: IssuePage[], page: IssuePage, limit: number) {
  if (pages.length >= limit) {
    const best = pages[pages.length - 1]

    if (best && best.score <= page.score) {
      return
    }
  }

  let index = pages.length

  while (index > 0) {
    const previous = pages[index - 1]

    if (!previous || previous.score <= page.score) {
      break
    }

    index--
  }

  pages.splice(index, 0, page)

  if (pages.length > limit) {
    pages.pop()
  }
}

// Groups failing audits across pages, one page at a time, so callers can
// stream pages from the database. Each issue keeps a count of all affected
// pages but only the `pagesPerIssue` worst ones.
export function makeIssueCollector({
  category,
  pagesPerIssue
}: {
  category: IssueCategory | undefined
  pagesPerIssue: number
}) {
  const categories = category ? [category] : issueCategories
  const issues = new Map<string, MutableIssue>()

  const add = (page: IssueSourcePage) => {
    if (!page.auditReport) {
      return
    }

    for (const categoryName of categories) {
      const categoryResult = page.auditReport[categoryName]

      if (!categoryResult) {
        continue
      }

      for (const audit of categoryResult.audits) {
        if (audit.score === null || audit.score >= 1) {
          continue
        }

        let issue = issues.get(audit.id)

        if (!issue) {
          issue = {
            auditId: audit.id,
            category: categoryName,
            pageCount: 0,
            pages: [],
            title: audit.title
          }
          issues.set(audit.id, issue)
        }

        issue.pageCount++
        insertWorstPages(
          issue.pages,
          {
            displayValue: audit.displayValue ?? null,
            pageId: page.id,
            path: page.path,
            score: audit.score,
            url: page.url
          },
          pagesPerIssue
        )
      }
    }
  }

  // Issues sorted by how many pages they affect, most first.
  const result = (): IssueDto[] =>
    [...issues.values()].sort(
      (a, b) => b.pageCount - a.pageCount || a.auditId.localeCompare(b.auditId)
    )

  return { add, result }
}
