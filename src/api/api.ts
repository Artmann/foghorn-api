import { Schema } from 'effect'
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiSchema,
  OpenApi
} from 'effect/http-api'

import { Authentication } from './authentication'
import {
  AlreadyTeamMemberResponse,
  ApiKeyNotFoundResponse,
  EmailAlreadyRegisteredResponse,
  InvalidCredentialsResponse,
  NotTeamMemberResponse,
  PageNotFoundResponse,
  SiteLimitReachedResponse,
  SiteNotFoundResponse,
  TeamLimitReachedResponse,
  TeamMemberNotFoundResponse,
  TeamNotFoundResponse,
  UserNotFoundResponse
} from './errors'
import {
  AddTeamMemberPayload,
  ApiKeyDto,
  CreateApiKeyPayload,
  CreatedApiKeyDto,
  CreateSitePayload,
  HealthResponse,
  IssueCategory,
  IssuesResponse,
  PageDto,
  SignInPayload,
  SignInResponse,
  SignUpPayload,
  SiteDto,
  Success,
  TeamDto,
  TeamMemberDto,
  TeamPayload,
  UpdateSitePayload,
  UserDto
} from './schemas'

function describe(summary: string, description?: string) {
  return OpenApi.annotations({ description, summary })
}

const created = <S extends Schema.Top>(schema: S) =>
  schema.pipe(HttpApiSchema.status(201))

export class HealthGroup extends HttpApiGroup.make('health', {
  topLevel: true
}).add(
  HttpApiEndpoint.get('health', '/', { success: HealthResponse }).annotateMerge(
    describe(
      'Health check',
      'Also reports whether a job runner is processing sites. When `jobRunner.status` is `offline`, pending sites and pages will not make progress.'
    )
  )
) {}

export class AuthGroup extends HttpApiGroup.make('auth')
  .add(
    HttpApiEndpoint.post('signUp', '/sign-up', {
      error: EmailAlreadyRegisteredResponse,
      payload: SignUpPayload,
      success: created(Schema.Struct({ user: UserDto }))
    }).annotateMerge(describe('Create an account')),
    HttpApiEndpoint.post('signIn', '/sign-in', {
      error: InvalidCredentialsResponse,
      payload: SignInPayload,
      success: SignInResponse
    }).annotateMerge(
      describe('Sign in', 'Returns a JWT that is valid for 24 hours.')
    )
  )
  .prefix('/auth') {}

export class ApiKeysGroup extends HttpApiGroup.make('apiKeys')
  .add(
    HttpApiEndpoint.post('create', '/', {
      payload: CreateApiKeyPayload,
      success: created(Schema.Struct({ apiKey: CreatedApiKeyDto }))
    }).annotateMerge(
      describe(
        'Create an API key',
        'The full key is only returned in this response.'
      )
    ),
    HttpApiEndpoint.get('list', '/', {
      success: Schema.Struct({ apiKeys: Schema.Array(ApiKeyDto) })
    }).annotateMerge(describe('List your API keys')),
    HttpApiEndpoint.delete('delete', '/:id', {
      error: ApiKeyNotFoundResponse,
      params: { id: Schema.String },
      success: Success
    }).annotateMerge(describe('Delete an API key'))
  )
  .middleware(Authentication)
  .prefix('/api-keys') {}

const teamErrors = [TeamNotFoundResponse, NotTeamMemberResponse] as const

export class TeamsGroup extends HttpApiGroup.make('teams')
  .add(
    HttpApiEndpoint.post('create', '/', {
      error: TeamLimitReachedResponse,
      payload: TeamPayload,
      success: created(Schema.Struct({ team: TeamDto }))
    }).annotateMerge(
      describe(
        'Create a team',
        'The creator is added as a member. A user can be in at most 5 teams.'
      )
    ),
    HttpApiEndpoint.get('list', '/', {
      success: Schema.Struct({ teams: Schema.Array(TeamDto) })
    }).annotateMerge(describe('List your teams')),
    HttpApiEndpoint.get('get', '/:id', {
      error: teamErrors,
      params: { id: Schema.String },
      success: Schema.Struct({ team: TeamDto })
    }).annotateMerge(describe('Get a team')),
    HttpApiEndpoint.put('update', '/:id', {
      error: teamErrors,
      params: { id: Schema.String },
      payload: TeamPayload,
      success: Schema.Struct({ team: TeamDto })
    }).annotateMerge(describe('Rename a team')),
    HttpApiEndpoint.delete('delete', '/:id', {
      error: teamErrors,
      params: { id: Schema.String },
      success: Success
    }).annotateMerge(describe('Delete a team and its memberships')),
    HttpApiEndpoint.post('addMember', '/:id/members', {
      error: [...teamErrors, UserNotFoundResponse, AlreadyTeamMemberResponse],
      params: { id: Schema.String },
      payload: AddTeamMemberPayload,
      success: created(Schema.Struct({ member: TeamMemberDto }))
    }).annotateMerge(describe('Add a member')),
    HttpApiEndpoint.get('listMembers', '/:id/members', {
      error: teamErrors,
      params: { id: Schema.String },
      success: Schema.Struct({ members: Schema.Array(TeamMemberDto) })
    }).annotateMerge(describe('List members')),
    HttpApiEndpoint.delete('removeMember', '/:id/members/:userId', {
      error: [...teamErrors, TeamMemberNotFoundResponse],
      params: { id: Schema.String, userId: Schema.String },
      success: Success
    }).annotateMerge(describe('Remove a member'))
  )
  .middleware(Authentication)
  .prefix('/teams') {}

