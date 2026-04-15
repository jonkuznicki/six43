/**
 * POST /api/tryouts/imports/[jobId]/confirm
 *
 * Handles the review queue actions after a registration import.
 * Called once per row action from the review screen.
 *
 * Body:
 *   action: "confirm_match"  → assign this row to an existing player
 *   action: "create_new"     → create a new player from this row's data
 *   action: "confirm_all_suggested" → bulk confirm all 'suggested' rows
 *
 * For "confirm_match":
 *   rowIndex: number
 *   playerId: string  (the player to match to)
 *
 * For "create_new":
 *   rowIndex: number  (the row in match_report to create from)
 *
 * For "confirm_all_suggested":
 *   (no extra fields — confirms all rows with status='suggested' using their top candidate)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../../../../lib/supabase-server'

export async function POST(
  req: NextRequest,
  { params }: { params: { jobId: string } },
) {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Load the import job
  const { data: job, error: jobErr } = await supabase
    .from('tryout_import_jobs')
    .select('*')
    .eq('id', params.jobId)
    .single()

  if (jobErr || !job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  // Verify admin access
  const { data: isMember } = await supabase.rpc('tryout_is_member', {
    p_org_id: job.org_id,
    p_roles:  ['org_admin'],
  })
  if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json() as {
    action:    'confirm_match' | 'create_new' | 'confirm_all_suggested' | 'skip'
    rowIndex?: number
    playerId?: string
  }

  const report = (job.match_report ?? []) as any[]

  if (body.action === 'confirm_all_suggested') {
    return confirmAllSuggested({ supabase, job, report, userId: user.id })
  }

  const row = report.find((r: any) => r.rowIndex === body.rowIndex)
  if (!row) return NextResponse.json({ error: 'Row not found in match report' }, { status: 404 })

  if (body.action === 'confirm_match') {
    if (!body.playerId) return NextResponse.json({ error: 'Missing playerId' }, { status: 400 })
    return confirmMatch({ supabase, job, report, row, playerId: body.playerId, userId: user.id })
  }

  if (body.action === 'create_new') {
    return createNewPlayer({ supabase, job, report, row, userId: user.id })
  }

  if (body.action === 'skip') {
    return skipRow({ supabase, job, report, row, userId: user.id })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// ── Action handlers ──────────────────────────────────────────────────────────

async function confirmMatch({ supabase, job, report, row, playerId, userId }: any) {
  // Update the player record with any new info from the registration row
  const payload = row.createPayload
  await supabase
    .from('tryout_players')
    .update({
      // Merge in registration data — don't overwrite if already set
      ...(payload.dob         ? { dob:          payload.dob }         : {}),
      ...(payload.parentEmail ? { parent_email: payload.parentEmail } : {}),
      ...(payload.parentPhone ? { parent_phone: payload.parentPhone } : {}),
      ...(payload.grade       ? { grade:        payload.grade }       : {}),
      ...(payload.school      ? { school:       payload.school }      : {}),
      ...(payload.priorOrg    ? { prior_org:    payload.priorOrg }    : {}),
      ...(payload.priorTeam   ? { prior_team:   payload.priorTeam }   : {}),
    })
    .eq('id', playerId)

  // Create alias record
  await supabase.from('tryout_player_aliases').insert({
    player_id:     playerId,
    raw_name:      row.rawName,
    source:        'registration',
    confidence:    row.confidence ?? 0.90,
    confirmed:     true,
    confirmed_by:  userId,
    confirmed_at:  new Date().toISOString(),
    import_job_id: job.id,
  })

  // Update the row in match_report
  const updatedReport = report.map((r: any) =>
    r.rowIndex === row.rowIndex
      ? { ...r, status: 'auto', resolvedPlayerId: playerId, confidence: 1.0, matchReason: 'manually confirmed' }
      : r
  )

  await updateJobReport({ supabase, jobId: job.id, report: updatedReport, userId, orgId: job.org_id, action: `Confirmed match: ${row.rawName} → player ${playerId}` })

  return NextResponse.json({ ok: true, playerId })
}

async function createNewPlayer({ supabase, job, report, row, userId }: any) {
  const payload = row.createPayload

  const { data: newPlayer, error } = await supabase
    .from('tryout_players')
    .insert({
      org_id:       job.org_id,
      first_name:   payload.firstName,
      last_name:    payload.lastName,
      dob:          payload.dob,
      age_group:    payload.ageGroup,
      parent_email: payload.parentEmail,
      parent_phone: payload.parentPhone,
      grade:        payload.grade,
      school:       payload.school,
      prior_org:    payload.priorOrg,
      prior_team:   payload.priorTeam,
    })
    .select('id')
    .single()

  if (error || !newPlayer) {
    return NextResponse.json({ error: 'Failed to create player' }, { status: 500 })
  }

  // Canonical alias
  await supabase.from('tryout_player_aliases').insert({
    player_id:     newPlayer.id,
    raw_name:      row.rawName,
    source:        'registration',
    confidence:    1.0,
    confirmed:     true,
    confirmed_by:  userId,
    confirmed_at:  new Date().toISOString(),
    import_job_id: job.id,
  })

  const updatedReport = report.map((r: any) =>
    r.rowIndex === row.rowIndex
      ? { ...r, status: 'auto', resolvedPlayerId: newPlayer.id, confidence: 1.0, matchReason: 'new player created' }
      : r
  )

  await updateJobReport({ supabase, jobId: job.id, report: updatedReport, userId, orgId: job.org_id, action: `Created new player: ${payload.firstName} ${payload.lastName}` })

  return NextResponse.json({ ok: true, playerId: newPlayer.id })
}

async function confirmAllSuggested({ supabase, job, report, userId }: any) {
  const suggested = (report as any[]).filter((r: any) => r.status === 'suggested')
  const results: Array<{ rowIndex: number; playerId: string }> = []

  for (const row of suggested) {
    const topCandidate = row.candidates?.[0]
    if (!topCandidate) continue

    await supabase.from('tryout_player_aliases').insert({
      player_id:     topCandidate.id,
      raw_name:      row.rawName,
      source:        'registration',
      confidence:    topCandidate.confidence,
      confirmed:     true,
      confirmed_by:  userId,
      confirmed_at:  new Date().toISOString(),
      import_job_id: job.id,
    })

    results.push({ rowIndex: row.rowIndex, playerId: topCandidate.id })
  }

  const confirmedIds = new Set(results.map(r => r.rowIndex))
  const updatedReport = (report as any[]).map((r: any) => {
    if (!confirmedIds.has(r.rowIndex)) return r
    const match = results.find(res => res.rowIndex === r.rowIndex)!
    return {
      ...r,
      status:           'auto',
      resolvedPlayerId: match.playerId,
      matchReason:      'bulk confirmed',
    }
  })

  await updateJobReport({
    supabase, jobId: job.id, report: updatedReport, userId, orgId: job.org_id,
    action: `Bulk confirmed ${results.length} suggested rows`,
  })

  return NextResponse.json({ ok: true, confirmed: results.length })
}

async function skipRow({ supabase, job, report, row, userId }: any) {
  const updatedReport = report.map((r: any) =>
    r.rowIndex === row.rowIndex
      ? { ...r, status: 'skipped', resolvedPlayerId: null, matchReason: 'skipped — not a player' }
      : r
  )
  await updateJobReport({ supabase, jobId: job.id, report: updatedReport, userId, orgId: job.org_id, action: `Skipped row: ${row.rawName}` })
  return NextResponse.json({ ok: true })
}

// ── Shared helpers ───────────────────────────────────────────────────────────

async function updateJobReport({ supabase, jobId, report, userId, orgId, action }: any) {
  const remaining = report.filter((r: any) => r.status === 'unresolved' || r.status === 'suggested').length
  // skipped rows are considered resolved for job status purposes
  const status = remaining === 0 ? 'complete' : 'needs_review'

  await supabase
    .from('tryout_import_jobs')
    .update({
      match_report:    report,
      status,
      ...(status === 'complete' ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq('id', jobId)

  await supabase.from('tryout_audit_log').insert({
    org_id:      orgId,
    actor_id:    userId,
    actor_name:  userId,
    action:      'import.confirm',
    entity_type: 'tryout_import_job',
    entity_id:   jobId,
    after_val:   { action, remainingUnresolved: remaining },
  })
}
