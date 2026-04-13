import { createServerClient } from '../../../lib/supabase-server'
import { NextResponse } from 'next/server'

// Handles the redirect from Supabase password-reset emails.
// Exchanges the PKCE code for a session, then sends the user
// to the reset-password form where they can set a new password.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createServerClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}/reset-password`)
}
