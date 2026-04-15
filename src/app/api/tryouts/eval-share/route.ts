/**
 * POST /api/tryouts/eval-share
 * Generates or revokes the coach eval share token on a tryout season.
 * Body: { seasonId, orgId, action: 'generate' | 'revoke' }
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '../../../../lib/supabase-server'

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { seasonId, orgId, action } = await req.json() as { seasonId: string; orgId: string; action: 'generate' | 'revoke' }
  if (!seasonId || !orgId || !action) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { data: isMember } = await supabase.rpc('tryout_is_member', {
    p_org_id: orgId, p_roles: ['org_admin'],
  })
  if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const token = action === 'generate' ? crypto.randomUUID() : null

  const { data, error } = await supabase
    .from('tryout_seasons')
    .update({ eval_share_token: token })
    .eq('id', seasonId)
    .eq('org_id', orgId)
    .select('eval_share_token')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ token: data.eval_share_token })
}
