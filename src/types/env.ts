// The Worker bindings from `wrangler.jsonc` and `wrangler secret put`.
export interface CloudflareBindings {
  AXIOM_TOKEN?: string
  DB_DATABASE: string
  DB_URL: string
  ENVIRONMENT?: string
  JWT_SECRET: string
  LOG_LEVEL?: string
}
