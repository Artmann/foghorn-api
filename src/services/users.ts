import { Clock, Config, Context, Effect, Layer, Redacted } from 'effect'

import {
  EmailAlreadyRegistered,
  InvalidCredentials,
  Unauthorized
} from '../api/errors'
import { hashPassword, verifyPassword } from '../lib/crypto'
import { signJwt, verifyJwt } from '../lib/jwt'
import { User } from '../models/user'
import { Database, type DatabaseError } from './database'

// 24 hours.
export const jwtExpirySeconds = 86400

export interface SignInResult {
  readonly expiresIn: number
  readonly token: string
  readonly user: User
}

export interface UsersShape {
  readonly find: (id: string) => Effect.Effect<User | null, DatabaseError>
  readonly signIn: (input: {
    email: string
    password: string
  }) => Effect.Effect<SignInResult, DatabaseError | InvalidCredentials>
  readonly signUp: (input: {
    email: string
    password: string
  }) => Effect.Effect<User, DatabaseError | EmailAlreadyRegistered>
  // Returns the user ID in a valid JWT.
  readonly verifyToken: (token: string) => Effect.Effect<string, Unauthorized>
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export class Users extends Context.Service<Users, UsersShape>()(
  'foghorn/services/Users'
) {
  static readonly layer = Layer.effect(
    Users,
    Effect.gen(function* () {
      const database = yield* Database
      const jwtSecret = yield* Config.Redacted('JWT_SECRET')

      const find = (id: string) =>
        database.use('User.find', () => User.find(id))

      const signUp = Effect.fn('Users.signUp')(function* (input: {
        email: string
        password: string
      }) {
        const email = normalizeEmail(input.email)
        const existing = yield* database.use('User.findBy', () =>
          User.findBy('email', email)
        )

        if (existing) {
          yield* Effect.logWarning('Sign-up email conflict').pipe(
            Effect.annotateLogs({ email })
          )

          return yield* new EmailAlreadyRegistered({
            message:
              'Email already registered. Sign in instead, or use another email.'
          })
        }

        const { hash: passwordHash, salt: passwordSalt } =
          yield* Effect.promise(() => hashPassword(input.password))
        const user = yield* database.use('User.create', () =>
          User.create({ email, passwordHash, passwordSalt })
        )

        yield* Effect.logInfo('User signed up').pipe(
          Effect.annotateLogs({ email, userId: user.id })
        )

        return user
      })

      const signIn = Effect.fn('Users.signIn')(function* (input: {
        email: string
        password: string
      }) {
        const email = normalizeEmail(input.email)
        const user = yield* database.use('User.findBy', () =>
          User.findBy('email', email)
        )
        const isValid = user
          ? yield* Effect.promise(() =>
              verifyPassword(
                input.password,
                user.passwordHash,
                user.passwordSalt
              )
            )
          : false

        if (!user || !isValid) {
          yield* Effect.logWarning('Sign-in invalid credentials').pipe(
            Effect.annotateLogs({ email })
          )

          return yield* new InvalidCredentials({
            message: 'Invalid credentials.'
          })
        }

        const now = Math.floor((yield* Clock.currentTimeMillis) / 1000)
        const token = yield* Effect.promise(() =>
          signJwt(
            {
              email: user.email,
              exp: now + jwtExpirySeconds,
              iat: now,
              sub: user.id
            },
            Redacted.value(jwtSecret)
          )
        )

        yield* Effect.logInfo('User signed in').pipe(
          Effect.annotateLogs({ email, userId: user.id })
        )

        return { expiresIn: jwtExpirySeconds, token, user }
      })

      const verifyToken = Effect.fn('Users.verifyToken')(function* (
        token: string
      ) {
        const now = Math.floor((yield* Clock.currentTimeMillis) / 1000)
        const result = yield* Effect.promise(() =>
          verifyJwt(token, Redacted.value(jwtSecret), now)
        )

        if (!result.valid) {
          yield* Effect.logWarning('JWT auth failed').pipe(
            Effect.annotateLogs({ reason: result.reason })
          )

          return yield* new Unauthorized({
            message:
              'Invalid or expired token. Sign in again to get a new token.'
          })
        }

        const userId = result.payload.sub

        if (typeof userId !== 'string' || userId.length === 0) {
          return yield* new Unauthorized({ message: 'Invalid token payload.' })
        }

        return userId
      })

      return Users.of({ find, signIn, signUp, verifyToken })
    })
  )
}
