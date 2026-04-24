'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Player {
  id: string; first_name: string; last_name: string
  age_group: string; tryout_age_group: string | null
  prior_team: string | null; jersey_number: string | null
  dob: string | null; age_group_override_reason: string | null
  parent_email: string | null; parent_phone: string | null
  grade: string | null; school: string | null; prior_org: string | null
}
interface RegRow {
  player_id: string; prior_team: string | null; age_group: string | null
  parent_email: string | null; parent_phone: string | null
  imported_at: string; dob: string | null; preferred_tryout_date: string | null
  grade: string | null; school: string | null; prior_org: string | null
}
interface RosterRow { player_id: string; team_name: string | null; jersey_number: string | null; imported_at: string }
interface GcRow  {
  player_id: string; season_year: string; team_label: string|null
  games_played: number|null
  avg: number|null; obp: number|null; slg: number|null; ops: number|null
  h: number|null; doubles: number|null; triples: number|null; hr: number|null
  rbi: number|null; r: number|null; bb: number|null; so: number|null
  sb: number|null; hbp: number|null; sac: number|null; tb: number|null
  era: number|null; whip: number|null; ip: number|null
  w: number|null; sv: number|null; k_bb: number|null; strike_pct: number|null
  gc_computed_score: number|null
}
interface EvalField { field_key: string; label: string; section: string; sort_order: number; weight: number }
interface EvalRow   { player_id: string; computed_score: number|null; scores: Record<string,number>|null; coach_name: string|null; team_label: string|null; comments: string|null }
interface ScoreRow  { player_id: string; tryout_score: number|null; evaluator_name: string|null; session_id: string }

type Tab = 'master' | 'registration' | 'roster' | 'gc' | 'evals' | 'scores' | 'age'

