/**
 * POST /api/tryouts/imports/gc-stats
 *
 * Parses a GameChanger stats export (CSV or XLSX), resolves player identities,
 * writes matched stats to tryout_gc_stats, and creates an import job record.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../../../lib/supabase-server'
import { parseGcStatsFile } from '../../../../../lib/tryouts/import/parseGcStats'
import { resolvePlayer, CandidatePlayer } from '../../../../../lib/tryouts/identityResolver'
import { normalizeName } from '../../../../../lib/tryouts/nameNormalization'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let formData: FormData
  try { formData = await req.formData() }
  catch { return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 }) }

  const file       = formData.get('file')       as File   | null
  const orgId      = formData.get('orgId')      as string | null
  const seasonId   = formData.get('seasonId')   as string | null
  const seasonYear = formData.get('seasonYear') as string | null
  const teamId     = formData.get('teamId')     as string | null

  if (!file)       return NextResponse.json({ error: 'Missing file' },       { status: 400 })
  if (!orgId)      return NextResponse.json({ error: 'Missing orgId' },      { status: 400 })
  if (!seasonId)   return NextResponse.json({ error: 'Missing seasonId' },   { status: 400 })
  if (!seasonYear) return NextResponse.json({ error: 'Missing seasonYear' }, { status: 400 })

  const { data: isMember } = await supabase.rpc('tryout_is_member', {
    p_org_id: orgId, p_roles: ['org_admin', 'head_coach'],
  })
  if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const arrayBuffer = await file.arrayBuffer()
  let parseResult: ReturnType<typeof parseGcStatsFile>
  try { parseResult = parseGcStatsFile(arrayBuffer) }
  catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown parse error'
    return NextResponse.json({ error: `File parse failed: ${msg}` }, { status: 422 })
  }

  if (parseResult.rows.length === 0) {
    return NextResponse.json({
      error: 'No player rows found. ' + (parseResult.errors[0] ?? 'Check the file format.'),
      parseErrors: parseResult.errors,
    }, { status: 422 })
  }

  // Load existing players
  const { data: existingPlayers } = await supabase
    .from('tryout_players')
    .select('id, first_name, last_name, dob, age_group, parent_email, jersey_number, prior_team')
    .eq('org_id', orgId).eq('is_active', true)

  if (!existingPlayers?.length) {
    return NextResponse.json({ error: 'No players found. Import registration first.' }, { status: 422 })
  }

  const candidatePool: CandidatePlayer[] = existingPlayers.map((p: any) => ({
    id: p.id, firstName: p.first_name, lastName: p.last_name,
    dob: p.dob, ageGroup: p.age_group, parentEmail: p.parent_email,
  }))

  // Resolve each row — boost confidence if jersey numbers match
  const matchReport = parseResult.rows.map(row => {
    const result = resolvePlayer(row.rawName, null, null, null, candidatePool)

    // Jersey number boost: if GC jersey matches player jersey, upgrade suggested→auto
    let status = result.status
    let topMatch = result.topMatch
    if (row.jerseyNumber && result.topMatch) {
      const matchedPlayer = existingPlayers.find(
        (p: any) => p.id === result.topMatch?.player.id
      )
      if (matchedPlayer?.jersey_number === row.jerseyNumber && result.topMatch.confidence >= 0.6) {
        status   = 'auto'
        topMatch = { ...result.topMatch, confidence: Math.max(result.topMatch.confidence, 0.92) }
      }
    }

    return {
      rowIndex:         row.rowIndex,
      rawName:          row.rawName,
      normalized:       normalizeName(row.rawName),
      jerseyNumber:     row.jerseyNumber,
      type:             row.type,
      teamLabel:        row.teamLabel,
      status,
      confidence:       topMatch?.confidence ?? null,
      matchReason:      topMatch?.matchReason ?? null,
      resolvedPlayerId: status === 'auto' ? (topMatch?.player.id ?? null) : null,
      candidates:       result.candidates.map(c => ({
        id: c.player.id,
        name: `${c.player.firstName} ${c.player.lastName}`,
        ageGroup: c.player.ageGroup,
        confidence: c.confidence,
        reason: c.matchReason,
      })),
      stats: row.stats,
    }
  })

  const autoCount       = matchReport.filter(r => r.status === 'auto').length
  const suggestedCount  = matchReport.filter(r => r.status === 'suggested').length
  const unresolvedCount = matchReport.filter(r => r.status === 'unresolved').length

  // Write auto-matched stats
  const autoRows = matchReport.filter(r => r.status === 'auto' && r.resolvedPlayerId)
  if (autoRows.length > 0) {
    const upserts = autoRows.map(r => ({
      player_id:   r.resolvedPlayerId,
      org_id:      orgId,
      season_year: seasonYear,
      team_label:  r.teamLabel,
      source:      'gamechanger',
      // Batting
      games_played: r.stats.g   ?? null,
      pa:     r.stats.pa         ?? null,
      ab:     r.stats.ab         ?? null,
      avg:    r.stats.avg        ?? null,
      obp:    r.stats.obp        ?? null,
      slg:    r.stats.slg        ?? null,
      ops:    r.stats.ops        ?? null,
      h:      r.stats.h          ?? null,
      doubles: r.stats.doubles   ?? null,
      triples: r.stats.triples   ?? null,
      hr:     r.stats.hr         ?? null,
      rbi:    r.stats.rbi        ?? null,
      r:      r.stats.r          ?? null,
      bb:     r.stats.bb         ?? null,
      so:     r.stats.so         ?? null,
      sb:     r.stats.sb         ?? null,
      // Pitching
      ip:     r.stats.ip         ?? null,
      gs:     r.stats.gs         ?? null,
      w:      r.stats.w          ?? null,
      l:      r.stats.l          ?? null,
      sv:     r.stats.sv         ?? null,
      era:    r.stats.era        ?? null,
      whip:   r.stats.whip       ?? null,
    }))

    await supabase.from('tryout_gc_stats')
      .upsert(upserts, { onConflict: 'player_id,season_year' })
  }

  const { data: job } = await supabase
    .from('tryout_import_jobs')
    .insert({
      org_id:          orgId,
      season_id:       seasonId,
      team_id:         teamId ?? null,
      imported_by:     user.id,
      type:            'gc_stats',
      filename:        file.name,
      status:          (suggestedCount + unresolvedCount) === 0 ? 'complete' : 'needs_review',
      rows_total:      matchReport.length,
      rows_matched:    autoCount,
      rows_suggested:  suggestedCount,
      rows_unresolved: unresolvedCount,
      match_report:    matchReport,
      ...(suggestedCount + unresolvedCount === 0 ? { completed_at: new Date().toISOString() } : {}),
    })
    .select('id').single()

  await supabase.from('tryout_audit_log').insert({
    org_id:       orgId,
    actor_id:     user.id,
    actor_name:   user.email ?? user.id,
    action:       'import.gc_stats',
    entity_type:  'tryout_import_job',
    entity_id:    job?.id,
    after_val: {
      filename: file.name, rows: matchReport.length,
      auto: autoCount, suggested: suggestedCount, unresolved: unresolvedCount,
      detectedType: parseResult.detectedType, teamLabel: parseResult.teamLabel,
    },
  })

  return NextResponse.json({
    jobId:       job?.id,
    rowsTotal:   matchReport.length,
    auto:        autoCount,
    suggested:   suggestedCount,
    unresolved:  unresolvedCount,
    autoWritten: autoRows.length,
    detectedType: parseResult.detectedType,
    teamLabel:   parseResult.teamLabel,
    parseErrors: parseResult.errors,
    matchReport,
  })
}
