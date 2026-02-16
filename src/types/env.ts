export interface CloudflareBindings {
  JWT_SECRET: string
  MONGODB_API_KEY: string
  MONGODB_APP_ID: string
  MONGODB_CLUSTER: string
  MONGODB_DATABASE: string
}

export interface AuthContext {
  userId: string
  authType: 'jwt' | 'api-key'
}

export interface AppVariables {
  auth: AuthContext
}
