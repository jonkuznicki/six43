import { NextResponse } from 'next/server'
import { createServiceClient } from '../../../../lib/supabase-service'
import { createServerClient } from '../../../../lib/supabase-server'

// POST /api/invite/auto-accept
// Called after login or email confirmation.
// Finds any pending invites whose invite_email matches the logged-in user's email
// and accepts them all. Safe to call multiple times (idempotent).
export async function POST() {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ accepted: 0 })
  }

  const service = createServiceClient()

  // Find all pending invites for this email
  const { data: pending } = await service
    .from('team_members')
    .select('id, team_id')
    .eq('invite_email', user.email)
    .is('accepted_at', null)

  if (!pending || pending.length === 0) {
    return NextResponse.json({ accepted: 0 })
  }

  // Filter out teams the user already owns or is already a member of
  const { data: alreadyMember } = await service
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .not('accepted_at', 'is', null)

  const { data: ownedTeams } = await service
    .from('teams')
    .select('id')
    .eq('user_id', user.id)

  const alreadyTeamIds = new Set([
    ...(alreadyMember ?? []).map((r: any) => r.team_id),
    ...(ownedTeams ?? []).map((r: any) => r.id),
  ])

  const toAccept = pending.filter((r: any) => !alreadyTeamIds.has(r.team_id))
  if (toAccept.length === 0) {
    return NextResponse.json({ accepted: 0 })
  }

  await service
    .from('team_members')
    .update({
      user_id: user.id,
      accepted_at: new Date().toISOString(),
      email: user.email,
    })
    .in('id', toAccept.map((r: any) => r.id))

  return NextResponse.json({ accepted: toAccept.length })
}
