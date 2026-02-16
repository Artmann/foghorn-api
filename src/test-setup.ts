process.env.DB_ADAPTER = 'mock'
process.env.DB_DATABASE = 'test-foghorn'

vi.mock('tiny-typescript-logger', () => ({
  log: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}))

vi.mock('@axiomhq/js', () => ({
  Axiom: class {
    ingest = vi.fn()
    flush = vi.fn().mockResolvedValue(undefined)
  }
}))
