# Foghorn API

Foghorn finds performance, accessibility, and SEO issues across your entire site
— automatically. Point it at a domain, and it crawls every page, runs Lighthouse
audits, and reports what needs fixing. Use the REST API directly from your AI
agent to monitor site health and act on issues without leaving the loop.

## Getting Started

### Use from an agent

Install the Foghorn skill to use the API directly from Claude Code, Cursor,
Gemini CLI, or any agent that supports the [Agent Skills](https://agentskills.io)
spec:

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

Returns the site object including its `id`. Foghorn will begin crawling the
sitemap and running Lighthouse audits.

### 5. List issues

```bash
curl https://foghorn-api.artgaard.workers.dev/issues?siteId=<site-id> \
  -H "Authorization: Bearer <token>"
```

Returns audit failures grouped by audit ID, sorted by the number of affected
pages. Each issue includes the list of pages where the audit fails.

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

Both fields are optional.

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
`search` filters pages where the URL or path matches the term
(case-insensitive).

#### Get a page

```
GET /pages/:id
```

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

### Other

#### Health check

```
GET /
```

#### OpenAPI spec

```
GET /openapi
```
