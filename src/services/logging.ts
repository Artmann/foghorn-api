import { Axiom } from '@axiomhq/js'
import {
  Config,
  Effect,
  Layer,
  Logger,
  type LogLevel,
  References
} from 'effect'

// One Axiom client per process (or Worker isolate). It batches events until
// `flushLogs` is called.
let axiomClient: { client: Axiom; token: string } | undefined

function getAxiom(token: string): Axiom {
  if (axiomClient?.token !== token) {
    axiomClient = { client: new Axiom({ token }), token }
  }

  return axiomClient.client
}

export function flushLogs(): Promise<void> {
  return axiomClient?.client.flush() ?? Promise.resolve()
}

const logLevels: Record<string, LogLevel.LogLevel> = {
  all: 'All',
  debug: 'Debug',
  error: 'Error',
  fatal: 'Fatal',
  info: 'Info',
  none: 'None',
  trace: 'Trace',
  warn: 'Warn'
}

function makeAxiomLogger(axiom: Axiom) {
  return Logger.make((options) => {
    const entry = Logger.formatStructured.log(options)

    axiom.ingest('foghorn', [entry])
  })
}

// Logs as JSON lines, and also sends logs to Axiom when `AXIOM_TOKEN` is set.
// `LOG_LEVEL` sets the minimum level (default `info`).
export const LoggingLive = Layer.unwrap(
  Effect.gen(function* () {
    const level = yield* Config.String('LOG_LEVEL').pipe(
      Config.withDefault('info')
    )
    const axiomToken = yield* Config.String('AXIOM_TOKEN').pipe(
      Config.withDefault('')
    )
    const loggers =
      axiomToken.length > 0
        ? [Logger.consoleJson, makeAxiomLogger(getAxiom(axiomToken))]
        : [Logger.consoleJson]

    return Logger.layer(loggers).pipe(
      Layer.provideMerge(
        Layer.succeed(
          References.MinimumLogLevel,
          logLevels[level.toLowerCase()] ?? 'Info'
        )
      )
    )
  })
)
