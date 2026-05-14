/**
 * POST /api/tryouts/admin/reset
 *
 * Deletes ALL player data for the org, leaving config and structure intact.
 * Requires org_admin role and the confirmation string "RESET SEASON DATA".
 *
 * Preserved: tryout_orgs, tryout_org_members, tryout_seasons,
 *            tryout_scoring_config, tryout_coach_eval_config,
 *            tryout_teams, tryout_eval_team_tokens, tryout_audit_log
 *
 * Deleted (in FK-safe order):
 *   tryout_combined_scores, tryout_team_assignments, tryout_player_aliases,
 *   tryout_player_notes, tryout_scores, tryout_checkins, tryout_gc_stats,
 *   tryout_coach_eval_submissions, tryout_coach_evals, tryout_eval_drafts,
 *   tryout_registration_staging, tryout_roster_staging, tryout_import_jobs,
 *   tryout_sessions, tryout_players
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../../../lib/supabase-server'

const CONFIRM_PHRASE = 'RESET SEASON DATA'

// Tables to clear in FK-safe order (children before parents).
// Each entry is [tableName, filterColumn] where filterColumn is how we scope to this org.
const TABLES_TO_CLEAR: [string, string][] = [
  ['tryout_combined_scores',        'org_id'],
  ['tryout_team_assignments',       'org_id'],
  ['tryout_player_aliases',         'org_id'],
  ['tryout_player_notes',           'org_id'],
  ['tryout_scores',                 'org_id'],
  ['tryout_checkins',               'org_id'],
  ['tryout_gc_stats',               'org_id'],
  ['tryout_coach_eval_submissions', 'org_id'],
  ['tryout_coach_evals',            'org_id'],
  ['tryout_eval_drafts',            'org_id'],
  ['tryout_registration_staging',   'org_id'],
  ['tryout_roster_staging',         'org_id'],
  ['tryout_import_jobs',            'org_id'],
  ['tryout_sessions',               'org_id'],
  ['tryout_players',                'org_id'],
]

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { orgId, confirmation } = body as { orgId?: string; confirmation?: string }

  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 })
  if (confirmation !== CONFIRM_PHRASE) {
    return NextResponse.json(
      { error: `Confirmation required: type "${CONFIRM_PHRASE}" exactly` },
      { status: 400 }
    )
  }

  const { data: isMember } = await supabase.rpc('tryout_is_member', {
    p_org_id: orgId,
    p_roles: ['org_admin'],
  })
  if (!isMember) return NextResponse.json({ error: 'Forbidden — org_admin required' }, { status: 403 })

  const counts: Record<string, number> = {}
  const skipped: string[] = []

  for (const [table, col] of TABLES_TO_CLEAR) {
    // count first so we can report how many rows were removed
    const { count, error: countErr } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq(col, orgId)

    if (countErr) {
      // Table may not exist yet (older migration not applied) — skip gracefully
      skipped.push(table)
      continue
    }

    const { error: delErr } = await supabase
      .from(table)
      .delete()
      .eq(col, orgId)

    if (delErr) {
      return NextResponse.json(
        { error: `Failed to clear ${table}: ${delErr.message}` },
        { status: 500 }
      )
    }

    counts[table] = count ?? 0
  }

  return NextResponse.json({ ok: true, deleted: counts, skipped })
}
