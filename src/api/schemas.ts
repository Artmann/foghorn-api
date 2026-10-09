import { Schema } from 'effect'

// Request validation. The messages are returned to the client as is, so they
// should tell the user what to fix.

function requiredText({
  maxLength,
  name
}: {
  maxLength: number
  name: string
}) {
  return Schema.Trim.check(
    Schema.isMinLength(1, { message: `${name} is required.` }),
    Schema.isMaxLength(maxLength, {
      message: `${name} must be ${maxLength} characters or less.`
    })
  ).pipe(Schema.annotateKey({ messageMissingKey: `${name} is required.` }))
}

function optionalText({
  maxLength,
  name
}: {
  maxLength: number
  name: string
}) {
  return Schema.optional(
    Schema.Trim.check(
      Schema.isMinLength(1, {
        message: `${name} must be at least 1 character.`
      }),
      Schema.isMaxLength(maxLength, {
        message: `${name} must be ${maxLength} characters or less.`
      })
    )
  )
}

const isoDateTime =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const SignUpPayload = Schema.Struct({
  email: Schema.String.check(
    Schema.isPattern(emailPattern, { message: 'Invalid email format.' })
  ).pipe(Schema.annotateKey({ messageMissingKey: 'Email is required.' })),
  password: Schema.String.check(
    Schema.isMinLength(8, {
      message: 'Password must be at least 8 characters.'
    })
  ).pipe(Schema.annotateKey({ messageMissingKey: 'Password is required.' }))
})

export const SignInPayload = Schema.Struct({
  email: Schema.String.check(
    Schema.isMinLength(1, { message: 'Email and password are required.' })
  ).pipe(
    Schema.annotateKey({
      messageMissingKey: 'Email and password are required.'
    })
  ),
  password: Schema.String.check(
    Schema.isMinLength(1, { message: 'Email and password are required.' })
  ).pipe(
    Schema.annotateKey({
      messageMissingKey: 'Email and password are required.'
    })
  )
})

export const CreateApiKeyPayload = Schema.Struct({
  expiresAt: Schema.optional(
    Schema.String.check(
      Schema.isPattern(isoDateTime, { message: 'Invalid date format.' })
    )
  ),
  name: requiredText({ maxLength: 100, name: 'Name' })
})

export const TeamPayload = Schema.Struct({
  name: requiredText({ maxLength: 100, name: 'Name' })
})

export const AddTeamMemberPayload = Schema.Struct({
  userId: Schema.String.check(
    Schema.isMinLength(1, { message: 'userId is required.' })
  ).pipe(Schema.annotateKey({ messageMissingKey: 'userId is required.' }))
})

export const CreateSitePayload = Schema.Struct({
  domain: requiredText({ maxLength: 255, name: 'Domain' }),
  sitemapPath: optionalText({ maxLength: 255, name: 'Sitemap path' }),
  teamId: Schema.String.check(
    Schema.isMinLength(1, { message: 'Team ID is required.' })
  ).pipe(Schema.annotateKey({ messageMissingKey: 'Team ID is required.' }))
})

export const UpdateSitePayload = Schema.Struct({
  domain: optionalText({ maxLength: 255, name: 'Domain' }),
  sitemapPath: optionalText({ maxLength: 255, name: 'Sitemap path' })
})

export const IssueCategory = Schema.Literals([
  'performance',
  'accessibility',
  'bestPractices',
  'seo'
]).annotate({
  message:
    'Invalid category. Must be one of: performance, accessibility, bestPractices, seo.'
})

export type IssueCategory = typeof IssueCategory.Type

// Pagination. Query strings are text, so the REST API decodes numbers from
// strings. Tool arguments are JSON, so MCP tools take numbers.

export const pageListLimit = { default: 50, maximum: 250 }
export const issueListLimit = { default: 20, maximum: 100 }
export const pagesPerIssueLimit = { default: 10, maximum: 250 }

function rangeMessage(name: string, minimum: number, maximum: number) {
  return `${name} must be a whole number from ${minimum} to ${maximum}.`
}

function wholeNumber(name: string, minimum: number, maximum: number) {
  const message = rangeMessage(name, minimum, maximum)

  return Schema.Int.annotate({ message }).check(
    Schema.isBetween({ maximum, minimum }, { message })
  )
}

function wholeNumberFromString(name: string, minimum: number, maximum: number) {
  const message = rangeMessage(name, minimum, maximum)

  return Schema.FiniteFromString.annotate({ message }).check(
    Schema.isInt({ message }),
    Schema.isBetween({ maximum, minimum }, { message })
  )
}

