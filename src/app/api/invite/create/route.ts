import { NextResponse } from 'next/server'
import { createServiceClient } from '../../../../lib/supabase-service'
import { createServerClient } from '../../../../lib/supabase-server'

// POST /api/invite/create
// Creates a team_members invite row. If the invited email already belongs to an
// existing auth user, the invite is immediately accepted (user_id + accepted_at set).
// Otherwise it's left pending for auto-accept on their next sign-in.
export async function POST(req: Request) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { teamId, email } = body
  if (!teamId || !email) return NextResponse.json({ error: 'Missing teamId or email' }, { status: 400 })

  const normalizedEmail = email.trim().toLowerCase()
  const service = createServiceClient()

  // Verify the caller owns this team
  const { data: team } = await service.from('teams').select('id, user_id').eq('id', teamId).single()
  if (!team || team.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Check for an existing pending invite to this email on this team
  const { data: existing } = await service
    .from('team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('invite_email', normalizedEmail)
    .is('accepted_at', null)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'This email already has a pending invite.' }, { status: 409 })
  }

  // Look up whether this email belongs to an existing auth user
  const { data: existingUserId } = await service.rpc('get_user_id_by_email', { user_email: normalizedEmail })

  const token = crypto.randomUUID()

  if (existingUserId) {
    // User already exists — create and immediately accept the invite
    const now = new Date().toISOString()
    const { data, error } = await service
      .from('team_members')
      .insert({
        team_id: teamId,
        invite_token: token,
        invite_email: normalizedEmail,
        role: 'coach',
        owner_user_id: user.id,
        user_id: existingUserId,
        accepted_at: now,
        email: normalizedEmail,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: 'Failed to create invite.' }, { status: 500 })
    return NextResponse.json({ member: data, autoAccepted: true })
  } else {
    // User doesn't exist yet — create pending invite, auto-accept on first sign-in
    const { data, error } = await service
      .from('team_members')
      .insert({
        team_id: teamId,
        invite_token: token,
        invite_email: normalizedEmail,
        role: 'coach',
        owner_user_id: user.id,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: 'Failed to create invite.' }, { status: 500 })
    return NextResponse.json({ member: data, autoAccepted: false })
  }
}
