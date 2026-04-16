'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Player {
  id: string; first_name: string; last_name: string
  age_group: string; tryout_age_group: string | null
  prior_team: string | null; jersey_number: string | null
}
interface RegRow  { player_id: string; prior_team: string | null; age_group: string | null; parent_email: string | null; imported_at: string }
interface RosterRow { player_id: string; team_name: string | null; jersey_number: string | null; imported_at: string }
interface GcRow  {
  player_id: string; season_year: string
  avg: number|null; obp: number|null; slg: number|null; ops: number|null
  era: number|null; whip: number|null; games_played: number|null; ip: number|null
}
interface EvalField { field_key: string; label: string; section: string; sort_order: number; weight: number }
interface EvalRow   { player_id: string; computed_score: number|null; scores: Record<string,number>|null; coach_name: string|null; team_label: string|null; comments: string|null }
interface ScoreRow  { player_id: string; tryout_score: number|null; evaluator_name: string|null; session_id: string }

type Tab = 'master' | 'registration' | 'roster' | 'gc' | 'evals' | 'scores'

const TABS: { key: Tab; label: string }[] = [
  { key: 'master',       label: 'Master' },
  { key: 'registration', label: 'Registration' },
  { key: 'roster',       label: 'Roster' },
  { key: 'gc',           label: 'GC Stats' },
  { key: 'evals',        label: 'Coach Evals' },
  { key: 'scores',       label: 'Tryout Scores' },
]

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
  const [loading,       setLoading]       = useState(true)

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

  useEffect(() => { loadData() }, [])
  useEffect(() => { if (editingCell && inputRef.current) inputRef.current.focus() }, [editingCell])

  useEffect(() => {
    if (tab === 'gc'     && gcFull    === null) lazyLoad('gc')
    if (tab === 'evals'  && evalFull  === null) lazyLoad('evals')
    if (tab === 'scores' && scoresFull === null) lazyLoad('scores')
  }, [tab])

  async function loadData() {
    const { data: seasonData } = await supabase.from('tryout_seasons').select('id').eq('org_id', params.orgId).eq('is_active', true).maybeSingle()
    setSeasonId(seasonData?.id ?? null)

    const [
      { data: playerData }, { data: regData }, { data: rosterData },
      { data: gcData }, { data: evalData }, { data: scoreData },
    ] = await Promise.all([
      supabase.from('tryout_players').select('id,first_name,last_name,age_group,tryout_age_group,prior_team,jersey_number').eq('org_id', params.orgId).eq('is_active', true).order('last_name').order('first_name'),
      seasonData ? supabase.from('tryout_registration_staging').select('player_id,prior_team,age_group,parent_email,imported_at').eq('org_id', params.orgId).eq('season_id', seasonData.id) : Promise.resolve({ data: [] }),
      seasonData ? supabase.from('tryout_roster_staging').select('player_id,team_name,jersey_number,imported_at').eq('org_id', params.orgId).eq('season_id', seasonData.id) : Promise.resolve({ data: [] }),
      supabase.from('tryout_gc_stats').select('player_id').eq('org_id', params.orgId),
      supabase.from('tryout_coach_evals').select('player_id').eq('org_id', params.orgId).eq('status', 'submitted'),
      supabase.from('tryout_scores').select('player_id').eq('org_id', params.orgId),
    ])
    setPlayers(playerData ?? [])
    setRegMap(new Map((regData ?? []).map((r: any) => [r.player_id, r])))
    setRosterMap(new Map((rosterData ?? []).map((r: any) => [r.player_id, r])))
    setGcIds(new Set((gcData ?? []).map((r: any) => r.player_id)))
    setEvalIds(new Set((evalData ?? []).map((r: any) => r.player_id)))
    setScoreIds(new Set((scoreData ?? []).map((r: any) => r.player_id)))
    setLoading(false)
  }

  async function lazyLoad(target: 'gc' | 'evals' | 'scores') {
    setLazyLoading(true)
    if (target === 'gc') {
      const { data } = await supabase.from('tryout_gc_stats').select('player_id,season_year,avg,obp,slg,ops,era,whip,games_played,ip').eq('org_id', params.orgId)
      setGcFull(data ?? [])
    }
    if (target === 'evals') {
      const [{ data: fields }, { data: evals }] = await Promise.all([
        supabase.from('tryout_coach_eval_config').select('field_key,label,section,sort_order,weight').eq('org_id', params.orgId).order('sort_order'),
        supabase.from('tryout_coach_evals').select('player_id,computed_score,scores,coach_name,team_label,comments').eq('org_id', params.orgId).eq('status', 'submitted'),
      ])
      setEvalFields((fields ?? []).map((f: any) => ({ field_key: f.field_key, label: f.label, section: f.section, sort_order: f.sort_order, weight: f.weight ?? 1 })))
      setEvalFull(evals ?? [])
    }
    if (target === 'scores') {
      const { data } = await supabase.from('tryout_scores').select('player_id,tryout_score,evaluator_name,session_id').eq('org_id', params.orgId)
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
      list = list.filter(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
        (pv(p, 'prior_team') ?? '').toLowerCase().includes(q) ||
        (pv(p, 'tryout_age_group') ?? '').toLowerCase().includes(q)
      )
    }
    return [...list].sort((a, b) => {
      let va = '', vb = ''
      if (sortCol === 'name')      { va = `${a.last_name}${a.first_name}`; vb = `${b.last_name}${b.first_name}` }
      if (sortCol === 'team')      { va = pv(a, 'prior_team') ?? ''; vb = pv(b, 'prior_team') ?? '' }
      if (sortCol === 'tryout_ag') { va = pv(a, 'tryout_age_group') ?? ''; vb = pv(b, 'tryout_age_group') ?? '' }
      if (sortCol === 'age')       { va = a.age_group; vb = b.age_group }
      return va.localeCompare(vb) * sortDir
    })
  }, [players, ageFilter, search, sortCol, sortDir, localUpdates])

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
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', maxWidth: '1300px', margin: '0 auto', padding: '2rem 1.5rem 6rem' }}>
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
            registration: regMap.size,
            roster: rosterMap.size,
            gc: gcIds.size,
            evals: evalIds.size,
            scores: scoreIds.size,
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
              <span style={{ marginLeft: '6px', fontSize: '11px', fontWeight: 400, color: s.dim }}>
                {counts[t.key]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Search + Age filter — shared across tabs */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search players…"
          style={{ background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '7px 12px', fontSize: '13px', color: 'var(--fg)', width: '220px' }}
        />
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
        <div style={{ overflowX: 'auto' }}>
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
                  <th key={i} style={{ ...th, cursor: col.key ? 'pointer' : 'default' }}
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
                    <td style={{ ...td, fontWeight: 600 }}>{p.last_name}, {p.first_name}</td>
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
        const rows = filtered.map(p => ({ p, reg: regMap.get(p.id) })).filter(r => r.reg)
        return (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead><tr>
                {['Player', 'Age Group', 'Reg Team', 'Parent Email', 'Imported'].map(l => (
                  <th key={l} style={th}>{l}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map(({ p, reg }, i) => (
                  <tr key={p.id} style={{ background: i % 2 ? 'rgba(var(--fg-rgb),0.02)' : 'transparent' }}>
                    <td style={{ ...td, fontWeight: 600 }}>{p.last_name}, {p.first_name}</td>
                    <td style={{ ...td, color: s.muted }}>{reg?.age_group ?? p.age_group}</td>
                    <td style={{ ...td, color: '#80B0E8' }}>{reg?.prior_team ?? '—'}</td>
                    <td style={{ ...td, color: s.muted, fontSize: '12px' }}>{reg?.parent_email ?? '—'}</td>
                    <td style={{ ...td, color: s.dim, fontSize: '12px' }}>{reg?.imported_at ? new Date(reg.imported_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '13px' }}>No registration data. Import a registration file first.</div>}
          </div>
        )
      })()}

      {/* ── Roster tab ────────────────────────────────────────────────────── */}
      {!lazyLoading && tab === 'roster' && (() => {
        const rows = filtered.map(p => ({ p, ros: rosterMap.get(p.id) })).filter(r => r.ros)
        return (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead><tr>
                {['Player', 'Age Group', 'Team', 'Jersey #', 'Imported'].map(l => (
                  <th key={l} style={th}>{l}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map(({ p, ros }, i) => (
                  <tr key={p.id} style={{ background: i % 2 ? 'rgba(var(--fg-rgb),0.02)' : 'transparent' }}>
                    <td style={{ ...td, fontWeight: 600 }}>{p.last_name}, {p.first_name}</td>
                    <td style={{ ...td, color: s.muted }}>{p.age_group}</td>
                    <td style={{ ...td, color: '#6DB875' }}>{ros?.team_name ?? '—'}</td>
                    <td style={{ ...td, color: s.muted }}>{ros?.jersey_number ?? '—'}</td>
                    <td style={{ ...td, color: s.dim, fontSize: '12px' }}>{ros?.imported_at ? new Date(ros.imported_at).toLocaleDateString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '13px' }}>No roster data. Import a roster file first.</div>}
          </div>
        )
      })()}

      {/* ── GC Stats tab ──────────────────────────────────────────────────── */}
      {!lazyLoading && tab === 'gc' && gcFull !== null && (() => {
        const gcMap = new Map(gcFull.map(r => [r.player_id, r]))
        const rows = filtered.map(p => ({ p, gc: gcMap.get(p.id) })).filter(r => r.gc)
        return (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead><tr>
                {['Player', 'Age', 'Year', 'GP', 'AVG', 'OBP', 'SLG', 'OPS', 'ERA', 'WHIP', 'IP'].map(l => (
                  <th key={l} style={{ ...th, textAlign: l === 'Player' ? 'left' : 'right' }}>{l}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.map(({ p, gc }, i) => (
                  <tr key={p.id} style={{ background: i % 2 ? 'rgba(var(--fg-rgb),0.02)' : 'transparent' }}>
                    <td style={{ ...td, fontWeight: 600 }}>{p.last_name}, {p.first_name}</td>
                    <td style={{ ...td, textAlign: 'right', color: s.muted }}>{p.age_group}</td>
                    <td style={{ ...td, textAlign: 'right', color: s.dim }}>{gc?.season_year ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{gc?.games_played ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmt(gc?.avg ?? null, 3)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmt(gc?.obp ?? null, 3)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmt(gc?.slg ?? null, 3)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmt(gc?.ops ?? null, 3)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmt(gc?.era ?? null, 2)}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmt(gc?.whip ?? null, 2)}</td>
                    <td style={{ ...td, textAlign: 'right', color: s.muted }}>{fmt(gc?.ip ?? null, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '13px' }}>No GC stats found.</div>}
          </div>
        )
      })()}

      {/* ── Coach Evals tab ───────────────────────────────────────────────── */}
      {!lazyLoading && tab === 'evals' && evalFull !== null && evalFields !== null && (() => {
        const evalMap = new Map(evalFull.map(r => [r.player_id, r]))
        const rows = filtered.filter(p => evalMap.has(p.id))
        const sections = Array.from(new Set(evalFields.map(f => f.section)))
        return (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
              <div style={{ fontSize: '12px', color: s.dim }}>{rows.length} players with submitted evals · Read-only — edit on the <Link href={`/org/${params.orgId}/tryouts/coach-evals`} style={{ color: 'var(--accent)' }}>Coach Evals page</Link></div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  {/* Section headers */}
                  <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                    <th style={{ ...th, minWidth: '180px', fontWeight: 800, fontSize: '12px' }} rowSpan={2}>Player</th>
                    {sections.map(sec => {
                      const secFields = evalFields.filter(f => f.section === sec)
                      return (
                        <th key={sec} colSpan={secFields.length} style={{
                          ...th, textAlign: 'center', fontSize: '10px',
                          borderLeft: '0.5px solid var(--border)', borderRight: '0.5px solid var(--border)',
                          background: sec === 'pitching_catching' ? 'rgba(var(--fg-rgb),0.03)' : 'var(--bg)',
                        }}>
                          {sec === 'fielding_hitting' ? 'Fielding & Hitting' : sec === 'pitching_catching' ? 'Pitching & Catching' : 'Intangibles'}
                        </th>
                      )
                    })}
                    <th style={{ ...th, textAlign: 'right', minWidth: '72px', color: 'var(--accent)' }} rowSpan={2}>Score</th>
                  </tr>
                  <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                    {evalFields.map(f => (
                      <th key={f.field_key} title={f.label} style={{ ...th, textAlign: 'center', minWidth: '52px', maxWidth: '72px', fontSize: '10px', fontWeight: 500 }}>
                        {f.label.length > 8 ? f.label.slice(0, 7) + '…' : f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p, i) => {
                    const ev = evalMap.get(p.id)!
                    return (
                      <tr key={p.id} style={{ background: i % 2 ? 'rgba(var(--fg-rgb),0.02)' : 'transparent', borderBottom: '0.5px solid rgba(var(--fg-rgb),0.04)' }}>
                        <td style={{ ...td, fontWeight: 600, whiteSpace: 'nowrap' }}>
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
              {rows.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '13px' }}>No submitted coach evals yet.</div>}
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
        return (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead><tr>
                {['Player', 'Age', 'Avg Score', 'Sessions', 'Evaluators'].map(l => (
                  <th key={l} style={{ ...th, textAlign: l === 'Player' || l === 'Evaluators' ? 'left' : 'right' }}>{l}</th>
                ))}
              </tr></thead>
              <tbody>
                {rows.sort((a, b) => {
                  const sa = aggMap.get(a.id)!.scores; const sb = aggMap.get(b.id)!.scores
                  const avgA = sa.length ? sa.reduce((x,y)=>x+y,0)/sa.length : -1
                  const avgB = sb.length ? sb.reduce((x,y)=>x+y,0)/sb.length : -1
                  return avgB - avgA
                }).map((p, i) => {
                  const agg = aggMap.get(p.id)!
                  const avg = agg.scores.length ? agg.scores.reduce((a, b) => a + b, 0) / agg.scores.length : null
                  return (
                    <tr key={p.id} style={{ background: i % 2 ? 'rgba(var(--fg-rgb),0.02)' : 'transparent' }}>
                      <td style={{ ...td, fontWeight: 600 }}>{p.last_name}, {p.first_name}</td>
                      <td style={{ ...td, textAlign: 'right', color: s.muted }}>{p.age_group}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: 'var(--accent)' }}>{fmt(avg)}</td>
                      <td style={{ ...td, textAlign: 'right', color: s.muted }}>{agg.scores.length}</td>
                      <td style={{ ...td, color: s.muted, fontSize: '12px' }}>{Array.from(agg.evaluators).join(', ') || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {rows.length === 0 && <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '13px' }}>No tryout scores recorded yet.</div>}
          </div>
        )
      })()}
    </main>
  )
}
