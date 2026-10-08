# Contributing

## Tech Stack

- **API**: Cloudflare Workers with Hono
- **Job runner**: Bun, packaged with Docker
- **Database**: MongoDB with Esix
- **Auth**: JWT tokens and API keys
- **Audits**: PageSpeed Insights API

See [AGENTS.md](AGENTS.md) for the architecture, how jobs and pending state
work, and the code style.

## Getting Started

```bash
bun install
cp .env.example .env    # Needs a local MongoDB
bun run dev
```

## Scripts

| Command                   | Description                             |
| ------------------------- | --------------------------------------- |
| `bun run dev`             | Start the local API                     |
| `bun run deploy`          | Deploy the API to Cloudflare Workers    |
| `bun run run-jobs`        | Run the job runner until stopped        |
| `bun run scrape-sitemaps` | Scrape the sitemaps that are due        |
| `bun run run-audits`      | Audit the pages that are due            |
| `bun run test:run`        | Run the tests once                      |
| `bun run typecheck`       | Run TypeScript type checking            |
| `bun run format`          | Format code with Prettier               |
| `bun run format:check`    | Check formatting without changing files |
| `bun run cf-typegen`      | Generate types from the wrangler config |

## Environment Setup

Set the API secrets with wrangler:

```bash
bunx wrangler secret put DB_URL
bunx wrangler secret put DB_DATABASE
bunx wrangler secret put JWT_SECRET
bunx wrangler secret put AXIOM_TOKEN
```

The job runner reads `.env.production` when it runs in Docker. See the
[Job runner](README.md#job-runner) section in the README.
