process.env.DB_ADAPTER = 'mock'
process.env.DB_DATABASE = 'test-foghorn'

vi.mock('@axiomhq/js', () => ({
  Axiom: class {
    ingest = vi.fn()
    flush = vi.fn().mockResolvedValue(undefined)
  }
}))
