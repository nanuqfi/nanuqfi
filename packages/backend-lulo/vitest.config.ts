import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 5_000,
    teardownTimeout: 3_000,
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/integration/**'],
      thresholds: { lines: 80, functions: 80, branches: 70 },
    },
  },
})
