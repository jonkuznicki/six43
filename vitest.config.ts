import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    // Database security tests need a running local Supabase stack; they run
    // separately via `npm run test:rls` (vitest.rls.config.ts).
    exclude: [...configDefaults.exclude, 'tests/rls/**'],
  },
})
