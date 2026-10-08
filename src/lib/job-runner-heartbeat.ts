import { connectionHandler } from 'esix'

import { JobRunner } from '../models/job-runner'
import type { Logger } from './logger'
import { timestampToDateTime } from './time'

export const heartbeatIntervalMs = 30 * 1000

// A runner that hasn't checked in for this long counts as offline.
export const heartbeatTimeoutMs = 2 * 60 * 1000

// Runners that haven't been seen for this long are deleted on startup.
export const heartbeatRetentionMs = 7 * 24 * 60 * 60 * 1000

export interface JobRunnerStatusDto {
  lastSeenAt: string | null
  status: 'offline' | 'online'
}

export async function getJobRunnerStatus(
  now: number
): Promise<JobRunnerStatusDto> {
  const [runner] = await JobRunner.orderBy('lastSeenAt', 'desc').limit(1).get()

  if (!runner) {
    return { lastSeenAt: null, status: 'offline' }
  }

  const isOnline =
    runner.stoppedAt === null && runner.lastSeenAt > now - heartbeatTimeoutMs

  return {
    lastSeenAt: timestampToDateTime(runner.lastSeenAt),
    status: isOnline ? 'online' : 'offline'
  }
}

// Registers the runner and keeps `lastSeenAt` up to date until the returned
// function is called.
export async function startHeartbeat(
  name: string,
  logger: Logger,
  intervalMs = heartbeatIntervalMs
): Promise<() => Promise<void>> {
  const now = Date.now()

  await deleteOldRunners(now)

  const runner = await JobRunner.create({
    lastSeenAt: now,
    name,
    startedAt: now,
    stoppedAt: null
  })

  const beat = async () => {
    runner.lastSeenAt = Date.now()
    await runner.save()
  }

  const timer = setInterval(() => {
    beat().catch((error: unknown) => {
      logger.warn('Could not update the job runner heartbeat.', {
        error: error instanceof Error ? error.message : String(error)
      })
    })
  }, intervalMs)

  return async () => {
    clearInterval(timer)

    const stoppedAt = Date.now()

    runner.lastSeenAt = stoppedAt
    runner.stoppedAt = stoppedAt
    await runner.save()
  }
}

async function deleteOldRunners(now: number): Promise<void> {
  const database = await connectionHandler.getConnection()

  // Esix strips `$` operators, so use the collection directly.
  await database
    .collection('job-runners')
    .deleteMany({ lastSeenAt: { $lt: now - heartbeatRetentionMs } })
}
