/**
 * POST /api/tryouts/gc-stats/compute-scores
 *
 * Recomputes gc_computed_score for all players in org+season who have GC stats.
 * Reads scoring config from tryout_gc_scoring_config.
 * Falls back to GC_STAT_DEFS defaults for any stat_key not in config.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../../../lib/supabase-server'
import { computeGcScores, GcPlayerStat, GcScoringConfigRow } from '../../../../../lib/tryouts/computeGcScores'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orgId, seasonId, seasonYear } = await req.json()
  if (!orgId || !seasonYear) {
    return NextResponse.json({ error: 'Missing orgId or seasonYear' }, { status: 400 })
  }

  const { data: isMember } = await supabase.rpc('tryout_is_member', {
    p_org_id: orgId, p_roles: ['org_admin', 'head_coach'],
  })
  if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Load all GC stats for this org+season
  const { data: statsRows, error: statsErr } = await supabase
    .from('tryout_gc_stats')
    .select(`
      player_id,
      avg, obp, slg, ops, rbi, r, hr, sb, bb, so,
      era, whip, ip, k, bb_allowed, bf, baa, bb_per_inn, k_bb, strike_pct, w, sv
    `)
    .eq('org_id', orgId)
    .eq('season_year', seasonYear)

  if (statsErr) return NextResponse.json({ error: statsErr.message }, { status: 500 })
  if (!statsRows?.length) return NextResponse.json({ updated: 0 })

  // Load player age groups
  const playerIds = statsRows.map((r: any) => r.player_id)
  const { data: playerRows } = await supabase
    .from('tryout_players')
    .select('id, age_group')
    .in('id', playerIds)

  const ageGroupById = new Map<string, string | null>(
    (playerRows ?? []).map((p: any) => [p.id, p.age_group])
  )

  // Load scoring config (if season provided)
  let configRows: GcScoringConfigRow[] = []
  if (seasonId) {
    const { data: cfgData } = await supabase
      .from('tryout_gc_scoring_config')
      .select('age_group, stat_key, included, weight')
      .eq('org_id', orgId)
      .eq('season_id', seasonId)
    configRows = cfgData ?? []
  }

  // Build GcPlayerStat array
  const playerStats: GcPlayerStat[] = statsRows.map((r: any) => ({
    player_id: r.player_id,
    age_group:  ageGroupById.get(r.player_id) ?? null,
    avg:        r.avg,   obp:  r.obp,  slg: r.slg, ops: r.ops,
    rbi:        r.rbi,   r:    r.r,    hr:  r.hr,  sb:  r.sb,
    bb:         r.bb,    so:         r.so,
    era:        r.era,   whip:       r.whip,       ip:    r.ip,
    k:          r.k,     bb_allowed: r.bb_allowed, bf:    r.bf,
    baa:        r.baa,   bb_per_inn: r.bb_per_inn,
    k_bb:       r.k_bb,  strike_pct: r.strike_pct,
    w:          r.w,     sv:         r.sv,
  }))

  // If no config at all, bail out — admin needs to set up scoring first
  if (configRows.length === 0) {
    return NextResponse.json({
      updated: 0,
      message: 'No scoring config found. Set up GC Stat Scoring in Scoring Setup first.',
    })
  }

  const scores = computeGcScores(playerStats, configRows)

  // Write scores back
  let updated = 0
  const updates: Array<{ player_id: string; season_year: string; gc_hitting_score: number | null; gc_pitching_score: number | null }> = []
  for (const [playerId, score] of Array.from(scores)) {
    updates.push({ player_id: playerId, season_year: seasonYear, gc_hitting_score: score.hitting, gc_pitching_score: score.pitching })
    updated++
  }

  if (updates.length > 0) {
    const { error: upsertErr } = await supabase
      .from('tryout_gc_stats')
      .upsert(
        updates.map(u => ({ ...u, org_id: orgId })),
        { onConflict: 'player_id,org_id,season_year' }
      )
    if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 })
  }

  return NextResponse.json({ updated })
}