export class SitesGroup extends HttpApiGroup.make('sites')
  .add(
    HttpApiEndpoint.post('create', '/', {
      error: [...teamErrors, SiteLimitReachedResponse],
      payload: CreateSitePayload,
      success: created(Schema.Struct({ site: SiteDto }))
    }).annotateMerge(
      describe(
        'Add a site',
        'The site starts as `pending`. The job runner scrapes its sitemap and audits each page. A team can have at most 10 sites.'
      )
    ),
    HttpApiEndpoint.get('list', '/', {
      error: teamErrors,
      query: { teamId: Schema.optional(Schema.String) },
      success: Schema.Struct({ sites: Schema.Array(SiteDto) })
    }).annotateMerge(
      describe(
        'List sites',
        'Returns the sites of one team, or of every team you are a member of.'
      )
    ),
    HttpApiEndpoint.get('get', '/:id', {
      error: [...teamErrors, SiteNotFoundResponse],
      params: { id: Schema.String },
      success: Schema.Struct({ site: SiteDto })
    }).annotateMerge(describe('Get a site and its processing state')),
    HttpApiEndpoint.put('update', '/:id', {
      error: [...teamErrors, SiteNotFoundResponse],
      params: { id: Schema.String },
      payload: UpdateSitePayload,
      success: Schema.Struct({ site: SiteDto })
    }).annotateMerge(
      describe(
        'Update a site',
        'Changing the domain or sitemap path queues a new sitemap scrape.'
      )
    ),
    HttpApiEndpoint.delete('delete', '/:id', {
      error: [...teamErrors, SiteNotFoundResponse],
      params: { id: Schema.String },
      success: Success
    }).annotateMerge(describe('Delete a site'))
  )
  .middleware(Authentication)
  .prefix('/sites') {}

export class PagesGroup extends HttpApiGroup.make('pages')
  .add(
    HttpApiEndpoint.get('list', '/', {
      error: [...teamErrors, SiteNotFoundResponse],
      query: {
        search: Schema.optional(Schema.String),
        siteId: Schema.optional(Schema.String)
      },
      success: Schema.Struct({ pages: Schema.Array(PageDto) })
    }).annotateMerge(
      describe(
        'List pages',
        '`search` matches the URL or path, case-insensitive.'
      )
    ),
    HttpApiEndpoint.get('get', '/:id', {
      error: [...teamErrors, SiteNotFoundResponse, PageNotFoundResponse],
      params: { id: Schema.String },
      success: Schema.Struct({ page: PageDto })
    }).annotateMerge(describe('Get a page with its audit report'))
  )
  .middleware(Authentication)
  .prefix('/pages') {}

export class IssuesGroup extends HttpApiGroup.make('issues')
  .add(
    HttpApiEndpoint.get('list', '/', {
      error: [...teamErrors, SiteNotFoundResponse],
      query: {
        category: Schema.optional(IssueCategory),
        siteId: Schema.optional(Schema.String)
      },
      success: IssuesResponse
    }).annotateMerge(
      describe(
        'List issues',
        'Failing audits grouped by audit ID, most widespread first. Pages in each issue are sorted by score, worst first.'
      )
    )
  )
  .middleware(Authentication)
  .prefix('/issues') {}

export class Api extends HttpApi.make('foghorn')
  .add(HealthGroup)
  .add(AuthGroup)
  .add(ApiKeysGroup)
  .add(TeamsGroup)
  .add(SitesGroup)
  .add(PagesGroup)
  .add(IssuesGroup)
  .annotateMerge(
    OpenApi.annotations({
      description:
        'Foghorn finds performance, accessibility, best-practices and SEO issues across a whole site.',
      title: 'Foghorn API',
      version: '1.0.0'
    })
  ) {}