const maximumOffset = 100_000

export function paginationFields(
  limit: { default: number; maximum: number },
  { fromString }: { fromString: boolean }
) {
  const makeNumber = fromString ? wholeNumberFromString : wholeNumber

  return {
    limit: Schema.optional(
      makeNumber('Limit', 1, limit.maximum).annotate({
        description: `How many items to return. Defaults to ${limit.default}, at most ${limit.maximum}.`
      })
    ),
    offset: Schema.optional(
      makeNumber('Offset', 0, maximumOffset).annotate({
        description:
          'How many items to skip. Use `pagination.nextOffset` from the previous response to get the next page.'
      })
    )
  }
}

export function pagesPerIssueField({ fromString }: { fromString: boolean }) {
  const makeNumber = fromString ? wholeNumberFromString : wholeNumber

  return Schema.optional(
    makeNumber('Pages per issue', 1, pagesPerIssueLimit.maximum).annotate({
      description: `How many affected pages to list per issue, worst first. Defaults to ${pagesPerIssueLimit.default}, at most ${pagesPerIssueLimit.maximum}. \`pageCount\` always has the full count.`
    })
  )
}

// Responses.

const DateTimeString = Schema.String.annotate({
  description: 'ISO 8601 date and time.',
  format: 'date-time'
})

export const Success = Schema.Struct({ success: Schema.Literal(true) })

export const UserDto = Schema.Struct({
  createdAt: DateTimeString,
  email: Schema.String,
  id: Schema.String
})

export type UserDto = typeof UserDto.Type

export const SignInResponse = Schema.Struct({
  expiresIn: Schema.Number.annotate({
    description: 'Seconds until the token expires.'
  }),
  token: Schema.String,
  user: UserDto
})

export const ApiKeyDto = Schema.Struct({
  createdAt: DateTimeString,
  expiresAt: Schema.NullOr(DateTimeString),
  id: Schema.String,
  keyPrefix: Schema.String,
  lastUsedAt: Schema.NullOr(DateTimeString),
  name: Schema.String
})

export type ApiKeyDto = typeof ApiKeyDto.Type

export const CreatedApiKeyDto = Schema.Struct({
  createdAt: DateTimeString,
  expiresAt: Schema.NullOr(DateTimeString),
  id: Schema.String,
  key: Schema.String.annotate({
    description: 'The full key. It is only returned once.'
  }),
  keyPrefix: Schema.String,
  name: Schema.String
})

export const TeamDto = Schema.Struct({
  createdAt: DateTimeString,
  id: Schema.String,
  name: Schema.String
})

export type TeamDto = typeof TeamDto.Type

export const TeamMemberDto = Schema.Struct({
  createdAt: DateTimeString,
  id: Schema.String,
  teamId: Schema.String,
  userId: Schema.String
})

export type TeamMemberDto = typeof TeamMemberDto.Type

export const JobStatus = Schema.Literals([
  'pending',
  'running',
  'completed',
  'failed'
])

export const AuditProgressDto = Schema.Struct({
  completedPages: Schema.Number,
  failedPages: Schema.Number.annotate({
    description:
      'Pages whose last audit failed. They are retried after the cooldown.'
  }),
  pendingPages: Schema.Number.annotate({
    description: 'Pages waiting for their first audit.'
  }),
  runningPages: Schema.Number.annotate({
    description: 'Pages being audited right now.'
  }),
  totalPages: Schema.Number
})

export const SitemapStatusDto = Schema.Struct({
  error: Schema.NullOr(Schema.String),
  lastScrapedAt: Schema.NullOr(DateTimeString),
  nextScrapeAt: Schema.NullOr(DateTimeString),
  status: JobStatus
})

export const SiteDto = Schema.Struct({
  audits: AuditProgressDto,
  createdAt: DateTimeString,
  domain: Schema.String,
  id: Schema.String,
  sitemap: SitemapStatusDto,
  sitemapPath: Schema.String,
  status: Schema.Literals(['pending', 'ready', 'failed']).annotate({
    description:
      '`pending` until the sitemap has been scraped and every page has been audited once. `failed` when the sitemap could not be scraped and there are no pages. `ready` otherwise.'
  }),
  teamId: Schema.String
})

export type SiteDto = typeof SiteDto.Type

export const AuditResult = Schema.Struct({
  displayValue: Schema.optionalKey(Schema.String),
  id: Schema.String,
  numericValue: Schema.optionalKey(Schema.Number),
  score: Schema.NullOr(Schema.Number),
  title: Schema.String
})

