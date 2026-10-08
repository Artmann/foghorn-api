# Foghorn To-do

## Now

### Local job runner (Docker)

- [ ] Create `.env.production` with the production `DB_URL`, `DB_DATABASE`,
      `PAGESPEED_API_KEY` and `AXIOM_TOKEN`, then run `docker compose up`.
- [ ] Run it against production and watch the first full pass. Check how long
      250 pages take and whether 5 workers hit PageSpeed's quota.
- [ ] Show when work is running, not just pending: mark a page or site as
      `running` when a worker picks it up, with a timeout so a crashed runner
      doesn't leave it stuck.
- [ ] Let agents tell "pending" apart from "nothing is processing": record a
      runner heartbeat and expose it (for example on `GET /`).
- [ ] Clean up pages that are no longer in the sitemap, or that belong to an old
      domain after a site's domain changes.
- [ ] Remove the stale `package-lock.json`. The project uses `bun.lock`.

### Fix what's out of date

- [ ] Rewrite `AGENTS.md`. It describes the MongoDB Data API and `MONGODB_*`
      variables, but the code uses Esix with `DB_URL` / `DB_DATABASE`. The file
      list and route names (`/auth/signup`) are also wrong.
- [ ] Fix the CI format job. `prettier --write . --check` never fails. Use
      `prettier --check .`, then format the 5 files that fail today.
- [ ] Decide what to do with `src/routes/internal.ts`. Nothing calls it. Either
      remove it or make the job runner use it instead of talking to the database
      directly.

## Next

### Rewrite to Effect

- [ ] Plan the migration: services and layers for the database, logger, config,
      PageSpeed client and auth.
- [ ] Use tagged errors with clear, actionable messages instead of throwing
      `ApiError`.
- [ ] Move config to `Config` so missing env vars fail at startup with a clear
      message.
- [ ] Rewrite the jobs (scrape, audit) with Effect: timeouts, retries with
      backoff for PageSpeed, bounded concurrency, and scheduling with
      `Schedule`.
- [ ] Rewrite the routes, either with `@effect/platform` HttpApi or by keeping
      Hono and running Effect inside the handlers. Decide before starting.
- [ ] Generate the OpenAPI spec from the schemas instead of keeping
      `openapi-spec.ts` in sync by hand.
- [ ] Keep the existing endpoint tests passing throughout.

### MCP server

- [ ] Add an MCP server so agents can use Foghorn as tools instead of reading
      the skill and calling the REST API.
- [ ] Tools: list sites, add site, list issues, get page report, run an audit
      now, get score history.
- [ ] Auth with an API key (`fh_...`).
- [ ] Decide where it runs: a remote MCP endpoint on the Worker (HTTP), a local
      stdio package (`npx foghorn-mcp`), or both.
- [ ] Build it on top of the Effect services so the REST API and MCP share the
      same logic.
- [ ] Update the skill and README to point at the MCP server.

### Hardening

- [ ] Add pagination to `GET /pages` and `GET /issues`. Today they load every
      page and full audit report into memory.
- [ ] Use a projection so list endpoints don't return full audit reports.
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
