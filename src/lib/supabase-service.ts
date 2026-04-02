/**
 * Server-side Supabase client using the service role key.
 * Bypasses RLS — only use in server components and server actions
 * for operations that need to cross auth boundaries (share links, invite acceptance).
 * NEVER import this in client components.
 */
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env variables')
  }
  return createClient(url, key, {
    auth: { persistSession: false },
  })
}
