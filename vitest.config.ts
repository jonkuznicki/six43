import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  // tsconfig uses "jsx": "preserve" for Next.js; tests that render .tsx
  // components need the JSX compiled, so use React's automatic runtime here.
  oxc: { jsx: { runtime: 'automatic' } },
  test: {
    environment: 'node',
    // Database security tests need a running local Supabase stack; they run
    // separately via `npm run test:rls` (vitest.rls.config.ts).
    exclude: [...configDefaults.exclude, 'tests/rls/**'],
  },
})
