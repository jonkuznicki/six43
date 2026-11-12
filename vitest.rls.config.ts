import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

// Cross-team / anonymous access tests against the LOCAL Supabase stack.
// Run: `npm run test:rls` (needs `supabase start` in WSL and .env.local, or env vars in CI).
export default defineConfig(({ mode }) => ({
  test: {
    environment: 'node',
    include: ['tests/rls/**/*.test.ts'],
    env: loadEnv(mode, process.cwd(), ''),
    // Tests share one fixture set per file and mutate the database: run serially.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
}))
