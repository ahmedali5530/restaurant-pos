import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  // Only transform TSX with the React plugin — plain .ts infra tests were
  // spending hundreds of ms (or looking hung) under full-project collect.
  plugins: [react({ include: /\.tsx$/ })],
  test: {
    // IndexedDB tests use fake-indexeddb; node is far faster than happy-dom.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['src/test/setup-idb.ts'],
    pool: 'forks',
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 20_000,
    hookTimeout: 20_000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
