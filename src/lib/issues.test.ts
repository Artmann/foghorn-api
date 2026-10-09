import { describe, expect, it } from 'vitest'

import { makeIssueCollector, type IssueSourcePage } from './issues'

function makePage(id: string, score: number): IssueSourcePage {
  return {
    auditReport: {
      performance: {
        audits: [{ id: 'render-blocking', score, title: 'Render blocking' }],
        score
      }
    },
    id,
    path: `/${id}`,
    url: `https://example.com/${id}`
  }
}

function issuePage(id: string, score: number) {
  return {
    displayValue: null,
    pageId: id,
    path: `/${id}`,
    score,
    url: `https://example.com/${id}`
  }
}

describe('makeIssueCollector', () => {
  it('keeps the worst pages and counts all of them', () => {
    const collector = makeIssueCollector({
      category: undefined,
      pagesPerIssue: 2
    })

    for (const [id, score] of [
      ['a', 0.5],
      ['b', 0.1],
      ['c', 0.9],
      ['d', 0.1],
      ['e', 0]
    ] as const) {
      collector.add(makePage(id, score))
    }

    expect(collector.result()).toEqual([
      {
        auditId: 'render-blocking',
        category: 'performance',
        pageCount: 5,
        pages: [issuePage('e', 0), issuePage('b', 0.1)],
        title: 'Render blocking'
      }
    ])
  })

  it('skips passing audits, null scores and other categories', () => {
    const collector = makeIssueCollector({
      category: 'seo',
      pagesPerIssue: 10
    })

    collector.add(makePage('a', 0))
    collector.add({
      auditReport: {
        seo: {
          audits: [
            { id: 'passing', score: 1, title: 'Passing' },
            { id: 'manual', score: null, title: 'Manual' }
          ],
          score: 1
        }
      },
      id: 'b',
      path: '/b',
      url: 'https://example.com/b'
    })
    collector.add({ auditReport: null, id: 'c', path: '/c', url: '' })

    expect(collector.result()).toEqual([])
  })
})
