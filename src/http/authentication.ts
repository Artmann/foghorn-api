import { Effect, Layer, Redacted } from 'effect'

import {
  Authentication,
  CurrentUser,
  type CurrentUserShape
} from '../api/authentication'
import { Unauthorized } from '../api/errors'
import { isApiKey } from '../lib/api-key'
import { ApiKeys } from '../services/api-keys'
import { Users } from '../services/users'

export const missingTokenMessage =
  'Missing authorization header. Send "Authorization: Bearer <token>" with a JWT or an API key.'

// Builds a function that checks a bearer token: an `fh_` API key or a JWT.
// Shared by the REST API and the MCP endpoint.
export const makeAuthenticateToken = Effect.gen(function* () {
  const apiKeys = yield* ApiKeys
  const users = yield* Users

  return Effect.fn('authenticateToken')(function* (token: string) {
    if (token.length === 0) {
      return yield* new Unauthorized({ message: missingTokenMessage })
    }

    const currentUser: CurrentUserShape = isApiKey(token)
      ? {
          authType: 'api-key',
          userId: yield* apiKeys.authenticate(token)
        }
      : { authType: 'jwt', userId: yield* users.verifyToken(token) }

    return currentUser
  })
})

export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const authenticateToken = yield* makeAuthenticateToken

    return Authentication.of({
      bearer: (httpEffect, { credential }) =>
        Effect.flatMap(
          authenticateToken(Redacted.value(credential)),
          (currentUser) =>
            Effect.provideService(httpEffect, CurrentUser, currentUser)
        )
    })
  })
)
