export interface AppVariables {
  auth: AuthContext
}

export interface AuthContext {
  authType: 'jwt' | 'api-key'
  userId: string
}

export interface CloudflareBindings {
  JWT_SECRET: string
}
