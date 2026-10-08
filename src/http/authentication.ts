import { Effect, Layer, Redacted } from 'effect'

import { Authentication, CurrentUser } from '../api/authentication'
import { Unauthorized } from '../api/errors'
import { isApiKey } from '../lib/api-key'
import { ApiKeys } from '../services/api-keys'
import { Users } from '../services/users'

export const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const apiKeys = yield* ApiKeys
    const users = yield* Users

    return Authentication.of({
      bearer: Effect.fn('Authentication.bearer')(function* (
        httpEffect,
        { credential }
      ) {
        const token = Redacted.value(credential)

        if (token.length === 0) {
          return yield* new Unauthorized({
            message:
              'Missing authorization header. Send "Authorization: Bearer <token>" with a JWT or an API key.'
          })
        }

        const currentUser = isApiKey(token)
          ? {
              authType: 'api-key' as const,
              userId: yield* apiKeys.authenticate(token)
            }
          : {
              authType: 'jwt' as const,
              userId: yield* users.verifyToken(token)
            }

        return yield* Effect.provideService(
          httpEffect,
          CurrentUser,
          currentUser
        )
      })
    })
  })
)
