import { Effect } from 'effect'
import { connectionHandler } from 'esix'
import { beforeEach, describe, expect, it } from 'vitest'

import { JobRunner } from '../models/job-runner'
import { runWithServices } from '../test-helpers'
import {
  JobRunners,
  heartbeatRetentionMs,
  heartbeatTimeoutMs
} from './job-runners'

// Status looks at every runner, so start each test from an empty collection.
beforeEach(async () => {
  const database = await connectionHandler.getConnection()

  await database.collection('job-runners').deleteMany({})
})

const getStatus = (now: number) =>
  runWithServices(
    Effect.gen(function* () {
      const jobRunners = yield* JobRunners

      return yield* jobRunners.status(now)
    })
  )

describe('JobRunners.status', () => {
  it('is offline when no runner has ever started', async () => {
    expect(await getStatus(Date.now())).toEqual({
      lastSeenAt: null,
      status: 'offline'
    })
  })

  it('is online while a runner is checking in', async () => {
    const status = await runWithServices(
      Effect.gen(function* () {
        const jobRunners = yield* JobRunners

        yield* jobRunners.heartbeat('runner-1')

        return yield* jobRunners.status(Date.now())
      })
    )

    expect(status).toEqual({
      lastSeenAt: expect.any(String),
      status: 'online'
    })
  })

  it('is offline after the runner stops', async () => {
    await runWithServices(
      Effect.gen(function* () {
        const jobRunners = yield* JobRunners

        yield* jobRunners.heartbeat('runner-1')
      })
    )

    expect(await getStatus(Date.now())).toEqual({
      lastSeenAt: expect.any(String),
      status: 'offline'
    })
  })

  it('is offline when the runner stopped checking in', async () => {
    const lastSeenAt = Date.UTC(2026, 9, 8, 12, 0, 0)

    await JobRunner.create({
      lastSeenAt,
      name: 'crashed',
      startedAt: lastSeenAt,
      stoppedAt: null
    })

    expect(await getStatus(lastSeenAt + heartbeatTimeoutMs + 1000)).toEqual({
      lastSeenAt: '2026-10-08T12:00:00.000Z',
      status: 'offline'
    })
  })
})

describe('JobRunners.heartbeat', () => {
  it('deletes runners that have not been seen for a long time', async () => {
    const old = Date.now() - heartbeatRetentionMs - 1000

    await JobRunner.create({
      lastSeenAt: old,
      name: 'old',
      startedAt: old,
      stoppedAt: old
    })

    await runWithServices(
      Effect.gen(function* () {
        const jobRunners = yield* JobRunners

        yield* jobRunners.heartbeat('runner-1')
      })
    )

    const runners = await JobRunner.all()

    expect(runners.map((runner) => runner.name)).toEqual(['runner-1'])
  })
})
