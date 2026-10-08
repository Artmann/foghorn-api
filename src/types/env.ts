import type { Logger } from '../lib/logger'

export interface AppVariables {
  auth: AuthContext
  logger: Logger
}

export interface AuthContext {
  authType: 'jwt' | 'api-key'
  userId: string
}

export interface CloudflareBindings {
  AXIOM_TOKEN: string
  DB_DATABASE: string
  DB_URL: string
  JWT_SECRET: string
}
