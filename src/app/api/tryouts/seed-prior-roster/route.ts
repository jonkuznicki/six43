import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../../lib/supabase-server'

// ── "Seed Prior Rosters from <season>" ───────────────────────────────────────
//
// Explicit admin action, run once a prior season is confirmed finalized —
// deliberately NOT automatic on season creation, so an admin chooses when
// the source season is actually done. Reads the source season's FINAL
// roster (accepted, non-excluded tryout_team_assignments) and snapshots
// each player's prior team/age group into tryout_prior_roster_context for
// the target (new) season.
//
// What this does NOT touch: the target season's own team assignments,
// acceptance, exclusion, notes, action items, scores, evals, GC stats, or
// sessions — those all start fresh through their normal flows. This only
// ever writes to tryout_prior_roster_context.
//
// Safe to re-run: upserts on (season_id, player_id), so running it again
// (e.g. after fixing a source-season roster mistake) updates the existing
// snapshot rows rather than duplicating them.

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orgId, targetSeasonId, sourceSeasonId } = await req.json()
  if (!orgId || !targetSeasonId || !sourceSeasonId) {
    return NextResponse.json({ error: 'Missing orgId, targetSeasonId, or sourceSeasonId' }, { status: 400 })
  }
  if (targetSeasonId === sourceSeasonId) {
    return NextResponse.json({ error: 'Source and target season must be different' }, { status: 400 })
  }

  const { data: isMember } = await supabase.rpc('tryout_is_member', {
    p_org_id: orgId,
    p_roles:  ['org_admin'],
  })
  if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [{ data: targetSeason }, { data: sourceSeason }] = await Promise.all([
    supabase.from('tryout_seasons').select('id').eq('id', targetSeasonId).eq('org_id', orgId).maybeSingle(),
    supabase.from('tryout_seasons').select('id, label, year').eq('id', sourceSeasonId).eq('org_id', orgId).maybeSingle(),
  ])
  if (!targetSeason) return NextResponse.json({ error: 'Target season not found for this org' }, { status: 404 })
  if (!sourceSeason) return NextResponse.json({ error: 'Source season not found for this org' }, { status: 404 })

  // The source season's final roster: accepted assignments only. Declined/
  // never-accepted assignments never counted as "final" and don't seed
  // anything.
  const { data: assignments, error: assignErr } = await supabase
    .from('tryout_team_assignments')
    .select('id, player_id, team_id')
    .eq('season_id', sourceSeasonId)
    .eq('is_accepted', true)
  if (assignErr) return NextResponse.json({ error: assignErr.message }, { status: 500 })

  if (!assignments || assignments.length === 0) {
    return NextResponse.json({ ok: true, seeded: 0, skippedExcluded: 0, skippedNoTeam: 0, sourceLabel: sourceSeason.label, sourceYear: sourceSeason.year })
  }

  const teamIds = Array.from(new Set(assignments.map(a => a.team_id)))
  const playerIds = Array.from(new Set(assignments.map(a => a.player_id)))

  const [{ data: teams }, { data: combinedScores }, { data: players }] = await Promise.all([
    supabase.from('tryout_teams').select('id, name, age_group').in('id', teamIds),
    supabase.from('tryout_combined_scores').select('player_id, is_excluded').eq('season_id', sourceSeasonId).in('player_id', playerIds),
    supabase.from('tryout_players').select('id, prior_org').in('id', playerIds),
  ])

  const teamById = new Map((teams ?? []).map(t => [t.id, t]))
  const excludedSet = new Set((combinedScores ?? []).filter(c => c.is_excluded).map(c => c.player_id))
  const priorOrgByPlayer = new Map((players ?? []).map(p => [p.id, p.prior_org as string | null]))

  let skippedExcluded = 0
  let skippedNoTeam = 0
  const rows: Array<{
    org_id: string; season_id: string; player_id: string
    prior_team_name: string | null; prior_age_group: string | null; prior_org: string | null
    source_season_id: string; source_assignment_id: string
    created_by: string
  }> = []

  for (const a of assignments) {
    if (excludedSet.has(a.player_id)) { skippedExcluded++; continue }
    const team = teamById.get(a.team_id)
    if (!team) { skippedNoTeam++; continue }
    rows.push({
      org_id:               orgId,
      season_id:            targetSeasonId,
      player_id:            a.player_id,
      prior_team_name:      team.name,
      prior_age_group:      team.age_group,
      prior_org:            priorOrgByPlayer.get(a.player_id) ?? null,
      source_season_id:     sourceSeasonId,
      source_assignment_id: a.id,
      created_by:           user.id,
    })
  }

  if (rows.length > 0) {
    const { error: upsertErr } = await supabase
      .from('tryout_prior_roster_context')
      .upsert(rows, { onConflict: 'season_id,player_id' })
    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  await supabase.from('tryout_audit_log').insert({
    org_id:      orgId,
    actor_id:    user.id,
    actor_name:  user.email ?? user.id,
    action:      'prior_roster.seed',
    entity_type: 'tryout_prior_roster_context',
    entity_id:   null,
    after_val:   { targetSeasonId, sourceSeasonId, seeded: rows.length, skippedExcluded, skippedNoTeam },
  })

  return NextResponse.json({
    ok: true,
    seeded: rows.length,
    skippedExcluded,
    skippedNoTeam,
    sourceLabel: sourceSeason.label,
    sourceYear: sourceSeason.year,
  })
}
