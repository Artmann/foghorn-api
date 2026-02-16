import { Axiom } from '@axiomhq/js'
import { log } from 'tiny-typescript-logger'

export class Logger {
  private axiom: Axiom | null

  constructor(token?: string) {
    this.axiom = token ? new Axiom({ token }) : null
  }

  info(message: string, fields: Record<string, unknown> = {}) {
    log.info(message, fields)
    this.axiom?.ingest('foghorn', [{ level: 'info', message, ...fields }])
  }

  warn(message: string, fields: Record<string, unknown> = {}) {
    log.warn(message, fields)
    this.axiom?.ingest('foghorn', [{ level: 'warn', message, ...fields }])
  }

  error(message: string, fields: Record<string, unknown> = {}) {
    log.error(message, fields)
    this.axiom?.ingest('foghorn', [{ level: 'error', message, ...fields }])
  }

  flush(): Promise<void> {
    return this.axiom?.flush() ?? Promise.resolve()
  }
}
