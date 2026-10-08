import type { IssueCategory, IssueDto } from '../api/schemas'
import type { Page } from '../models/page'

export const issueCategories: IssueCategory[] = [
  'performance',
  'accessibility',
  'bestPractices',
  'seo'
]

interface MutableIssue {
  auditId: string
  category: IssueCategory
  pages: {
    displayValue: string | null
    pageId: string
    path: string
    score: number
    url: string
  }[]
  title: string
}

// Groups failing audits across pages. Issues are sorted by how many pages they
// affect, and the pages in each issue by score, worst first.
export function collectIssues(
  pages: Page[],
  category: IssueCategory | undefined
): IssueDto[] {
  const categories = category ? [category] : issueCategories
  const issues = new Map<string, MutableIssue>()

  for (const page of pages) {
    if (!page.auditReport) {
      continue
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
            pages: [],
            title: audit.title
          }
          issues.set(audit.id, issue)
        }

        issue.pages.push({
          displayValue: audit.displayValue ?? null,
          pageId: page.id,
          path: page.path,
          score: audit.score,
          url: page.url
        })
      }
    }
  }

  const result = [...issues.values()]

  for (const issue of result) {
    issue.pages.sort((a, b) => a.score - b.score)
  }

  result.sort((a, b) => b.pages.length - a.pages.length)

  return result
}
