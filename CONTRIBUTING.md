# Contributing

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

| Command              | Description                         |
| -------------------- | ----------------------------------- |
| `bun run dev`        | Start local development server      |
| `bun run deploy`     | Deploy to Cloudflare Workers        |
| `bun run typecheck`  | Run TypeScript type checking        |
| `bun run format`     | Format code with Prettier           |
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

## Project Structure

```
src/
  index.ts              # Main app entry point
  types/
    env.ts              # CloudflareBindings, type definitions
  models/
    user.ts             # User model
    api-key.ts          # API key model
    team.ts             # Team model
    team-member.ts      # Team membership model
    site.ts             # Site model
  lib/
    mongodb.ts          # MongoDB Atlas Data API client
    crypto.ts           # Password hashing (PBKDF2)
    api-key.ts          # API key generation
  middleware/
    auth.ts             # JWT + API key auth middleware
  routes/
    auth.ts             # Auth endpoints
    api-keys.ts         # API key endpoints
    teams.ts            # Team endpoints
    sites.ts            # Site endpoints
```
