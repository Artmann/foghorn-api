# Foghorn API - Agent Context

## Overview

Foghorn API is a Cloudflare Workers application for running and collecting
Lighthouse performance data. It uses Hono as the web framework and MongoDB Atlas
Data API for persistence.

## Architecture

- **Runtime**: Cloudflare Workers (serverless edge)
- **Framework**: Hono v4
- **Database**: MongoDB Atlas via HTTP Data API (not native driver - Workers
  don't support TCP)
- **Auth**: Dual auth via Bearer tokens - JWT for users, API keys for
  programmatic access

## Key Design Decisions

### Why MongoDB Data API instead of native driver?

Cloudflare Workers don't support TCP sockets. MongoDB Atlas Data API provides
HTTP-based access that works in the Workers environment.

### Why dual auth (JWT + API keys)?

- JWT tokens: Short-lived (24h), for user sessions in web apps
- API keys: Long-lived, for server-to-server and CLI usage

### API key format

Keys use `fh_` prefix followed by base64url-encoded random bytes. The prefix
allows the auth middleware to detect token type without database lookup.

## File Structure

```
src/
  index.ts              # App entry, middleware stack, route mounting
  types/env.ts          # CloudflareBindings interface, shared types
  models/
    user.ts             # User interface, response helpers
    api-key.ts          # ApiKey interface, response helpers
  lib/
    mongodb.ts          # MongoDBClient class wrapping Data API
    crypto.ts           # PBKDF2 password hashing via Web Crypto API
    api-key.ts          # Key generation, SHA-256 hashing
  middleware/
    auth.ts             # Combined JWT/API key bearer auth
  routes/
    auth.ts             # POST /auth/signup, POST /auth/signin
    api-keys.ts         # CRUD for API keys (protected)
```

## Security Implementation

### Passwords

- PBKDF2 with 100,000 iterations
- SHA-256 hash function
- Unique 16-byte salt per user
- Timing-safe comparison

### API Keys

- SHA-256 hashed before storage
- Only prefix stored for identification
- Full key shown once at creation

### JWT

- HS256 algorithm
- 24-hour expiration
- Contains: sub (userId), email, iat, exp

## Environment Variables

All secrets set via `wrangler secret put`:

- `JWT_SECRET` - JWT signing key
- `MONGODB_API_KEY` - Atlas Data API key
- `MONGODB_APP_ID` - Atlas App ID
- `MONGODB_CLUSTER` - Cluster name
- `MONGODB_DATABASE` - Database name

## API Contracts

### POST /auth/signup

```json
// Request
{ "email": "user@example.com", "password": "min8chars" }
// Response 201
{ "id": "...", "email": "user@example.com", "createdAt": "..." }
```

### POST /auth/signin

```json
// Request
{ "email": "user@example.com", "password": "..." }
// Response 200
{ "token": "eyJ...", "expiresIn": 86400, "user": { "id": "...", "email": "..." } }
```

### POST /api-keys (protected)

```json
// Request
{ "name": "My Key" }
// Response 201
{ "id": "...", "name": "My Key", "key": "fh_abc123...", "keyPrefix": "fh_abc1", "createdAt": "..." }
```

## Common Tasks

### Adding a new protected route

1. Create route file in `src/routes/`
2. Apply `authMiddleware()` to the route
3. Access user via `c.get('auth').userId`
4. Mount in `src/index.ts`
5. Update the OpenAPI spec in `src/openapi-spec.ts` to document the new endpoint
6. Update the README to reflect the new endpoint
7. Update the skill files in `skills/` to document the new endpoint

### Editing an existing endpoint

When changing request bodies, response shapes, status codes, or URL paths of an
existing endpoint, you **must** update all of the following to keep them in
sync:

1. The OpenAPI spec in `src/openapi-spec.ts` (served at `GET /openapi`)
2. The README
3. The skill files in `skills/` (both `SKILL.md` and
   `references/api-reference.md`)

### Adding a new model

1. Define interface in `src/models/`
2. Add response type and helper function
3. Use `MongoDBClient` methods for CRUD

## Testing Locally

```bash
bun run dev
# Server runs at http://localhost:8787

# Test signup
curl -X POST http://localhost:8787/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

Note: Local testing requires MongoDB Atlas Data API credentials in wrangler
secrets or a `.dev.vars` file.

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
