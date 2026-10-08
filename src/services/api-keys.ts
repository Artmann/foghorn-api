import { Clock, Context, Effect, Layer } from 'effect'

import { ApiKeyNotFound, Unauthorized } from '../api/errors'
import { generateApiKey, hashApiKey } from '../lib/api-key'
import { ApiKey } from '../models/api-key'
import { Database, type DatabaseError } from './database'

export interface CreatedApiKey {
  readonly apiKey: ApiKey
  // The full key. Only available right after creation.
  readonly key: string
}

export interface ApiKeysShape {
  // Returns the user ID the key belongs to.
  readonly authenticate: (key: string) => Effect.Effect<string, Unauthorized>
  readonly create: (input: {
    expiresAt: number | null
    name: string
    userId: string
  }) => Effect.Effect<CreatedApiKey, DatabaseError>
  readonly delete: (input: {
    id: string
    userId: string
  }) => Effect.Effect<void, ApiKeyNotFound | DatabaseError>
  readonly list: (userId: string) => Effect.Effect<ApiKey[], DatabaseError>
}

export class ApiKeys extends Context.Service<ApiKeys, ApiKeysShape>()(
  'foghorn/services/ApiKeys'
) {
  static readonly layer = Layer.effect(
    ApiKeys,
    Effect.gen(function* () {
      const database = yield* Database

      const create = Effect.fn('ApiKeys.create')(function* (input: {
        expiresAt: number | null
        name: string
        userId: string
      }) {
        const {
          hash: keyHash,
          key,
          prefix: keyPrefix
        } = yield* Effect.promise(() => generateApiKey())
        const apiKey = yield* database.use('ApiKey.create', () =>
          ApiKey.create({
            expiresAt: input.expiresAt,
            keyHash,
            keyPrefix,
            lastUsedAt: null,
            name: input.name,
            userId: input.userId
          })
        )

        yield* Effect.logInfo('API key created').pipe(
          Effect.annotateLogs({ keyPrefix, userId: input.userId })
        )

        return { apiKey, key }
      })

      const list = (userId: string) =>
        database.use('ApiKey.where', () => ApiKey.where('userId', userId).get())

      const remove = Effect.fn('ApiKeys.delete')(function* (input: {
        id: string
        userId: string
      }) {
        const apiKey = yield* database.use('ApiKey.find', () =>
          ApiKey.find(input.id)
        )

        if (!apiKey || apiKey.userId !== input.userId) {
          yield* Effect.logWarning('API key not found on delete').pipe(
            Effect.annotateLogs({ keyId: input.id, userId: input.userId })
          )

          return yield* new ApiKeyNotFound({
            message:
              'API key not found. Check the ID against your list of API keys.'
          })
        }

        yield* database.use('ApiKey.delete', () => apiKey.delete())

        yield* Effect.logInfo('API key deleted').pipe(
          Effect.annotateLogs({ keyId: input.id, userId: input.userId })
        )
      })

      const authenticate = Effect.fn('ApiKeys.authenticate')(
        function* (key: string) {
          const keyHash = yield* Effect.promise(() => hashApiKey(key))
          const apiKey = yield* database.use('ApiKey.findBy', () =>
            ApiKey.findBy('keyHash', keyHash)
          )

          if (!apiKey) {
            yield* Effect.logWarning('API key auth failed (not found)')

            return yield* new Unauthorized({ message: 'Invalid API key.' })
          }

          const now = yield* Clock.currentTimeMillis

          if (apiKey.expiresAt !== null && apiKey.expiresAt < now) {
            yield* Effect.logWarning('API key auth failed (expired)').pipe(
              Effect.annotateLogs({ keyPrefix: apiKey.keyPrefix })
            )

            return yield* new Unauthorized({ message: 'API key has expired.' })
          }

          // Recording the last use is nice to have, so don't fail the request
          // over it.
          apiKey.lastUsedAt = now
          yield* database
            .use('ApiKey.save', () => apiKey.save())
            .pipe(
              Effect.catchTag('DatabaseError', (error) =>
                Effect.logWarning('Could not record API key use.').pipe(
                  Effect.annotateLogs({ error: error.message })
                )
              )
            )

          return apiKey.userId
        },
        Effect.catchTag('DatabaseError', () =>
          Effect.fail(
            new Unauthorized({ message: 'API key authentication failed.' })
          )
        )
      )

      return ApiKeys.of({ authenticate, create, delete: remove, list })
    })
  )
}