const TABS: { key: Tab; label: string }[] = [
  { key: 'master',       label: 'Master' },
  { key: 'registration', label: 'Registration' },
  { key: 'roster',       label: 'Roster' },
  { key: 'gc',           label: 'GC Stats' },
  { key: 'evals',        label: 'Coach Evals' },
  { key: 'scores',       label: 'Tryout Scores' },
  { key: 'age',          label: 'Age Check' },
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
const STATUS_COLOR: Record<AgeStatus, string> = {
  correct:    'rgba(109,184,117,0.15)',
  playing_up: 'rgba(232,160,32,0.13)',
  overage:    'rgba(224,82,82,0.15)',
  no_dob:     'rgba(var(--fg-rgb),0.08)',
  no_group:   'rgba(var(--fg-rgb),0.08)',
}
const STATUS_TEXT: Record<AgeStatus, string> = {
  correct:    '#6DB875',
  playing_up: '#E8A020',
  overage:    '#e05252',
  no_dob:     'rgba(var(--fg-rgb),0.5)',
  no_group:   'rgba(var(--fg-rgb),0.5)',
}

function nextAgeGroup(ag: string) {
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
  const [gcIds,         setGcIds]         = useState<Set<string>>(new Set())
  const [evalIds,       setEvalIds]       = useState<Set<string>>(new Set())
  const [scoreIds,      setScoreIds]      = useState<Set<string>>(new Set())
  const [seasonId,      setSeasonId]      = useState<string | null>(null)
  const [seasonYear,    setSeasonYear]    = useState<number | null>(null)
  const [seasonAgeGroups, setSeasonAgeGroups] = useState<string[]>([])
  const [loading,       setLoading]       = useState(true)

  // GC tab state
  const [gcSortCol,     setGcSortCol]     = useState('name')
  const [gcSortDir,     setGcSortDir]     = useState<1 | -1>(1)
  const [gcTeamFilter,  setGcTeamFilter]  = useState<string[]>([])
  const [gcSelected,    setGcSelected]    = useState<string[]>([])

  // Lazy-loaded tab data
  const [gcFull,        setGcFull]        = useState<GcRow[]    | null>(null)
  const [evalFields,    setEvalFields]    = useState<EvalField[] | null>(null)
  const [evalFull,      setEvalFull]      = useState<EvalRow[]  | null>(null)
  const [scoresFull,    setScoresFull]    = useState<ScoreRow[] | null>(null)
  const [lazyLoading,   setLazyLoading]   = useState(false)

  // UI state
  const [tab,           setTab]           = useState<Tab>('master')
  const [search,        setSearch]        = useState('')
  const [ageFilter,     setAgeFilter]     = useState('all')
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

  // Per-tab sort state
  const [regSortCol,    setRegSortCol]    = useState('name')
  const [regSortDir,    setRegSortDir]    = useState<1 | -1>(1)
  const [rosterSortCol, setRosterSortCol] = useState('name')
  const [rosterSortDir, setRosterSortDir] = useState<1 | -1>(1)
  const [evalsSortCol,  setEvalsSortCol]  = useState('score')
  const [evalsSortDir,  setEvalsSortDir]  = useState<1 | -1>(-1)
  const [scoresSortCol, setScoresSortCol] = useState('avg')
  const [scoresSortDir, setScoresSortDir] = useState<1 | -1>(-1)
  const [ageSortCol,    setAgeSortCol]    = useState('name')
  const [ageSortDir,    setAgeSortDir]    = useState<1 | -1>(1)

  useEffect(() => { loadData() }, [])
  useEffect(() => { if (editingCell && inputRef.current) inputRef.current.focus() }, [editingCell])

  useEffect(() => {
    if (tab === 'gc'     && gcFull    === null) lazyLoad('gc')
    if (tab === 'evals'  && evalFull  === null) lazyLoad('evals')
    if (tab === 'scores' && scoresFull === null) lazyLoad('scores')
  }, [tab])

  async function loadData() {
    const { data: seasonData } = await supabase.from('tryout_seasons').select('id,year,age_groups').eq('org_id', params.orgId).eq('is_active', true).maybeSingle()
    const sid   = seasonData?.id   ?? null
    const syear = seasonData?.year ?? null
    setSeasonId(sid)
    setSeasonYear(syear)
    setSeasonAgeGroups(seasonData?.age_groups ?? [])

    // Get session IDs for the active season so we can filter tryout_scores
    const sessionIds: string[] = []
    if (sid) {
      const { data: sessions } = await supabase.from('tryout_sessions').select('id').eq('season_id', sid)
      sessionIds.push(...(sessions ?? []).map((s: any) => s.id))
    }

    const [
      { data: playerData }, { data: rosterData },
      { data: gcData }, { data: evalData }, { data: scoreData },
    ] = await Promise.all([
      supabase.from('tryout_players').select('id,first_name,last_name,age_group,tryout_age_group,prior_team,jersey_number,dob,age_group_override_reason,parent_email,parent_phone,grade,school,prior_org').eq('org_id', params.orgId).eq('is_active', true).order('last_name').order('first_name'),
      sid
        ? supabase.from('tryout_roster_staging').select('player_id,team_name,jersey_number,imported_at').eq('season_id', sid)
        : Promise.resolve({ data: [] as any[] }),
      syear
        ? supabase.from('tryout_gc_stats').select('player_id').eq('org_id', params.orgId).eq('season_year', String(syear))
        : Promise.resolve({ data: [] as any[] }),
      sid
        ? supabase.from('tryout_coach_evals').select('player_id').eq('org_id', params.orgId).eq('season_id', sid).eq('status', 'submitted')
        : Promise.resolve({ data: [] as any[] }),
      sessionIds.length > 0
        ? supabase.from('tryout_scores').select('player_id').in('session_id', sessionIds)
        : Promise.resolve({ data: [] as any[] }),
    ])

    // Registration staging — season-scoped
    let regData: any[] = []
    if (sid) {
      const { data, error } = await supabase
        .from('tryout_registration_staging')
        .select('player_id,prior_team,age_group,parent_email,parent_phone,imported_at,dob,preferred_tryout_date,grade,school,prior_org')
        .eq('season_id', sid)
      if (!error) {
        regData = data ?? []
      } else {
        const { data: fallback } = await supabase
          .from('tryout_registration_staging')
          .select('player_id,prior_team,age_group,parent_email,parent_phone,imported_at,dob,grade,school,prior_org')
          .eq('season_id', sid)
        regData = fallback ?? []
      }
    }

    setPlayers(playerData ?? [])
    setRegMap(new Map(regData.map((r: any) => [r.player_id, r])))
    setRosterMap(new Map((rosterData ?? []).map((r: any) => [r.player_id, r])))
    setGcIds(new Set((gcData ?? []).map((r: any) => r.player_id)))
    setEvalIds(new Set((evalData ?? []).map((r: any) => r.player_id)))
    setScoreIds(new Set((scoreData ?? []).map((r: any) => r.player_id)))
    setLoading(false)
  }

  async function backfillStaging() {
    if (!seasonId) { setBackfillError('No active season — create one first.'); return }
    setBackfilling(true)
    setBackfillError('')

    // Load all completed registration import jobs for this org
    const { data: jobs } = await supabase
      .from('tryout_import_jobs')
      .select('id,season_id,match_report,created_at')
      .eq('org_id', params.orgId)
      .eq('type', 'registration')
      .in('status', ['complete', 'needs_review'])

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
          age_group:             p.ageGroup ?? row.ageGroup ?? null,
          preferred_tryout_date: p.preferredTryoutDate ?? null,
          prior_team:            p.priorTeam ?? null,
          parent_email:          p.parentEmail ?? null,
          parent_phone:          p.parentPhone ?? null,
          dob:                   p.dob ?? null,
          grade:                 p.grade ?? null,
          school:                p.school ?? null,
          prior_org:             p.priorOrg ?? null,
          imported_at:           job.created_at,
        })
      }
    }

    if (!stagingRows.length) { setBackfillError('No matched players found in import jobs.'); setBackfilling(false); return }

    // Deduplicate by player_id — keep last entry (jobs are ordered by created_at desc)
    const deduped = Array.from(
      stagingRows.reduce((m, r) => { m.set(r.player_id, r); return m }, new Map<string, any>()).values()
    )

    const { error } = await supabase
      .from('tryout_registration_staging')
      .upsert(deduped, { onConflict: 'player_id,season_id' })

    if (error) {
      // Retry without preferred_tryout_date if column doesn't exist yet
      const fallback = (deduped as any[]).map(({ preferred_tryout_date: _d, ...r }) => r)
      const { error: e2 } = await supabase
        .from('tryout_registration_staging')
        .upsert(fallback, { onConflict: 'player_id,season_id' })
      if (e2) { setBackfillError(e2.message); setBackfilling(false); return }
    }

    setBackfilling(false)
    setBackfillDone(true)
    await loadData()
  }

  async function lazyLoad(target: 'gc' | 'evals' | 'scores', sid = seasonId, syear = seasonYear) {
    setLazyLoading(true)
    if (target === 'gc') {
      const q = supabase
        .from('tryout_gc_stats')
        .select('player_id,season_year,team_label,games_played,avg,obp,slg,ops,h,doubles,triples,hr,rbi,r,bb,so,sb,hbp,sac,tb,era,whip,ip,w,sv,k_bb,strike_pct,gc_computed_score')
        .eq('org_id', params.orgId)
      const { data } = syear ? await q.eq('season_year', String(syear)) : await q
      setGcFull(data ?? [])
    }
    if (target === 'evals') {
      const evalQ = supabase.from('tryout_coach_evals').select('player_id,computed_score,scores,coach_name,team_label,comments').eq('org_id', params.orgId).eq('status', 'submitted')
      const cfgQ  = supabase.from('tryout_coach_eval_config').select('field_key,label,section,sort_order,weight').eq('org_id', params.orgId).order('sort_order')
      const [{ data: fields }, { data: evals }] = await Promise.all([
        sid ? cfgQ.eq('season_id', sid) : cfgQ,
        sid ? evalQ.eq('season_id', sid) : evalQ,
      ])
      setEvalFields((fields ?? []).map((f: any) => ({ field_key: f.field_key, label: f.label, section: f.section, sort_order: f.sort_order, weight: f.weight ?? 1 })))
      setEvalFull(evals ?? [])
    }
    if (target === 'scores') {
      if (!sid) { setScoresFull([]); setLazyLoading(false); return }
      const { data: sessions } = await supabase.from('tryout_sessions').select('id').eq('season_id', sid)
      const sids = (sessions ?? []).map((s: any) => s.id)
      const { data } = sids.length > 0
        ? await supabase.from('tryout_scores').select('player_id,tryout_score,evaluator_name,session_id').in('session_id', sids)
        : { data: [] as any[] }
      setScoresFull(data ?? [])
    }
    setLazyLoading(false)
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
    const col: Record<string, string> = { team: 'prior_team', tryout_ag: 'tryout_age_group', jersey: 'jersey_number' }
    const dbCol = col[field]
    if (!dbCol) { setSavingCell(null); return }
    await supabase.from('tryout_players').update({ [dbCol]: editVal.trim() || null }).eq('id', pid)
    setLocalUpdates(prev => { const m = new Map(prev); m.set(pid, { ...(m.get(pid) ?? {}), [dbCol as keyof Player]: editVal.trim() || null }); return m })
    setSavingCell(null); setSavedCell(key)
    setTimeout(() => setSavedCell(c => c === key ? null : c), 1500)
  }

  async function saveFix(pid: string) {
    setSavingFix(true)
    const updates = { tryout_age_group: fixGroup || null, age_group_override_reason: fixReason.trim() || null }
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

  const filtered = useMemo(() => {
    let list = players
    if (ageFilter !== 'all') list = list.filter(p => p.age_group === ageFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => {
        const reg = regMap.get(p.id)
        return (
          `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
          (pv(p, 'prior_team') ?? '').toLowerCase().includes(q) ||
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
          (reg?.grade ?? '').toLowerCase().includes(q)
        )
      })
    }
    return [...list].sort((a, b) => {
      let va = '', vb = ''
      if (sortCol === 'name')      { va = `${a.last_name}${a.first_name}`; vb = `${b.last_name}${b.first_name}` }
      if (sortCol === 'team')      { va = pv(a, 'prior_team') ?? ''; vb = pv(b, 'prior_team') ?? '' }
      if (sortCol === 'tryout_ag') { va = pv(a, 'tryout_age_group') ?? ''; vb = pv(b, 'tryout_age_group') ?? '' }
      if (sortCol === 'age')       { va = a.age_group; vb = b.age_group }
      return va.localeCompare(vb) * sortDir
    })
  }, [players, ageFilter, search, sortCol, sortDir, localUpdates, regMap])

  const ageAlerts = useMemo(() =>
    players.filter(p => {
      const dob = p.dob ?? regMap.get(p.id)?.dob ?? null
      const s = calcAgeStatus(dob, p.tryout_age_group, seasonYear)
      return s === 'overage' || s === 'no_dob'
    }).length,
    [players, regMap, seasonYear]
  )

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

  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 4rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '2px' }}>Data Hub</h1>
          <p style={{ fontSize: '13px', color: s.muted, margin: 0 }}>Review all imported data by source · {players.length} players</p>
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
          const counts: Record<Tab, number> = {
            master: players.length,
            registration: regMap.size > 0 ? regMap.size : players.length,
            roster: rosterMap.size,
            gc: gcIds.size,
            evals: evalIds.size,
            scores: scoreIds.size,
            age: ageAlerts,
          }
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
                color: t.key === 'age' && counts[t.key] > 0 ? '#e05252' : s.dim,
              }}>
                {counts[t.key]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Search + Age filter — shared across tabs */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
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
            background: ageFilter === ag ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
            color: ageFilter === ag ? 'var(--accent)' : s.muted,
            fontSize: '12px', fontWeight: ageFilter === ag ? 700 : 400, cursor: 'pointer',
          }}>{ag === 'all' ? 'All' : ag}</button>
        ))}
      </div>

      {lazyLoading && (
        <div style={{ padding: '2rem', textAlign: 'center', color: s.dim, fontSize: '13px' }}>Loading…</div>
      )}

      {/* ── Master tab ─────────────────────────────────────────────────────── */}
      {!lazyLoading && tab === 'master' && (
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr>
                {[
                  { key: 'name',      label: 'Player' },
                  { key: 'age',       label: 'Age' },
                  { key: 'tryout_ag', label: 'Tryout AG' },
                  { key: 'team',      label: 'Current Team' },
                  { key: null,        label: 'Reg Team' },
                  { key: null,        label: 'Roster Team' },
                  { key: 'jersey',    label: 'Jersey' },
                  { key: null,        label: 'Data' },
                ].map((col, i) => (
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
                const team = pv(p, 'prior_team'); const tag = pv(p, 'tryout_age_group'); const jer = pv(p, 'jersey_number')
                const conflict = !!(reg?.prior_team && ros?.team_name && reg.prior_team.toLowerCase() !== ros.team_name.toLowerCase())
                const rowBg = i % 2 === 0 ? 'transparent' : 'rgba(var(--fg-rgb),0.02)'

                return (
                  <tr key={p.id} style={{ background: rowBg }}>
                    <td style={{ ...td, ...stickyPlayerTd, fontWeight: 600, whiteSpace: 'nowrap' }}>{p.last_name}, {p.first_name}</td>
                    <td style={{ ...td, color: s.muted }}>{p.age_group}</td>

                    {/* Tryout AG — editable */}
                    <td style={td}>
                      {editingCell === `${p.id}_tryout_ag` ? (
                        <input ref={inputRef} value={editVal} onChange={e => setEditVal(e.target.value)}
                          onBlur={() => commitEdit(p.id, 'tryout_ag')}
                          onKeyDown={e => { if (e.key==='Enter') commitEdit(p.id, 'tryout_ag'); if (e.key==='Escape') setEditingCell(null) }}
                          style={{ ...editInput, width: '64px' }} />
                      ) : (
                        <span onClick={() => startEdit(p.id, 'tryout_ag', tag ?? nextAgeGroup(p.age_group))}
                          style={{ cursor: 'text', padding: '2px 5px', borderRadius: '3px', border: '0.5px solid transparent', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-md)')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>
                          {tag
                            ? <b>{tag}</b>
                            : <span style={{ opacity: 0.35, fontStyle: 'italic' }}>{nextAgeGroup(p.age_group)}?</span>
                          }
                          {savedCell === `${p.id}_tryout_ag` && <span style={{ color: '#6DB875', fontSize: '11px' }}>✓</span>}
                        </span>
                      )}
                    </td>

                    {/* Current Team — editable */}
                    <td style={td}>
                      {editingCell === `${p.id}_team` ? (
                        <input ref={inputRef} value={editVal} onChange={e => setEditVal(e.target.value)}
                          onBlur={() => commitEdit(p.id, 'team')}
                          onKeyDown={e => { if (e.key==='Enter') commitEdit(p.id, 'team'); if (e.key==='Escape') setEditingCell(null) }}
                          style={{ ...editInput, width: '140px' }} />
                      ) : (
                        <span onClick={() => startEdit(p.id, 'team', team ?? '')}
                          style={{ cursor: 'text', padding: '2px 5px', borderRadius: '3px', border: `0.5px solid ${conflict ? 'rgba(232,160,32,0.5)' : 'transparent'}`, background: conflict ? 'rgba(232,160,32,0.07)' : 'transparent', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = conflict ? 'rgba(232,160,32,0.7)' : 'var(--border-md)')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = conflict ? 'rgba(232,160,32,0.5)' : 'transparent')}>
                          {conflict && <span style={{ fontSize: '11px', color: '#E8A020' }}>⚠</span>}
                          {team ? <span style={{ fontWeight: 600 }}>{team}</span> : <span style={{ opacity: 0.3, fontStyle: 'italic' }}>—</span>}
                          {savedCell === `${p.id}_team` && <span style={{ color: '#6DB875', fontSize: '11px' }}>✓</span>}
                        </span>
                      )}
                    </td>

                    <td style={{ ...td, color: reg?.prior_team ? '#80B0E8' : s.dim, fontSize: '12px' }}>
                      {reg?.prior_team ?? <span style={{ opacity: 0.3 }}>—</span>}
                    </td>
                    <td style={{ ...td, color: ros?.team_name ? '#6DB875' : s.dim, fontSize: '12px' }}>
                      {ros?.team_name ?? <span style={{ opacity: 0.3 }}>—</span>}
                    </td>

                    {/* Jersey — editable */}
                    <td style={td}>
                      {editingCell === `${p.id}_jersey` ? (
                        <input ref={inputRef} value={editVal} onChange={e => setEditVal(e.target.value)}
                          onBlur={() => commitEdit(p.id, 'jersey')}
                          onKeyDown={e => { if (e.key==='Enter') commitEdit(p.id, 'jersey'); if (e.key==='Escape') setEditingCell(null) }}
                          style={{ ...editInput, width: '52px' }} />
                      ) : (
                        <span onClick={() => startEdit(p.id, 'jersey', jer ?? '')}
                          style={{ cursor: 'text', padding: '2px 5px', borderRadius: '3px', border: '0.5px solid transparent', display: 'inline-flex', alignItems: 'center' }}
                          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-md)')}
                          onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>
                          {jer ?? <span style={{ opacity: 0.3 }}>—</span>}
                          {savedCell === `${p.id}_jersey` && <span style={{ color: '#6DB875', fontSize: '11px', marginLeft: '4px' }}>✓</span>}
                        </span>
                      )}
                    </td>

                    {/* Data dots */}
                    <td style={td}>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        {[
                          { has: !!reg,                  color: '#80B0E8', title: 'Registration' },
                          { has: !!ros,                  color: '#6DB875', title: 'Roster' },
                          { has: gcIds.has(p.id),        color: '#E8A020', title: 'GC Stats' },
                          { has: evalIds.has(p.id),      color: '#C084FC', title: 'Coach Eval' },
                          { has: scoreIds.has(p.id),     color: '#F472B6', title: 'Tryout Score' },
                        ].map(({ has, color, title }) => (
                          <span key={title} title={title} style={{ width: 8, height: 8, borderRadius: '50%', background: has ? color : 'rgba(var(--fg-rgb),0.1)', flexShrink: 0 }} />
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {filtered.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '13px' }}>No players match your filters.</div>}
        </div>
      )}

      {/* ── Registration tab ──────────────────────────────────────────────── */}
      {!lazyLoading && tab === 'registration' && (() => {
        const rows = filtered.map(p => ({ p, reg: regMap.get(p.id) ?? null }))
        const hasAnyReg = rows.some(r => r.reg)

        function regVal(p: Player, reg: RegRow | null, col: string): string {
          switch (col) {
            case 'name':     return `${p.last_name} ${p.first_name}`
            case 'age':      return reg?.age_group ?? p.age_group ?? ''
            case 'dob':      return reg?.dob ?? p.dob ?? ''
            case 'grade':    return reg?.grade ?? p.grade ?? ''
            case 'school':   return reg?.school ?? p.school ?? ''
            case 'prior_org': return reg?.prior_org ?? p.prior_org ?? ''
            case 'team':     return reg?.prior_team ?? p.prior_team ?? ''
            case 'email':    return reg?.parent_email ?? p.parent_email ?? ''
            case 'phone':    return reg?.parent_phone ?? p.parent_phone ?? ''
            case 'pref_date': return reg?.preferred_tryout_date ?? ''
            case 'imported': return reg?.imported_at ?? ''
            default:         return ''
          }
        }

        const sorted = [...rows].sort((a, b) => {
          const va = regVal(a.p, a.reg, regSortCol)
          const vb = regVal(b.p, b.reg, regSortCol)
          return va.localeCompare(vb) * regSortDir
        })

        function regToggleSort(col: string) {
          if (regSortCol === col) setRegSortDir(d => d === 1 ? -1 : 1)
          else { setRegSortCol(col); setRegSortDir(1) }
        }
        function regArrow(col: string) {
          if (regSortCol !== col) return <span style={{ opacity: 0.2 }}> ↕</span>
          return <span style={{ color: 'var(--accent)' }}>{regSortDir === 1 ? ' ↑' : ' ↓'}</span>
        }

        const cols: { key: string; label: string; sticky?: boolean }[] = [
          { key: 'name',      label: 'Player',       sticky: true },
          { key: 'age',       label: 'Age Group' },
          { key: 'dob',       label: 'DOB' },
          { key: 'grade',     label: 'Grade' },
          { key: 'school',    label: 'School' },
          { key: 'prior_org', label: 'Prior Org' },
          { key: 'team',      label: 'Prior Team' },
          { key: 'email',     label: 'Parent Email' },
          { key: 'phone',     label: 'Parent Phone' },
          { key: 'pref_date', label: 'Pref. Date' },
          { key: 'imported',  label: 'Imported' },
        ]

        return (
          <div>
            {!hasAnyReg && rows.length > 0 && !backfillDone && (
              <div style={{ marginBottom: '12px', padding: '10px 14px', background: 'rgba(232,160,32,0.08)', border: '0.5px solid rgba(232,160,32,0.3)', borderRadius: '8px', fontSize: '12px', color: '#E8A020', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <span style={{ flex: 1 }}>Registration was imported before a season was created — staging data is missing. Click to backfill from import history.</span>
                {backfillError && <span style={{ color: '#E87060' }}>{backfillError}</span>}
                <button onClick={backfillStaging} disabled={backfilling || !seasonId} style={{
                  padding: '5px 14px', borderRadius: '6px', border: 'none', cursor: backfilling || !seasonId ? 'default' : 'pointer',
                  background: 'rgba(232,160,32,0.25)', color: '#E8A020', fontWeight: 700, fontSize: '12px',
                  opacity: backfilling || !seasonId ? 0.6 : 1, whiteSpace: 'nowrap',
                }}>
                  {backfilling ? 'Fixing…' : seasonId ? 'Fix now' : 'No active season'}
                </button>
              </div>
            )}
            <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 270px)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr>
                    {cols.map((col) => (
                      <th key={col.key} onClick={() => regToggleSort(col.key)} style={{ ...th, cursor: 'pointer', whiteSpace: 'nowrap', ...(col.sticky ? stickyPlayerTh : {}) }}>
                        {col.label}{regArrow(col.key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map(({ p, reg }, i) => {
                    const dob = reg?.dob ?? p.dob
                    const imported = reg?.imported_at
                    return (
                      <tr key={p.id} style={{ background: i % 2 ? 'rgba(var(--fg-rgb),0.02)' : 'transparent' }}>
                        <td style={{ ...td, ...stickyPlayerTd, fontWeight: 600, whiteSpace: 'nowrap' }}>{p.last_name}, {p.first_name}</td>
                        <td style={{ ...td, color: s.muted }}>{reg?.age_group ?? p.age_group}</td>
                        <td style={{ ...td, color: s.muted, fontSize: '12px', whiteSpace: 'nowrap' }}>
                          {dob ? new Date(dob + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : <span style={{ opacity: 0.3 }}>—</span>}
                        </td>
                        <td style={{ ...td, color: s.muted, fontSize: '12px' }}>{reg?.grade ?? p.grade ?? <span style={{ opacity: 0.3 }}>—</span>}</td>
                        <td style={{ ...td, color: s.muted, fontSize: '12px', maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reg?.school ?? p.school ?? <span style={{ opacity: 0.3 }}>—</span>}</td>
                        <td style={{ ...td, color: s.muted, fontSize: '12px', whiteSpace: 'nowrap' }}>{reg?.prior_org ?? p.prior_org ?? <span style={{ opacity: 0.3 }}>—</span>}</td>
                        <td style={{ ...td, color: '#80B0E8', whiteSpace: 'nowrap' }}>{reg?.prior_team ?? p.prior_team ?? <span style={{ opacity: 0.3 }}>—</span>}</td>
                        <td style={{ ...td, color: s.muted, fontSize: '12px' }}>{reg?.parent_email ?? p.parent_email ?? <span style={{ opacity: 0.3 }}>—</span>}</td>
                        <td style={{ ...td, color: s.muted, fontSize: '12px', whiteSpace: 'nowrap' }}>{reg?.parent_phone ?? p.parent_phone ?? <span style={{ opacity: 0.3 }}>—</span>}</td>
                        <td style={{ ...td, color: '#40A0E8', fontSize: '12px', whiteSpace: 'nowrap' }}>{reg?.preferred_tryout_date ?? <span style={{ opacity: 0.3 }}>—</span>}</td>
                        <td style={{ ...td, color: s.dim, fontSize: '12px', whiteSpace: 'nowrap' }}>{imported ? new Date(imported).toLocaleDateString() : <span style={{ opacity: 0.3 }}>—</span>}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {sorted.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '13px' }}>No players found. Import a registration file first.</div>}
            </div>
          </div>
        )
      })()}

      {/* ── Roster tab ────────────────────────────────────────────────────── */}
      {!lazyLoading && tab === 'roster' && (() => {
        const rows = filtered.map(p => ({ p, ros: rosterMap.get(p.id) })).filter(r => r.ros)

        function rosterToggleSort(col: string) {
          if (rosterSortCol === col) setRosterSortDir(d => d === 1 ? -1 : 1)
          else { setRosterSortCol(col); setRosterSortDir(1) }
        }
        function rosterArrow(col: string) {
          if (rosterSortCol !== col) return <span style={{ opacity: 0.2 }}> ↕</span>
          return <span style={{ color: 'var(--accent)' }}>{rosterSortDir === 1 ? ' ↑' : ' ↓'}</span>
        }

        const sorted = [...rows].sort((a, b) => {
          if (rosterSortCol === 'name')     return rosterSortDir * `${a.p.last_name}${a.p.first_name}`.localeCompare(`${b.p.last_name}${b.p.first_name}`)
          if (rosterSortCol === 'age')      return rosterSortDir * (a.p.age_group ?? '').localeCompare(b.p.age_group ?? '')
          if (rosterSortCol === 'team')     return rosterSortDir * (a.ros!.team_name ?? '').localeCompare(b.ros!.team_name ?? '')
          if (rosterSortCol === 'jersey')   return rosterSortDir * (a.ros!.jersey_number ?? '').localeCompare(b.ros!.jersey_number ?? '')
          if (rosterSortCol === 'imported') return rosterSortDir * (a.ros!.imported_at ?? '').localeCompare(b.ros!.imported_at ?? '')
          return 0
        })

        const cols = [
          { key: 'name',     label: 'Player',    sticky: true },
          { key: 'age',      label: 'Age Group' },
          { key: 'team',     label: 'Team' },
          { key: 'jersey',   label: 'Jersey #' },
          { key: 'imported', label: 'Imported' },
        ]

        return (
          <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead><tr>
                {cols.map((col) => (
                  <th key={col.key} onClick={() => rosterToggleSort(col.key)}
                    style={{ ...th, cursor: 'pointer', ...(col.sticky ? stickyPlayerTh : {}) }}>
                    {col.label}{rosterArrow(col.key)}
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {sorted.map(({ p, ros }, i) => (
                  <tr key={p.id} style={{ background: i % 2 ? 'rgba(var(--fg-rgb),0.02)' : 'transparent' }}>
                    <td style={{ ...td, ...stickyPlayerTd, fontWeight: 600, whiteSpace: 'nowrap' }}>{p.last_name}, {p.first_name}</td>
                    <td style={{ ...td, color: s.muted }}>{p.age_group}</td>
                    <td style={{ ...td, color: '#6DB875' }}>{ros?.team_name ?? '—'}</td>
                    <td style={{ ...td, color: s.muted }}>{ros?.jersey_number ?? '—'}</td>
                    <td style={{ ...td, color: s.dim, fontSize: '12px' }}>{ros?.imported_at ? new Date(ros.imported_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sorted.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '13px' }}>No roster data. Import a roster file first.</div>}
          </div>
        )
      })()}

      {/* ── GC Stats tab ──────────────────────────────────────────────────── */}
      {!lazyLoading && tab === 'gc' && gcFull !== null && (() => {
        const gcMap = new Map(gcFull.map(r => [r.player_id, r]))

        // Distinct teams from loaded stats
        const gcTeams = Array.from(new Set(gcFull.map(r => r.team_label).filter(Boolean) as string[])).sort()

        // Column → GcRow key mapping
        const GC_COL_KEY: Record<string, keyof GcRow> = {
          name: 'player_id', age: 'player_id', team: 'team_label', year: 'season_year',
          GP: 'games_played', AVG: 'avg', OBP: 'obp', SLG: 'slg', OPS: 'ops',
          H: 'h', '2B': 'doubles', '3B': 'triples', HR: 'hr', RBI: 'rbi',
          R: 'r', BB: 'bb', SO: 'so', SB: 'sb', HBP: 'hbp', SAC: 'sac', TB: 'tb',
          ERA: 'era', WHIP: 'whip', IP: 'ip', W: 'w', SV: 'sv', 'K/BB': 'k_bb', 'STR%': 'strike_pct',
          Score: 'gc_computed_score',
        }

        function gcToggleSort(col: string) {
          if (gcSortCol === col) setGcSortDir(d => d === 1 ? -1 : 1)
          else { setGcSortCol(col); setGcSortDir(col === 'name' || col === 'age' || col === 'team' || col === 'year' ? 1 : -1) }
        }
        function gcArrow(col: string) {
          if (gcSortCol !== col) return <span style={{ opacity: 0.2, fontSize: '9px' }}> ↕</span>
          return <span style={{ color: 'var(--accent)', fontSize: '9px' }}>{gcSortDir === 1 ? ' ↑' : ' ↓'}</span>
        }

        function toggleTeamFilter(team: string) {
          setGcTeamFilter(prev => prev.includes(team) ? prev.filter(t => t !== team) : [...prev, team])
        }

        // Build filtered + sorted rows
        let rows = filtered.map(p => ({ p, gc: gcMap.get(p.id) })).filter(r => r.gc)
        if (gcTeamFilter.length > 0) {
          rows = rows.filter(r => r.gc!.team_label && gcTeamFilter.includes(r.gc!.team_label))
        }
        rows = rows.sort((a, b) => {
          const col = gcSortCol
          const dir = gcSortDir
          if (col === 'name') return dir * `${a.p.last_name}${a.p.first_name}`.localeCompare(`${b.p.last_name}${b.p.first_name}`)
          if (col === 'age')  return dir * (a.p.age_group ?? '').localeCompare(b.p.age_group ?? '')
          if (col === 'team') return dir * (a.gc!.team_label ?? '').localeCompare(b.gc!.team_label ?? '')
          if (col === 'year') return dir * (a.gc!.season_year ?? '').localeCompare(b.gc!.season_year ?? '')
          const key = GC_COL_KEY[col]
          if (!key) return 0
          const va = (a.gc as any)[key] ?? -Infinity
          const vb = (b.gc as any)[key] ?? -Infinity
          return dir * (va - vb)
        })

        const allIds = rows.map(r => r.p.id)
        const allSelected = allIds.length > 0 && allIds.every(id => gcSelected.includes(id))
        function toggleSelectAll() {
          if (allSelected) setGcSelected(prev => prev.filter(id => !allIds.includes(id)))
          else setGcSelected(prev => Array.from(new Set([...prev, ...allIds])))
        }
        function toggleSelectOne(id: string) {
          setGcSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
        }

        const batting  = ['GP','AVG','OBP','SLG','OPS','H','2B','3B','HR','RBI','R','BB','SO','SB','HBP','SAC','TB']
        const pitching = ['ERA','WHIP','IP','W','SV','K/BB','STR%']

        const thGc = (col: string, extra?: React.CSSProperties) => ({
          ...th, cursor: 'pointer',
          ...extra,
          onClick: () => gcToggleSort(col),
        })

        return (
          <div>
            {rows.length === 0 && gcFull.length === 0 && (
              <div style={{ padding: '12px 16px', marginBottom: '10px', background: 'rgba(232,160,32,0.08)', border: '0.5px solid rgba(232,160,32,0.3)', borderRadius: '8px', fontSize: '13px', color: '#E8A020' }}>
                No GC stats saved. If you already imported a file, check the <strong>Import history</strong> — if the job shows "Needs review", open it to confirm player matches.
              </div>
            )}

            {/* Team filter chips */}
            {gcTeams.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center' }}>
                <span style={{ fontSize: '11px', color: s.dim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Team:</span>
                {gcTeams.map(team => {
                  const active = gcTeamFilter.includes(team)
                  return (
                    <button key={team} onClick={() => toggleTeamFilter(team)} style={{
                      padding: '4px 10px', borderRadius: '20px', border: '0.5px solid',
                      borderColor: active ? 'var(--accent)' : 'var(--border-md)',
                      background: active ? 'rgba(232,160,32,0.12)' : 'var(--bg-input)',
                      color: active ? 'var(--accent)' : s.muted,
                      fontSize: '12px', fontWeight: active ? 700 : 400, cursor: 'pointer', whiteSpace: 'nowrap',
                    }}>{team}</button>
                  )
                })}
                {gcTeamFilter.length > 0 && (
                  <button onClick={() => setGcTeamFilter([])} style={{ fontSize: '11px', color: s.dim, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px' }}>
                    Clear
                  </button>
                )}
                {gcSelected.length > 0 && (
                  <span style={{ marginLeft: '8px', fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>
                    {gcSelected.length} selected
                    <button onClick={() => setGcSelected([])} style={{ marginLeft: '6px', fontSize: '11px', color: s.dim, background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                  </span>
                )}
              </div>
            )}

            <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 300px)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                    {/* Checkbox — sticky left:0 */}
                    <th style={{ ...th, ...stickyPlayerTh, width: '32px', cursor: 'pointer', paddingRight: '4px', boxShadow: 'none' }} rowSpan={2} onClick={toggleSelectAll}>
                      <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} onClick={e => e.stopPropagation()} style={{ cursor: 'pointer' }} />
                    </th>
                    <th style={thGc('name', { minWidth: '160px', position: 'sticky', left: '32px', zIndex: 3, background: 'var(--bg)', boxShadow: '2px 0 4px rgba(var(--fg-rgb),0.06)' })} rowSpan={2}>Player{gcArrow('name')}</th>
                    <th style={thGc('age', { textAlign: 'right', minWidth: '48px' })} rowSpan={2}>Age{gcArrow('age')}</th>
                    <th style={thGc('team', { textAlign: 'left', minWidth: '120px', whiteSpace: 'nowrap' })} rowSpan={2}>Team{gcArrow('team')}</th>
                    <th style={thGc('year', { textAlign: 'right', minWidth: '48px' })} rowSpan={2}>Year{gcArrow('year')}</th>
                    <th colSpan={batting.length} style={{ ...th, textAlign: 'center', borderLeft: '0.5px solid var(--border)', borderRight: '0.5px solid var(--border)', fontSize: '10px', background: 'rgba(var(--fg-rgb),0.02)', cursor: 'default' }}>Batting</th>
                    <th colSpan={pitching.length} style={{ ...th, textAlign: 'center', borderRight: '0.5px solid var(--border)', fontSize: '10px', background: 'rgba(var(--fg-rgb),0.02)', cursor: 'default' }}>Pitching</th>
                    <th style={thGc('Score', { textAlign: 'right', color: 'var(--accent)' })} rowSpan={2}>Score{gcArrow('Score')}</th>
                  </tr>
                  <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                    {batting.map(l => (
                      <th key={l} onClick={() => gcToggleSort(l)} style={{ ...th, textAlign: 'right', minWidth: '40px', fontSize: '10px', fontWeight: gcSortCol === l ? 700 : 500, cursor: 'pointer', borderLeft: l === 'GP' ? '0.5px solid var(--border)' : undefined, color: gcSortCol === l ? 'var(--accent)' : s.dim }}>
                        {l}{gcArrow(l)}
                      </th>
                    ))}
                    {pitching.map(l => (
                      <th key={l} onClick={() => gcToggleSort(l)} style={{ ...th, textAlign: 'right', minWidth: '40px', fontSize: '10px', fontWeight: gcSortCol === l ? 700 : 500, cursor: 'pointer', borderLeft: l === 'ERA' ? '0.5px solid var(--border)' : undefined, borderRight: l === 'STR%' ? '0.5px solid var(--border)' : undefined, color: gcSortCol === l ? 'var(--accent)' : s.dim }}>
                        {l}{gcArrow(l)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ p, gc }, i) => {
                    const selected = gcSelected.includes(p.id)
                    return (
                      <tr key={p.id} style={{ background: selected ? 'rgba(232,160,32,0.06)' : i % 2 ? 'rgba(var(--fg-rgb),0.02)' : 'transparent' }}>
                        <td style={{ ...td, ...stickyPlayerTd, paddingRight: '4px', width: '32px', boxShadow: 'none' }}>
                          <input type="checkbox" checked={selected} onChange={() => toggleSelectOne(p.id)} style={{ cursor: 'pointer' }} />
                        </td>
                        <td style={{ ...td, position: 'sticky', left: '32px', zIndex: 1, background: 'var(--bg)', boxShadow: '2px 0 4px rgba(var(--fg-rgb),0.06)', fontWeight: 600, whiteSpace: 'nowrap' }}>{p.last_name}, {p.first_name}</td>
                        <td style={{ ...td, textAlign: 'right', color: s.muted }}>{p.age_group}</td>
                        <td style={{ ...td, textAlign: 'left', color: s.dim, fontSize: '11px', whiteSpace: 'nowrap', minWidth: '120px' }}>{gc?.team_label ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'right', color: s.dim }}>{gc?.season_year ?? '—'}</td>
                        {/* Batting */}
                        <td style={{ ...td, textAlign: 'right', borderLeft: '0.5px solid rgba(var(--fg-rgb),0.06)' }}>{gc?.games_played ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{fmt(gc?.avg ?? null, 3)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{fmt(gc?.obp ?? null, 3)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{fmt(gc?.slg ?? null, 3)}</td>
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmt(gc?.ops ?? null, 3)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{gc?.h ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{gc?.doubles ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{gc?.triples ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{gc?.hr ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{gc?.rbi ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{gc?.r ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{gc?.bb ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{gc?.so ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{gc?.sb ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{gc?.hbp ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{gc?.sac ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{gc?.tb ?? '—'}</td>
                        {/* Pitching */}
                        <td style={{ ...td, textAlign: 'right', borderLeft: '0.5px solid rgba(var(--fg-rgb),0.06)' }}>{fmt(gc?.era ?? null, 2)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{fmt(gc?.whip ?? null, 2)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{fmt(gc?.ip ?? null, 1)}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{gc?.w ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{gc?.sv ?? '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{fmt(gc?.k_bb ?? null, 2)}</td>
                        <td style={{ ...td, textAlign: 'right', borderRight: '0.5px solid rgba(var(--fg-rgb),0.06)' }}>{gc?.strike_pct != null ? `${(gc.strike_pct * 100).toFixed(0)}%` : '—'}</td>
                        {/* Score */}
                        <td style={{ ...td, textAlign: 'right', fontWeight: 700, background: scoreColor(gc?.gc_computed_score ?? null) }}>
                          {gc?.gc_computed_score != null ? gc.gc_computed_score.toFixed(2) : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {rows.length === 0 && gcFull.length > 0 && (
                <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '13px' }}>No GC stats match your current filter.</div>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Coach Evals tab ───────────────────────────────────────────────── */}
      {!lazyLoading && tab === 'evals' && evalFull !== null && evalFields !== null && (() => {
        const evalMap = new Map(evalFull.map(r => [r.player_id, r]))
        const rows = filtered.filter(p => evalMap.has(p.id))
        const sections = Array.from(new Set(evalFields.map(f => f.section)))

        function evalsToggleSort(col: string) {
          if (evalsSortCol === col) setEvalsSortDir(d => d === 1 ? -1 : 1)
          else { setEvalsSortCol(col); setEvalsSortDir(col === 'name' ? 1 : -1) }
        }
        function evalsArrow(col: string) {
          if (evalsSortCol !== col) return <span style={{ opacity: 0.2 }}> ↕</span>
          return <span style={{ color: 'var(--accent)' }}>{evalsSortDir === 1 ? ' ↑' : ' ↓'}</span>
        }

        const sorted = [...rows].sort((a, b) => {
          if (evalsSortCol === 'name') return evalsSortDir * `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`)
          if (evalsSortCol === 'score') {
            const sa = evalMap.get(a.id)?.computed_score ?? -Infinity
            const sb = evalMap.get(b.id)?.computed_score ?? -Infinity
            return evalsSortDir * (sa - sb)
          }
          return 0
        })

        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', color: s.dim }}>{rows.length} players with submitted evals · Read-only — edit on the <Link href={`/org/${params.orgId}/tryouts/coach-evals`} style={{ color: 'var(--accent)' }}>Coach Evals page</Link></div>
            </div>
            <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 280px)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  {/* Section headers */}
                  <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                    <th onClick={() => evalsToggleSort('name')} style={{ ...th, ...stickyPlayerTh, minWidth: '180px', fontWeight: 800, fontSize: '12px', cursor: 'pointer' }} rowSpan={2}>
                      Player{evalsArrow('name')}
                    </th>
                    {sections.map(sec => {
                      const secFields = evalFields.filter(f => f.section === sec)
                      return (
                        <th key={sec} colSpan={secFields.length} style={{
                          ...th, textAlign: 'center', fontSize: '10px',
                          borderLeft: '0.5px solid var(--border)', borderRight: '0.5px solid var(--border)',
                          background: sec === 'pitching_catching' ? 'rgba(var(--fg-rgb),0.03)' : 'var(--bg)',
                          cursor: 'default',
                        }}>
                          {sec === 'fielding_hitting' ? 'Fielding & Hitting' : sec === 'pitching_catching' ? 'Pitching & Catching' : 'Intangibles'}
                        </th>
                      )
                    })}
                    <th onClick={() => evalsToggleSort('score')} style={{ ...th, textAlign: 'right', minWidth: '72px', color: evalsSortCol === 'score' ? 'var(--accent)' : 'var(--accent)', cursor: 'pointer' }} rowSpan={2}>
                      Score{evalsArrow('score')}
                    </th>
                  </tr>
                  <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                    {evalFields.map(f => (
                      <th key={f.field_key} title={f.label} style={{ ...th, textAlign: 'center', minWidth: '52px', maxWidth: '72px', fontSize: '10px', fontWeight: 500, cursor: 'default' }}>
                        {f.label.length > 8 ? f.label.slice(0, 7) + '…' : f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((p, i) => {
                    const ev = evalMap.get(p.id)!
                    return (
                      <tr key={p.id} style={{ background: i % 2 ? 'rgba(var(--fg-rgb),0.02)' : 'transparent', borderBottom: '0.5px solid rgba(var(--fg-rgb),0.04)' }}>
                        <td style={{ ...td, ...stickyPlayerTd, fontWeight: 600, whiteSpace: 'nowrap' }}>
                          {p.last_name}, {p.first_name}
                          <span style={{ fontSize: '10px', color: s.dim, marginLeft: '6px' }}>{p.age_group}</span>
                        </td>
                        {evalFields.map(f => {
                          const v = ev.scores?.[f.field_key] ?? null
                          return (
                            <td key={f.field_key} style={{ ...td, textAlign: 'center', background: v != null ? scoreColor(v) : 'transparent', padding: '5px 4px' }}>
                              {v != null ? <span style={{ fontWeight: 700 }}>{v}</span> : <span style={{ opacity: 0.2 }}>—</span>}
                            </td>
                          )
                        })}
                        <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: ev.computed_score != null ? 'var(--accent)' : s.dim }}>
                          {ev.computed_score?.toFixed(2) ?? '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {sorted.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '13px' }}>No submitted coach evals yet.</div>}
            </div>
          </div>
        )
      })()}

      {/* ── Scores tab ────────────────────────────────────────────────────── */}
      {!lazyLoading && tab === 'scores' && scoresFull !== null && (() => {
        // Aggregate: avg score per player, count of evaluators
        const aggMap = new Map<string, { scores: number[]; evaluators: Set<string> }>()
        for (const r of scoresFull) {
          if (!aggMap.has(r.player_id)) aggMap.set(r.player_id, { scores: [], evaluators: new Set() })
          const a = aggMap.get(r.player_id)!
          if (r.tryout_score != null) a.scores.push(r.tryout_score)
          if (r.evaluator_name) a.evaluators.add(r.evaluator_name)
        }
        const rows = filtered.filter(p => aggMap.has(p.id))

        function scoresToggleSort(col: string) {
          if (scoresSortCol === col) setScoresSortDir(d => d === 1 ? -1 : 1)
          else { setScoresSortCol(col); setScoresSortDir(col === 'name' || col === 'age' ? 1 : -1) }
        }
        function scoresArrow(col: string) {
          if (scoresSortCol !== col) return <span style={{ opacity: 0.2 }}> ↕</span>
          return <span style={{ color: 'var(--accent)' }}>{scoresSortDir === 1 ? ' ↑' : ' ↓'}</span>
        }

        const sorted = [...rows].sort((a, b) => {
          if (scoresSortCol === 'name') return scoresSortDir * `${a.last_name}${a.first_name}`.localeCompare(`${b.last_name}${b.first_name}`)
          if (scoresSortCol === 'age')  return scoresSortDir * (a.age_group ?? '').localeCompare(b.age_group ?? '')
          if (scoresSortCol === 'avg') {
            const sa = aggMap.get(a.id)!.scores; const sb = aggMap.get(b.id)!.scores
            const avgA = sa.length ? sa.reduce((x, y) => x + y, 0) / sa.length : -Infinity
            const avgB = sb.length ? sb.reduce((x, y) => x + y, 0) / sb.length : -Infinity
            return scoresSortDir * (avgA - avgB)
          }
          if (scoresSortCol === 'sessions') return scoresSortDir * (aggMap.get(a.id)!.scores.length - aggMap.get(b.id)!.scores.length)
          return 0
        })

        const scoreCols: { key: string; label: string; align: 'left' | 'right' }[] = [
          { key: 'name',     label: 'Player',     align: 'left' },
          { key: 'age',      label: 'Age',        align: 'right' },
          { key: 'avg',      label: 'Avg Score',  align: 'right' },
          { key: 'sessions', label: 'Sessions',   align: 'right' },
          { key: 'evals',    label: 'Evaluators', align: 'left' },
        ]

        return (
          <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead><tr>
                {scoreCols.map((col, i) => (
                  <th key={col.key} onClick={() => col.key !== 'evals' && scoresToggleSort(col.key)}
                    style={{ ...th, textAlign: col.align, cursor: col.key !== 'evals' ? 'pointer' : 'default', ...(i === 0 ? stickyPlayerTh : {}) }}>
                    {col.label}{col.key !== 'evals' ? scoresArrow(col.key) : null}
                  </th>
                ))}
              </tr></thead>
              <tbody>
                {sorted.map((p, i) => {
                  const agg = aggMap.get(p.id)!
                  const avg = agg.scores.length ? agg.scores.reduce((a, b) => a + b, 0) / agg.scores.length : null
                  return (
                    <tr key={p.id} style={{ background: i % 2 ? 'rgba(var(--fg-rgb),0.02)' : 'transparent' }}>
                      <td style={{ ...td, ...stickyPlayerTd, fontWeight: 600, whiteSpace: 'nowrap' }}>{p.last_name}, {p.first_name}</td>
                      <td style={{ ...td, textAlign: 'right', color: s.muted }}>{p.age_group}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{fmt(avg)}</td>
                      <td style={{ ...td, textAlign: 'right', color: s.muted }}>{agg.scores.length}</td>
                      <td style={{ ...td, color: s.muted, fontSize: '12px' }}>{Array.from(agg.evaluators).join(', ') || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {sorted.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '13px' }}>No tryout scores recorded yet.</div>}
          </div>
        )
      })()}

      {/* ── Age Check tab ─────────────────────────────────────────────────── */}
      {!lazyLoading && tab === 'age' && (() => {
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
            {/* Explanation */}
            <div style={{ fontSize: '12px', color: s.muted, marginBottom: '14px', lineHeight: 1.6 }}>
              <strong>Baseball Age</strong> = age as of May 1, {seasonYear}.
              Overage players must be moved to the correct group. Playing Up is allowed but flagged for review.
            </div>

            {/* Status filter chips + counts */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
              {([
                ['all',        'All',         players.length,              'rgba(var(--fg-rgb),0.1)',  'var(--fg)'  ],
                ['overage',    '⚠ Overage',   counts_by_status.overage,    'rgba(224,82,82,0.15)',    '#e05252'    ],
                ['playing_up', '↑ Playing Up', counts_by_status.playing_up, 'rgba(232,160,32,0.13)',   '#E8A020'    ],
                ['no_dob',     '? No DOB',     counts_by_status.no_dob,     'rgba(var(--fg-rgb),0.08)', s.muted     ],
                ['correct',    '✓ Correct',    counts_by_status.correct,    'rgba(109,184,117,0.15)', '#6DB875'    ],
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
                      <>
                        <tr key={p.id} style={{ background: rowBg }}>
                          <td style={{ ...td, ...stickyPlayerTd, fontWeight: 600, whiteSpace: 'nowrap' }}>{p.last_name}, {p.first_name}</td>
                          <td style={{ ...td, color: s.muted }}>{p.age_group}</td>
                          <td style={{ ...td, color: s.muted, fontSize: '12px' }}>
                            {dob
                              ? new Date(dob + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : <span style={{ color: '#e05252', fontStyle: 'italic' }}>missing</span>}
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
                            <span style={{
                              fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: '20px',
                              background: STATUS_COLOR[status],
                              color: STATUS_TEXT[status],
                              whiteSpace: 'nowrap',
                            }}>{STATUS_LABEL[status]}</span>
                          </td>
                          <td style={{ ...td, color: s.dim, fontSize: '12px', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {p.age_group_override_reason ?? <span style={{ opacity: 0.25 }}>—</span>}
                          </td>
                          <td style={td}>
                            <button onClick={() => isFix ? setFixingId(null) : openFix(p)} style={{
                              fontSize: '11px', padding: '4px 10px', borderRadius: '5px', cursor: 'pointer',
                              border: `0.5px solid ${isFix ? 'var(--accent)' : 'var(--border-md)'}`,
                              background: isFix ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
                              color: isFix ? 'var(--accent)' : s.muted,
                              fontWeight: isFix ? 700 : 400,
                            }}>{isFix ? 'Cancel' : 'Adjust'}</button>
                          </td>
                        </tr>

                        {/* Inline fix panel */}
                        {isFix && (
                          <tr key={`${p.id}_fix`} style={{ background: 'rgba(232,160,32,0.04)' }}>
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
                      </>
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
