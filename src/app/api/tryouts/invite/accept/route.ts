/**
 * POST /api/tryouts/invite/accept
 * Called after the user is authenticated. Links their user_id to the
 * tryout_org_members record identified by the token.
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '../../../../../lib/supabase-server'
import { createServiceClient } from '../../../../../lib/supabase-service'

export async function POST(req: Request) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { token } = await req.json()
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const service = createServiceClient()

  const { data: member } = await service
    .from('tryout_org_members')
    .select('id, org_id, role, is_active, email')
    .eq('invite_token', token)
    .maybeSingle()

  if (!member) {
    return NextResponse.json({ error: 'Invalid or expired invite token.' }, { status: 404 })
  }

  if (member.is_active && member.email !== user.email) {
    // Already accepted by someone else
    return NextResponse.json({ error: 'This invite has already been used.' }, { status: 409 })
  }

  await service
    .from('tryout_org_members')
    .update({ user_id: user.id, is_active: true })
    .eq('id', member.id)

  return NextResponse.json({
    orgId: member.org_id,
    role:  member.role,
  })
}
