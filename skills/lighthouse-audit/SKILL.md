---
name: lighthouse-audit
description: >
  Run Lighthouse audits against websites using the Foghorn API. Use when the
  user wants to check a site's performance, accessibility, best practices, or
  SEO issues. Covers sign-up, authentication, team/site setup, and issue
  retrieval.
metadata:
  author: artgaard
  version: '1.0'
allowed-tools: Bash(curl:*foghorn-api.artgaard.workers.dev*), Read, Write
---

# Lighthouse Audit Skill

Run Lighthouse audits and retrieve performance, accessibility, best-practices,
and SEO issues for any website using the
[Foghorn API](https://foghorn-api.artgaard.workers.dev).

## Overview

Foghorn is a site-health monitoring service built on Lighthouse. You register a
site, Foghorn crawls its sitemap, audits every page, and exposes the results
through a REST API. This skill lets you interact with that API using `curl`.

**Base URL:** `https://foghorn-api.artgaard.workers.dev`

If the `foghorn` MCP server is connected (tools like `list_sites` and
`add_site`), use its tools instead of `curl`. The flow is the same.

## Authentication

All endpoints (except sign-up, sign-in, and health check) require a Bearer token
in the `Authorization` header.

### Step 1 — Check for a stored API key

Read `~/.foghorn`. If the file exists and its contents start with `fh_`, you
already have a valid API key. Set the auth header and skip to
[Setup Workflow](#setup-workflow):

```
AUTH="Authorization: Bearer <key from ~/.foghorn>"
```

### Step 2 — First-time setup (only if `~/.foghorn` is missing or empty)

If no stored key is found, ask the user for their email and password, then run
through sign-up, sign-in, and key creation.

#### Sign up (first time only)

```bash
curl -s -X POST https://foghorn-api.artgaard.workers.dev/auth/sign-up \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"min8chars"}'
```

#### Sign in (get a JWT)

```bash
curl -s -X POST https://foghorn-api.artgaard.workers.dev/auth/sign-in \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"min8chars"}'
```

Returns `{ "token": "eyJ...", "expiresIn": 86400, "user": {...} }`.

#### Create an API key

```bash
curl -s -X POST https://foghorn-api.artgaard.workers.dev/api-keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-agent-key"}'
```

Returns the full key **once** in `apiKey.key`.

#### Save the key

Write the `fh_...` key to `~/.foghorn` so it is reused in future sessions. Then
set the auth header:

```
AUTH="Authorization: Bearer <key>"
```

## Setup Workflow

Before you can retrieve issues you need a **team** and a **site**.

### 1. Create a team

```bash
curl -s -X POST https://foghorn-api.artgaard.workers.dev/teams \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{"name":"My Team"}'
```

### 2. Add a site

```bash
curl -s -X POST https://foghorn-api.artgaard.workers.dev/sites \
  -H "$AUTH" \
  -H "Content-Type: application/json" \
  -d '{"teamId":"TEAM_ID","domain":"www.example.com"}'
```

The `sitemapPath` defaults to `/sitemap.xml`. Override it if your sitemap lives
elsewhere.

### 3. Wait for the crawl

Foghorn scrapes the sitemap and audits each page in the background. This is not
instant: a new site can take minutes to hours depending on how many pages it
has. Check progress:

```bash
curl -s https://foghorn-api.artgaard.workers.dev/sites/SITE_ID \
  -H "$AUTH"
```

The site includes its processing state:

```json
{
  "site": {
    "status": "pending",
    "sitemap": {
      "status": "completed",
      "error": null,
      "lastScrapedAt": "2026-10-08T12:00:00.000Z",
      "nextScrapeAt": "2026-10-08T16:00:00.000Z"
    },
    "audits": {
      "completedPages": 12,
      "failedPages": 1,
      "pendingPages": 32,
      "runningPages": 5,
      "totalPages": 50
    }
  }
}
```

- `status: "pending"` — the sitemap or some pages haven't been processed yet.
  Tell the user how far along it is (for example "12 of 50 pages audited") and
  check again later. Don't poll in a tight loop; once every few minutes is
  enough.
- `status: "ready"` — everything has been audited at least once. Issues are
  complete.
- `status: "failed"` — the sitemap could not be scraped. Show `sitemap.error` to
  the user. Usually the sitemap path is wrong; fix it with `PUT /sites/SITE_ID`
  and a new `sitemapPath`, which queues a new scrape.

`sitemap.status` and each page's `auditStatus` are `pending`, `running`,
`completed` or `failed`. Sitemaps and pages are refreshed every 4 hours
(`nextScrapeAt`, `nextAuditAt`).

If a site stays `pending` with no `runningPages`, check whether anything is
processing jobs:

```bash
curl -s https://foghorn-api.artgaard.workers.dev/
```

If `jobRunner.status` is `offline`, no job runner is running, and the site won't
make progress until one starts. Tell the user that processing is paused instead
of waiting.

## Querying Issues

The `/issues` endpoint aggregates audit failures across all audited pages.

```bash
# All issues for a site
curl -s "https://foghorn-api.artgaard.workers.dev/issues?siteId=SITE_ID" \
  -H "$AUTH"

# Filter by category
curl -s "https://foghorn-api.artgaard.workers.dev/issues?siteId=SITE_ID&category=accessibility" \
  -H "$AUTH"
```

**Categories:** `performance`, `accessibility`, `bestPractices`, `seo`

### Response shape

```json
{
  "status": "ready",
  "audits": {
    "completedPages": 50,
    "failedPages": 0,
    "pendingPages": 0,
    "runningPages": 0,
    "totalPages": 50
  },
  "issues": [
    {
      "auditId": "uses-responsive-images",
      "title": "Properly size images",
      "category": "performance",
      "pageCount": 23,
      "pages": [
        {
          "pageId": "page-id",
          "url": "https://www.example.com/about",
          "path": "/about",
          "score": 0.45,
          "displayValue": "Potential savings of 120 KiB"
        }
      ]
    }
  ],
  "pagination": { "limit": 20, "offset": 0, "nextOffset": 20, "total": 41 }
}
```

- When `status` is `pending`, the list is incomplete because pages are still
  being audited. Say so when you report the issues, and include the progress
  from `audits`.
- Issues are sorted by number of affected pages (most widespread first).
- `pageCount` is how many pages fail the audit. `pages` lists only the worst of
  them, sorted by score ascending (up to `pagesPerIssue`, default 10). To list
  every affected page of a site, pass `siteId` and `pagesPerIssue=250`.
- Scores range from 0 (fail) to 1 (pass).

### Pagination

`/issues` returns 20 issues by default (`limit`, at most 100) and `/pages`
returns 50 pages (at most 250). When `pagination.nextOffset` is not `null`,
there are more. Request the next page with `offset=<nextOffset>`. Usually the
first page of issues is enough to report the biggest problems. Only fetch more
when the user asks for everything.

## Searching Pages

Find specific pages by URL or path. The search is a case-insensitive text match:

```bash
curl -s "https://foghorn-api.artgaard.workers.dev/pages?siteId=SITE_ID&search=blog" \
  -H "$AUTH"
```

Page lists include each page's category `scores` but not the audit report. Use
`GET /pages/:id` for the full report of one page.

## Handling Errors

Errors look like `{ "error": { "code": "SiteNotFound", "message": "..." } }`.
Branch on `code` and show `message` to the user; it says what to do next.

- `Unauthorized` — the token or API key is missing, invalid or expired. If you
  used the key in `~/.foghorn`, it may have been deleted or expired. Run the
  first-time setup again.
- `ValidationFailed` — fix the field named in `message` and retry.
- `RateLimited` — wait for the seconds in the `Retry-After` header.
- `TeamLimitReached` / `SiteLimitReached` — tell the user the limit was reached.
  Don't retry.

## Quick Reference

| Method | Path                         | Purpose                                       |
| ------ | ---------------------------- | --------------------------------------------- |
| GET    | `/`                          | Health check                                  |
| POST   | `/auth/sign-up`              | Create account                                |
| POST   | `/auth/sign-in`              | Get JWT token                                 |
| POST   | `/api-keys`                  | Create API key                                |
| GET    | `/api-keys`                  | List API keys                                 |
| DELETE | `/api-keys/:id`              | Delete API key                                |
| POST   | `/teams`                     | Create team                                   |
| GET    | `/teams`                     | List teams                                    |
| GET    | `/teams/:id`                 | Get team                                      |
| PUT    | `/teams/:id`                 | Update team                                   |
| DELETE | `/teams/:id`                 | Delete team                                   |
| POST   | `/teams/:id/members`         | Add member                                    |
| GET    | `/teams/:id/members`         | List members                                  |
| DELETE | `/teams/:id/members/:userId` | Remove member                                 |
| POST   | `/sites`                     | Add site                                      |
| GET    | `/sites`                     | List sites (optional `?teamId=`)              |
| GET    | `/sites/:id`                 | Get site                                      |
| PUT    | `/sites/:id`                 | Update site                                   |
| DELETE | `/sites/:id`                 | Delete site                                   |
| GET    | `/pages`                     | List pages (`?siteId=`, `?search=`, paged)    |
| GET    | `/pages/:id`                 | Get page with audit report                    |
| GET    | `/issues`                    | List issues (`?siteId=`, `?category=`, paged) |

See [references/api-reference.md](references/api-reference.md) for full
request/response schemas.
