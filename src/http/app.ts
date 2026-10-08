import { ConfigProvider, Layer } from 'effect'
import { HttpRouter, HttpServer } from 'effect/http'
import { HttpApiBuilder } from 'effect/http-api'

import { Api } from '../api/api'
import { ApiKeys } from '../services/api-keys'
import { Database } from '../services/database'
import { Issues } from '../services/issues'
import { JobQueue } from '../services/job-queue'
import { JobRunners } from '../services/job-runners'
import { LoggingLive } from '../services/logging'
import { Pages } from '../services/pages'
import { Sites } from '../services/sites'
import { Teams } from '../services/teams'
import { Users } from '../services/users'
import { AuthenticationLive } from './authentication'
import { AllHandlers } from './handlers'
import { AppMiddleware } from './middleware'

export const ServicesLive = Layer.mergeAll(Issues.layer, Pages.layer).pipe(
  Layer.provideMerge(Sites.layer),
  Layer.provideMerge(
    Layer.mergeAll(
      ApiKeys.layer,
      JobQueue.layer,
      JobRunners.layer,
      Teams.layer,
      Users.layer
    )
  ),
  Layer.provideMerge(Database.layer)
)

const ApiLive = HttpApiBuilder.layer(Api, { openapiPath: '/openapi' }).pipe(
  Layer.provide(AllHandlers),
  Layer.provide(AuthenticationLive)
)

const AppLive = Layer.mergeAll(ApiLive, AppMiddleware, HttpRouter.cors()).pipe(
  Layer.provide(ServicesLive),
  Layer.provide(HttpServer.layerServices)
)

// Builds a fetch handler. `env` is where config is read from: the Worker
// bindings in production, or a plain object in tests.
export function makeApp(env: Record<string, unknown>) {
  const ConfigLive = ConfigProvider.layer(ConfigProvider.fromUnknown(env))

  return HttpRouter.toWebHandler(
    AppLive.pipe(Layer.provide(LoggingLive), Layer.provide(ConfigLive)),
    { disableLogger: true }
  )
}
