import { NextResponse } from 'next/server'
import { createServiceClient } from '../../../../../lib/supabase-service'
import { createServerClient } from '../../../../../lib/supabase-server'

export async function POST(req: Request, { params }: { params: { token: string } }) {
  // Verify the caller is actually logged in
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const service = createServiceClient()

  // Find the pending invite
  const { data: invite } = await service
    .from('team_members')
    .select('id, team_id, accepted_at')
    .eq('invite_token', params.token)
    .is('accepted_at', null)
    .single()

  if (!invite) {
    return NextResponse.json({ error: 'Invite not found or already used' }, { status: 404 })
  }

  // Check user isn't already a member of this team
  const { data: existing } = await service
    .from('team_members')
    .select('id')
    .eq('team_id', invite.team_id)
    .eq('user_id', user.id)
    .maybeSingle()

  // Also check they aren't the team owner
  const { data: ownedTeam } = await service
    .from('teams')
    .select('id')
    .eq('id', invite.team_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (existing || ownedTeam) {
    return NextResponse.json({ error: 'You already have access to this team' }, { status: 400 })
  }

  // Accept the invite
  const { error } = await service
    .from('team_members')
    .update({ user_id: user.id, accepted_at: new Date().toISOString() })
    .eq('id', invite.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
