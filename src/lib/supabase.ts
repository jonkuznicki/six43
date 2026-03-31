// ============================================================
// Six43 – Supabase client
// ============================================================
// Two clients, two purposes:
//
//  createClient()      → browser client, uses the logged-in user's
//                        session. Respects RLS. Use in components.
//
//  createServerClient() → server-side client for Next.js Server
//                         Components and API routes. Also uses the
//                         user's session via cookies.
//
// Never use the service-role key in client code. It bypasses RLS
// and would let any user read any other user's data.
// ============================================================

import { createBrowserClient } from '@supabase/ssr'
import { createServerClient as _createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'

// ----------------------------------------------------------------
// Environment variables
// These come from your .env.local file (never commit that file).
// Both values are safe to use in the browser — they are the
// "anon" key, which is public and protected by RLS.
// ----------------------------------------------------------------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Browser client — use in React components and client-side code
export function createClient() {
  return createBrowserClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY)
}

// Server client — use in Server Components and route handlers
// Reads the session from cookies automatically
export async function createServerClient() {
  const cookieStore = await cookies()
  return _createServerClient<Database>(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Server Component — cookies can only be set in middleware
          }
        },
      },
    }
  )
}
