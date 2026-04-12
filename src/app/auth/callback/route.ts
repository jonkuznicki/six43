import { createServerClient } from '../../../lib/supabase-server'
import { createServiceClient } from '../../../lib/supabase-service'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createServerClient()
    await supabase.auth.exchangeCodeForSession(code)

    // Auto-accept any pending email invites for this user
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) {
      const service = createServiceClient()
      const { data: pending } = await service
        .from('team_members')
        .select('id, team_id')
        .eq('invite_email', user.email)
        .is('accepted_at', null)

      if (pending && pending.length > 0) {
        await service
          .from('team_members')
          .update({
            user_id: user.id,
            accepted_at: new Date().toISOString(),
          })
          .in('id', pending.map((r: any) => r.id))
      }
    }
  }

  return NextResponse.redirect(`${origin}/dashboard`)
}
