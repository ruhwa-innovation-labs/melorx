import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

export function createDb(connectionString: string) {
  if (!connectionString) throw new Error('DATABASE_URL is required')
  const sql = postgres(connectionString)
  return drizzle(sql, { schema })
}

export type Db = ReturnType<typeof createDb>
