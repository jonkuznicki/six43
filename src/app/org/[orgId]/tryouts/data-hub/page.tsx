'use client'

import React, { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'
import { StatusPill, type StatusTone } from '../../../../../components/ui/StatusPill'
import PlayerCard, { type PlayerRegistrationDetail } from '../rankings/PlayerCard'
import {
  averagePresent,
  computeCoachEvalScore,
  computeIntangiblesScore,
  computeCombinedScore,
  denseRank,
  selectActiveSeasonCoachEvals,
  selectActiveSeasonEvalConfig,
  DEFAULT_SEASON_WEIGHTS,
  type SeasonWeights,
} from '../../../../../lib/tryouts/scoring/combinedScore'

// ── Types ─────────────────────────────────────────────────────────────────────

// prior_team is deliberately NOT here — tryout_players.prior_team is a
// legacy field no longer treated as current-season data. Current-season
// "Prior Team" comes from priorTeamMap (tryout_prior_roster_context) below.
interface Player {
  id: string; first_name: string; last_name: string
  age_group: string; tryout_age_group: string | null
  jersey_number: string | null
  dob: string | null; age_group_override_reason: string | null
  parent_email: string | null; parent_phone: string | null
  grade: string | null; school: string | null; prior_org: string | null
}
interface RegRow {
  player_id: string; prior_team: string | null; age_group: string | null
  parent_email: string | null; parent_phone: string | null
  imported_at: string; dob: string | null; preferred_tryout_date: string | null
  grade: string | null; school: string | null; prior_org: string | null
  guardian_first_name: string | null; guardian_last_name: string | null
  address: string | null; city: string | null; state: string | null; zip: string | null
  registration_date: string | null
  player_first_name: string | null; player_last_name: string | null
}
interface RosterRow { player_id: string; team_name: string | null; jersey_number: string | null; imported_at: string }
interface GcRow  {
  player_id: string; season_year: string; team_label: string|null
  games_played: number|null
  avg: number|null; obp: number|null; slg: number|null; ops: number|null
  h: number|null; doubles: number|null; triples: number|null; hr: number|null
  rbi: number|null; r: number|null; bb: number|null; so: number|null
  sb: number|null; hbp: number|null; sac: number|null; tb: number|null
  k: number|null; bb_allowed: number|null
  era: number|null; whip: number|null; ip: number|null
  w: number|null; sv: number|null; k_bb: number|null; strike_pct: number|null
  gc_computed_score: number|null
  bf: number|null; baa: number|null; bb_per_inn: number|null
  gc_hitting_score:  number|null
  gc_pitching_score: number|null
}
interface EvalField { season_id: string | null; field_key: string; label: string; section: string; sort_order: number; weight: number }
interface EvalRow   { player_id: string; season_id: string | null; season_year: string; computed_score: number|null; scores: Record<string,number>|null; coach_name: string|null; team_label: string|null; comments: string|null }
interface ScoreRow  { player_id: string; tryout_score: number|null; evaluator_name: string|null; session_id: string }
interface TeamRow   { id: string; name: string; age_group: string; color: string | null }

type DataFilter = 'all' | 'complete' | 'missing_reg' | 'missing_roster' | 'missing_tryout' | 'missing_eval' | 'missing_gc'

// Registration, Roster, GC Stats, Coach Evals, and Tryout Scores used to be
// their own tabs. They're now column groups + filters on Master and the
// player detail panel instead — see the Phase 2 cleanup summary. Age Check
// stays a dedicated tab: it's a data-fixing workflow (inline age-group
// correction), not a viewing mode.
type Tab = 'master' | 'age'

const TABS: { key: Tab; label: string }[] = [
  { key: 'master', label: 'Master' },
  { key: 'age',    label: 'Age Check' },
]

// ── Baseball age helpers ──────────────────────────────────────────────────────

/** Age as of May 1 of the given season year. */
function calcBaseballAge(dob: string, seasonYear: number): number {
  const cutoff = new Date(seasonYear, 4, 1) // May 1 (month 0-indexed)
  const birth  = new Date(dob)
  let age = cutoff.getFullYear() - birth.getFullYear()
  const dm = cutoff.getMonth() - birth.getMonth()
  if (dm < 0 || (dm === 0 && cutoff.getDate() < birth.getDate())) age--
  return age
}

/** Parse "10U" → 10, "11u" → 11 */
function ageGroupMax(ag: string | null): number | null {
  if (!ag) return null
  const m = ag.match(/(\d+)/)
  return m ? parseInt(m[1]) : null
}

type AgeStatus = 'correct' | 'playing_up' | 'overage' | 'no_dob' | 'no_group'

function calcAgeStatus(dob: string | null, tryoutAgeGroup: string | null, seasonYear: number | null): AgeStatus {
  if (!dob)        return 'no_dob'
  if (!seasonYear) return 'no_group'
  const ba  = calcBaseballAge(dob, seasonYear)
  const max = ageGroupMax(tryoutAgeGroup)
  if (max == null) return 'no_group'
  if (ba === max)  return 'correct'
  if (ba < max)    return 'playing_up'
  return 'overage'
}

const STATUS_LABEL: Record<AgeStatus, string> = {
  correct:    '✓ Correct',
  playing_up: '↑ Playing Up',
  overage:    '⚠ Overage',
  no_dob:     '? No DOB',
  no_group:   '? No Group',
}
const STATUS_TONE: Record<AgeStatus, StatusTone> = {
  correct:    'good',
  playing_up: 'warn',
  overage:    'bad',
  no_dob:     'neutral',
  no_group:   'neutral',
}

function nextAgeGroup(ag: string | null) {
  if (!ag) return '?U'
  const m = ag.match(/^(\d+)u$/i)
  return m ? `${parseInt(m[1], 10) + 1}u` : ag
}

function scoreColor(v: number | null): string {
  if (v == null) return 'transparent'
  if (v >= 4.5) return 'rgba(109,184,117,0.45)'
  if (v >= 3.5) return 'rgba(109,184,117,0.2)'
  if (v >= 2.5) return 'rgba(80,160,232,0.18)'
  if (v >= 1.5) return 'rgba(232,140,40,0.2)'
  return 'rgba(232,80,80,0.22)'
}

function fmt(v: number | null, dec = 2) { return v != null ? v.toFixed(dec) : '—' }

// ── Component ─────────────────────────────────────────────────────────────────

export default function DataHubPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()

  // Core data (always loaded)
  const [players,       setPlayers]       = useState<Player[]>([])
  const [regMap,        setRegMap]        = useState<Map<string, RegRow>>(new Map())
  const [rosterMap,     setRosterMap]     = useState<Map<string, RosterRow>>(new Map())
  const [gcRows,        setGcRows]        = useState<GcRow[]>([])
  const [evalRows,      setEvalRows]      = useState<EvalRow[]>([])
  const [evalConfig,    setEvalConfig]    = useState<EvalField[]>([])
  const [scoreRows,     setScoreRows]     = useState<ScoreRow[]>([])
  const [teams,         setTeams]         = useState<TeamRow[]>([])
  const [assignedTeamMap, setAssignedTeamMap] = useState<Map<string, string>>(new Map()) // player_id → team name
  // "Previous team" for the active season — seeded explicitly from a
  // completed prior season's final roster (Seasons page). The single
  // source of truth for current-season Prior Team everywhere, replacing
  // the legacy tryout_players.prior_team field (see season-rollover work).
  const [priorTeamMap, setPriorTeamMap] = useState<Map<string, string | null>>(new Map())
  const [acceptedMap,   setAcceptedMap]   = useState<Map<string, boolean>>(new Map())
  const [seasonWeights, setSeasonWeights] = useState<SeasonWeights>(DEFAULT_SEASON_WEIGHTS)
  const [seasonId,      setSeasonId]      = useState<string | null>(null)
  const [seasonYear,    setSeasonYear]    = useState<number | null>(null)
  const [seasonAgeGroups, setSeasonAgeGroups] = useState<string[]>([])
  const [loading,       setLoading]       = useState(true)

  // Player detail panel
  const [panelPlayerId, setPanelPlayerId] = useState<string | null>(null)

  // UI state
  const [tab,           setTab]           = useState<Tab>('master')
  const [search,        setSearch]        = useState('')
  const [ageFilter,     setAgeFilter]     = useState('all')
  const [dataFilter,    setDataFilter]    = useState<DataFilter>('all')
  const [showRegDetail, setShowRegDetail] = useState(false)
  const [sortCol,       setSortCol]       = useState('name')
  const [sortDir,       setSortDir]       = useState<1 | -1>(1)
  const [autoFilling,   setAutoFilling]   = useState(false)

  // Inline edit (master tab)
  const [editingCell,   setEditingCell]   = useState<string | null>(null)
  const [editVal,       setEditVal]       = useState('')
  const [savingCell,    setSavingCell]    = useState<string | null>(null)
  const [savedCell,     setSavedCell]     = useState<string | null>(null)
  const [localUpdates,  setLocalUpdates]  = useState<Map<string, Partial<Player>>>(new Map())
  const inputRef = useRef<HTMLInputElement>(null)

  // Age Check tab state
  const [ageStatusFilter, setAgeStatusFilter] = useState<AgeStatus | 'all'>('all')
  const [fixingId,    setFixingId]    = useState<string | null>(null)
  const [fixGroup,    setFixGroup]    = useState('')
  const [fixReason,   setFixReason]   = useState('')
  const [savingFix,   setSavingFix]   = useState(false)

  // Staging backfill
  const [backfilling,   setBackfilling]   = useState(false)
  const [backfillDone,  setBackfillDone]  = useState(false)
  const [backfillError, setBackfillError] = useState('')

  // Age Check sort state
  const [ageSortCol,    setAgeSortCol]    = useState('name')
  const [ageSortDir,    setAgeSortDir]    = useState<1 | -1>(1)

  useEffect(() => { loadData() }, [])
  useEffect(() => { if (editingCell && inputRef.current) inputRef.current.focus() }, [editingCell])

  async function loadData() {
    const { data: seasonData } = await supabase
      .from('tryout_seasons')
      .select('id,year,age_groups,tryout_weight,coach_eval_weight,intangibles_weight,prior_stats_weight')
      .eq('org_id', params.orgId).eq('is_active', true).maybeSingle()
    const sid   = seasonData?.id   ?? null
    const syear = seasonData?.year ?? null
    setSeasonId(sid)
    setSeasonYear(syear)
    setSeasonAgeGroups(seasonData?.age_groups ?? [])
    setSeasonWeights(seasonData ? {
      tryoutWeight:      seasonData.tryout_weight,
      coachEvalWeight:   seasonData.coach_eval_weight,
      intangiblesWeight: seasonData.intangibles_weight,
      priorStatsWeight:  seasonData.prior_stats_weight,
    } : DEFAULT_SEASON_WEIGHTS)

    // Get session IDs for the active season so we can filter tryout_scores
    const sessionIds: string[] = []
    if (sid) {
      const { data: sessions } = await supabase.from('tryout_sessions').select('id').eq('season_id', sid)
      sessionIds.push(...(sessions ?? []).map((s: any) => s.id))
    }

    const [
      { data: playerData }, { data: rosterData },
      { data: gcData }, { data: evalData }, { data: evalCfgData }, { data: scoreData },
      { data: teamsData }, { data: priorContextData },
    ] = await Promise.all([
      supabase.from('tryout_players').select('id,first_name,last_name,age_group,tryout_age_group,jersey_number,dob,age_group_override_reason,parent_email,parent_phone,grade,school,prior_org').eq('org_id', params.orgId).eq('is_active', true).order('last_name').order('first_name'),
      sid
        ? supabase.from('tryout_roster_staging').select('player_id,team_name,jersey_number,imported_at').eq('season_id', sid)
        : Promise.resolve({ data: [] as any[] }),
      syear
        ? supabase.from('tryout_gc_stats').select('player_id,season_year,team_label,games_played,avg,obp,slg,ops,h,doubles,triples,hr,rbi,r,bb,so,sb,hbp,sac,tb,k,bb_allowed,era,whip,ip,w,sv,k_bb,strike_pct,gc_computed_score,bf,baa,bb_per_inn,gc_hitting_score,gc_pitching_score').eq('org_id', params.orgId).eq('season_year', String(syear - 1))
        : Promise.resolve({ data: [] as any[] }),
      // Season-scoped, not a [this year, last year] window — see
      // selectActiveSeasonCoachEvals in combinedScore.ts.
      sid
        ? supabase.from('tryout_coach_evals').select('player_id,season_id,season_year,computed_score,scores,coach_name,team_label,comments').eq('org_id', params.orgId).eq('season_id', sid).eq('status', 'submitted')
        : Promise.resolve({ data: [] as any[] }),
      sid
        ? supabase.from('tryout_coach_eval_config').select('season_id,field_key,label,section,sort_order,weight').eq('org_id', params.orgId).eq('season_id', sid).order('sort_order')
        : Promise.resolve({ data: [] as any[] }),
      sessionIds.length > 0
        ? supabase.from('tryout_scores').select('player_id,tryout_score,evaluator_name,session_id').in('session_id', sessionIds)
        : Promise.resolve({ data: [] as any[] }),
      sid
        ? supabase.from('tryout_teams').select('id,name,age_group,color').eq('season_id', sid)
        : Promise.resolve({ data: [] as any[] }),
      sid
        ? supabase.from('tryout_prior_roster_context').select('player_id,prior_team_name').eq('season_id', sid)
        : Promise.resolve({ data: [] as any[] }),
    ])

    // Registration staging — season-scoped
    let regData: any[] = []
    if (sid) {
      const { data } = await supabase
        .from('tryout_registration_staging')
        .select('player_id,prior_team,age_group,parent_email,parent_phone,imported_at,dob,preferred_tryout_date,grade,school,prior_org,guardian_first_name,guardian_last_name,address,city,state,zip,registration_date,player_first_name,player_last_name')
        .eq('season_id', sid)
      regData = data ?? []
    }

    // Team assignments — name + accepted flag, keyed by player
    let assignMap = new Map<string, string>()
    let acceptMap  = new Map<string, boolean>()
    const teamIds = (teamsData ?? []).map((t: any) => t.id as string)
    if (teamIds.length > 0) {
      const { data: assignData } = await supabase.from('tryout_team_assignments').select('player_id,team_id,is_accepted').in('team_id', teamIds)
      const nameById = new Map((teamsData ?? []).map((t: any) => [t.id, t.name as string]))
      for (const a of (assignData ?? [])) {
        assignMap.set(a.player_id, nameById.get(a.team_id) ?? '')
        acceptMap.set(a.player_id, !!a.is_accepted)
      }
    }

    setPlayers(playerData ?? [])
    setRegMap(new Map(regData.map((r: any) => [r.player_id, r])))
    setRosterMap(new Map((rosterData ?? []).map((r: any) => [r.player_id, r])))
    setGcRows(gcData ?? [])
    setEvalRows(evalData ?? [])
    setEvalConfig((evalCfgData ?? []).map((f: any) => ({ season_id: f.season_id, field_key: f.field_key, label: f.label, section: f.section, sort_order: f.sort_order, weight: f.weight ?? 1 })))
    setScoreRows(scoreData ?? [])
    setTeams(teamsData ?? [])
    setAssignedTeamMap(assignMap)
    setAcceptedMap(acceptMap)
    setPriorTeamMap(new Map((priorContextData ?? []).map((r: any) => [r.player_id, r.prior_team_name])))
    setLoading(false)
  }

  async function backfillStaging() {
    if (!seasonId) { setBackfillError('No active season — create one first.'); return }
    setBackfilling(true)
    setBackfillError('')

    // Load all completed registration import jobs, oldest first so newest wins dedup
    const { data: jobs } = await supabase
      .from('tryout_import_jobs')
      .select('id,season_id,match_report,created_at')
      .eq('org_id', params.orgId)
      .eq('type', 'registration')
      .in('status', ['complete', 'needs_review'])
      .order('created_at', { ascending: true })

    if (!jobs?.length) { setBackfillError('No registration import jobs found.'); setBackfilling(false); return }

    const stagingRows: any[] = []
    for (const job of jobs) {
      const report: any[] = job.match_report ?? []
      for (const row of report) {
        if (!row.resolvedPlayerId) continue
        if (row.status === 'skipped') continue
        const p = row.createPayload ?? {}
        stagingRows.push({
          player_id:             row.resolvedPlayerId,
          org_id:                params.orgId,
          season_id:             seasonId,
          import_job_id:         job.id,
          player_first_name:     p.firstName || null,
          player_last_name:      p.lastName || null,
          age_group:             p.ageGroup ?? row.ageGroup ?? null,
          preferred_tryout_date: p.preferredTryoutDate ?? null,
          prior_team:            p.priorTeam ?? null,
          parent_email:          p.parentEmail ?? null,
          parent_phone:          p.parentPhone ?? null,
          guardian_first_name:   p.guardianFirstName ?? null,
          guardian_last_name:    p.guardianLastName ?? null,
          address:               p.address ?? null,
          city:                  p.city ?? null,
          state:                 p.state ?? null,
          zip:                   p.zip ?? null,
          dob:                   p.dob ?? null,
          grade:                 p.grade ?? null,
          school:                p.school ?? null,
          prior_org:             p.priorOrg ?? null,
          registration_date:     p.registrationDate ?? null,
          imported_at:           job.created_at,
        })
      }
    }

    if (!stagingRows.length) { setBackfillError('No matched players found in import jobs.'); setBackfilling(false); return }

    // Deduplicate by player_id — oldest job first means newest job's entry wins in Map
    const deduped = Array.from(
      stagingRows.reduce((m, r) => { m.set(r.player_id, r); return m }, new Map<string, any>()).values()
    )

    const { error } = await supabase
      .from('tryout_registration_staging')
      .upsert(deduped, { onConflict: 'player_id,season_id' })

    if (error) { setBackfillError(error.message); setBackfilling(false); return }

    // Also repair blank first_name on tryout_players using the same import data
    const nameRepairs = deduped.filter((r: any) => r.player_first_name)
    await Promise.all(nameRepairs.map(async (r: any) => {
      const { data: p } = await supabase
        .from('tryout_players').select('first_name').eq('id', r.player_id).single()
      if (p && !p.first_name) {
        await supabase.from('tryout_players').update({
          first_name: r.player_first_name,
          ...(r.player_last_name ? { last_name: r.player_last_name } : {}),
        }).eq('id', r.player_id)
      }
    }))

    setBackfilling(false)
    setBackfillDone(true)
    await loadData()
  }

  // ── Master: inline edit ───────────────────────────────────────────────────

  function pv(p: Player, field: keyof Player): string | null {
    const loc = localUpdates.get(p.id)
    if (loc && field in loc) return (loc as any)[field] ?? null
    return (p as any)[field] ?? null
  }

  function startEdit(pid: string, field: string, val: string) {
    setEditingCell(`${pid}_${field}`)
    setEditVal(val)
  }

  async function commitEdit(pid: string, field: string) {
    const key = `${pid}_${field}`
    if (savingCell === key) return
    setSavingCell(key); setEditingCell(null)
    const col: Record<string, string> = { tryout_ag: 'tryout_age_group' }
    const dbCol = col[field]
    if (!dbCol) { setSavingCell(null); return }
    let val = editVal.trim() || null
    if (dbCol === 'tryout_age_group' && val) val = val.replace(/u$/i, 'U')
    await supabase.from('tryout_players').update({ [dbCol]: val }).eq('id', pid)
    setLocalUpdates(prev => { const m = new Map(prev); m.set(pid, { ...(m.get(pid) ?? {}), [dbCol as keyof Player]: val }); return m })
    setSavingCell(null); setSavedCell(key)
    setTimeout(() => setSavedCell(c => c === key ? null : c), 1500)
  }

  async function saveFix(pid: string) {
    setSavingFix(true)
    const normalizedGroup = (fixGroup || '').replace(/u$/i, 'U') || null
    const updates = { tryout_age_group: normalizedGroup, age_group_override_reason: fixReason.trim() || null }
    await supabase.from('tryout_players').update(updates).eq('id', pid)
    setPlayers(prev => prev.map(p => p.id === pid ? { ...p, ...updates } : p))
    setLocalUpdates(prev => { const m = new Map(prev); m.set(pid, { ...(m.get(pid) ?? {}), ...updates }); return m })
    setSavingFix(false)
    setFixingId(null)
  }

  function openFix(p: Player) {
    const dob = p.dob ?? regMap.get(p.id)?.dob ?? null
    setFixingId(p.id)
    setFixGroup(p.tryout_age_group ?? (dob && seasonYear ? `${calcBaseballAge(dob, seasonYear)}U` : ''))
    setFixReason(p.age_group_override_reason ?? '')
  }

  async function autoFillTryoutAgeGroups() {
    setAutoFilling(true)
    const toFill = players.filter(p => !pv(p, 'tryout_age_group') && p.age_group)
    await Promise.all(toFill.map(p => supabase.from('tryout_players').update({ tryout_age_group: nextAgeGroup(p.age_group) }).eq('id', p.id)))
    setLocalUpdates(prev => { const m = new Map(prev); toFill.forEach(p => m.set(p.id, { ...(m.get(p.id) ?? {}), tryout_age_group: nextAgeGroup(p.age_group) })); return m })
    setAutoFilling(false)
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const ageGroups = useMemo(() =>
    Array.from(new Set(players.map(p => p.age_group).filter(Boolean)))
      .sort((a, b) => { const n = (s: string) => parseInt(s) || 99; return n(a) - n(b) }),
    [players]
  )

  // ── Per-player scoring (shared with Rankings — see lib/tryouts/scoring/combinedScore.ts) ──

  const gcMap = useMemo(() => new Map(gcRows.map(r => [r.player_id, r])), [gcRows])
  // Constrained to the active season only — see selectActiveSeasonCoachEvals
  // in combinedScore.ts. A player with no eval for THIS season has none,
  // never a prior season's.
  const evalMap = useMemo(
    () => seasonId ? selectActiveSeasonCoachEvals(evalRows, seasonId) : new Map<string, EvalRow>(),
    [evalRows, seasonId]
  )
  const scopedEvalConfig = useMemo(
    () => seasonId ? selectActiveSeasonEvalConfig(evalConfig, seasonId) : [],
    [evalConfig, seasonId]
  )
  const scoreAvgMap = useMemo(() => {
    const byPlayer = new Map<string, number[]>()
    for (const r of scoreRows) {
      if (r.tryout_score == null) continue
      if (!byPlayer.has(r.player_id)) byPlayer.set(r.player_id, [])
      byPlayer.get(r.player_id)!.push(r.tryout_score)
    }
    const out = new Map<string, { avg: number | null; count: number }>()
    for (const [pid, vals] of Array.from(byPlayer)) out.set(pid, { avg: averagePresent(vals), count: vals.length })
    return out
  }, [scoreRows])

  interface ScoredPlayer {
    tryoutScore: number | null
    coachEvalScore: number | null
    intangibles: number | null
    gcHitting: number | null
    gcPitching: number | null
    combinedScore: number | null
    combinedRank: number | null
  }

  const scoredMap = useMemo(() => {
    const base = new Map<string, Omit<ScoredPlayer, 'combinedRank'>>()
    for (const p of players) {
      const tryoutScore = scoreAvgMap.get(p.id)?.avg ?? null
      const evalRow = evalMap.get(p.id) ?? null
      const coachEvalScore = computeCoachEvalScore(evalRow?.scores ?? null, scopedEvalConfig)
      const intangibles = computeIntangiblesScore(evalRow?.scores ?? null, scopedEvalConfig)
      const gcRow = gcMap.get(p.id) ?? null
      const gcHitting = gcRow?.gc_hitting_score ?? null
      const gcPitching = gcRow?.gc_pitching_score ?? null
      const priorStatScore = averagePresent([gcHitting, gcPitching])
      const combinedScore = computeCombinedScore(
        { tryoutScore, coachEvalScore, intangiblesScore: intangibles, priorStatScore },
        seasonWeights,
      )
      base.set(p.id, { tryoutScore, coachEvalScore, intangibles, gcHitting, gcPitching, combinedScore })
    }

    // Rank within age group (tryout age group takes priority, matching Age Check)
    const byAge = new Map<string, string[]>()
    for (const p of players) {
      const ag = (p.tryout_age_group ?? p.age_group ?? '?U').toUpperCase()
      if (!byAge.has(ag)) byAge.set(ag, [])
      byAge.get(ag)!.push(p.id)
    }
    const rankMap = new Map<string, number>()
    for (const ids of Array.from(byAge.values())) {
      denseRank(ids.map(id => ({ id, v: base.get(id)?.combinedScore ?? null }))).forEach((v, k) => rankMap.set(k, v))
    }

    const out = new Map<string, ScoredPlayer>()
    for (const [id, v] of Array.from(base)) out.set(id, { ...v, combinedRank: rankMap.get(id) ?? null })
    return out
  }, [players, scoreAvgMap, evalMap, scopedEvalConfig, gcMap, seasonWeights])

  interface DataStatus { count: number; reg: boolean; roster: boolean; score: boolean; eval: boolean; gc: boolean }

  function dataStatus(p: Player): DataStatus {
    const reg    = regMap.has(p.id)
    const roster = rosterMap.has(p.id)
    const score  = scoreAvgMap.has(p.id)
    const eval_  = evalMap.has(p.id)
    const gc     = gcMap.has(p.id)
    return { count: [reg, roster, score, eval_, gc].filter(Boolean).length, reg, roster, score, eval: eval_, gc }
  }

  const filtered = useMemo(() => {
    let list = players
    if (ageFilter !== 'all') list = list.filter(p => p.age_group === ageFilter)
    if (dataFilter !== 'all') {
      list = list.filter(p => {
        const ds = dataStatus(p)
        switch (dataFilter) {
          case 'complete':       return ds.count === 5
          case 'missing_reg':    return !ds.reg
          case 'missing_roster': return !ds.roster
          case 'missing_tryout': return !ds.score
          case 'missing_eval':   return !ds.eval
          case 'missing_gc':     return !ds.gc
          default:                return true
        }
      })
    }
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => {
        const reg = regMap.get(p.id)
        return (
          `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
          (priorTeamMap.get(p.id) ?? '').toLowerCase().includes(q) ||
          (pv(p, 'tryout_age_group') ?? '').toLowerCase().includes(q) ||
          (p.age_group ?? '').toLowerCase().includes(q) ||
          (p.school ?? '').toLowerCase().includes(q) ||
          (p.prior_org ?? '').toLowerCase().includes(q) ||
          (p.parent_email ?? '').toLowerCase().includes(q) ||
          (p.parent_phone ?? '').toLowerCase().includes(q) ||
          (p.grade ?? '').toLowerCase().includes(q) ||
          (reg?.school ?? '').toLowerCase().includes(q) ||
          (reg?.prior_org ?? '').toLowerCase().includes(q) ||
          (reg?.parent_email ?? '').toLowerCase().includes(q) ||
          (reg?.parent_phone ?? '').toLowerCase().includes(q) ||
          (reg?.grade ?? '').toLowerCase().includes(q) ||
          (assignedTeamMap.get(p.id) ?? '').toLowerCase().includes(q)
        )
      })
    }
    return [...list].sort((a, b) => {
      let va = '', vb = ''
      if (sortCol === 'name')      { va = `${a.last_name}${a.first_name}`; vb = `${b.last_name}${b.first_name}` }
      if (sortCol === 'tryout_ag') { va = pv(a, 'tryout_age_group') ?? ''; vb = pv(b, 'tryout_age_group') ?? '' }
      if (sortCol === 'age')       {
        const da = a.dob ?? regMap.get(a.id)?.dob ?? null
        const db2 = b.dob ?? regMap.get(b.id)?.dob ?? null
        return ((da && seasonYear ? calcBaseballAge(da, seasonYear) : 0) - (db2 && seasonYear ? calcBaseballAge(db2, seasonYear) : 0)) * sortDir
      }
      if (sortCol === 'assigned')   { va = assignedTeamMap.get(a.id) ?? ''; vb = assignedTeamMap.get(b.id) ?? '' }
      if (sortCol === 'grade')     { va = regMap.get(a.id)?.grade ?? a.grade ?? ''; vb = regMap.get(b.id)?.grade ?? b.grade ?? '' }
      if (sortCol === 'email')     { va = regMap.get(a.id)?.parent_email ?? a.parent_email ?? ''; vb = regMap.get(b.id)?.parent_email ?? b.parent_email ?? '' }
      if (sortCol === 'phone')     { va = regMap.get(a.id)?.parent_phone ?? a.parent_phone ?? ''; vb = regMap.get(b.id)?.parent_phone ?? b.parent_phone ?? '' }
      const numericCols: Record<string, (id: string) => number | null> = {
        data:         id => dataStatus(players.find(p => p.id === id)!).count,
        tryoutScore:  id => scoredMap.get(id)?.tryoutScore ?? null,
        coachEval:    id => scoredMap.get(id)?.coachEvalScore ?? null,
        gcBat:        id => scoredMap.get(id)?.gcHitting ?? null,
        gcPit:        id => scoredMap.get(id)?.gcPitching ?? null,
        combined:     id => scoredMap.get(id)?.combinedScore ?? null,
        rank:         id => scoredMap.get(id)?.combinedRank ?? null,
        accepted:     id => (acceptedMap.get(id) ? 1 : 0),
      }
      if (numericCols[sortCol]) {
        const na = numericCols[sortCol](a.id) ?? -Infinity
        const nb = numericCols[sortCol](b.id) ?? -Infinity
        return (na - nb) * sortDir
      }
      return va.localeCompare(vb) * sortDir
    })
  }, [players, ageFilter, dataFilter, search, sortCol, sortDir, localUpdates, regMap, rosterMap, scoreAvgMap, evalMap, gcMap, scoredMap, acceptedMap, priorTeamMap])

  const ageAlerts = useMemo(() =>
    players.filter(p => {
      const dob = p.dob ?? regMap.get(p.id)?.dob ?? null
      const s = calcAgeStatus(dob, p.tryout_age_group, seasonYear)
      return s === 'overage' || s === 'no_dob'
    }).length,
    [players, regMap, seasonYear]
  )

  const dataFilterCounts = useMemo(() => {
    const counts: Record<DataFilter, number> = {
      all: players.length, complete: 0,
      missing_reg: 0, missing_roster: 0, missing_tryout: 0, missing_eval: 0, missing_gc: 0,
    }
    for (const p of players) {
      const ds = dataStatus(p)
      if (ds.count === 5) counts.complete++
      if (!ds.reg)    counts.missing_reg++
      if (!ds.roster) counts.missing_roster++
      if (!ds.score)  counts.missing_tryout++
      if (!ds.eval)   counts.missing_eval++
      if (!ds.gc)     counts.missing_gc++
    }
    return counts
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, regMap, rosterMap, scoreAvgMap, evalMap, gcMap])

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 1 ? -1 : 1)
    else { setSortCol(col); setSortDir(1) }
  }

  function sortArrow(col: string) {
    if (sortCol !== col) return <span style={{ opacity: 0.2 }}> ↕</span>
    return <span style={{ color: 'var(--accent)' }}>{sortDir === 1 ? ' ↑' : ' ↓'}</span>
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const s = { muted: `rgba(var(--fg-rgb),0.55)` as const, dim: `rgba(var(--fg-rgb),0.35)` as const }

  const th: React.CSSProperties = {
    textAlign: 'left', padding: '6px 10px', fontSize: '11px', fontWeight: 700,
    color: s.dim, textTransform: 'uppercase', letterSpacing: '0.06em',
    background: 'var(--bg)', borderBottom: '0.5px solid var(--border)',
    whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
    position: 'sticky', top: 0, zIndex: 2,
  }
  // Sticky left column helpers
  const stickyPlayerTh: React.CSSProperties = {
    position: 'sticky', left: 0, zIndex: 3, background: 'var(--bg)',
    boxShadow: '2px 0 4px rgba(var(--fg-rgb),0.06)',
  }
  const stickyPlayerTd: React.CSSProperties = {
    position: 'sticky', left: 0, zIndex: 1, background: 'var(--bg)',
    boxShadow: '2px 0 4px rgba(var(--fg-rgb),0.06)',
  }
  const td: React.CSSProperties = {
    padding: '7px 10px', borderBottom: '0.5px solid rgba(var(--fg-rgb),0.05)', verticalAlign: 'middle',
  }

  const editInput: React.CSSProperties = {
    background: 'var(--bg-input)', border: '1px solid var(--accent)',
    borderRadius: '4px', padding: '3px 7px', fontSize: '13px', color: 'var(--fg)', outline: 'none',
  }

  if (loading) return <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>

  // ── Render ────────────────────────────────────────────────────────────────

  const dataFilterChips: { key: DataFilter; label: string }[] = [
    { key: 'all',            label: 'All' },
    { key: 'complete',       label: '5/5 Complete' },
    { key: 'missing_reg',    label: 'Missing Registration' },
    { key: 'missing_roster', label: 'Missing Roster' },
    { key: 'missing_tryout', label: 'Missing Tryout Score' },
    { key: 'missing_eval',   label: 'Missing Coach Eval' },
    { key: 'missing_gc',     label: 'Missing GC Stats' },
  ]

  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 4rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '2px' }}>Data Hub</h1>
          <p style={{ fontSize: '13px', color: s.muted, margin: 0 }}>One row per player · data quality and analysis · {players.length} players</p>
        </div>
        {tab === 'master' && (
          <button onClick={autoFillTryoutAgeGroups} disabled={autoFilling} style={{
            fontSize: '12px', fontWeight: 600, padding: '7px 14px', borderRadius: '6px',
            border: '0.5px solid var(--border-md)', background: 'var(--bg-card)', color: s.muted,
            cursor: autoFilling ? 'default' : 'pointer', opacity: autoFilling ? 0.6 : 1,
          }}>{autoFilling ? 'Filling…' : 'Auto-fill tryout AGs'}</button>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '2px', marginBottom: '1.25rem', borderBottom: '0.5px solid var(--border)', paddingBottom: '0' }}>
        {TABS.map(t => {
          const counts: Record<Tab, number> = { master: players.length, age: ageAlerts }
          const active = tab === t.key
          return (
            <button key={t.key} onClick={() => setTab(t.key)} style={{
              padding: '8px 16px', fontSize: '13px', fontWeight: active ? 700 : 400,
              border: 'none', background: 'none', cursor: 'pointer',
              color: active ? 'var(--fg)' : s.muted,
              borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
              marginBottom: '-0.5px',
            }}>
              {t.label}
              <span style={{
                marginLeft: '6px', fontSize: '11px', fontWeight: 400,
                color: t.key === 'age' && counts[t.key] > 0 ? 'var(--status-bad)' : s.dim,
              }}>
                {counts[t.key]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Search + Age filter — shared across tabs */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: tab === 'master' ? '0.6rem' : '1rem', alignItems: 'center' }}>
        <div style={{ position: 'relative' }}>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Name, team, school, email, org…"
            style={{ background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '7px 30px 7px 12px', fontSize: '13px', color: 'var(--fg)', width: '260px' }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{
              position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px',
              color: `rgba(var(--fg-rgb),0.35)`, padding: '0', lineHeight: 1,
            }}>×</button>
          )}
        </div>
        {['all', ...ageGroups].map(ag => (
          <button key={ag} onClick={() => setAgeFilter(ag)} style={{
            padding: '5px 12px', borderRadius: '20px', border: '0.5px solid',
            borderColor: ageFilter === ag ? 'var(--accent)' : 'var(--border-md)',
            background: ageFilter === ag ? 'rgba(var(--accent-rgb),0.1)' : 'var(--bg-input)',
            color: ageFilter === ag ? 'var(--accent)' : s.muted,
            fontSize: '12px', fontWeight: ageFilter === ag ? 700 : 400, cursor: 'pointer',
          }}>{ag === 'all' ? 'All' : ag}</button>
        ))}
      </div>

      {/* ── Master tab ─────────────────────────────────────────────────────── */}
      {tab === 'master' && (
        <>
          {/* Data-completeness filter chips */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '0.6rem', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: s.dim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Data:</span>
            {dataFilterChips.map(c => (
              <button key={c.key} onClick={() => setDataFilter(c.key)} style={{
                padding: '4px 11px', borderRadius: '20px', border: '0.5px solid',
                borderColor: dataFilter === c.key ? 'var(--accent)' : 'var(--border-md)',
                background: dataFilter === c.key ? 'rgba(var(--accent-rgb),0.1)' : 'var(--bg-input)',
                color: dataFilter === c.key ? 'var(--accent)' : s.muted,
                fontSize: '12px', fontWeight: dataFilter === c.key ? 700 : 400, cursor: 'pointer',
              }}>{c.label} <span style={{ opacity: 0.6 }}>{dataFilterCounts[c.key]}</span></button>
            ))}
            <button onClick={() => setShowRegDetail(v => !v)} style={{
              marginLeft: 'auto', fontSize: '12px', fontWeight: 600, padding: '5px 12px',
              borderRadius: '6px', border: '0.5px solid var(--border-md)',
              background: showRegDetail ? 'rgba(var(--accent-rgb),0.1)' : 'var(--bg-input)',
              color: showRegDetail ? 'var(--accent)' : s.muted, cursor: 'pointer',
            }}>{showRegDetail ? '− Hide registration detail' : '+ Registration detail'}</button>
          </div>

          {seasonId && regMap.size === 0 && players.length > 0 && !backfillDone && (
            <div style={{ marginBottom: '10px', padding: '10px 14px', background: 'var(--status-warn-bg)', border: '0.5px solid var(--border-md)', borderRadius: '8px', fontSize: '12px', color: 'var(--status-warn)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <span style={{ flex: 1 }}>Registration was imported before a season was created — staging data is missing. Click to backfill from import history.</span>
              {backfillError && <span style={{ color: 'var(--status-bad)' }}>{backfillError}</span>}
              <button onClick={backfillStaging} disabled={backfilling} style={{
                padding: '5px 14px', borderRadius: '6px', border: 'none', cursor: backfilling ? 'default' : 'pointer',
                background: 'var(--status-warn-bg)', color: 'var(--status-warn)', fontWeight: 700, fontSize: '12px',
                opacity: backfilling ? 0.6 : 1, whiteSpace: 'nowrap',
              }}>{backfilling ? 'Fixing…' : 'Fix now'}</button>
            </div>
          )}

          <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr>
                  {([
                    { key: 'name',     label: 'Player',   sticky: true },
                    { key: 'data',     label: 'Data' },
                    { key: 'tryout_ag', label: 'Tryout AG' },
                    ...(showRegDetail ? ([
                      { key: 'grade',  label: 'Grade' },
                      { key: 'school', label: 'School' },
                      { key: 'email',  label: 'Parent Email' },
                      { key: 'phone',  label: 'Phone' },
                    ] as const) : []),
                    { key: 'tryoutScore', label: 'Tryout' },
                    { key: 'coachEval',   label: 'Coach Eval' },
                    { key: 'gcBat',       label: 'GC Bat' },
                    { key: 'gcPit',       label: 'GC Pitch' },
                    { key: 'combined',    label: 'Combined' },
                    { key: 'rank',        label: 'Rank' },
                    { key: 'assigned',    label: 'Assigned Team' },
                    { key: 'accepted',    label: 'Accepted' },
                  ] as { key: string | null; label: string; sticky?: boolean }[]).map((col, i) => (
                    <th key={i} style={{ ...th, cursor: col.key ? 'pointer' : 'default', ...(i === 0 ? stickyPlayerTh : {}) }}
                      onClick={() => col.key && toggleSort(col.key)}>
                      {col.label}{col.key ? sortArrow(col.key) : null}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p, i) => {
                  const reg = regMap.get(p.id); const ros = rosterMap.get(p.id)
                  const tag = pv(p, 'tryout_age_group')
                  const conflict = !!(reg?.prior_team && ros?.team_name && reg.prior_team.toLowerCase() !== ros.team_name.toLowerCase())
                  const rowBg = i % 2 === 0 ? 'transparent' : 'rgba(var(--fg-rgb),0.02)'
                  const assignedTeam = assignedTeamMap.get(p.id) ?? null
                  const accepted = acceptedMap.get(p.id) ?? false
                  const grade = reg?.grade ?? p.grade ?? null
                  const school = reg?.school ?? p.school ?? null
                  const email = reg?.parent_email ?? p.parent_email ?? null
                  const phone = reg?.parent_phone ?? p.parent_phone ?? null
                  const ds = dataStatus(p)
                  const scored = scoredMap.get(p.id)
                  const dsTitle = [
                    ds.reg    ? 'Registration ✓' : 'Registration ✗',
                    ds.roster ? 'Roster ✓'       : 'Roster ✗',
                    ds.score  ? 'Tryout Score ✓' : 'Tryout Score ✗',
                    ds.eval   ? 'Coach Eval ✓'   : 'Coach Eval ✗',
                    ds.gc     ? 'GC Stats ✓'     : 'GC Stats ✗',
                    conflict  ? '⚠ Registration/Roster team mismatch' : '',
                  ].filter(Boolean).join(' · ')

                  return (
                    <tr
                      key={p.id} style={{ background: rowBg, cursor: 'pointer' }}
                      onClick={() => setPanelPlayerId(p.id)}
                    >
                      <td style={{ ...td, ...stickyPlayerTd, fontWeight: 600, whiteSpace: 'nowrap' }}>{p.last_name}, {p.first_name}</td>

                      {/* Data Status */}
                      <td style={td} title={dsTitle} onClick={e => e.stopPropagation()}>
                        <span onClick={() => setPanelPlayerId(p.id)} style={{ cursor: 'pointer' }}>
                          <StatusPill tone={ds.count === 5 ? 'good' : ds.count === 0 ? 'bad' : 'warn'}>
                            {ds.count}/5{conflict ? ' ⚠' : ''}
                          </StatusPill>
                        </span>
                      </td>

                      {/* Tryout AG — editable */}
                      <td style={td} onClick={e => e.stopPropagation()}>
                        {editingCell === `${p.id}_tryout_ag` ? (
                          <input ref={inputRef} value={editVal} onChange={e => setEditVal(e.target.value)}
                            onBlur={() => commitEdit(p.id, 'tryout_ag')}
                            onKeyDown={e => { if (e.key==='Enter') commitEdit(p.id, 'tryout_ag'); if (e.key==='Escape') setEditingCell(null) }}
                            style={{ ...editInput, width: '64px' }} />
                        ) : (
                          <span onClick={() => startEdit(p.id, 'tryout_ag', tag ?? p.age_group)}
                            style={{ cursor: 'text', padding: '2px 5px', borderRadius: '3px', border: '0.5px solid transparent', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-md)')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>
                            {tag
                              ? <b>{tag}</b>
                              : <span style={{ opacity: 0.35, fontStyle: 'italic' }}>{nextAgeGroup(p.age_group)}?</span>
                            }
                            {savedCell === `${p.id}_tryout_ag` && <span style={{ color: 'var(--status-good)', fontSize: '11px' }}>✓</span>}
                          </span>
                        )}
                      </td>

                      {showRegDetail && (
                        <>
                          <td style={{ ...td, color: s.muted, fontSize: '12px' }}>{grade ?? <span style={{ opacity: 0.3 }}>—</span>}</td>
                          <td style={{ ...td, color: s.muted, fontSize: '12px', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{school ?? <span style={{ opacity: 0.3 }}>—</span>}</td>
                          <td style={{ ...td, color: s.muted, fontSize: '12px' }}>{email ?? <span style={{ opacity: 0.3 }}>—</span>}</td>
                          <td style={{ ...td, color: s.muted, fontSize: '12px', whiteSpace: 'nowrap' }}>{phone ?? <span style={{ opacity: 0.3 }}>—</span>}</td>
                        </>
                      )}

                      <td style={{ ...td, textAlign: 'right', fontWeight: 600, background: scoreColor(scored?.tryoutScore ?? null) }}>{fmt(scored?.tryoutScore ?? null)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600, background: scoreColor(scored?.coachEvalScore ?? null) }}>{fmt(scored?.coachEvalScore ?? null)}</td>
                      <td style={{ ...td, textAlign: 'right', color: s.muted }}>{fmt(scored?.gcHitting ?? null)}</td>
                      <td style={{ ...td, textAlign: 'right', color: s.muted }}>{fmt(scored?.gcPitching ?? null)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: scored?.combinedScore != null ? 'var(--accent)' : s.dim }}>{fmt(scored?.combinedScore ?? null)}</td>
                      <td style={{ ...td, textAlign: 'center', color: s.muted, fontSize: '12px' }}>{scored?.combinedRank ?? <span style={{ opacity: 0.3 }}>—</span>}</td>

                      <td style={{ ...td, fontSize: '12px', fontWeight: assignedTeam ? 600 : 400, color: assignedTeam ? 'var(--accent)' : s.dim }}>
                        {assignedTeam ?? <span style={{ opacity: 0.3 }}>—</span>}
                      </td>
                      <td style={td}>
                        {assignedTeam
                          ? <StatusPill tone={accepted ? 'good' : 'neutral'}>{accepted ? 'Yes' : 'Pending'}</StatusPill>
                          : <span style={{ opacity: 0.3 }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '13px' }}>No players match your filters.</div>}
          </div>
        </>
      )}

      {panelPlayerId && (() => {
        const p = players.find(pl => pl.id === panelPlayerId)
        if (!p) return null
        const scored = scoredMap.get(p.id)
        const reg = regMap.get(p.id)
        const ros = rosterMap.get(p.id)
        const gcRow = gcMap.get(p.id) ?? null
        const evalRow = evalMap.get(p.id) ?? null
        const ag = (p.tryout_age_group ?? p.age_group ?? '?U').toUpperCase()
        const totalInAge = players.filter(pl => (pl.tryout_age_group ?? pl.age_group ?? '?U').toUpperCase() === ag).length
        const ageGroupGcRows = gcRows.filter(g => {
          const owner = players.find(pl => pl.id === g.player_id)
          return owner && (owner.tryout_age_group ?? owner.age_group ?? '?U').toUpperCase() === ag
        })
        const registration: PlayerRegistrationDetail = {
          grade:            reg?.grade ?? p.grade ?? null,
          school:           reg?.school ?? p.school ?? null,
          priorOrg:         reg?.prior_org ?? p.prior_org ?? null,
          parentEmail:      reg?.parent_email ?? p.parent_email ?? null,
          parentPhone:      reg?.parent_phone ?? p.parent_phone ?? null,
          guardianName:     reg ? [reg.guardian_first_name, reg.guardian_last_name].filter(Boolean).join(' ') || null : null,
          address:          reg ? [reg.address, reg.city, reg.state, reg.zip].filter(Boolean).join(', ') || null : null,
          registrationDate: reg?.registration_date ?? null,
          preferredDate:    reg?.preferred_tryout_date ?? null,
          jerseyNumber:     ros?.jersey_number ?? p.jersey_number ?? null,
          rosterTeam:       ros?.team_name ?? null,
          registered:       !!reg,
        }
        return (
          <PlayerCard
            player={{
              player: { id: p.id, first_name: p.first_name, last_name: p.last_name, age_group: p.age_group, tryout_age_group: p.tryout_age_group, prior_team: priorTeamMap.get(p.id) ?? null, grade: p.grade },
              ageGroup: ag,
              tryoutScore: scored?.tryoutScore ?? null,
              tryoutPitching: null, tryoutHitting: null, speed: null,
              coachEval: scored?.coachEvalScore ?? null,
              intangibles: scored?.intangibles ?? null,
              teamPitching: null, teamHitting: null,
              coachComments: evalRow?.comments ?? null,
              gcHittingScore: scored?.gcHitting ?? null,
              gcPitchingScore: scored?.gcPitching ?? null,
              combinedScore: scored?.combinedScore ?? null,
              combinedRank: scored?.combinedRank ?? null,
              tryoutRank: null, coachRank: null, intangiblesRank: null,
              assignedTeamId: teams.find(t => t.name === assignedTeamMap.get(p.id) && t.age_group === (p.tryout_age_group ?? p.age_group))?.id ?? null,
              adminNotes: null,
            }}
            gcRow={gcRow}
            ageGroupGcRows={ageGroupGcRows}
            teams={teams}
            totalInAge={totalInAge}
            weights={seasonWeights}
            registration={registration}
            onClose={() => setPanelPlayerId(null)}
          />
        )
      })()}


      {/* ── Age Check tab ─────────────────────────────────────────────────── */}
      {tab === 'age' && (() => {
        if (!seasonYear) return (
          <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '13px' }}>
            No active season — set one up in <Link href={`/org/${params.orgId}/tryouts/seasons`} style={{ color: 'var(--accent)' }}>Seasons</Link> first.
          </div>
        )

        // Build per-player age check rows
        const ageRows = filtered.map(p => {
          const dob = p.dob ?? regMap.get(p.id)?.dob ?? null
          const ba  = dob ? calcBaseballAge(dob, seasonYear) : null
          const status = calcAgeStatus(dob, p.tryout_age_group, seasonYear)
          const correctGroup = ba != null
            ? (seasonAgeGroups.find(ag => ageGroupMax(ag) === ba) ?? `${ba}U`)
            : null
          return { p, dob, ba, status, correctGroup }
        }).filter(r => ageStatusFilter === 'all' || r.status === ageStatusFilter)

        const counts_by_status = {
          overage:    filtered.filter(p => { const d = p.dob ?? regMap.get(p.id)?.dob ?? null; return calcAgeStatus(d, p.tryout_age_group, seasonYear) === 'overage' }).length,
          playing_up: filtered.filter(p => { const d = p.dob ?? regMap.get(p.id)?.dob ?? null; return calcAgeStatus(d, p.tryout_age_group, seasonYear) === 'playing_up' }).length,
          correct:    filtered.filter(p => { const d = p.dob ?? regMap.get(p.id)?.dob ?? null; return calcAgeStatus(d, p.tryout_age_group, seasonYear) === 'correct' }).length,
          no_dob:     filtered.filter(p => { const d = p.dob ?? regMap.get(p.id)?.dob ?? null; return calcAgeStatus(d, p.tryout_age_group, seasonYear) === 'no_dob' }).length,
          no_group:   filtered.filter(p => { const d = p.dob ?? regMap.get(p.id)?.dob ?? null; return calcAgeStatus(d, p.tryout_age_group, seasonYear) === 'no_group' }).length,
        }

        function ageToggleSort(col: string) {
          if (ageSortCol === col) setAgeSortDir(d => d === 1 ? -1 : 1)
          else { setAgeSortCol(col); setAgeSortDir(1) }
        }
        function ageArrow(col: string) {
          if (ageSortCol !== col) return <span style={{ opacity: 0.2 }}> ↕</span>
          return <span style={{ color: 'var(--accent)' }}>{ageSortDir === 1 ? ' ↑' : ' ↓'}</span>
        }

        const sortedAgeRows = [...ageRows].sort((a, b) => {
          if (ageSortCol === 'name')    return ageSortDir * `${a.p.last_name}${a.p.first_name}`.localeCompare(`${b.p.last_name}${b.p.first_name}`)
          if (ageSortCol === 'age')     return ageSortDir * (a.p.age_group ?? '').localeCompare(b.p.age_group ?? '')
          if (ageSortCol === 'dob')     return ageSortDir * (a.dob ?? '').localeCompare(b.dob ?? '')
          if (ageSortCol === 'ba')      return ageSortDir * ((a.ba ?? -1) - (b.ba ?? -1))
          if (ageSortCol === 'correct') return ageSortDir * (a.correctGroup ?? '').localeCompare(b.correctGroup ?? '')
          if (ageSortCol === 'tryout')  return ageSortDir * (a.p.tryout_age_group ?? '').localeCompare(b.p.tryout_age_group ?? '')
          if (ageSortCol === 'status')  return ageSortDir * a.status.localeCompare(b.status)
          return 0
        })

        return (
          <div>
            {/* Stale year warning */}
            {seasonYear !== null && seasonYear <= new Date().getFullYear() && (
              <div style={{ background: 'var(--status-warn-bg)', border: '1px solid var(--status-warn)', borderRadius: '6px', padding: '10px 14px', marginBottom: '14px', fontSize: '12px', color: 'var(--status-warn)', lineHeight: 1.6 }}>
                <strong>Season year is {seasonYear}</strong> — today is {new Date().getFullYear()}. If you&apos;re running {new Date().getFullYear() + 1} tryouts, go to{' '}
                <Link href={`/org/${params.orgId}/tryouts/seasons`} style={{ color: 'var(--status-warn)', textDecoration: 'underline' }}>Seasons</Link>{' '}
                and update the year to {new Date().getFullYear() + 1}. Age calculations will be off by one year until you do.
              </div>
            )}

            {/* Explanation */}
            <div style={{ fontSize: '12px', color: s.muted, marginBottom: '14px', lineHeight: 1.6 }}>
              <strong>Baseball Age</strong> = age as of May 1, {seasonYear}. This should be the year of the season you are preparing for (e.g. 2027 for 2027 tryouts). If the numbers look off by one year, update the season year in <Link href={`/org/${params.orgId}/tryouts/seasons`} style={{ color: 'var(--accent)' }}>Seasons</Link>.
              {' '}Overage players must be moved to the correct group. Playing Up is allowed but flagged for review.
            </div>

            {/* Status filter chips + counts */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
              {([
                ['all',        'All',         players.length,              'rgba(var(--fg-rgb),0.1)',  'var(--fg)'  ],
                ['overage',    '⚠ Overage',   counts_by_status.overage,    'var(--status-bad-bg)',    'var(--status-bad)'    ],
                ['playing_up', '↑ Playing Up', counts_by_status.playing_up, 'var(--status-warn-bg)',   'var(--status-warn)'    ],
                ['no_dob',     '? No DOB',     counts_by_status.no_dob,     'rgba(var(--fg-rgb),0.08)', s.muted     ],
                ['correct',    '✓ Correct',    counts_by_status.correct,    'var(--status-good-bg)', 'var(--status-good)'    ],
              ] as const).map(([key, label, count, bg, color]) => (
                <button key={key} onClick={() => setAgeStatusFilter(key as AgeStatus | 'all')} style={{
                  padding: '5px 12px', borderRadius: '20px', cursor: 'pointer',
                  fontSize: '12px', fontWeight: ageStatusFilter === key ? 700 : 400,
                  background: ageStatusFilter === key ? bg : 'var(--bg-input)',
                  color: ageStatusFilter === key ? color : s.dim,
                  border: `0.5px solid ${ageStatusFilter === key ? color : 'var(--border-md)'}`,
                }}>
                  {label} <span style={{ opacity: 0.7 }}>{count}</span>
                </button>
              ))}
            </div>

            {/* Table */}
            <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 310px)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    {([
                      { key: 'name',    label: 'Player',         sticky: true },
                      { key: 'age',     label: 'Age Group' },
                      { key: 'dob',     label: 'DOB' },
                      { key: 'ba',      label: 'Baseball Age' },
                      { key: 'correct', label: 'Correct Group' },
                      { key: 'tryout',  label: 'Tryout Group' },
                      { key: 'status',  label: 'Status' },
                      { key: null,      label: 'Override Reason' },
                      { key: null,      label: '' },
                    ] as { key: string | null; label: string; sticky?: boolean }[]).map((col, i) => (
                      <th key={i} onClick={() => col.key && ageToggleSort(col.key)}
                        style={{ ...th, cursor: col.key ? 'pointer' : 'default', ...(col.sticky ? stickyPlayerTh : {}) }}>
                        {col.label}{col.key ? ageArrow(col.key) : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedAgeRows.map(({ p, dob, ba, status, correctGroup }, i) => {
                    const isFix = fixingId === p.id
                    const rowBg = i % 2 === 0 ? 'transparent' : 'rgba(var(--fg-rgb),0.02)'
                    const tagDisplay = p.tryout_age_group

                    return (
                      <React.Fragment key={p.id}>
                        <tr style={{ background: rowBg }}>
                          <td style={{ ...td, ...stickyPlayerTd, fontWeight: 600, whiteSpace: 'nowrap' }}>{p.last_name}, {p.first_name}</td>
                          <td style={{ ...td, color: s.muted }}>{p.age_group}</td>
                          <td style={{ ...td, color: s.muted, fontSize: '12px' }}>
                            {dob
                              ? new Date(dob + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : <span style={{ color: 'var(--status-bad)', fontStyle: 'italic' }}>missing</span>}
                          </td>
                          <td style={{ ...td, textAlign: 'center', fontWeight: 700, fontSize: '15px', color: ba != null ? 'var(--fg)' : s.dim }}>
                            {ba ?? '—'}
                          </td>
                          <td style={{ ...td, color: s.muted }}>
                            {correctGroup
                              ? <span style={{ fontWeight: 600 }}>{correctGroup}</span>
                              : <span style={{ opacity: 0.3 }}>—</span>}
                          </td>
                          <td style={td}>
                            {tagDisplay
                              ? <span style={{ fontWeight: 600 }}>{tagDisplay}</span>
                              : <span style={{ opacity: 0.3, fontStyle: 'italic' }}>not set</span>}
                          </td>
                          <td style={td}>
                            <StatusPill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusPill>
                          </td>
                          <td style={{ ...td, color: s.dim, fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.age_group_override_reason ?? <span style={{ opacity: 0.25 }}>—</span>}
                          </td>
                          <td style={td}>
                            <button onClick={() => isFix ? setFixingId(null) : openFix(p)} style={{
                              fontSize: '11px', padding: '4px 10px', borderRadius: '5px', cursor: 'pointer',
                              border: `0.5px solid ${isFix ? 'var(--accent)' : 'var(--border-md)'}`,
                              background: isFix ? 'rgba(var(--accent-rgb),0.1)' : 'var(--bg-input)',
                              color: isFix ? 'var(--accent)' : s.muted,
                              fontWeight: isFix ? 700 : 400,
                            }}>{isFix ? 'Cancel' : 'Adjust'}</button>
                          </td>
                        </tr>

                        {/* Inline fix panel */}
                        {isFix && (
                          <tr key={`${p.id}_fix`} style={{ background: 'rgba(var(--accent-rgb),0.04)' }}>
                            <td colSpan={9} style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--border)' }}>
                              <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                                <div>
                                  <label style={{ display: 'block', fontSize: '11px', color: s.dim, fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Tryout Age Group
                                  </label>
                                  <select value={fixGroup} onChange={e => setFixGroup(e.target.value)} style={{
                                    background: 'var(--bg-input)', border: '0.5px solid var(--border-md)',
                                    borderRadius: '6px', padding: '6px 10px', fontSize: '13px', color: 'var(--fg)',
                                    minWidth: '100px',
                                  }}>
                                    <option value="">— select —</option>
                                    {seasonAgeGroups.map(ag => (
                                      <option key={ag} value={ag}>{ag}
                                        {ba != null && ageGroupMax(ag) === ba ? ' ✓ correct' :
                                         ba != null && ageGroupMax(ag)! < ba  ? ' ⚠ overage' :
                                         ba != null                            ? ' ↑ playing up' : ''}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div style={{ flex: 1, minWidth: '240px' }}>
                                  <label style={{ display: 'block', fontSize: '11px', color: s.dim, fontWeight: 600, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    Reason for adjustment
                                  </label>
                                  <input
                                    type="text" value={fixReason} onChange={e => setFixReason(e.target.value)}
                                    placeholder={status === 'playing_up' ? 'e.g. Parent request, advanced ability' : status === 'overage' ? 'e.g. League waiver approved' : 'Optional note'}
                                    style={{ background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', color: 'var(--fg)', width: '100%', boxSizing: 'border-box' }}
                                  />
                                </div>
                                <button onClick={() => saveFix(p.id)} disabled={!fixGroup || savingFix} style={{
                                  padding: '7px 18px', borderRadius: '7px', border: 'none',
                                  background: fixGroup ? 'var(--accent)' : 'var(--bg-input)',
                                  color: fixGroup ? 'var(--accent-text)' : s.dim,
                                  fontSize: '13px', fontWeight: 700,
                                  cursor: fixGroup && !savingFix ? 'pointer' : 'default',
                                  opacity: savingFix ? 0.6 : 1,
                                }}>{savingFix ? 'Saving…' : 'Save'}</button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
              {sortedAgeRows.length === 0 && (
                <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '13px' }}>
                  {ageStatusFilter === 'all' ? 'No players found.' : `No players with status "${STATUS_LABEL[ageStatusFilter as AgeStatus]}".`}
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </main>
  )
}
