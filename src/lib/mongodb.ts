import type { CloudflareBindings } from '../types/env'

interface MongoDBAction {
  action: 'findOne' | 'find' | 'insertOne' | 'updateOne' | 'deleteOne'
  collection: string
  filter?: Record<string, unknown>
  document?: Record<string, unknown>
  update?: Record<string, unknown>
  projection?: Record<string, unknown>
}

interface FindOneResult<T> {
  document: T | null
}

interface InsertOneResult {
  insertedId: string
}

interface UpdateOneResult {
  matchedCount: number
  modifiedCount: number
}

export class MongoDBClient {
  private baseUrl: string
  private headers: Record<string, string>
  private cluster: string
  private database: string

  constructor(env: CloudflareBindings) {
    this.baseUrl = `https://data.mongodb-api.com/app/${env.MONGODB_APP_ID}/endpoint/data/v1`
    this.headers = {
      'Content-Type': 'application/json',
      'api-key': env.MONGODB_API_KEY
    }
    this.cluster = env.MONGODB_CLUSTER
    this.database = env.MONGODB_DATABASE
  }

  private async execute<T>(action: MongoDBAction): Promise<T> {
    const { action: actionName, ...rest } = action
    const response = await fetch(`${this.baseUrl}/action/${actionName}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        dataSource: this.cluster,
        database: this.database,
        ...rest
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`MongoDB API error: ${response.status} - ${error}`)
    }

    return response.json() as Promise<T>
  }

  async findOne<T>(
    collection: string,
    filter: Record<string, unknown>,
    projection?: Record<string, unknown>
  ): Promise<T | null> {
    const result = await this.execute<FindOneResult<T>>({
      action: 'findOne',
      collection,
      filter,
      projection
    })
    return result.document
  }

  async insertOne<T extends Record<string, unknown>>(
    collection: string,
    document: T
  ): Promise<string> {
    const result = await this.execute<InsertOneResult>({
      action: 'insertOne',
      collection,
      document
    })
    return result.insertedId
  }

  async updateOne(
    collection: string,
    filter: Record<string, unknown>,
    update: Record<string, unknown>
  ): Promise<UpdateOneResult> {
    return this.execute<UpdateOneResult>({
      action: 'updateOne',
      collection,
      filter,
      update
    })
  }
}

export function createMongoClient(env: CloudflareBindings): MongoDBClient {
  return new MongoDBClient(env)
}
