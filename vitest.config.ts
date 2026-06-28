import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    env: {
      // loaded from .env.test — see .env.test.example
    },
    setupFiles: ['tests/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 15000,
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/smoke/**'],
  },
})