export const CategoryResult = Schema.Struct({
  audits: Schema.Array(AuditResult),
  score: Schema.NullOr(Schema.Number)
})

export const FieldMetric = Schema.Struct({
  category: Schema.String,
  distributions: Schema.Array(
    Schema.Struct({
      max: Schema.optionalKey(Schema.Number),
      min: Schema.Number,
      proportion: Schema.Number
    })
  ),
  percentile: Schema.Number
})

export const PageAuditReport = Schema.Struct({
  accessibility: CategoryResult,
  bestPractices: CategoryResult,
  durationMs: Schema.Number,
  fetchTime: Schema.String,
  fieldData: Schema.NullOr(Schema.Record(Schema.String, FieldMetric)),
  finalUrl: Schema.String,
  performance: CategoryResult,
  seo: CategoryResult
})

export const PageDto = Schema.Struct({
  auditError: Schema.NullOr(Schema.String),
  auditReport: Schema.NullOr(PageAuditReport).annotate({
    description:
      'Last successful Lighthouse audit report, or null if there is none.'
  }),
  auditStatus: JobStatus,
  createdAt: DateTimeString,
  id: Schema.String,
  lastAuditedAt: Schema.NullOr(DateTimeString),
  nextAuditAt: Schema.NullOr(DateTimeString),
  path: Schema.String,
  siteId: Schema.String,
  url: Schema.String
})

export type PageDto = typeof PageDto.Type

export const CategoryScores = Schema.Struct({
  accessibility: Schema.NullOr(Schema.Number),
  bestPractices: Schema.NullOr(Schema.Number),
  performance: Schema.NullOr(Schema.Number),
  seo: Schema.NullOr(Schema.Number)
})

export type CategoryScores = typeof CategoryScores.Type

// A page without its audit report, for lists.
export const PageSummaryDto = Schema.Struct({
  auditError: PageDto.fields.auditError,
  auditStatus: PageDto.fields.auditStatus,
  createdAt: PageDto.fields.createdAt,
  id: PageDto.fields.id,
  lastAuditedAt: PageDto.fields.lastAuditedAt,
  nextAuditAt: PageDto.fields.nextAuditAt,
  path: PageDto.fields.path,
  scores: Schema.NullOr(CategoryScores).annotate({
    description:
      'Lighthouse category scores from 0 to 1 from the last successful audit, or null if there is none.'
  }),
  siteId: PageDto.fields.siteId,
  url: PageDto.fields.url
})

export type PageSummaryDto = typeof PageSummaryDto.Type

export const PaginationDto = Schema.Struct({
  limit: Schema.Number,
  nextOffset: Schema.NullOr(Schema.Number).annotate({
    description:
      'The `offset` for the next page, or null when this is the last page.'
  }),
  offset: Schema.Number,
  total: Schema.Number.annotate({
    description: 'How many items there are in total.'
  })
})

export type PaginationDto = typeof PaginationDto.Type

export const PagesResponse = Schema.Struct({
  pages: Schema.Array(PageSummaryDto),
  pagination: PaginationDto
})

export const IssuePageDto = Schema.Struct({
  displayValue: Schema.NullOr(Schema.String),
  pageId: Schema.String,
  path: Schema.String,
  score: Schema.Number,
  url: Schema.String
})

export const IssueDto = Schema.Struct({
  auditId: Schema.String,
  category: IssueCategory,
  pageCount: Schema.Number.annotate({
    description: 'How many pages fail this audit.'
  }),
  pages: Schema.Array(IssuePageDto).annotate({
    description:
      'The worst affected pages, up to `pagesPerIssue`. `pageCount` has the full count.'
  }),
  title: Schema.String
})

export type IssueDto = typeof IssueDto.Type

export const IssuesResponse = Schema.Struct({
  audits: AuditProgressDto,
  issues: Schema.Array(IssueDto),
  pagination: PaginationDto,
  status: Schema.Literals(['pending', 'ready']).annotate({
    description:
      '`pending` while a sitemap has not been scraped yet or pages are waiting for their first audit. The issue list is incomplete until it is `ready`.'
  })
})

export const HealthResponse = Schema.Struct({
  jobRunner: Schema.Struct({
    lastSeenAt: Schema.NullOr(DateTimeString),
    status: Schema.Literals(['online', 'offline', 'unknown'])
  }),
  service: Schema.String,
  status: Schema.String
})
