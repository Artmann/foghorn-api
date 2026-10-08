import { Effect } from 'effect'
import { connectionHandler } from 'esix'
import { describe, expect, it } from 'vitest'

import { Site } from '../models/site'
import {
  app,
  createAuthToken,
  createTestSite,
  createTestTeam,
  createTestUser,
  mockExecutionContext,
  runWithServices
} from '../test-helpers'
import {
  Database,
  DatabaseConnection,
  makeDatabaseConnection,
  type DatabaseConnectionShape
} from './database'

// A request connection that records how often it was used.
function trackConnection() {
  const connection = makeDatabaseConnection()
  const tracked = {
    close: vi.fn(connection.close),
    getDatabase: vi.fn(connection.getDatabase)
  } satisfies DatabaseConnectionShape

  return tracked
}

describe('makeDatabaseConnection', () => {
  it('opens one client for concurrent queries', async () => {
    const connection = makeDatabaseConnection()

    const [first, second] = await Promise.all([
      connection.getDatabase(),
      connection.getDatabase()
    ])

    expect(first).toBe(second)

    await connection.close()
  })

  it('closes without having connected', async () => {
    const connection = makeDatabaseConnection()

    await expect(connection.close()).resolves.toEqual(undefined)
  })
})

describe('Database.use', () => {
  it('runs Esix queries on the provided connection', async () => {
    const { user } = await createTestUser()
    const team = await createTestTeam(user.id)
    const site = await createTestSite(team.id, { domain: 'example.com' })
    const connection = trackConnection()

    const found = await runWithServices(
      Effect.gen(function* () {
        const database = yield* Database

        return yield* database.use('Site.find', () => Site.find(site.id))
      }).pipe(Effect.provideService(DatabaseConnection, connection))
    )

    expect(found?.domain).toEqual('example.com')
    expect(connection.getDatabase).toHaveBeenCalledTimes(1)

    await connection.close()
  })

  it('gives raw collections from the provided connection', async () => {
    const connection = trackConnection()

    await runWithServices(
      Effect.gen(function* () {
        const database = yield* Database

        return yield* database.collection('sites')
      }).pipe(Effect.provideService(DatabaseConnection, connection))
    )

    expect(connection.getDatabase).toHaveBeenCalledTimes(1)

    await connection.close()
  })

  it('uses the global connection without one', async () => {
    const getConnection = vi.spyOn(connectionHandler, 'getConnection')

    await runWithServices(
      Effect.gen(function* () {
        const database = yield* Database

        return yield* database.use('Site.all', () => Site.all())
      })
    )

    expect(getConnection).toHaveBeenCalledTimes(1)
  })
})

describe('Worker requests', () => {
  it('each open their own connection', async () => {
    const { user } = await createTestUser()
    const token = await createAuthToken(user.id, user.email)

    await createTestTeam(user.id)

    // The global handler's `getConnection` is replaced, so this only counts
    // connections opened by request handlers.
    const prototype = Object.getPrototypeOf(
      connectionHandler
    ) as typeof connectionHandler
    const openConnection = vi.spyOn(prototype, 'getConnection')

    const responses = await Promise.all([
      app.request('/teams', { headers: { Authorization: `Bearer ${token}` } }),
      app.request('/teams', { headers: { Authorization: `Bearer ${token}` } })
    ])

    expect(responses.map((response) => response.status)).toEqual([200, 200])
    expect(openConnection).toHaveBeenCalledTimes(2)
    expect(mockExecutionContext.waitUntil).toHaveBeenCalledTimes(2)

    await Promise.all(
      mockExecutionContext.waitUntil.mock.calls.map(([promise]) => promise)
    )
  })
})
