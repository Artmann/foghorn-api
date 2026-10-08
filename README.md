# Foghorn API

Foghorn finds performance, accessibility, and SEO issues across your entire site
— automatically. Point it at a domain, and it crawls every page, runs Lighthouse
audits, and reports what needs fixing. Use the REST API directly from your AI
agent to monitor site health and act on issues without leaving the loop.

## Getting Started

### Use from an agent

Install the Foghorn skill to use the API directly from Claude Code, Cursor,
Gemini CLI, or any agent that supports the
[Agent Skills](https://agentskills.io) spec:

```bash
npx skills add https://github.com/artmann/foghorn-api
```

Once installed, ask your agent to check a site's performance and it will handle
authentication, setup, and issue retrieval for you.

### Manual setup

Walk through the end-to-end flow: create an account, set up a team, add a site,
and check for issues.

### 1. Sign up

```bash
curl -X POST https://foghorn-api.artgaard.workers.dev/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "securepassword"}'
```

Creates your account and returns your user ID.

### 2. Sign in

```bash
curl -X POST https://foghorn-api.artgaard.workers.dev/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "securepassword"}'
```

Returns a JWT `token` (valid for 24 hours). Use it as a Bearer token in all
subsequent requests.

### 3. Create a team

```bash
curl -X POST https://foghorn-api.artgaard.workers.dev/teams \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "My Team"}'
```

Returns the team object including its `id`. You are automatically added as a
member.

### 4. Add a site

```bash
curl -X POST https://foghorn-api.artgaard.workers.dev/sites \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"teamId": "<team-id>", "domain": "www.example.com"}'
```

Returns the site object including its `id`. The site starts with
`"status": "pending"`. The [job runner](#job-runner) picks it up, scrapes the
sitemap, and audits each page.

### 5. Wait for the audits

```bash
curl https://foghorn-api.artgaard.workers.dev/sites/<site-id> \
  -H "Authorization: Bearer <token>"
```

`status` is `pending` until the sitemap has been scraped and every page has been
audited once, then `ready`. `audits` shows the progress:

```json
{
  "status": "pending",
  "sitemap": {
    "status": "completed",
    "error": null,
    "lastScrapedAt": "...",
    "nextScrapeAt": "..."
  },
  "audits": {
    "completedPages": 12,
    "failedPages": 1,
    "pendingPages": 32,
    "runningPages": 5,
    "totalPages": 50
  }
}
```

If nothing moves, check `GET /`. When `jobRunner.status` is `offline`, no job
runner is processing sites.

### 6. List issues

```bash
curl https://foghorn-api.artgaard.workers.dev/issues?siteId=<site-id> \
  -H "Authorization: Bearer <token>"
```

Returns audit failures grouped by audit ID, sorted by the number of affected
pages. Each issue includes the list of pages where the audit fails. The response
also has a `status`: while it's `pending`, the list is incomplete.

## Authentication

The API supports two authentication methods via Bearer token:

1. **JWT tokens** - Returned from `/auth/sign-in`, expires in 24 hours
2. **API keys** - Created via `/api-keys`, prefixed with `fh_`

```bash
# Using JWT
curl -H "Authorization: Bearer <jwt-token>" https://foghorn-api.artgaard.workers.dev/sites

# Using API key
curl -H "Authorization: Bearer fh_abc123..." https://foghorn-api.artgaard.workers.dev/sites
```

## Errors

Every error response has the same shape:

```json
{
  "error": {
    "code": "SiteNotFound",
    "message": "Site not found. List your sites with GET /sites to find the right ID."
  }
}
```

`code` is stable, so clients can branch on it. `message` explains what went
wrong and what to do about it. Common codes:

| Code               | Status | Meaning                                         |
| ------------------ | ------ | ----------------------------------------------- |
| `ValidationFailed` | 400    | The request body or query is invalid            |
| `Unauthorized`     | 401    | Missing, invalid or expired token or API key    |
| `NotTeamMember`    | 403    | You are not a member of the team                |
| `SiteNotFound`     | 404    | Also `TeamNotFound`, `PageNotFound`, and so on  |
| `RouteNotFound`    | 404    | There is no such endpoint                       |
| `TeamLimitReached` | 409    | Also `SiteLimitReached`, `AlreadyTeamMember`    |
| `RateLimited`      | 429    | Too many requests. See the `Retry-After` header |
| `InternalError`    | 500    | Something went wrong on our side                |

The OpenAPI spec at `GET /openapi` lists the errors each endpoint can return.

## Endpoints

### Auth

#### Create an account

```
POST /auth/sign-up
```

```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

#### Sign in

```
POST /auth/sign-in
```

```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

Returns a JWT token and its expiry.

### API Keys

All API key endpoints require authentication.

#### Create an API key

```
POST /api-keys
```

```json
{
  "name": "My Key",
  "expiresAt": "2025-12-31T00:00:00Z"
}
```

`expiresAt` is optional. The full key value is only returned once on creation.

#### List API keys

```
GET /api-keys
```

#### Delete an API key

```
DELETE /api-keys/:id
```

### Teams

All team endpoints require authentication.

#### Create a team

```
POST /teams
```

```json
{
  "name": "My Team"
}
```

The creator is automatically added as a member.

#### List your teams

```
GET /teams
```

#### Get a team

```
GET /teams/:id
```

#### Update a team

```
PUT /teams/:id
```

```json
{
  "name": "New Name"
}
```

#### Delete a team

```
DELETE /teams/:id
```

#### Add a member

```
POST /teams/:id/members
```

```json
{
  "userId": "user-id-here"
}
```

#### List members

```
GET /teams/:id/members
```

#### Remove a member

```
DELETE /teams/:id/members/:userId
```

### Sites

All site endpoints require authentication. You must be a member of the site's
team.

#### Create a site

```
POST /sites
```

```json
{
  "teamId": "team-id-here",
  "domain": "www.example.com",
  "sitemapPath": "/sitemap.xml"
}
```

`sitemapPath` is optional and defaults to `/sitemap.xml`.

#### List sites for a team

```
GET /sites?teamId=team-id-here
```

#### Get a site

```
GET /sites/:id
```

Every site includes its processing state:

- `status`: `pending` until the sitemap has been scraped and every page has been
  audited once, `failed` when the sitemap could not be scraped and there are no
  pages, and `ready` otherwise. Later refreshes keep the site `ready`.
- `sitemap`: `status` (`pending`, `running`, `completed` or `failed`), `error`,
  `lastScrapedAt` and `nextScrapeAt`.
- `audits`: `completedPages`, `failedPages`, `pendingPages`, `runningPages` and
  `totalPages`.

Sitemaps are scraped and pages audited at most every 4 hours. Pages that are no
longer in the sitemap are removed.

#### Update a site

```
PUT /sites/:id
```

```json
{
  "domain": "new-domain.com",
  "sitemapPath": "/custom-sitemap.xml"
}
```

Both fields are optional. Changing either one queues a new sitemap scrape.

#### Delete a site

```
DELETE /sites/:id
```

### Pages

All page endpoints require authentication. You must be a member of the page's
site's team.

#### List pages

```
GET /pages?siteId=site-id-here&search=keyword
```

Both query parameters are optional. If `siteId` is provided, returns pages for
that site. Otherwise, returns pages across all sites you have access to.
`search` filters pages whose URL or path contains the text (case-insensitive).
It's a plain text match, not a regular expression.

#### Get a page

```
GET /pages/:id
```

Every page includes `auditStatus` (`pending`, `running`, `completed` or
`failed`), `auditError`, `lastAuditedAt` and `nextAuditAt`. A failed audit keeps
the last successful `auditReport`.

### Issues

All issue endpoints require authentication.

#### List issues

```
GET /issues?siteId=site-id-here&category=accessibility
```

Both query parameters are optional. If `siteId` is provided, returns issues for
that site. Otherwise, returns issues across all sites you have access to.
`category` filters to a single Lighthouse category: `performance`,
`accessibility`, `bestPractices`, or `seo`.

Returns audit failures grouped by audit ID across all pages. Each issue includes
the list of pages where the audit fails, sorted by score ascending (worst
first). Issues are sorted by number of affected pages descending.

The response also includes `status` and `audits`. `status` is `pending` while a
sitemap hasn't been scraped yet or pages are waiting for their first audit, so
the issue list is incomplete. It's `ready` once everything has been audited.

```json
{
  "status": "pending",
  "audits": {
    "completedPages": 12,
    "failedPages": 1,
    "pendingPages": 32,
    "runningPages": 5,
    "totalPages": 50
  },
  "issues": []
}
```

### Other

#### Health check

```
GET /
```

```json
{
  "service": "foghorn-api",
  "status": "ok",
  "jobRunner": { "status": "online", "lastSeenAt": "2026-10-08T12:00:00.000Z" }
}
```

`jobRunner.status` is `online` when a job runner has checked in during the last
2 minutes, `offline` when none has, and `unknown` if the status could not be
read. While it's `offline`, pending sites and pages don't make progress.

#### OpenAPI spec

```
GET /openapi
```

## Job runner

The API only stores and serves data. A separate job runner scrapes sitemaps and
runs PageSpeed Insights audits. It picks up sites and pages that have never been
processed first, then anything older than 4 hours.

### Run it in Docker

Create `.env.production` with the production values (see `.env.example`):

```bash
DB_URL=mongodb+srv://...
DB_DATABASE=foghorn-api
PAGESPEED_API_KEY=...
AXIOM_TOKEN=...
```

Then start the runner:

```bash
docker compose up --build
```

It runs until stopped. On `docker compose down` or Ctrl+C it finishes the
current audits before exiting. Without `PAGESPEED_API_KEY`, PageSpeed rate
limits almost right away. When that happens the runner leaves the pages pending
and pauses audits for 5 minutes. Network errors and 5xx responses from PageSpeed
are retried twice with backoff before the audit counts as failed.

### Run it without Docker

```bash
bun run run-jobs              # Keep running
bun run run-jobs --once       # Run one cycle and exit
bun run scrape-sitemaps       # Only scrape sitemaps that are due
bun run run-audits            # Only audit pages that are due
```

`run-jobs` options: `--batch-size` (default 10), `--concurrency` (default 5, max
5), `--delay` (seconds between audits per worker, default 3), `--idle-delay`
(seconds to wait when there's nothing to do, default 60), `--rate-limit-delay`
(seconds to pause after being rate limited, default 300), `--once` and
`--only sitemaps|audits`. Run `bun run run-jobs --help` for details.
