/**
 * GET /api/tryouts/invite/info?token=xxx
 * Public endpoint — returns invite details without exposing sensitive data.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '../../../../../lib/supabase-service'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const service = createServiceClient()

  const { data: member } = await service
    .from('tryout_org_members')
    .select('role, org_id, invited_by, is_active, email')
    .eq('invite_token', token)
    .maybeSingle()

  if (!member) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 404 })
  }

  // Get org name
  const { data: org } = await service
    .from('tryout_orgs').select('name').eq('id', member.org_id).single()

  // Get inviter email (limited — just first name or email prefix)
  let inviterEmail: string | null = null
  if (member.invited_by) {
    const { data: inviter } = await service.auth.admin.getUserById(member.invited_by)
    inviterEmail = inviter?.user?.email ?? null
  }

  return NextResponse.json({
    orgName:      org?.name ?? 'Unknown Organization',
    role:         member.role,
    inviterEmail,
    alreadyActive: member.is_active,
  })
}
