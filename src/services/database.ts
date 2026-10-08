import { AsyncLocalStorage } from 'node:async_hooks'

import { Config, Context, Effect, Layer, Option, Schema } from 'effect'
import { connectionHandler } from 'esix'
import type { Collection, Db } from 'mongodb'

export class DatabaseError extends Schema.TaggedError<DatabaseError>()(
  'DatabaseError',
  {
    cause: Schema.Defect(),
    message: Schema.String
  }
) {}

// Esix stores ids as hex strings, not ObjectIds.
export interface StoredDocument {
  _id: string
  [key: string]: unknown
}

export type CollectionName = 'job-runners' | 'pages' | 'sites'

export interface DatabaseConnectionShape {
  // Closes the client, if one was opened. Safe to call more than once.
  readonly close: () => Promise<void>
  // Opens the client on first use and returns the same database after that.
  readonly getDatabase: () => Promise<Db>
}

// A MongoDB client that belongs to one Worker request. Workers can't use a
// socket that another request opened, so concurrent requests in the same
// isolate must not share a client. When this service isn't provided (the job
// runner, tests), Esix's global client is used.
export class DatabaseConnection extends Context.Service<
  DatabaseConnection,
  DatabaseConnectionShape
>()('foghorn/services/DatabaseConnection') {}

type ConnectionHandler = typeof connectionHandler

export function makeDatabaseConnection(): DatabaseConnectionShape {
  // Esix doesn't export its `ConnectionHandler` class. A new instance reads
  // the same settings (`DB_URL`, `DB_ADAPTER`, ...) but has its own client.
  const ConnectionHandlerClass =
    connectionHandler.constructor as new () => ConnectionHandler
  const handler = new ConnectionHandlerClass()
  let database: Promise<Db> | undefined

  return {
    async close() {
      if (!database) {
        return
      }

      try {
        await database
      } catch {
        // The client never connected, so there is nothing to close.
        return
      }

      await handler.closeConnections()
    },
    getDatabase() {
      // Keep the promise so concurrent queries don't each open a client.
      database ??= handler.getConnection()

      return database
    }
  }
}

const currentConnection = new AsyncLocalStorage<DatabaseConnectionShape>()
const getGlobalConnection =
  connectionHandler.getConnection.bind(connectionHandler)

// Esix models always get their connection from the global
// `connectionHandler`. Point it at the current request's connection while
// `Database.use` runs a query.
connectionHandler.getConnection = () =>
  currentConnection.getStore()?.getDatabase() ?? getGlobalConnection()

export interface DatabaseShape {
  // Raw collection access, for queries Esix can't express (it strips `$`
  // operators from queries).
  readonly collection: (
    name: CollectionName
  ) => Effect.Effect<Collection<StoredDocument>, DatabaseError>
  // Runs an Esix call and turns a rejection into a `DatabaseError`.
  readonly use: <A>(
    operation: string,
    run: () => Promise<A>
  ) => Effect.Effect<A, DatabaseError>
}

export class Database extends Context.Service<Database, DatabaseShape>()(
  'foghorn/services/Database'
) {
  // Esix reads its connection settings from `process.env`, so copy them over
  // from the Effect config once.
  static readonly layer = Layer.effect(
    Database,
    Effect.gen(function* () {
      const url = yield* Config.String('DB_URL')
      const database = yield* Config.String('DB_DATABASE')

      process.env.DB_URL = url
      process.env.DB_DATABASE = database

      // Close the global connection when the app shuts down, so a process can
      // exit.
      yield* Effect.addFinalizer(() =>
        Effect.promise(() => connectionHandler.closeConnections())
      )

      const use = <A>(operation: string, run: () => Promise<A>) =>
        Effect.flatMap(Effect.serviceOption(DatabaseConnection), (connection) =>
          Effect.tryPromise({
            catch: (cause) =>
              new DatabaseError({
                cause,
                message: `Database operation "${operation}" failed.`
              }),
            try: () =>
              Option.isSome(connection)
                ? currentConnection.run(connection.value, run)
                : run()
          })
        )

      const collection = (name: CollectionName) =>
        use(`collection ${name}`, async () => {
          const connection = await connectionHandler.getConnection()

          return connection.collection<StoredDocument>(name)
        })

      return Database.of({ collection, use })
    })
  )
}
