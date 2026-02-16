# Foghorn API

API for running and collecting Lighthouse data for your site.

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono
- **Database**: MongoDB Atlas (via Data API)
- **Auth**: JWT tokens + API keys

## Getting Started

```bash
bun install
bun run dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start local development server |
| `bun run deploy` | Deploy to Cloudflare Workers |
| `bun run typecheck` | Run TypeScript type checking |
| `bun run format` | Format code with Prettier |
| `bun run cf-typegen` | Generate types from wrangler config |

## Environment Setup

Set secrets via wrangler:

```bash
bunx wrangler secret put JWT_SECRET
bunx wrangler secret put MONGODB_API_KEY
bunx wrangler secret put MONGODB_APP_ID
bunx wrangler secret put MONGODB_CLUSTER
bunx wrangler secret put MONGODB_DATABASE
```

## API Endpoints

### Public

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Health check |
| GET | `/health` | Health check |
| POST | `/auth/signup` | Create account |
| POST | `/auth/signin` | Login, returns JWT |

### Protected (Bearer token required)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api-keys` | Create API key |
| GET | `/api-keys` | List user's API keys |
| DELETE | `/api-keys/:id` | Delete API key |

## Authentication

The API supports two authentication methods via Bearer token:

1. **JWT tokens** - Returned from `/auth/signin`, expires in 24 hours
2. **API keys** - Created via `/api-keys`, prefixed with `fh_`

```bash
# Using JWT
curl -H "Authorization: Bearer <jwt-token>" https://api.example.com/api-keys

# Using API key
curl -H "Authorization: Bearer fh_abc123..." https://api.example.com/api-keys
```

## Project Structure

```
src/
  index.ts              # Main app entry point
  types/
    env.ts              # CloudflareBindings, type definitions
  models/
    user.ts             # User model
    api-key.ts          # API key model
  lib/
    mongodb.ts          # MongoDB Atlas Data API client
    crypto.ts           # Password hashing (PBKDF2)
    api-key.ts          # API key generation
  middleware/
    auth.ts             # JWT + API key auth middleware
  routes/
    auth.ts             # Auth endpoints
    api-keys.ts         # API key endpoints
```

## MongoDB Setup

1. Create a MongoDB Atlas cluster
2. Enable the Data API in Atlas
3. Create an API key with read/write access
4. Create indexes:

```javascript
db.users.createIndex({ "email": 1 }, { unique: true })
db.apiKeys.createIndex({ "keyHash": 1 }, { unique: true })
db.apiKeys.createIndex({ "userId": 1 })
```
