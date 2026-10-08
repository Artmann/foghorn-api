import { connectionHandler } from 'esix'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { JobRunner } from '../models/job-runner'
import {
  getJobRunnerStatus,
  heartbeatRetentionMs,
  heartbeatTimeoutMs,
  startHeartbeat
} from './job-runner-heartbeat'
import type { Logger } from './logger'

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  flush: vi.fn()
} as unknown as Logger

// Status looks at every runner, so start each test from an empty collection.
beforeEach(async () => {
  const database = await connectionHandler.getConnection()

  await database.collection('job-runners').deleteMany({})
})

describe('getJobRunnerStatus', () => {
  it('is offline when no runner has ever started', async () => {
    expect(await getJobRunnerStatus(Date.now())).toEqual({
      lastSeenAt: null,
      status: 'offline'
    })
  })

  it('is online while a runner is checking in', async () => {
    const stop = await startHeartbeat('runner-1', mockLogger, 60_000)

    try {
      expect(await getJobRunnerStatus(Date.now())).toEqual({
        lastSeenAt: expect.any(String),
        status: 'online'
      })
    } finally {
      await stop()
    }
  })

  it('is offline after the runner stops', async () => {
    const stop = await startHeartbeat('runner-1', mockLogger, 60_000)

    await stop()

    expect(await getJobRunnerStatus(Date.now())).toEqual({
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

    expect(
      await getJobRunnerStatus(lastSeenAt + heartbeatTimeoutMs + 1000)
    ).toEqual({ lastSeenAt: '2026-10-08T12:00:00.000Z', status: 'offline' })
  })
})

describe('startHeartbeat', () => {
  it('deletes runners that have not been seen for a long time', async () => {
    const old = Date.now() - heartbeatRetentionMs - 1000

    await JobRunner.create({
      lastSeenAt: old,
      name: 'old',
      startedAt: old,
      stoppedAt: old
    })

    const stop = await startHeartbeat('runner-1', mockLogger, 60_000)
    await stop()

    const runners = await JobRunner.all()

    expect(runners.map((runner) => runner.name)).toEqual(['runner-1'])
  })
})
