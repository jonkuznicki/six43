import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../../../lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orgId, seasonId, teamLabel } = await req.json()
  if (!orgId || !seasonId || !teamLabel) {
    return NextResponse.json({ error: 'Missing orgId, seasonId, or teamLabel' }, { status: 400 })
  }

  const { data: isMember } = await supabase.rpc('tryout_is_member', {
    p_org_id: orgId,
    p_roles:  ['org_admin'],
  })
  if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Reset per-player eval rows
  const { error } = await supabase
    .from('tryout_coach_evals')
    .update({ status: 'draft', submitted_at: null })
    .eq('org_id', orgId)
    .eq('season_id', seasonId)
    .eq('team_label', teamLabel)
    .eq('status', 'submitted')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also reset the token-based draft row so the coach-facing form unlocks.
  // tryout_eval_drafts.status drives the "already submitted" locked view.
  await supabase
    .from('tryout_eval_drafts')
    .update({ status: 'in_progress', submitted_at: null })
    .eq('org_id', orgId)
    .eq('season_id', seasonId)
    .eq('team_label', teamLabel)
    .eq('status', 'submitted')

  await supabase.from('tryout_audit_log').insert({
    org_id:      orgId,
    actor_id:    user.id,
    actor_name:  user.email ?? user.id,
    action:      'coach_eval.unlock',
    entity_type: 'tryout_coach_evals',
    entity_id:   null,
    after_val:   { seasonId, teamLabel },
  })

  return NextResponse.json({ ok: true })
}
