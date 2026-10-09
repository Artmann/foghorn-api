import { Schema } from 'effect'
import { Tool, Toolkit } from 'effect/ai'

import {
  CreateSitePayload,
  HealthResponse,
  IssueCategory,
  issueListLimit,
  IssuesResponse,
  PageDto,
  pageListLimit,
  PagesResponse,
  pagesPerIssueField,
  paginationFields,
  SiteDto,
  TeamDto,
  TeamPayload,
  UpdateSitePayload
} from '../api/schemas'

// Every tool fails with this error. The message is shown to the agent, so it
// says what went wrong and what to do next.
export class ToolFailed extends Schema.TaggedError<ToolFailed>()('ToolFailed', {
  message: Schema.String
}) {}

const siteId = Schema.String.annotate({
  description: 'The site ID, from list_sites or add_site.'
})

const pendingNote =
  'Processing happens in the background and can take minutes to hours. While `status` is `pending`, tell the user how far along it is (from `audits`) instead of waiting in a loop.'

export const GetServiceStatus = Tool.make('get_service_status', {
  description:
    'Check whether Foghorn is processing sites. If `jobRunner.status` is `offline`, pending sites will not make progress until the job runner starts again.',
  failure: ToolFailed,
  parameters: Tool.EmptyParams,
  success: HealthResponse
})
  .annotate(Tool.Title, 'Get service status')
  .annotate(Tool.Readonly, true)

export const ListTeams = Tool.make('list_teams', {
  description:
    'List the teams you are a member of. Sites belong to teams, so you need a team ID to add a site.',
  failure: ToolFailed,
  parameters: Tool.EmptyParams,
  success: Schema.Struct({ teams: Schema.Array(TeamDto) })
})
  .annotate(Tool.Title, 'List teams')
  .annotate(Tool.Readonly, true)

export const CreateTeam = Tool.make('create_team', {
  description:
    'Create a team. You are added as a member. A user can be in at most 5 teams.',
  failure: ToolFailed,
  parameters: TeamPayload,
  success: Schema.Struct({ team: TeamDto })
}).annotate(Tool.Title, 'Create team')

export const ListSites = Tool.make('list_sites', {
  description: `List sites with their processing status. ${pendingNote}`,
  failure: ToolFailed,
  parameters: Schema.Struct({
    teamId: Schema.optional(
      Schema.String.annotate({
        description: 'Only list the sites of this team.'
      })
    )
  }),
  success: Schema.Struct({ sites: Schema.Array(SiteDto) })
})
  .annotate(Tool.Title, 'List sites')
  .annotate(Tool.Readonly, true)

export const AddSite = Tool.make('add_site', {
  description: `Add a site to a team so Foghorn crawls its sitemap and audits every page with Lighthouse. The domain is the host only, like "www.example.com". A team can have at most 10 sites. ${pendingNote}`,
  failure: ToolFailed,
  parameters: CreateSitePayload,
  success: Schema.Struct({ site: SiteDto })
}).annotate(Tool.Title, 'Add site')

export const GetSite = Tool.make('get_site', {
  description: `Get a site and its processing status: whether the sitemap has been scraped, and how many pages are audited, pending, running or failed. ${pendingNote}`,
  failure: ToolFailed,
  parameters: Schema.Struct({ siteId }),
  success: Schema.Struct({ site: SiteDto })
})
  .annotate(Tool.Title, 'Get site')
  .annotate(Tool.Readonly, true)

export const UpdateSite = Tool.make('update_site', {
  description:
    "Change a site's domain or sitemap path. Use it when `sitemap.error` says the sitemap could not be found. Changing either one queues a new sitemap scrape.",
  failure: ToolFailed,
  parameters: Schema.Struct({ ...UpdateSitePayload.fields, siteId }),
  success: Schema.Struct({ site: SiteDto })
})
  .annotate(Tool.Title, 'Update site')
  .annotate(Tool.Idempotent, true)

export const ListIssues = Tool.make('list_issues', {
  description:
    'List failing Lighthouse audits grouped by issue, most widespread first. Each issue has `pageCount` and its worst pages, up to `pagesPerIssue`. Results are paged: when `pagination.nextOffset` is not null, call again with that `offset` for more. If `status` is `pending`, the list is incomplete because pages are still being audited.',
  failure: ToolFailed,
  parameters: Schema.Struct({
    ...paginationFields(issueListLimit, { fromString: false }),
    category: Schema.optional(
      IssueCategory.annotate({
        description:
          'Only list issues in this Lighthouse category: performance, accessibility, bestPractices or seo.'
      })
    ),
    pagesPerIssue: pagesPerIssueField({ fromString: false }),
    siteId: Schema.optional(
      siteId.annotate({
        description:
          'Only list issues for this site. Leave out to list issues across all your sites.'
      })
    )
  }),
  success: IssuesResponse
})
  .annotate(Tool.Title, 'List issues')
  .annotate(Tool.Readonly, true)

export const ListPages = Tool.make('list_pages', {
  description:
    "List the pages Foghorn found in a site's sitemap with their Lighthouse category scores, sorted by URL. Use get_page for the full audit report of one page. Results are paged: when `pagination.nextOffset` is not null, call again with that `offset` for more.",
  failure: ToolFailed,
  parameters: Schema.Struct({
    ...paginationFields(pageListLimit, { fromString: false }),
    search: Schema.optional(
      Schema.String.annotate({
        description:
          'Only list pages whose URL or path contains this text (case-insensitive).'
      })
    ),
    siteId
  }),
  success: PagesResponse
})
  .annotate(Tool.Title, 'List pages')
  .annotate(Tool.Readonly, true)

export const GetPage = Tool.make('get_page', {
  description:
    'Get one page with its full Lighthouse report: every audit with its score and value, and Core Web Vitals field data when Google has it.',
  failure: ToolFailed,
  parameters: Schema.Struct({
    pageId: Schema.String.annotate({
      description: 'The page ID, from list_pages or list_issues.'
    })
  }),
  success: Schema.Struct({ page: PageDto })
})
  .annotate(Tool.Title, 'Get page')
  .annotate(Tool.Readonly, true)

export const FoghornToolkit = Toolkit.make(
  GetServiceStatus,
  ListTeams,
  CreateTeam,
  ListSites,
  AddSite,
  GetSite,
  UpdateSite,
  ListIssues,
  ListPages,
  GetPage
)
