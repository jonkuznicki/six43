/**
 * POST /api/tryouts/imports/roster
 *
 * Accepts a roster file (CSV/XLSX) with: First Name, Last Name, DOB, Team, Jersey #
 * Matches each row against existing tryout_players using the identity resolver.
 * On auto-match: updates prior_team and jersey_number.
 * Creates a tryout_import_jobs record for review of unresolved rows.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../../../lib/supabase-server'
import { parseRosterFile } from '../../../../../lib/tryouts/import/parseRoster'
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

  if (!file)   return NextResponse.json({ error: 'Missing file' },  { status: 400 })
  if (!orgId)  return NextResponse.json({ error: 'Missing orgId' }, { status: 400 })

  const { data: isMember } = await supabase.rpc('tryout_is_member', {
    p_org_id: orgId, p_roles: ['org_admin'],
  })
  if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const buffer = await file.arrayBuffer()
  let parseResult: ReturnType<typeof parseRosterFile>
  try { parseResult = parseRosterFile(buffer) }
  catch (err: unknown) {
    return NextResponse.json({ error: `Parse failed: ${err instanceof Error ? err.message : 'Unknown'}` }, { status: 422 })
  }

  if (parseResult.rows.length === 0) {
    return NextResponse.json({
      error: 'No rows found. ' + (parseResult.errors[0] ?? 'Check file format.'),
      parseErrors: parseResult.errors,
    }, { status: 422 })
  }

  // Load existing players (with jersey_number now that the column exists)
  const { data: existingPlayers } = await supabase
    .from('tryout_players')
    .select('id, first_name, last_name, dob, age_group, parent_email, jersey_number')
    .eq('org_id', orgId)
    .eq('is_active', true)

  if (!existingPlayers?.length) {
    return NextResponse.json({ error: 'No players found. Import registration first.' }, { status: 422 })
  }

  const candidatePool: CandidatePlayer[] = existingPlayers.map((p: any) => ({
    id:          p.id,
    firstName:   p.first_name,
    lastName:    p.last_name,
    dob:         p.dob,
    ageGroup:    p.age_group,
    parentEmail: p.parent_email,
  }))

  // Resolve each roster row
  const matchReport = parseResult.rows.map(row => {
    const rawName = `${row.firstName} ${row.lastName}`
    const result  = resolvePlayer(rawName, null, row.dob, null, candidatePool)

    // Jersey number boost: if roster jersey matches stored jersey, upgrade confidence
    let status    = result.status
    let topMatch  = result.topMatch
    if (row.jerseyNumber && result.topMatch) {
      const candidate = existingPlayers.find((p: any) => p.id === result.topMatch?.player.id)
      if (candidate?.jersey_number === row.jerseyNumber && (result.topMatch.confidence ?? 0) >= 0.55) {
        status   = 'auto'
        topMatch = { ...result.topMatch, confidence: Math.max(result.topMatch.confidence, 0.90) }
      }
    }

    return {
      rowIndex:         row.rowIndex,
      rawName,
      normalized:       normalizeName(rawName),
      teamName:         row.teamName,
      dob:              row.dob,
      jerseyNumber:     row.jerseyNumber,
      status,
      confidence:       topMatch?.confidence ?? null,
      matchReason:      topMatch?.matchReason ?? null,
      resolvedPlayerId: status === 'auto' ? (topMatch?.player.id ?? null) : null,
      candidates:       result.candidates.map(c => ({
        id:         c.player.id,
        name:       `${c.player.firstName} ${c.player.lastName}`,
        ageGroup:   c.player.ageGroup,
        confidence: c.confidence,
        reason:     c.matchReason,
      })),
    }
  })

  const autoCount       = matchReport.filter(r => r.status === 'auto').length
  const suggestedCount  = matchReport.filter(r => r.status === 'suggested').length
  const unresolvedCount = matchReport.filter(r => r.status === 'unresolved').length

  // Apply auto-matches: update prior_team and jersey_number
  const autoRows = matchReport.filter(r => r.status === 'auto' && r.resolvedPlayerId)
  if (autoRows.length > 0) {
    await Promise.all(autoRows.map(r =>
      supabase.from('tryout_players').update({
        prior_team:    r.teamName,
        ...(r.jerseyNumber ? { jersey_number: r.jerseyNumber } : {}),
      }).eq('id', r.resolvedPlayerId)
    ))
  }

  // Write roster staging for auto-matched rows
  if (autoRows.length > 0 && seasonId) {
    const stagingRows = autoRows.map(r => ({
      player_id:     r.resolvedPlayerId,
      org_id:        orgId,
      season_id:     seasonId,
      import_job_id: null as null,  // set after job creation below
      team_name:     r.teamName,
      jersey_number: r.jerseyNumber ?? null,
    }))
    await supabase.from('tryout_roster_staging')
      .upsert(stagingRows, { onConflict: 'player_id,season_id' })
  }

  const { data: job } = await supabase.from('tryout_import_jobs').insert({
    org_id:          orgId,
    season_id:       seasonId ?? null,
    imported_by:     user.id,
    type:            'roster',
    filename:        file.name,
    status:          (suggestedCount + unresolvedCount) === 0 ? 'complete' : 'needs_review',
    rows_total:      matchReport.length,
    rows_matched:    autoCount,
    rows_suggested:  suggestedCount,
    rows_unresolved: unresolvedCount,
    match_report:    matchReport,
    ...(suggestedCount + unresolvedCount === 0 ? { completed_at: new Date().toISOString() } : {}),
  }).select('id').single()

  await supabase.from('tryout_audit_log').insert({
    org_id:      orgId,
    actor_id:    user.id,
    actor_name:  user.email ?? user.id,
    action:      'import.roster',
    entity_type: 'tryout_import_job',
    entity_id:   job?.id,
    after_val:   { filename: file.name, rows: matchReport.length, auto: autoCount, suggested: suggestedCount, unresolved: unresolvedCount },
  })

  return NextResponse.json({
    jobId:       job?.id,
    rowsTotal:   matchReport.length,
    auto:        autoCount,
    suggested:   suggestedCount,
    unresolved:  unresolvedCount,
    parseErrors: parseResult.errors,
    matchReport,
  })
}
