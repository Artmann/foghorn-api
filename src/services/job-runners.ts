import {
  Clock,
  Context,
  Duration,
  Effect,
  Layer,
  Schedule,
  type Scope
} from 'effect'

import { timestampToDateTime } from '../lib/time'
import { JobRunner } from '../models/job-runner'
import { Database, type DatabaseError } from './database'

export const heartbeatInterval = Duration.seconds(30)

// A runner that hasn't checked in for this long counts as offline.
export const heartbeatTimeoutMs = 2 * 60 * 1000

// Runners that haven't been seen for this long are deleted on startup.
export const heartbeatRetentionMs = 7 * 24 * 60 * 60 * 1000

export interface JobRunnerStatus {
  readonly lastSeenAt: string | null
  readonly status: 'offline' | 'online'
}

export interface JobRunnersShape {
  // Registers a runner and keeps it marked as online until the scope closes.
  readonly heartbeat: (
    name: string
  ) => Effect.Effect<void, DatabaseError, Scope.Scope>
  readonly status: (
    now: number
  ) => Effect.Effect<JobRunnerStatus, DatabaseError>
}

export class JobRunners extends Context.Service<JobRunners, JobRunnersShape>()(
  'foghorn/services/JobRunners'
) {
  static readonly layer = Layer.effect(
    JobRunners,
    Effect.gen(function* () {
      const database = yield* Database

      const status = Effect.fn('JobRunners.status')(function* (now: number) {
        const [runner] = yield* database.use('JobRunner.latest', () =>
          JobRunner.orderBy('lastSeenAt', 'desc').limit(1).get()
        )

        if (!runner) {
          return { lastSeenAt: null, status: 'offline' as const }
        }

        const isOnline =
          runner.stoppedAt === null &&
          runner.lastSeenAt > now - heartbeatTimeoutMs

        return {
          lastSeenAt: timestampToDateTime(runner.lastSeenAt),
          status: isOnline ? ('online' as const) : ('offline' as const)
        }
      })

      const heartbeat = Effect.fn('JobRunners.heartbeat')(function* (
        name: string
      ) {
        const now = yield* Clock.currentTimeMillis
        const runners = yield* database.collection('job-runners')

        yield* database.use('deleteOldRunners', () =>
          runners.deleteMany({
            lastSeenAt: { $lt: now - heartbeatRetentionMs }
          })
        )

        const runner = yield* Effect.acquireRelease(
          database.use('JobRunner.create', () =>
            JobRunner.create({
              lastSeenAt: now,
              name,
              startedAt: now,
              stoppedAt: null
            })
          ),
          (created) =>
            Effect.gen(function* () {
              const stoppedAt = yield* Clock.currentTimeMillis

              created.lastSeenAt = stoppedAt
              created.stoppedAt = stoppedAt

              yield* database.use('JobRunner.save', () => created.save())
            }).pipe(
              Effect.catchTag('DatabaseError', (error) =>
                Effect.logWarning(
                  'Could not mark the job runner as stopped.'
                ).pipe(Effect.annotateLogs({ error: error.message }))
              )
            )
        )

        const beat = Effect.gen(function* () {
          runner.lastSeenAt = yield* Clock.currentTimeMillis

          yield* database.use('JobRunner.save', () => runner.save())
        }).pipe(
          Effect.catchTag('DatabaseError', (error) =>
            Effect.logWarning(
              'Could not update the job runner heartbeat.'
            ).pipe(Effect.annotateLogs({ error: error.message }))
          )
        )

        // Runs in the background until the scope closes.
        yield* beat.pipe(
          Effect.repeat(Schedule.spaced(heartbeatInterval)),
          Effect.forkScoped
        )
      })

      return JobRunners.of({ heartbeat, status })
    })
  )
}
