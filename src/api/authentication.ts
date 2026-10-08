import { Context } from 'effect'
import { HttpApiMiddleware, HttpApiSecurity } from 'effect/http-api'

import { UnauthorizedResponse } from './errors'

export interface CurrentUserShape {
  readonly authType: 'api-key' | 'jwt'
  readonly userId: string
}

// The user the request is authenticated as. Provided by `Authentication`.
export class CurrentUser extends Context.Service<
  CurrentUser,
  CurrentUserShape
>()('foghorn/api/CurrentUser') {}

// Accepts a JWT from `/auth/sign-in` or an `fh_` API key as a bearer token.
export class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  { provides: CurrentUser; requires: never }
>()('foghorn/api/Authentication', {
  error: UnauthorizedResponse,
  security: { bearer: HttpApiSecurity.bearer }
}) {}
