# Runs the background jobs (sitemap scraping and audits). The API itself runs
# on Cloudflare Workers and is not part of this image.
FROM oven/bun:1.4.0

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --chown=bun:bun tsconfig.json ./
COPY --chown=bun:bun src ./src

USER bun

ENTRYPOINT ["bun", "src/commands/run-jobs.ts"]
