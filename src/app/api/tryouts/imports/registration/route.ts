/**
 * POST /api/tryouts/imports/registration
 *
 * Accepts a multipart form upload of a registration spreadsheet.
 * 1. Parses the file with parseRegistrationFile()
 * 2. Loads existing tryout_players for the org to build the candidate pool
 * 3. Runs the identity resolver on every row
 * 4. Creates a tryout_import_job with status=needs_review + full match_report
 * 5. Auto-inserts new players for rows with status=auto + no existing match
 * 6. Returns the job ID and a summary for the client
 *
 * The client renders the review screen from match_report.
 * Confirmed/unresolved rows are handled by a separate PATCH endpoint.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../../../lib/supabase-server'
import { parseRegistrationFile, ParsedRegistrationRow } from '../../../../../lib/tryouts/import/parseRegistration'
import { resolvePlayer, CandidatePlayer, MatchStatus } from '../../../../../lib/tryouts/identityResolver'

interface MatchReportRow {
  rowIndex:         number
  rawName:          string
  normalized:       string
  ageGroup:         string
  dob:              string | null
  parentEmail:      string | null
  status:           MatchStatus | 'new'    // 'new' = no candidates at all, will create
  confidence:       number | null
  matchReason:      string | null
  resolvedPlayerId: string | null          // set for auto-matched rows
  candidates:       Array<{
    id:         string
    name:       string
    ageGroup:   string | null
    dob:        string | null
    confidence: number
    reason:     string
  }>
  // Payload to create if this row becomes a new player
  createPayload:    Omit<ParsedRegistrationRow, 'rowIndex'>
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()

  // ── Auth ──────────────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ── Parse multipart form ─────────────────────────────────────────────────
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data' }, { status: 400 })
  }

  const file    = formData.get('file') as File | null
  const orgId   = formData.get('orgId') as string | null
  const seasonId = formData.get('seasonId') as string | null

  if (!file)  return NextResponse.json({ error: 'Missing file' },  { status: 400 })
  if (!orgId) return NextResponse.json({ error: 'Missing orgId' }, { status: 400 })

  // ── Verify org membership ────────────────────────────────────────────────
  const { data: isMember } = await supabase.rpc('tryout_is_member', {
    p_org_id: orgId,
    p_roles:  ['org_admin'],
  })
  if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // ── Parse file ───────────────────────────────────────────────────────────
  const arrayBuffer = await file.arrayBuffer()
  let parseResult: Awaited<ReturnType<typeof parseRegistrationFile>>
  try {
    parseResult = parseRegistrationFile(arrayBuffer)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown parse error'
    return NextResponse.json({ error: `File parse failed: ${msg}` }, { status: 422 })
  }

  if (parseResult.rows.length === 0) {
    return NextResponse.json({
      error: 'No player rows found in file.',
      parseErrors: parseResult.errors,
    }, { status: 422 })
  }

  // ── Load existing players for this org ───────────────────────────────────
  const { data: existingPlayers, error: playersError } = await supabase
    .from('tryout_players')
    .select('id, first_name, last_name, dob, age_group, parent_email')
    .eq('org_id', orgId)
    .eq('is_active', true)

  if (playersError) {
    return NextResponse.json({ error: 'Could not load existing players' }, { status: 500 })
  }

  const candidatePool: CandidatePlayer[] = (existingPlayers ?? []).map((p: any) => ({
    id:          p.id,
    firstName:   p.first_name,
    lastName:    p.last_name,
    dob:         p.dob,
    ageGroup:    p.age_group,
    parentEmail: p.parent_email,
  }))

  // ── Run identity resolver on every row ───────────────────────────────────
  const matchReport: MatchReportRow[] = parseResult.rows.map(row => {
    const rawName = `${row.firstName} ${row.lastName}`.trim()

    // If no existing players, everything is "new"
    if (candidatePool.length === 0) {
      return {
        rowIndex:         row.rowIndex,
        rawName:          row.rawFullName,
        normalized:       rawName,
        ageGroup:         row.ageGroup,
        dob:              row.dob,
        parentEmail:      row.parentEmail,
        status:           'new' as const,
        confidence:       null,
        matchReason:      null,
        resolvedPlayerId: null,
        candidates:       [],
        createPayload:    row,
      }
    }

    const result = resolvePlayer(
      rawName,
      row.ageGroup,
      row.dob,
      row.parentEmail,
      candidatePool,
    )

    return {
      rowIndex:         row.rowIndex,
      rawName:          row.rawFullName,
      normalized:       rawName,
      ageGroup:         row.ageGroup,
      dob:              row.dob,
      parentEmail:      row.parentEmail,
      status:           result.status,
      confidence:       result.topMatch?.confidence ?? null,
      matchReason:      result.topMatch?.matchReason ?? null,
      resolvedPlayerId: result.status === 'auto' ? (result.topMatch?.player.id ?? null) : null,
      candidates:       result.candidates.map(c => ({
        id:         c.player.id,
        name:       `${c.player.firstName} ${c.player.lastName}`,
        ageGroup:   c.player.ageGroup,
        dob:        c.player.dob,
        confidence: c.confidence,
        reason:     c.matchReason,
      })),
      createPayload: row,
    }
  })

  // ── Count summary ────────────────────────────────────────────────────────
  const autoCount       = matchReport.filter(r => r.status === 'auto').length
  const suggestedCount  = matchReport.filter(r => r.status === 'suggested').length
  const unresolvedCount = matchReport.filter(r => r.status === 'unresolved').length
  const newCount        = matchReport.filter(r => r.status === 'new').length

  // ── Create import job record ─────────────────────────────────────────────
  const { data: job, error: jobError } = await supabase
    .from('tryout_import_jobs')
    .insert({
      org_id:          orgId,
      season_id:       seasonId ?? null,
      imported_by:     user.id,
      type:            'registration',
      filename:        file.name,
      status:          'needs_review',
      rows_total:      matchReport.length,
      rows_matched:    autoCount,
      rows_suggested:  suggestedCount,
      rows_unresolved: unresolvedCount,
      rows_created:    newCount,
      match_report:    matchReport,
    })
    .select('id')
    .single()

  if (jobError || !job) {
    return NextResponse.json({ error: 'Failed to create import job' }, { status: 500 })
  }

  // ── Auto-create players for rows with status='new' (no existing players at all) ─
  // For auto-matched rows: add an alias confirming the match.
  // Actual new-player creation for unresolved/suggested happens after review.
  if (newCount > 0 && candidatePool.length === 0) {
    const newRows = matchReport.filter(r => r.status === 'new')
    const newPlayers = newRows.map(r => ({
      org_id:       orgId,
      first_name:   r.createPayload.firstName,
      last_name:    r.createPayload.lastName,
      dob:          r.createPayload.dob,
      age_group:    r.createPayload.ageGroup,
      parent_email: r.createPayload.parentEmail,
      parent_phone: r.createPayload.parentPhone,
      grade:        r.createPayload.grade,
      school:       r.createPayload.school,
      prior_org:    r.createPayload.priorOrg,
      prior_team:   r.createPayload.priorTeam,
    }))

    const { data: createdPlayers } = await supabase
      .from('tryout_players')
      .insert(newPlayers)
      .select('id, first_name, last_name')

    // Create canonical aliases for every new player
    if (createdPlayers?.length) {
      const aliases = createdPlayers.map((p: any) => ({
        player_id:     p.id,
        raw_name:      `${p.first_name} ${p.last_name}`,
        source:        'registration' as const,
        confidence:    1.0,
        confirmed:     true,
        confirmed_by:  user.id,
        confirmed_at:  new Date().toISOString(),
        import_job_id: job.id,
      }))
      await supabase.from('tryout_player_aliases').insert(aliases)

      // Write registration staging for newly created players
      if (seasonId) {
        const stagingRows = createdPlayers.map((p: any, i: number) => {
          const row = newRows[i]
          return {
            player_id:     p.id,
            org_id:               orgId,
            season_id:            seasonId,
            import_job_id:        job.id,
            age_group:            row.createPayload.ageGroup,
            preferred_tryout_date: row.createPayload.preferredTryoutDate ?? null,
            prior_team:           row.createPayload.priorTeam,
            parent_email:         row.createPayload.parentEmail,
            parent_phone:         row.createPayload.parentPhone,
            dob:                  row.createPayload.dob,
            grade:                row.createPayload.grade,
            school:               row.createPayload.school,
            prior_org:            row.createPayload.priorOrg,
          }
        })
        await supabase.from('tryout_registration_staging')
          .upsert(stagingRows, { onConflict: 'player_id,season_id' })
      }
    }

    // Mark job complete if everything was new (first import)
    await supabase
      .from('tryout_import_jobs')
      .update({
        status:       'complete',
        rows_created: createdPlayers?.length ?? 0,
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id)
  }

  // Write registration staging for auto-matched rows
  const autoMatchedRows = matchReport.filter(r => r.status === 'auto' && r.resolvedPlayerId)
  if (autoMatchedRows.length > 0 && seasonId) {
    const stagingRows = autoMatchedRows.map(r => ({
      player_id:     r.resolvedPlayerId,
      org_id:               orgId,
      season_id:            seasonId,
      import_job_id:        job.id,
      age_group:            r.createPayload.ageGroup,
      preferred_tryout_date: r.createPayload.preferredTryoutDate ?? null,
      prior_team:           r.createPayload.priorTeam,
      parent_email:         r.createPayload.parentEmail,
      parent_phone:         r.createPayload.parentPhone,
      dob:           r.createPayload.dob,
      grade:         r.createPayload.grade,
      school:        r.createPayload.school,
      prior_org:     r.createPayload.priorOrg,
    }))
    await supabase.from('tryout_registration_staging')
      .upsert(stagingRows, { onConflict: 'player_id,season_id' })
  }

  // ── Audit log ────────────────────────────────────────────────────────────
  await supabase.from('tryout_audit_log').insert({
    org_id:      orgId,
    actor_id:    user.id,
    actor_name:  user.email ?? user.id,
    action:      'import.registration',
    entity_type: 'tryout_import_job',
    entity_id:   job.id,
    after_val:   {
      filename:  file.name,
      rowsTotal: matchReport.length,
      auto:      autoCount,
      suggested: suggestedCount,
      unresolved: unresolvedCount,
      new:       newCount,
    },
  })

  return NextResponse.json({
    jobId:       job.id,
    rowsTotal:   matchReport.length,
    auto:        autoCount,
    suggested:   suggestedCount,
    unresolved:  unresolvedCount,
    new:         newCount,
    parseErrors: parseResult.errors,
    // Return the full match report so the client can render the review screen
    // without a second fetch
    matchReport,
  })
}
