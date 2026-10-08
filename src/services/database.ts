import { Config, Context, Effect, Layer, Schema } from 'effect'
import { connectionHandler } from 'esix'
import type { Collection } from 'mongodb'

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

      // Close the connection when the app shuts down, so a process can exit.
      yield* Effect.addFinalizer(() =>
        Effect.promise(() => connectionHandler.closeConnections())
      )

      const use = <A>(operation: string, run: () => Promise<A>) =>
        Effect.tryPromise({
          catch: (cause) =>
            new DatabaseError({
              cause,
              message: `Database operation "${operation}" failed.`
            }),
          try: run
        })

      const collection = (name: CollectionName) =>
        use(`collection ${name}`, async () => {
          const connection = await connectionHandler.getConnection()

          return connection.collection<StoredDocument>(name)
        })

      return Database.of({ collection, use })
    })
  )
}
