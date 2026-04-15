/**
 * POST /api/tryouts/imports/tryout-scores
 *
 * Parses tryout score file, resolves player identities, creates
 * a tryout_import_job, and auto-writes scores for matched rows.
 *
 * Also creates a tryout_session record for each unique (age_group, date)
 * combination found in the file (if one doesn't exist already).
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../../../lib/supabase-server'
import { parseTryoutScoresFile } from '../../../../../lib/tryouts/import/parseTryoutScores'
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

  if (!file)     return NextResponse.json({ error: 'Missing file' },     { status: 400 })
  if (!orgId)    return NextResponse.json({ error: 'Missing orgId' },    { status: 400 })
  if (!seasonId) return NextResponse.json({ error: 'Missing seasonId' }, { status: 400 })

  const { data: isMember } = await supabase.rpc('tryout_is_member', {
    p_org_id: orgId, p_roles: ['org_admin'],
  })
  if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const arrayBuffer = await file.arrayBuffer()
  let parseResult: ReturnType<typeof parseTryoutScoresFile>
  try { parseResult = parseTryoutScoresFile(arrayBuffer) }
  catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown parse error'
    return NextResponse.json({ error: `File parse failed: ${msg}` }, { status: 422 })
  }

  if (parseResult.rows.length === 0) {
    return NextResponse.json({ error: 'No score rows found.', parseErrors: parseResult.errors }, { status: 422 })
  }

  // Load existing players
  const { data: existingPlayers } = await supabase
    .from('tryout_players')
    .select('id, first_name, last_name, dob, age_group, parent_email')
    .eq('org_id', orgId).eq('is_active', true)

  if (!existingPlayers?.length) {
    return NextResponse.json({ error: 'No players found. Import registration first.' }, { status: 422 })
  }

  const candidatePool: CandidatePlayer[] = existingPlayers.map((p: any) => ({
    id: p.id, firstName: p.first_name, lastName: p.last_name,
    dob: p.dob, ageGroup: p.age_group, parentEmail: p.parent_email,
  }))

  // Ensure sessions exist for each unique (age_group, date) in the file
  const sessionKeys = new Map<string, { ageGroup: string; date: string | null; label: string | null }>()
  for (const row of parseResult.rows) {
    const key = `${row.ageGroup}::${row.sessionDate ?? 'unknown'}`
    if (!sessionKeys.has(key)) {
      sessionKeys.set(key, { ageGroup: row.ageGroup, date: row.sessionDate, label: row.sessionLabel })
    }
  }

  // Load or create sessions
  const sessionMap = new Map<string, string>()  // key → session_id
  for (const [key, info] of Array.from(sessionKeys.entries())) {
    const { data: existing } = await supabase
      .from('tryout_sessions')
      .select('id')
      .eq('season_id', seasonId)
      .eq('age_group', info.ageGroup)
      .eq('session_date', info.date ?? '1970-01-01')
      .maybeSingle()

    if (existing) {
      sessionMap.set(key, existing.id)
    } else {
      const label = info.label ?? (info.date ? `Tryout ${info.date}` : `${info.ageGroup} Tryout`)
      const { data: created } = await supabase
        .from('tryout_sessions')
        .insert({
          season_id: seasonId, org_id: orgId,
          age_group: info.ageGroup,
          session_date: info.date ?? new Date().toISOString().split('T')[0],
          label, status: 'closed',  // historical imports are already done
        })
        .select('id').single()
      if (created) sessionMap.set(key, created.id)
    }
  }

  // Resolve each row
  const matchReport = parseResult.rows.map(row => {
    const result = resolvePlayer(row.rawName, row.ageGroup, null, null, candidatePool)
    const sessionKey = `${row.ageGroup}::${row.sessionDate ?? 'unknown'}`
    return {
      rowIndex:         row.rowIndex,
      rawName:          row.rawName,
      normalized:       normalizeName(row.rawName),
      ageGroup:         row.ageGroup,
      sessionDate:      row.sessionDate,
      sessionId:        sessionMap.get(sessionKey) ?? null,
      status:           result.status,
      confidence:       result.topMatch?.confidence ?? null,
      matchReason:      result.topMatch?.matchReason ?? null,
      resolvedPlayerId: result.status === 'auto' ? (result.topMatch?.player.id ?? null) : null,
      candidates:       result.candidates.map(c => ({
        id: c.player.id, name: `${c.player.firstName} ${c.player.lastName}`,
        ageGroup: c.player.ageGroup, confidence: c.confidence, reason: c.matchReason,
      })),
      scorePayload: {
        scores:        row.scores,
        tryoutScore:   row.tryoutScore,
        evaluatorName: row.evaluatorName,
        comments:      row.comments,
      },
    }
  })

  const autoCount       = matchReport.filter(r => r.status === 'auto').length
  const suggestedCount  = matchReport.filter(r => r.status === 'suggested').length
  const unresolvedCount = matchReport.filter(r => r.status === 'unresolved').length

  // Auto-write scores for matched rows
  const autoRows = matchReport.filter(r => r.status === 'auto' && r.resolvedPlayerId && r.sessionId)
  if (autoRows.length > 0) {
    const scores = autoRows.map(r => ({
      player_id:      r.resolvedPlayerId,
      session_id:     r.sessionId,
      org_id:         orgId,
      evaluator_id:   user.id,
      evaluator_name: r.scorePayload.evaluatorName ?? 'Import',
      scores:         r.scorePayload.scores,
      tryout_score:   r.scorePayload.tryoutScore,
      comments:       r.scorePayload.comments,
      submitted_at:   new Date().toISOString(),
    }))
    await supabase.from('tryout_scores')
      .upsert(scores, { onConflict: 'player_id,session_id,evaluator_id' })
  }

  const { data: job } = await supabase
    .from('tryout_import_jobs')
    .insert({
      org_id: orgId, season_id: seasonId, imported_by: user.id,
      type: 'tryout_scores', filename: file.name,
      status: (suggestedCount + unresolvedCount) === 0 ? 'complete' : 'needs_review',
      rows_total: matchReport.length, rows_matched: autoCount,
      rows_suggested: suggestedCount, rows_unresolved: unresolvedCount,
      match_report: matchReport,
      ...(suggestedCount + unresolvedCount === 0 ? { completed_at: new Date().toISOString() } : {}),
    })
    .select('id').single()

  await supabase.from('tryout_audit_log').insert({
    org_id: orgId, actor_id: user.id, actor_name: user.email ?? user.id,
    action: 'import.tryout_scores', entity_type: 'tryout_import_job', entity_id: job?.id,
    after_val: { filename: file.name, rows: matchReport.length, auto: autoCount, suggested: suggestedCount, unresolved: unresolvedCount, sessionsCreated: sessionMap.size },
  })

  return NextResponse.json({
    jobId: job?.id, rowsTotal: matchReport.length,
    auto: autoCount, suggested: suggestedCount, unresolved: unresolvedCount,
    autoWritten: autoRows.length, sessionsCreated: sessionMap.size,
    parseErrors: parseResult.errors, matchReport,
  })
}
