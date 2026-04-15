/**
 * POST /api/tryouts/imports/coach-eval
 *
 * Parses a coach eval file, runs identity resolution against the
 * existing tryout_players pool, and creates a tryout_import_job.
 *
 * After this endpoint, the client shows the review screen for any
 * suggested/unresolved rows. Confirmed rows are written to
 * tryout_coach_evals via the shared confirm endpoint.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../../../lib/supabase-server'
import { parseCoachEvalFile } from '../../../../../lib/tryouts/import/parseCoachEval'
import { resolvePlayer, CandidatePlayer } from '../../../../../lib/tryouts/identityResolver'
import { normalizeName } from '../../../../../lib/tryouts/nameNormalization'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 }) }

  const file     = formData.get('file')     as File   | null
  const orgId    = formData.get('orgId')    as string | null
  const seasonId = formData.get('seasonId') as string | null
  const seasonYear = formData.get('seasonYear') as string | null  // "2025" — which year being evaluated

  if (!file)       return NextResponse.json({ error: 'Missing file' },       { status: 400 })
  if (!orgId)      return NextResponse.json({ error: 'Missing orgId' },      { status: 400 })
  if (!seasonYear) return NextResponse.json({ error: 'Missing seasonYear' }, { status: 400 })

  const { data: isMember } = await supabase.rpc('tryout_is_member', {
    p_org_id: orgId, p_roles: ['org_admin'],
  })
  if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const arrayBuffer = await file.arrayBuffer()
  let parseResult: ReturnType<typeof parseCoachEvalFile>
  try { parseResult = parseCoachEvalFile(arrayBuffer) }
  catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown parse error'
    return NextResponse.json({ error: `File parse failed: ${msg}` }, { status: 422 })
  }

  if (parseResult.rows.length === 0) {
    return NextResponse.json({ error: 'No eval rows found.', parseErrors: parseResult.errors }, { status: 422 })
  }

  // Load existing players
  const { data: existingPlayers } = await supabase
    .from('tryout_players')
    .select('id, first_name, last_name, dob, age_group, parent_email')
    .eq('org_id', orgId)
    .eq('is_active', true)

  if (!existingPlayers?.length) {
    return NextResponse.json({
      error: 'No players found for this org. Import the registration file first.',
    }, { status: 422 })
  }

  const candidatePool: CandidatePlayer[] = existingPlayers.map((p: any) => ({
    id: p.id, firstName: p.first_name, lastName: p.last_name,
    dob: p.dob, ageGroup: p.age_group, parentEmail: p.parent_email,
  }))

  // Resolve each row
  const matchReport = parseResult.rows.map(row => {
    const result = resolvePlayer(row.rawName, null, null, null, candidatePool)
    return {
      rowIndex:         row.rowIndex,
      rawName:          row.rawName,
      normalized:       normalizeName(row.rawName),
      teamLabel:        row.teamLabel,
      coachName:        row.coachName,
      status:           result.status,
      confidence:       result.topMatch?.confidence ?? null,
      matchReason:      result.topMatch?.matchReason ?? null,
      resolvedPlayerId: result.status === 'auto' ? (result.topMatch?.player.id ?? null) : null,
      candidates:       result.candidates.map(c => ({
        id: c.player.id,
        name: `${c.player.firstName} ${c.player.lastName}`,
        ageGroup: c.player.ageGroup,
        confidence: c.confidence,
        reason: c.matchReason,
      })),
      // Full row payload for writing to tryout_coach_evals after confirmation
      evalPayload: {
        seasonYear,
        teamLabel:        row.teamLabel,
        coachName:        row.coachName,
        scores:           row.scores,
        coachEvalScore:   row.coachEvalScore,
        coachEvalRank:    row.coachEvalRank,
        intangiblesScore: row.intangiblesScore,
        intangiblesRank:  row.intangiblesRank,
        comments:         row.comments,
      },
    }
  })

  const autoCount       = matchReport.filter(r => r.status === 'auto').length
  const suggestedCount  = matchReport.filter(r => r.status === 'suggested').length
  const unresolvedCount = matchReport.filter(r => r.status === 'unresolved').length

  // Auto-write evals for auto-matched rows
  const autoRows = matchReport.filter(r => r.status === 'auto' && r.resolvedPlayerId)
  if (autoRows.length > 0) {
    const evals = autoRows.map(r => ({
      player_id:          r.resolvedPlayerId,
      org_id:             orgId,
      season_year:        r.evalPayload.seasonYear,
      season_id:          seasonId ?? null,
      team_label:         r.evalPayload.teamLabel,
      coach_name:         r.evalPayload.coachName,
      scores:             r.evalPayload.scores,
      coach_eval_score:   r.evalPayload.coachEvalScore,
      coach_eval_rank:    r.evalPayload.coachEvalRank,
      intangibles_score:  r.evalPayload.intangiblesScore,
      intangibles_rank:   r.evalPayload.intangiblesRank,
      comments:           r.evalPayload.comments,
      status:             'submitted',
      submitted_at:       new Date().toISOString(),
    }))

    await supabase.from('tryout_coach_evals')
      .upsert(evals, { onConflict: 'player_id,org_id,season_year' })
  }

  const { data: job } = await supabase
    .from('tryout_import_jobs')
    .insert({
      org_id: orgId, season_id: seasonId ?? null, imported_by: user.id,
      type: 'coach_eval', filename: file.name,
      status: (suggestedCount + unresolvedCount) === 0 ? 'complete' : 'needs_review',
      rows_total: matchReport.length, rows_matched: autoCount,
      rows_suggested: suggestedCount, rows_unresolved: unresolvedCount,
      match_report: matchReport,
      ...(suggestedCount + unresolvedCount === 0 ? { completed_at: new Date().toISOString() } : {}),
    })
    .select('id').single()

  await supabase.from('tryout_audit_log').insert({
    org_id: orgId, actor_id: user.id, actor_name: user.email ?? user.id,
    action: 'import.coach_eval', entity_type: 'tryout_import_job', entity_id: job?.id,
    after_val: { filename: file.name, rows: matchReport.length, auto: autoCount, suggested: suggestedCount, unresolved: unresolvedCount },
  })

  return NextResponse.json({
    jobId: job?.id, rowsTotal: matchReport.length,
    auto: autoCount, suggested: suggestedCount, unresolved: unresolvedCount,
    autoWritten: autoRows.length,
    parseErrors: parseResult.errors, matchReport,
  })
}
