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

### Editing an existing endpoint

When changing request bodies, response shapes, status codes, or URL paths of an
existing endpoint, update the corresponding entry in `src/openapi-spec.ts` to
keep the spec in sync. The spec is served at `GET /openapi`.

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
