/**
 * POST /api/tryouts/invite/accept
 * Called after the user is authenticated. Links their user_id to the
 * tryout_org_members record identified by the token.
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '../../../../../lib/supabase-server'
import { createServiceClient } from '../../../../../lib/supabase-service'
import { decideTryoutInviteAcceptance } from '../../../../../lib/tryouts/inviteAcceptance'

export async function POST(req: Request) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const service = createServiceClient()

  const { data: member } = await service
    .from('tryout_org_members')
    .select('id, org_id, role, is_active, email, user_id')
    .eq('invite_token', token)
    .maybeSingle()

  if (!member) {
    return NextResponse.json({ error: 'Invalid or expired invite token.' }, { status: 404 })
  }

  // R5: removed members can't reactivate via an old link; used links can't be taken over.
  const decision = decideTryoutInviteAcceptance(member, user)
  if (!decision.ok) {
    return NextResponse.json({ error: decision.error }, { status: decision.status })
  }

  if (!decision.alreadyMember) {
    // Guard against races: only claim the row if it's still in the state we checked.
    let claim = service
      .from('tryout_org_members')
      .update({ user_id: user.id, is_active: true })
      .eq('id', member.id)
    claim = member.user_id === null ? claim.is('user_id', null) : claim.eq('user_id', member.user_id)
    const { error } = await claim
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    orgId: member.org_id,
    role:  member.role,
  })
}
