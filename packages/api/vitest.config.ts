import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      DATABASE_URL: 'postgres://melo:melo@localhost:5435/melo_rx',
    },
  },
})
