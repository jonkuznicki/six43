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
import { computeGcScores, GcPlayerStat, GcScoringConfigRow } from '../../../../../../lib/tryouts/computeGcScores'

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
    action:    'confirm_match' | 'create_new' | 'confirm_all_suggested' | 'create_all_new' | 'skip' | 'unmatch'
    rowIndex?: number
    playerId?: string
  }

  const report = (job.match_report ?? []) as any[]

  if (body.action === 'create_all_new') {
    return createAllNew({ supabase, job, report, userId: user.id })
  }

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

  if (body.action === 'unmatch') {
    return unmatchRow({ supabase, job, report, row, userId: user.id })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function upsertRegStaging(supabase: any, row: Record<string, any>) {
  await supabase
    .from('tryout_registration_staging')
    .upsert(row, { onConflict: 'player_id,season_id' })
}

// ── Action handlers ──────────────────────────────────────────────────────────

async function writeGcStatsForPlayer({ supabase, row, playerId, orgId, seasonId }: any) {
  // Fetch season year from season record
  const { data: season } = await supabase
    .from('tryout_seasons').select('year').eq('id', seasonId).single()
  const seasonYear = season?.year?.toString() ?? new Date().getFullYear().toString()

  const s = row.stats ?? {}
  const bb_per_inn = s.bb_per_inn != null
    ? s.bb_per_inn
    : (s.bb_allowed != null && s.ip != null && s.ip > 0)
      ? Math.round((s.bb_allowed / s.ip) * 1000) / 1000
      : null

  await supabase.from('tryout_gc_stats').upsert({
    player_id:    playerId,
    org_id:       orgId,
    season_year:  seasonYear,
    team_label:   row.teamLabel ?? null,
    source:       'gamechanger',
    games_played: s.g       ?? null,
    pa:     s.pa            ?? null,
    ab:     s.ab            ?? null,
    avg:    s.avg           ?? null,
    obp:    s.obp           ?? null,
    slg:    s.slg           ?? null,
    ops:    s.ops           ?? null,
    h:      s.h             ?? null,
    doubles: s.doubles      ?? null,
    triples: s.triples      ?? null,
    hr:     s.hr            ?? null,
    rbi:    s.rbi           ?? null,
    r:      s.r             ?? null,
    bb:     s.bb            ?? null,
    so:     s.so            ?? null,
    sb:     s.sb            ?? null,
    hbp:    s.hbp           ?? null,
    sac:    s.sac           ?? null,
    tb:     s.tb            ?? null,
    ip:     s.ip            ?? null,
    gs:     s.gs            ?? null,
    w:      s.w             ?? null,
    l:      s.l             ?? null,
    sv:     s.sv            ?? null,
    era:    s.era           ?? null,
    whip:   s.whip          ?? null,
    k:      s.k             ?? null,
    bb_allowed: s.bb_allowed ?? null,
    bf:     s.bf            ?? null,
    baa:    s.baa           ?? null,
    bb_per_inn,
    k_bb:       s.k_bb      ?? null,
    strike_pct: s.strike_pct ?? null,
  }, { onConflict: 'player_id,org_id,season_year' })

  // Compute and save GC scores
  const [{ data: scoringCfg }, { data: playerRow }] = await Promise.all([
    supabase.from('tryout_gc_scoring_config')
      .select('age_group, stat_key, included, weight')
      .eq('org_id', orgId).eq('season_id', seasonId),
    supabase.from('tryout_players').select('age_group').eq('id', playerId).single(),
  ])
  if (scoringCfg?.length) {
    const playerStat: GcPlayerStat = {
      player_id:  playerId,
      age_group:  playerRow?.age_group ?? null,
      avg: s.avg, obp: s.obp, slg: s.slg, ops: s.ops,
      rbi: s.rbi, r:   s.r,   hr:  s.hr,  sb:  s.sb,
      bb:  s.bb,  so:  s.so,
      era: s.era, whip: s.whip, ip: s.ip,
      k:   s.k,   bb_allowed: s.bb_allowed, bf: s.bf,
      baa: s.baa, bb_per_inn, k_bb: s.k_bb, strike_pct: s.strike_pct,
      w:   s.w,   sv: s.sv,
    }
    const scores = computeGcScores([playerStat], scoringCfg as GcScoringConfigRow[])
    const score = scores.get(playerId)
    if (score) {
      await supabase.from('tryout_gc_stats').upsert({
        player_id: playerId, org_id: orgId, season_year: seasonYear,
        gc_hitting_score: score.hitting, gc_pitching_score: score.pitching,
      }, { onConflict: 'player_id,org_id,season_year' })
    }
  }
}

async function confirmMatch({ supabase, job, report, row, playerId, userId }: any) {
  if (job.type === 'roster') {
    // Roster: update prior_team and jersey number on the player record
    await supabase
      .from('tryout_players')
      .update({
        prior_team:    row.teamName ?? null,
        ...(row.jerseyNumber ? { jersey_number: row.jerseyNumber } : {}),
      })
      .eq('id', playerId)

    // Create alias
    await supabase.from('tryout_player_aliases').insert({
      player_id:     playerId,
      raw_name:      row.rawName,
      source:        'roster',
      confidence:    row.confidence ?? 0.90,
      confirmed:     true,
      confirmed_by:  userId,
      confirmed_at:  new Date().toISOString(),
      import_job_id: job.id,
    })

    // Write roster staging
    if (job.season_id) {
      await supabase.from('tryout_roster_staging').upsert({
        player_id:     playerId,
        org_id:        job.org_id,
        season_id:     job.season_id,
        import_job_id: job.id,
        team_name:     row.teamName ?? null,
        jersey_number: row.jerseyNumber ?? null,
      }, { onConflict: 'player_id,season_id' })
    }
  } else if (job.type === 'gamechanger') {
    // Write GC stats and compute scores
    if (job.season_id) {
      await writeGcStatsForPlayer({ supabase, row, playerId, orgId: job.org_id, seasonId: job.season_id })
    }

    // Create alias
    await supabase.from('tryout_player_aliases').insert({
      player_id:     playerId,
      raw_name:      row.rawName,
      source:        'gamechanger',
      confidence:    row.confidence ?? 0.90,
      confirmed:     true,
      confirmed_by:  userId,
      confirmed_at:  new Date().toISOString(),
      import_job_id: job.id,
    })
  } else {
    // Registration: update player record with registration data
    const payload = row.createPayload
    if (payload) {
      // Fetch current record so we only overwrite blank name fields
      const { data: current } = await supabase
        .from('tryout_players')
        .select('first_name, last_name')
        .eq('id', playerId)
        .single()

      await supabase
        .from('tryout_players')
        .update({
          // Only fill name if blank on the canonical record (e.g. imported before BOM fix)
          ...(!current?.first_name && payload.firstName ? { first_name: payload.firstName } : {}),
          ...(!current?.last_name  && payload.lastName  ? { last_name:  payload.lastName }  : {}),
          ...(payload.ageGroup          ? { age_group: payload.ageGroup, tryout_age_group: payload.ageGroup } : {}),
          ...(payload.dob               ? { dob:                 payload.dob }               : {}),
          ...(payload.parentEmail       ? { parent_email:        payload.parentEmail }       : {}),
          ...(payload.parentPhone       ? { parent_phone:        payload.parentPhone }       : {}),
          ...(payload.guardianFirstName ? { guardian_first_name: payload.guardianFirstName } : {}),
          ...(payload.guardianLastName  ? { guardian_last_name:  payload.guardianLastName }  : {}),
          ...(payload.grade             ? { grade:               payload.grade }             : {}),
          ...(payload.school            ? { school:              payload.school }            : {}),
          ...(payload.priorOrg          ? { prior_org:           payload.priorOrg }          : {}),
          ...(payload.priorTeam         ? { prior_team:          payload.priorTeam }         : {}),
        })
        .eq('id', playerId)
    }

    // Create alias
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

    // Write registration staging
    if (job.type === 'registration' && job.season_id && payload) {
      await upsertRegStaging(supabase, {
        player_id:             playerId,
        org_id:                job.org_id,
        season_id:             job.season_id,
        import_job_id:         job.id,
        player_first_name:     payload.firstName,
        player_last_name:      payload.lastName,
        age_group:             payload.ageGroup,
        preferred_tryout_date: payload.preferredTryoutDate ?? null,
        prior_team:            payload.priorTeam,
        parent_email:          payload.parentEmail,
        parent_phone:          payload.parentPhone,
        guardian_first_name:   payload.guardianFirstName ?? null,
        guardian_last_name:    payload.guardianLastName ?? null,
        address:               payload.address ?? null,
        city:                  payload.city ?? null,
        state:                 payload.state ?? null,
        zip:                   payload.zip ?? null,
        dob:                   payload.dob,
        grade:                 payload.grade,
        school:                payload.school,
        prior_org:             payload.priorOrg,
        registration_date:     payload.registrationDate ?? null,
      })

      await autoAssignToSession({
        supabase, playerId, orgId: job.org_id, seasonId: job.season_id,
        ageGroup: payload.ageGroup ?? null,
        preferredTryoutDate: payload.preferredTryoutDate ?? null,
      })
    }
  }

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
  const payload = row.createPayload  // present for registration, absent for roster

  // Derive name fields — roster rows store the name directly on row, not in createPayload
  let firstName: string, lastName: string
  if (payload?.firstName) {
    firstName = payload.firstName
    lastName  = payload.lastName ?? ''
  } else {
    const parts = (row.rawName ?? '').trim().split(/\s+/)
    firstName = parts[0] ?? ''
    lastName  = parts.slice(1).join(' ')
  }

  const isRoster = job.type === 'roster'

  const { data: newPlayer, error } = await supabase
    .from('tryout_players')
    .insert({
      org_id:       job.org_id,
      first_name:   firstName,
      last_name:    lastName,
      dob:          payload?.dob ?? row.dob ?? null,
      age_group:    payload?.ageGroup ?? row.ageGroup ?? null,
      ...(isRoster ? {
        prior_team:    row.teamName ?? null,
        jersey_number: row.jerseyNumber ?? null,
      } : {
        parent_email:        payload?.parentEmail ?? null,
        parent_phone:        payload?.parentPhone ?? null,
        guardian_first_name: payload?.guardianFirstName ?? null,
        guardian_last_name:  payload?.guardianLastName ?? null,
        grade:               payload?.grade ?? null,
        school:              payload?.school ?? null,
        prior_org:           payload?.priorOrg ?? null,
        prior_team:          payload?.priorTeam ?? null,
        tryout_age_group:    payload?.ageGroup ?? null,
      }),
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
    source:        isRoster ? 'roster' : 'registration',
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

  if (isRoster && job.season_id) {
    await supabase.from('tryout_roster_staging').upsert({
      player_id:     newPlayer.id,
      org_id:        job.org_id,
      season_id:     job.season_id,
      import_job_id: job.id,
      team_name:     row.teamName ?? null,
      jersey_number: row.jerseyNumber ?? null,
    }, { onConflict: 'player_id,season_id' })
  }

  if (!isRoster && job.season_id && payload) {
    await upsertRegStaging(supabase, {
      player_id:             newPlayer.id,
      org_id:                job.org_id,
      season_id:             job.season_id,
      import_job_id:         job.id,
      player_first_name:     payload.firstName,
      player_last_name:      payload.lastName,
      age_group:             payload.ageGroup,
      preferred_tryout_date: payload.preferredTryoutDate ?? null,
      prior_team:            payload.priorTeam,
      parent_email:          payload.parentEmail,
      parent_phone:          payload.parentPhone,
      guardian_first_name:   payload.guardianFirstName ?? null,
      guardian_last_name:    payload.guardianLastName ?? null,
      address:               payload.address ?? null,
      city:                  payload.city ?? null,
      state:                 payload.state ?? null,
      zip:                   payload.zip ?? null,
      dob:                   payload.dob,
      grade:                 payload.grade,
      school:                payload.school,
      prior_org:             payload.priorOrg,
      registration_date:     payload.registrationDate ?? null,
    })

    await autoAssignToSession({
      supabase, playerId: newPlayer.id, orgId: job.org_id, seasonId: job.season_id,
      ageGroup: payload.ageGroup ?? null,
      preferredTryoutDate: payload.preferredTryoutDate ?? null,
    })
  }

  await updateJobReport({ supabase, jobId: job.id, report: updatedReport, userId, orgId: job.org_id, action: `Created new player: ${firstName} ${lastName}` })

  return NextResponse.json({ ok: true, playerId: newPlayer.id })
}

async function confirmAllSuggested({ supabase, job, report, userId }: any) {
  const suggested = (report as any[]).filter((r: any) => r.status === 'suggested')
  const results: Array<{ rowIndex: number; playerId: string }> = []
  const isRoster = job.type === 'roster'

  for (const row of suggested) {
    const topCandidate = row.candidates?.[0]
    if (!topCandidate) continue

    const aliasSource = isRoster ? 'roster' : job.type === 'gamechanger' ? 'gamechanger' : 'registration'
    await supabase.from('tryout_player_aliases').insert({
      player_id:     topCandidate.id,
      raw_name:      row.rawName,
      source:        aliasSource,
      confidence:    topCandidate.confidence,
      confirmed:     true,
      confirmed_by:  userId,
      confirmed_at:  new Date().toISOString(),
      import_job_id: job.id,
    })

    if (job.type === 'gamechanger' && job.season_id) {
      await writeGcStatsForPlayer({ supabase, row, playerId: topCandidate.id, orgId: job.org_id, seasonId: job.season_id })
    } else if (isRoster) {
      // Update player record
      await supabase.from('tryout_players').update({
        prior_team:    row.teamName ?? null,
        ...(row.jerseyNumber ? { jersey_number: row.jerseyNumber } : {}),
      }).eq('id', topCandidate.id)

      // Write roster staging
      if (job.season_id) {
        await supabase.from('tryout_roster_staging').upsert({
          player_id:     topCandidate.id,
          org_id:        job.org_id,
          season_id:     job.season_id,
          import_job_id: job.id,
          team_name:     row.teamName ?? null,
          jersey_number: row.jerseyNumber ?? null,
        }, { onConflict: 'player_id,season_id' })
      }
    } else if (job.type === 'registration' && job.season_id && row.createPayload) {
      const payload = row.createPayload
      // Update player record — refresh age_group, fill blank names if needed
      const { data: current } = await supabase
        .from('tryout_players').select('first_name, last_name').eq('id', topCandidate.id).single()
      await supabase.from('tryout_players').update({
        ...(payload.ageGroup ? { age_group: payload.ageGroup, tryout_age_group: payload.ageGroup } : {}),
        ...(!current?.first_name && payload.firstName ? { first_name: payload.firstName } : {}),
        ...(!current?.last_name  && payload.lastName  ? { last_name:  payload.lastName }  : {}),
      }).eq('id', topCandidate.id)
      // Write registration staging
      await upsertRegStaging(supabase, {
        player_id:             topCandidate.id,
        org_id:                job.org_id,
        season_id:             job.season_id,
        import_job_id:         job.id,
        player_first_name:     payload.firstName,
        player_last_name:      payload.lastName,
        age_group:             payload.ageGroup,
        preferred_tryout_date: payload.preferredTryoutDate ?? null,
        prior_team:            payload.priorTeam,
        parent_email:          payload.parentEmail,
        parent_phone:          payload.parentPhone,
        guardian_first_name:   payload.guardianFirstName ?? null,
        guardian_last_name:    payload.guardianLastName ?? null,
        address:               payload.address ?? null,
        city:                  payload.city ?? null,
        state:                 payload.state ?? null,
        zip:                   payload.zip ?? null,
        dob:                   payload.dob,
        grade:                 payload.grade,
        school:                payload.school,
        prior_org:             payload.priorOrg,
        registration_date:     payload.registrationDate ?? null,
      })

      await autoAssignToSession({
        supabase, playerId: topCandidate.id, orgId: job.org_id, seasonId: job.season_id,
        ageGroup: payload.ageGroup ?? null,
        preferredTryoutDate: payload.preferredTryoutDate ?? null,
      })
    }

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

async function unmatchRow({ supabase, job, report, row, userId }: any) {
  const topCandidate = (row.candidates ?? [])[0] ?? null
  const resetStatus  = topCandidate ? 'suggested' : 'unresolved'
  const updatedReport = report.map((r: any) =>
    r.rowIndex === row.rowIndex
      ? {
          ...r,
          status:           resetStatus,
          resolvedPlayerId: null,
          confidence:       topCandidate?.confidence ?? null,
          matchReason:      topCandidate?.reason     ?? null,
        }
      : r
  )
  await updateJobReport({ supabase, jobId: job.id, report: updatedReport, userId, orgId: job.org_id, action: `Unmatched row: ${row.rawName}` })
  return NextResponse.json({ ok: true, status: resetStatus })
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

/**
 * If a player has a preferred tryout date and a matching session exists
 * (same org, season, age_group, session_date), pre-assign them to it.
 * Uses upsert so re-running is idempotent. arrived=false means not yet on site.
 */
async function autoAssignToSession({
  supabase, playerId, orgId, seasonId, ageGroup, preferredTryoutDate,
}: {
  supabase: any; playerId: string; orgId: string; seasonId: string
  ageGroup: string | null; preferredTryoutDate: string | null
}) {
  if (!preferredTryoutDate || !ageGroup || !seasonId) return

  const { data: session } = await supabase
    .from('tryout_sessions')
    .select('id, season_id, age_group')
    .eq('org_id', orgId)
    .eq('season_id', seasonId)
    .eq('age_group', ageGroup)
    .eq('session_date', preferredTryoutDate)
    .maybeSingle()

  if (!session) return   // no matching session — nothing to assign

  // Pre-assign: arrived=false, tryout_number=null (assigned at check-in time)
  await supabase.from('tryout_checkins').upsert({
    session_id:    session.id,
    season_id:     session.season_id,
    age_group:     session.age_group,
    player_id:     playerId,
    tryout_number: null,
    arrived:       false,
    is_write_in:   false,
  }, { onConflict: 'session_id,player_id' })
}

async function createAllNew({ supabase, job, report, userId }: any) {
  const pending = (report as any[]).filter((r: any) =>
    r.status === 'unresolved' || r.status === 'suggested' || r.status === 'new'
  )

  const results: Array<{ rowIndex: number; playerId: string }> = []

  for (const row of pending) {
    const payload = row.createPayload
    let firstName: string, lastName: string
    if (payload?.firstName) {
      firstName = payload.firstName
      lastName  = payload.lastName ?? ''
    } else {
      const parts = (row.rawName ?? '').trim().split(/\s+/)
      firstName = parts[0] ?? ''
      lastName  = parts.slice(1).join(' ')
    }

    const { data: newPlayer, error } = await supabase
      .from('tryout_players')
      .insert({
        org_id:              job.org_id,
        first_name:          firstName,
        last_name:           lastName,
        dob:                 payload?.dob ?? row.dob ?? null,
        age_group:           payload?.ageGroup ?? row.ageGroup ?? null,
        tryout_age_group:    payload?.ageGroup ?? row.ageGroup ?? null,
        prior_team:          row.teamName ?? payload?.priorTeam ?? null,
        jersey_number:       row.jerseyNumber ?? null,
        parent_email:        payload?.parentEmail ?? null,
        parent_phone:        payload?.parentPhone ?? null,
        guardian_first_name: payload?.guardianFirstName ?? null,
        guardian_last_name:  payload?.guardianLastName ?? null,
        grade:               payload?.grade ?? null,
        school:              payload?.school ?? null,
        prior_org:           payload?.priorOrg ?? null,
      })
      .select('id')
      .single()

    if (error || !newPlayer) continue

    await supabase.from('tryout_player_aliases').insert({
      player_id:     newPlayer.id,
      raw_name:      row.rawName,
      source:        job.type === 'roster' ? 'roster' : 'registration',
      confidence:    1.0,
      confirmed:     true,
      confirmed_by:  userId,
      confirmed_at:  new Date().toISOString(),
      import_job_id: job.id,
    })

    if (job.type === 'roster' && job.season_id) {
      await supabase.from('tryout_roster_staging').upsert({
        player_id:     newPlayer.id,
        org_id:        job.org_id,
        season_id:     job.season_id,
        import_job_id: job.id,
        team_name:     row.teamName ?? null,
        jersey_number: row.jerseyNumber ?? null,
      }, { onConflict: 'player_id,season_id' })
    }

    results.push({ rowIndex: row.rowIndex, playerId: newPlayer.id })
  }

  const resolvedIndexes = new Set(results.map(r => r.rowIndex))
  const updatedReport = (report as any[]).map((r: any) => {
    if (!resolvedIndexes.has(r.rowIndex)) return r
    const match = results.find(res => res.rowIndex === r.rowIndex)!
    return { ...r, status: 'auto', resolvedPlayerId: match.playerId, matchReason: 'bulk created as new player' }
  })

  await updateJobReport({
    supabase, jobId: job.id, report: updatedReport, userId, orgId: job.org_id,
    action: `Bulk created ${results.length} new players`,
  })

  return NextResponse.json({ ok: true, created: results.length })
}

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
