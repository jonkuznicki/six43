/**
 * POST /api/tryouts/rankings-share
 * Body: { seasonId, orgId, action: 'generate' | 'revoke' }
 *
 * Generates or revokes a public share token for the rankings view.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../../lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { seasonId, orgId, action } = await req.json()
  if (!seasonId || !orgId || !action) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { data: isMember } = await supabase.rpc('tryout_is_member', {
    p_org_id: orgId, p_roles: ['org_admin'],
  })
  if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (action === 'generate') {
    const { data, error } = await supabase
      .from('tryout_seasons')
      .update({ rankings_share_token: crypto.randomUUID() })
      .eq('id', seasonId).eq('org_id', orgId)
      .select('rankings_share_token').single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ token: data.rankings_share_token })
  }

  if (action === 'revoke') {
    await supabase.from('tryout_seasons')
      .update({ rankings_share_token: null })
      .eq('id', seasonId).eq('org_id', orgId)
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
