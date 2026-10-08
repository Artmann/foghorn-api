# Foghorn API - Agent Context

## Overview

Foghorn finds performance, accessibility, best-practices and SEO issues across a
whole site. A user adds a site, Foghorn reads its sitemap, audits every page
with PageSpeed Insights (Lighthouse), and the API returns the failing audits
grouped by issue.

It has two parts:

- **API**: a Cloudflare Worker that stores and serves data. It never scrapes or
  audits anything itself.
- **Job runner**: a long-running Bun process (`src/commands/run-jobs.ts`) that
  scrapes sitemaps and runs audits. For now it runs in Docker on a developer
  machine against the production database.

Both are written with [Effect](https://effect.website) 4. The package ships its
own docs in `node_modules/effect/ai-docs` and `node_modules/effect/CLAUDE.md`.
Read those instead of relying on memory: Effect 4 differs a lot from Effect 3
(`Context.Service` instead of `Effect.Service`, `effect/http-api` instead of
`@effect/platform`, and so on).

## Architecture

- **Runtime**: Cloudflare Workers with `nodejs_compat` (API), Bun (job runner)
- **HTTP**: Effect `HttpApi`. The API is defined as schemas in `src/api/`, and
  the OpenAPI spec at `GET /openapi` is generated from them.
- **Services**: `Context.Service` classes with a static `layer` in
  `src/services/`. Handlers and jobs only talk to services.
- **Database**: MongoDB through Esix and the native driver, wrapped by the
  `Database` service. Workers can't use a socket another request opened, so each
  Worker request gets its own client (`DatabaseConnection`, created in
  `src/index.ts` and closed when the request ends). `Database.use` points Esix's
  global `connectionHandler` at it through `AsyncLocalStorage`, so always run
  Esix calls inside `Database.use`. The job runner uses Esix's global client.
- **Auth**: Bearer tokens. JWTs (`src/lib/jwt.ts`) for users, `fh_` API keys for
  programmatic access. See the `Authentication` middleware.
- **Audits**: Google PageSpeed Insights API, mobile strategy, all four
  categories.
- **Logging**: `Effect.log*` with annotations. `src/services/logging.ts` writes
  JSON lines and sends them to Axiom when `AXIOM_TOKEN` is set.

## File Structure

```
src/
  index.ts               # Worker entry: builds the app once per isolate
  api/                   # The API contract. No server code in here.
    api.ts               # Endpoint groups and the `Api` class
    schemas.ts           # Request and response schemas, validation messages
    errors.ts            # Tagged errors and how they're encoded on the wire
    authentication.ts    # Authentication middleware definition, CurrentUser
  http/
    app.ts               # Layer wiring and `makeApp(env)`
    handlers.ts          # Endpoint handlers, one group per resource
    authentication.ts    # Authentication middleware implementation
    middleware.ts        # Error responses, rate limiting, logging, headers
  mcp/                   # Remote MCP server at /mcp: tools, handlers, auth
  services/              # Effect services (Database, Users, Teams, Sites, ...)
  jobs/                  # scrapeSite, auditPages and the runner loop
  commands/run-jobs.ts   # CLI entry for the job runner (Docker entrypoint)
  lib/                   # Pure helpers: job status, JWT, crypto, issues, ...
  models/                # Esix models and DTO helpers
skills/lighthouse-audit/ # Agent skill for using the API
```

## MCP Server

- `src/mcp/server.ts` mounts Effect's `McpServer.layerHttp` at `/mcp` on the
  same router as the REST API. Tools are defined in `src/mcp/tools.ts` and
  implemented in `src/mcp/handlers.ts` on top of the same services.
- A route middleware checks the bearer token on every request and provides
  `CurrentUser`. Tool handlers are built once, so they read it with
  `Effect.serviceOption(CurrentUser)`.
- Tools fail with `ToolFailed`, whose message the agent sees. Keep error
  messages free of REST-specific wording, since both APIs show them.
- When you add a REST endpoint that agents need, add a tool for it too, and
  update the tool list in the README.

## Errors

- Domain errors are `Schema.TaggedError` classes in `src/api/errors.ts`.
  Services fail with them, and endpoints list them through their `...Response`
  schema, which encodes them as `{ error: { code, message } }` with the right
  status.
- Every distinct failure gets its own error (`SiteNotFound`, not `NotFound`).
  Messages tell the user what to do next.
- `DatabaseError` is unexpected. Handlers turn it into a defect with
  `Effect.catchTag('DatabaseError', Effect.die)`. The middleware in
  `src/http/middleware.ts` logs defects and answers with a generic 500.
- Request validation failures become `ValidationFailed` 400s with the messages
  from the schemas in `src/api/schemas.ts`.

## Jobs and Pending State

- Sites and pages carry job state: `lastScrapedSitemapAt` / `scrapeSitemapError`
  / `scrapeStartedAt` on sites, and `lastAuditedAt` / `auditError` /
  `auditStartedAt` on pages.
- `src/lib/job-status.ts` turns that into `pending`, `running`, `completed` or
  `failed`. `running` uses a 10-minute lease (`jobLeaseMs`) so a crashed runner
  doesn't leave work stuck.
- Work is due when it has never run, or when it last ran more than 4 hours ago
  (`jobCooldownMs`). Never-run work goes first.
- The runner writes job state with `$set` through the `JobQueue` service, not
  `model.save()`, so it never overwrites changes made through the API.
- Each audit and scrape runs uninterruptibly, so stopping the runner lets
  in-flight work finish. The heartbeat is released by a scope finalizer.
- Esix strips `$` operators from queries. Range and `$ne` queries go through
  `Database.collection()` and the native collection. Esix stores `_id` as a hex
  string.
- When PageSpeed returns 429, the page is released (left pending) and the runner
  pauses audits instead of marking pages as failed.
- The runner records a heartbeat in the `job-runners` collection. `GET /` shows
  it as `jobRunner.status` (`online`, `offline` or `unknown`).

## Security

### Passwords

- PBKDF2 with SHA-256 and 10,000 iterations (see the todo list; this should go
  up)
- Unique 16-byte salt per user
- Timing-safe comparison

### API Keys

- `fh_` prefix followed by base64url-encoded random bytes. The prefix lets the
  auth middleware tell keys from JWTs without a database lookup.
- SHA-256 hashed before storage. Only the first 8 characters are stored in plain
  text for identification.
- The full key is shown once at creation.

### JWT

- HS256, 24-hour expiry
- Contains `sub` (user ID), `email`, `iat` and `exp`

## Environment Variables

API (set with `bunx wrangler secret put <name>`):

- `DB_URL` - MongoDB connection string
- `DB_DATABASE` - Database name
- `JWT_SECRET` - JWT signing key
- `AXIOM_TOKEN` - Optional, sends logs to Axiom

Job runner (`.env` locally, `.env.production` for Docker):

- `DB_URL`, `DB_DATABASE`, `AXIOM_TOKEN` - Same as above
- `PAGESPEED_API_KEY` - PageSpeed Insights key. Without it, audits get rate
  limited almost right away.

## Common Tasks

### Adding a new protected endpoint

1. Add the request and response schemas to `src/api/schemas.ts`, and any new
   errors to `src/api/errors.ts`
2. Add the endpoint to a group in `src/api/api.ts` (or a new group with
   `.middleware(Authentication)`), listing its `error` responses
3. Put the logic in a service in `src/services/` and add its layer to
   `ServicesLive` in `src/http/app.ts`
4. Implement the handler in `src/http/handlers.ts`. Read the user with
   `yield* CurrentUser`
5. Add endpoint tests in `src/http/` that call `app.request()`
6. Update the README and the skill files in `skills/`. The OpenAPI spec updates
   itself.

### Editing an existing endpoint

When changing request bodies, response shapes, status codes, or URL paths of an
existing endpoint, you **must** update all of the following to keep them in
sync:

1. The schemas and endpoint in `src/api/` (the OpenAPI spec is generated from
   them)
2. The README
3. The skill files in `skills/` (both `SKILL.md` and
   `references/api-reference.md`)

### Adding a new model

1. Create an Esix model in `src/models/` (extend `BaseModel`, give every field a
   default)
2. Add the DTO schema to `src/api/schemas.ts` and a `toXDto` helper that
   converts timestamps with `timestampToDateTime`
3. Only access it through a service, using `Database.use()` so failures become
   `DatabaseError`
4. Add a `createTestX` helper in `src/test-helpers.ts` if tests need it

### Testing services and jobs

Use `runWithServices(effect)` from `src/test-helpers.ts`. It provides the job
services against the mock database. Mock `globalThis.fetch` with `vi.spyOn` to
fake PageSpeed and sitemap responses.

## Running Locally

```bash
cp .env.example .env    # Needs a local MongoDB
bun run dev             # API at http://localhost:8787
bun run run-jobs --once # Scrape and audit one batch
bun run test:run        # Tests use Esix's mock database
```

The Worker reads `DB_URL`, `DB_DATABASE` and `JWT_SECRET` from `.dev.vars`
locally.

## Checks

CI runs these as separate jobs. Run them before pushing:

```bash
bun run format:check
bun run typecheck
bun run test:run
```

- Use simple, non mannered language
- When creating pull requests, explain the problem you are solving and the
  changes at a high level. Include any relevant screenshots or videos. Highlight
  any manual steps that are still outstanding. You don't need to include
  information about the model or agent that wrote the code. You don't need to
  include information about the tests you wrote.
- Design for mobile first. Then use Tailwind modifiers to expand the design for
  larger devices and desktop.
- Use assertions like tiny-invariant to throw on invalid states.
- Don't worry if errors are pre-existing or not. Just fix them.

## Code Style

- Don't use CONSTANT_CASE. This is not JAVA.
- Use entire words as variable names. This is not Go. For example `request`
  instead of `req`.
- Use punctuation.
- Use whitespace to break up code to make it easier to read. Put a blank line
  after const groups and control flows and before return statements.
- Order things in alphabetical order by default. If applicable order by
  accessiblity level first, then alphabetical order.
- No any: Use proper types or unknown
- Prefer Nullish Coalescing: Use ?? over ||
- No Floating Promises: Always await or handle promises
- No Non-null Assertions: Avoid ! operator
- Single quotes
- No semicolons
- Always use bracers for control statements.

## Memory

The services are long-running processes; small per-request retention becomes a
production leak. Rules for all TypeScript code:

- No unbounded module-level collections. Any module-scope `Map`, `Set`, array,
  or object that grows per request needs an eviction strategy (TTL, LRU, max
  size) — or should live per-request instead.
- Pair every acquire with a release in a `finally`: remove listeners, clear
  timers, close sockets, cursors, and sessions — including on the error path.
- Give every external await a timeout. Pass `AbortSignal.timeout(...)` to
  `fetch` and SDK calls so a hung call becomes a settled rejection instead of
  retained state (counters, Sets, closures) that never releases.
- Create per-request objects (DataLoaders, request contexts) per request. Never
  retain them at module scope.
- Create long-lived singletons (DB clients, runtimes) once at boot with bounded
  pools, and release them on shutdown.
- Bound what you accept and return: body-size limits, pagination caps, and
  projections that exclude large fields.

## Error handling

- Always handle errors.
- User facing errors should be easy to understand and actionable.
- Error messages must be **actionable** — tell the user what went wrong and what
  they can do about it
- When planning features, always consider what errors can occur and include the
  exact error messages in the plan

## Testing

- Put test files next to the implementation.
- Prefer `toEqual` over `toBe`
- Compare entire objects instead of single properties.
  `expect(product).toEqual({ id: 1, name: 'Cup' })`
- Use RTL to test React components.
- Unit test small, side effect free modules.
- We prefer "integration tests" that only mocks a small set of dependencies.
- Normally, we test the entire endpoint, using a mock database in esix. A good
  API test should perform a request and then assert that the correct documents
  have been created in the database.

## Git

- When using Conventional Commits, scopes should referer to a sub system or a
  part of the application. Something like "ui" is probably to generic.
- Don't use worktrees unless you are explicitly asked to do so.

## Prefered Tools

- Bun
- Tailwind CSS
- shadcn/ui
- Lucide icons
- React hook form
- tiny-invariant
- tiny-typescript-logger
- Mongo DB (with Esix)
- Zod
