# Foghorn To-do

## Now

### Local job runner (Docker)

- [ ] Create `.env.production` with the production `DB_URL`, `DB_DATABASE`,
      `PAGESPEED_API_KEY` and `AXIOM_TOKEN`, then run `docker compose up`.
- [ ] Run it against production and watch the first full pass. Check how long
      250 pages take and whether 5 workers hit PageSpeed's quota.
- [ ] Delete the unused `INTERNAL_API_KEY` secret:
      `bunx wrangler secret delete INTERNAL_API_KEY`.
- [ ] Stop tracking `.claude/settings.local.json`. It's a personal file and
      contains an old local JWT.

## Next

### Database connections on Workers

- [ ] Each Worker request opens a new MongoDB connection, which adds a TLS
      handshake to every request. If latency becomes a problem, look at
      Cloudflare Hyperdrive (when it supports MongoDB) or an HTTP data layer.
- [ ] Add per-request connection support to Esix itself (for example
      `connectionHandler.run(client, callback)`), so `src/services/database.ts`
      doesn't need to replace `connectionHandler.getConnection`.

### Effect follow-ups

- [ ] Add the Effect language service (`@effect/language-service`) to catch
      Effect mistakes in the editor.
- [ ] Brand entity IDs (`TeamId`, `SiteId`, ...) in the schemas.

### MCP server

- [ ] Add `run_audit_now` once there is an on-demand audit endpoint, and
      `get_score_history` once score tracking exists.
- [ ] Sessions for the older MCP protocols live in memory per Worker isolate and
      never expire unless the client ends them. Isolates are recycled often, but
      move sessions to a Durable Object (or drop the old protocols once clients
      support 2026-07-28) before this gets real traffic.
- [ ] OAuth for MCP, so users can connect without creating an API key first.
- [ ] Submit the server to the MCP registry.

### Hardening

- [ ] Raise the PBKDF2 iterations for passwords from 10,000 to 100,000 (the most
      Workers allows). Store the iteration count per user so existing hashes
      keep working, and rehash on the next sign-in.
- [ ] Replace the in-memory rate limiter. It's per isolate on Workers, so the
      limit isn't enforced. Use Cloudflare's rate limiting binding or a Durable
      Object.
- [ ] Verify domain ownership before auditing (DNS TXT record or a file at
      `/.well-known/foghorn.txt`). Today anyone can add any domain and spend our
      PageSpeed quota.
- [ ] Invite team members by email instead of by user ID. There's no way to find
      another user's ID today.

## Later: making it really good

### Score tracking

- [ ] Store each audit as its own record (`AuditRun`) instead of overwriting
      `page.auditReport`. This is the base for everything below.
- [ ] Score history per page and per site, with a `GET` endpoint for trends.
- [ ] Site-level score: aggregate page scores (median, worst pages).
- [ ] Track Core Web Vitals field data (CrUX) over time, not just lab scores.
- [ ] Audit both mobile and desktop.
- [ ] Set a retention limit for old runs (for example, keep daily for 90 days).

### Regressions and alerts

- [ ] Detect regressions: a score drop over a threshold, or a new failing audit
      on a page.
- [ ] Notify by webhook, email or Slack.
- [ ] Performance budgets per site (for example, LCP under 2.5s, performance
      score over 90) that trigger alerts.
- [ ] Weekly summary email per team.

### Lighthouse score service

- [ ] On-demand audit endpoint: `POST /audits` with a URL that returns the
      result (or a job ID to poll). Useful for agents and CI.
- [ ] GitHub Action that audits preview deployments and comments the score diff
      on the pull request.
- [ ] Public score badge (`/badge/:siteId.svg`) for READMEs.
- [ ] Shareable public report page per site.
- [ ] Compare two runs side by side to show what changed.

### Running Lighthouse ourselves

- [ ] Run Lighthouse directly in the Docker runner (headless Chrome) instead of
      the PageSpeed Insights API. Removes the quota limit, allows desktop and
      custom settings, and returns the full report.
- [ ] Keep PageSpeed only for CrUX field data.
- [ ] Later, move the runner from a local machine to a hosted container (Fly,
      Railway or Cloudflare Containers).

## Done

- [x] Users, sign up and sign in with JWT.
- [x] API keys.
- [x] Teams and members.
- [x] Sites, pages and issues endpoints.
- [x] Sitemap scraping and PageSpeed audits as CLI commands.
- [x] OpenAPI spec at `/openapi`.
- [x] Agent skill in `skills/lighthouse-audit/`.
- [x] Limit the amount of pages scraped per site to 250.
- [x] Limit the number of sites per team to 10.
- [x] Limit the number of teams per user to 5.
- [x] Add rate limits to the API (per isolate, see Hardening).
- [x] Docker job runner (`docker compose up`) that loops over sitemap scrapes
      and audits, with a clean shutdown.
- [x] 4-hour cooldown for sitemap scrapes and audits.
- [x] Pending state in the API: `status`, `sitemap` and `audits` on sites,
      `auditStatus` on pages, and `status` and `audits` on issues.
- [x] Back off when PageSpeed rate limits instead of marking pages as failed.
- [x] `running` state for sitemap scrapes and audits, with a 10-minute lease so
      a crashed runner doesn't leave work stuck.
- [x] Job runner heartbeat, shown as `jobRunner` on `GET /`.
- [x] Remove pages that are no longer in the sitemap or belong to an old domain.
- [x] Remove the unused `/internal` routes and the stale `package-lock.json`.
- [x] Make the CI format check fail on unformatted files.
- [x] Rewrite `AGENTS.md` and `CONTRIBUTING.md` to match the code.
- [x] Rewrite the API and the job runner with Effect 4: `HttpApi` with schemas
      and a generated OpenAPI spec, services and layers, tagged errors with a
      `code` in every error response, `Config`, and an Effect job runner with
      timeouts, retries with backoff, bounded concurrency and a clean shutdown.
- [x] Remote MCP server at `/mcp` on the Worker, with API key or JWT auth and
      tools for teams, sites, issues and pages, built on the same services as
      the REST API.
- [x] A MongoDB client per Worker request, so concurrent requests no longer
      share sockets and fail.
- [x] Fix Worker request logs, which skipped the JSON and Axiom loggers and
      ignored `LOG_LEVEL`.
- [x] Pagination for `GET /pages` and `GET /issues` (and the MCP tools). Page
      lists return scores instead of audit reports. Issues are built by
      streaming pages with a projection and keep only the worst pages per issue,
      so memory stays bounded.
