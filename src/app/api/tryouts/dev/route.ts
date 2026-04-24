/**
 * POST /api/tryouts/dev?action=seed   — generate test data for all active players
 * POST /api/tryouts/dev?action=clear  — remove all test data (marked with __test__)
 *
 * Seeded data is marked with evaluator_name / coach_name = '__test__' so it
 * can be identified and removed without touching any real data.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../../lib/supabase-server'

// Normal-distribution score centered around `mean` with given std, clamped 1–5
function randScore(mean = 3.0, std = 0.75): number {
  const u1 = Math.random(), u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1 + 1e-12)) * Math.cos(2 * Math.PI * u2)
  return Math.round(Math.min(5, Math.max(1, mean + z * std)) * 10) / 10
}

// Weighted average, ignoring nulls
function weightedAvg(scores: Record<string, number>, fields: { field_key: string; weight: number }[]): number | null {
  const eligible = fields.filter(f => f.weight > 0 && scores[f.field_key] != null)
  if (!eligible.length) return null
  const wSum = eligible.reduce((s, f) => s + f.weight, 0)
  return Math.round(eligible.reduce((s, f) => s + scores[f.field_key] * f.weight, 0) / wSum * 100) / 100
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') ?? 'seed'
  const body = await req.json().catch(() => ({}))
  const orgId = body.orgId as string | undefined
  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 })

  const { data: isMember } = await supabase.rpc('tryout_is_member', { p_org_id: orgId, p_roles: ['org_admin'] })
  if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── CLEAR ────────────────────────────────────────────────────────────────────
  if (action === 'clear') {
    const [evalsRes, scoresRes, sessionsRes] = await Promise.all([
      supabase.from('tryout_coach_evals').delete().eq('org_id', orgId).eq('coach_name', '__test__'),
      supabase.from('tryout_scores').delete().eq('org_id', orgId).eq('evaluator_name', '__test__'),
      supabase.from('tryout_sessions').delete().eq('org_id', orgId).like('label', '[Test]%'),
    ])
    const errors = [evalsRes.error, scoresRes.error, sessionsRes.error].filter(Boolean)
    if (errors.length) return NextResponse.json({ error: errors[0]?.message }, { status: 500 })
    return NextResponse.json({ ok: true, cleared: { evals: true, scores: true, sessions: true } })
  }

  // ── SEED ─────────────────────────────────────────────────────────────────────

  // Load season, players, eval config
  const { data: season } = await supabase
    .from('tryout_seasons').select('id, year, age_groups')
    .eq('org_id', orgId).eq('is_active', true).maybeSingle()
  if (!season) return NextResponse.json({ error: 'No active season' }, { status: 422 })

  const { data: players } = await supabase
    .from('tryout_players').select('id, age_group, tryout_age_group, prior_team')
    .eq('org_id', orgId).eq('is_active', true)
  if (!players?.length) return NextResponse.json({ error: 'No active players' }, { status: 422 })

  const { data: evalConfig } = await supabase
    .from('tryout_coach_eval_config').select('field_key, section, weight, is_optional')
    .eq('org_id', orgId).eq('season_id', season.id)
  const configFields = evalConfig ?? []

  // Create one test session per age group (for tryout_scores)
  const ageGroups = Array.from(new Set(players.map(p => p.tryout_age_group ?? p.age_group).filter(Boolean))) as string[]
  const sessionMap: Record<string, string> = {}
  const sessionDate = new Date().toISOString().split('T')[0]
  for (const ag of ageGroups) {
    const label = `[Test] ${ag} Tryout Session`
    const { data: existing } = await supabase
      .from('tryout_sessions').select('id').eq('org_id', orgId).eq('season_id', season.id).eq('label', label).maybeSingle()
    if (existing) {
      sessionMap[ag] = existing.id
    } else {
      const { data: created } = await supabase
        .from('tryout_sessions').insert({
          org_id: orgId, season_id: season.id, age_group: ag,
          label, session_date: sessionDate, status: 'closed',
        }).select('id').single()
      if (created) sessionMap[ag] = created.id
    }
  }

  // Build eval and score rows for every player
  const evalRows: any[] = []
  const scoreRows: any[] = []
  const seasonYear = String(season.year - 1)

  for (const player of players) {
    const ag = player.tryout_age_group ?? player.age_group
    const sessionId = ag ? sessionMap[ag] : null

    // Give each player a consistent "talent level" to correlate scores across sources
    const talentBase = 1.5 + Math.random() * 3   // 1.5–4.5

    // ── Tryout score ──────────────────────────────────────────────────────────
    if (sessionId) {
      const tryoutScore = randScore(talentBase, 0.5)
      // 30% of players get a pitching score
      const tryoutPitching = Math.random() < 0.3 ? randScore(talentBase, 0.6) : null
      const fieldScores: Record<string, number> = {
        fielding: randScore(talentBase, 0.6),
        hitting:  randScore(talentBase, 0.6),
        running:  randScore(talentBase, 0.7),
        arm:      randScore(talentBase, 0.7),
      }
      scoreRows.push({
        player_id:      player.id,
        session_id:     sessionId,
        org_id:         orgId,
        evaluator_id:   user.id,
        evaluator_name: '__test__',
        scores:         fieldScores,
        tryout_score:   tryoutScore,
        tryout_pitching: tryoutPitching,
        submitted_at:   new Date().toISOString(),
      })
    }

    // ── Coach eval ────────────────────────────────────────────────────────────
    if (configFields.length > 0) {
      const evalScores: Record<string, number> = {}
      for (const f of configFields) {
        // optional section (pitching_catching) — skip 60% of players
        if (f.is_optional && Math.random() < 0.6) continue
        evalScores[f.field_key] = randScore(talentBase, 0.7)
      }
      const intangiblesFields = configFields.filter(f => f.section === 'intangibles')
      const mainFields = configFields.filter(f => f.section !== 'pitching_catching')
      const coachEvalScore = weightedAvg(evalScores, mainFields)
      const intangiblesScore = intangiblesFields.length > 0
        ? weightedAvg(evalScores, intangiblesFields) : null

      const comments = Math.random() > 0.5
        ? ['Strong arm, good presence at the plate.', 'Great attitude and coachable kid.',
           'Needs work on footwork but has good instincts.', 'Excellent makeup, always hustles.',
           'Above average speed, good range in the field.'][Math.floor(Math.random() * 5)]
        : null

      evalRows.push({
        player_id:        player.id,
        org_id:           orgId,
        season_year:      seasonYear,
        team_label:       player.prior_team ?? 'Unknown',
        coach_name:       '__test__',
        status:           'submitted',
        scores:           evalScores,
        coach_eval_score: coachEvalScore,
        intangibles_score: intangiblesScore,
        computed_score:   coachEvalScore,
        comments,
        submitted_at:     new Date().toISOString(),
      })
    }
  }

  // Upsert all rows
  const results: Record<string, number> = { sessions: Object.keys(sessionMap).length }

  if (scoreRows.length) {
    const { error } = await supabase.from('tryout_scores')
      .upsert(scoreRows, { onConflict: 'player_id,session_id,evaluator_id' })
    if (error) return NextResponse.json({ error: `Scores: ${error.message}` }, { status: 500 })
    results.tryoutScores = scoreRows.length
  }

  if (evalRows.length) {
    const { error } = await supabase.from('tryout_coach_evals')
      .upsert(evalRows, { onConflict: 'player_id,org_id,season_year' })
    if (error) return NextResponse.json({ error: `Evals: ${error.message}` }, { status: 500 })
    results.coachEvals = evalRows.length
  }

  return NextResponse.json({ ok: true, seeded: results })
}
