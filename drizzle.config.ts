import { defineConfig } from 'drizzle-kit'

const databaseUrl = process.env['DATABASE_URL']
if (!databaseUrl) throw new Error('DATABASE_URL environment variable is required')

export default defineConfig({
  schema: './packages/core/src/db/schema.ts',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: databaseUrl,
  },
})
