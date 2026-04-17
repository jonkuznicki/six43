'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Player {
  id:            string
  first_name:    string
  last_name:     string
  age_group:     string
  tryout_age_group: string | null
  jersey_number: string | null
  prior_team:    string | null
}

interface TryoutScore {
  player_id:    string
  tryout_score: number | null
  evaluator_name: string | null
}

interface CoachEval {
  player_id:     string
  computed_score: number | null
  coach_name:    string | null
  status:        string
}

interface GcStat {
  player_id:    string
  avg:          number | null
  obp:          number | null
  slg:          number | null
  ops:          number | null
  era:          number | null
  whip:         number | null
  games_played: number | null
  ip:           number | null
  season_year:  string
}

interface Season {
  id:                   string
  label:                string
  age_groups:           string[]
  rankings_share_token: string | null
}

interface Team {
  id:        string
  name:      string
  age_group: string
  color:     string | null
}

interface RankedPlayer {
  player:        Player
  tryoutAvg:     number | null
  coachEvalAvg:  number | null
  gcScore:       number | null
  gcStat:        GcStat | null
  combinedScore: number | null
  scoreCount:    number
  evalCount:     number
  hasGc:         boolean
  assignedTeam:  string | null
  // variance: true if |component - combined| >= threshold
  tryoutFlag:    boolean
  evalFlag:      boolean
  gcFlag:        boolean
}

const VARIANCE_THRESHOLD = 1.0

function flag(component: number | null, combined: number | null): boolean {
  if (component == null || combined == null) return false
  return Math.abs(component - combined) >= VARIANCE_THRESHOLD
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function RankingsPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()

  const [season,       setSeason]       = useState<Season | null>(null)
  const [players,      setPlayers]      = useState<Player[]>([])
  const [tryoutScores, setTryoutScores] = useState<TryoutScore[]>([])
  const [coachEvals,   setCoachEvals]   = useState<CoachEval[]>([])
  const [gcStats,      setGcStats]      = useState<GcStat[]>([])
  const [teams,        setTeams]        = useState<Team[]>([])
  const [assignments,  setAssignments]  = useState<Record<string, string>>({})
  const [loading,      setLoading]      = useState(true)

  const [ageFilter,   setAgeFilter]   = useState('all')
  const [sortBy,      setSortBy]      = useState<'combined' | 'tryout' | 'eval' | 'gc' | 'name'>('combined')
  const [sortDir,     setSortDir]     = useState<1 | -1>(-1)   // -1 = desc (high first)
  const [assigning,   setAssigning]   = useState<string | null>(null)

  // Cutoff lines per age group: { '10u': { blue: 12, white: 12 } }
  const [cutoffs, setCutoffs] = useState<Record<string, { blue: number; white: number }>>({})

  // Weight sliders
  const [tryoutWeight, setTryoutWeight] = useState(0.5)
  const [evalWeight,   setEvalWeight]   = useState(0.3)
  const [gcWeight,     setGcWeight]     = useState(0.2)
  const [showWeights,  setShowWeights]  = useState(false)

  // Sharing
  const [shareToken,  setShareToken]  = useState<string | null>(null)
  const [sharingBusy, setSharingBusy] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: seasonData } = await supabase
      .from('tryout_seasons').select('id, label, age_groups, rankings_share_token')
      .eq('org_id', params.orgId).eq('is_active', true).maybeSingle()
    setSeason(seasonData)
    setShareToken(seasonData?.rankings_share_token ?? null)
    if (!seasonData) { setLoading(false); return }

    const [
      { data: playerData },
      { data: scoreData },
      { data: evalData },
      { data: teamData },
      { data: assignData },
      { data: gcData },
    ] = await Promise.all([
      supabase.from('tryout_players')
        .select('id, first_name, last_name, age_group, tryout_age_group, jersey_number, prior_team')
        .eq('org_id', params.orgId).eq('is_active', true)
        .order('last_name').order('first_name'),
      supabase.from('tryout_scores')
        .select('player_id, tryout_score, evaluator_name')
        .eq('org_id', params.orgId),
      supabase.from('tryout_coach_evals')
        .select('player_id, computed_score, coach_name, status')
        .eq('org_id', params.orgId).eq('status', 'submitted'),
      supabase.from('tryout_teams')
        .select('id, name, age_group, color')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id).eq('is_active', true),
      supabase.from('tryout_team_assignments')
        .select('player_id, team_id')
        .eq('season_id', seasonData.id),
      supabase.from('tryout_gc_stats')
        .select('player_id, avg, obp, slg, ops, era, whip, games_played, ip, season_year')
        .eq('org_id', params.orgId),
    ])

    setPlayers(playerData ?? [])
    setTryoutScores(scoreData ?? [])
    setCoachEvals(evalData ?? [])
    setGcStats(gcData ?? [])
    setTeams(teamData ?? [])

    const assignMap: Record<string, string> = {}
    for (const a of (assignData ?? [])) assignMap[a.player_id] = a.team_id
    setAssignments(assignMap)
    setLoading(false)
  }

  async function assignTeam(playerId: string, teamId: string | null) {
    if (!season) return
    setAssigning(playerId)
    if (teamId) {
      await supabase.from('tryout_team_assignments').upsert(
        { player_id: playerId, team_id: teamId, season_id: season.id, org_id: params.orgId },
        { onConflict: 'player_id,season_id' }
      )
      setAssignments(prev => ({ ...prev, [playerId]: teamId }))
    } else {
      await supabase.from('tryout_team_assignments').delete()
        .eq('player_id', playerId).eq('season_id', season.id)
      setAssignments(prev => { const next = { ...prev }; delete next[playerId]; return next })
    }
    setAssigning(null)
  }

  // ── Score computation ──────────────────────────────────────────────────────

  const ranked = useMemo((): RankedPlayer[] => {
    return players.map(player => {
      const playerTryout = tryoutScores.filter(s => s.player_id === player.id && s.tryout_score != null)
      const playerEvals  = coachEvals.filter(e => e.player_id === player.id)
      const stat         = gcStats.find(g => g.player_id === player.id) ?? null

      const tryoutAvg = playerTryout.length > 0
        ? playerTryout.reduce((s, r) => s + (r.tryout_score ?? 0), 0) / playerTryout.length
        : null

      // Use computed_score stored by the submit RPC (weighted, excludes p/c by default)
      const evalScores = playerEvals.map(e => e.computed_score).filter((v): v is number => v != null)
      const coachEvalAvg = evalScores.length > 0
        ? evalScores.reduce((a, b) => a + b, 0) / evalScores.length
        : null

      // GC: normalize to 0–5
      let gcScore: number | null = null
      if (stat) {
        const opsScore  = stat.ops  != null ? Math.min(5, (stat.ops  / 1.2) * 5) : null
        const eraScore  = stat.era  != null ? Math.max(0, 5 - (stat.era  / 4.0) * 5) : null
        const whipScore = stat.whip != null ? Math.max(0, 5 - (stat.whip / 1.3) * 5) : null
        const pitchComps = [eraScore, whipScore].filter((v): v is number => v != null)
        const pitchScore = pitchComps.length > 0
          ? pitchComps.reduce((a, b) => a + b, 0) / pitchComps.length : null
        if      (opsScore != null && pitchScore != null && stat.ip != null && stat.ip > 0)
          gcScore = opsScore * 0.6 + pitchScore * 0.4
        else if (opsScore  != null) gcScore = opsScore
        else if (pitchScore != null) gcScore = pitchScore
      }

      // Combined: normalize weights among available components
      const components: [number, number][] = []
      if (tryoutAvg    != null) components.push([tryoutAvg,    tryoutWeight])
      if (coachEvalAvg != null) components.push([coachEvalAvg, evalWeight])
      if (gcScore      != null) components.push([gcScore,      gcWeight])

      let combinedScore: number | null = null
      if (components.length > 0) {
        const totalW = components.reduce((s, [, w]) => s + w, 0)
        combinedScore = components.reduce((s, [v, w]) => s + v * (w / totalW), 0)
      }

      return {
        player,
        tryoutAvg,
        coachEvalAvg,
        gcScore,
        gcStat:       stat,
        combinedScore,
        scoreCount:   playerTryout.length,
        evalCount:    playerEvals.length,
        hasGc:        gcScore != null,
        assignedTeam: assignments[player.id] ?? null,
        tryoutFlag:   flag(tryoutAvg,    combinedScore),
        evalFlag:     flag(coachEvalAvg, combinedScore),
        gcFlag:       flag(gcScore,      combinedScore),
      }
    })
  }, [players, tryoutScores, coachEvals, gcStats, tryoutWeight, evalWeight, gcWeight, assignments])

  const filtered = useMemo(() => {
    let list = ranked
    if (ageFilter !== 'all') {
      list = list.filter(r => (r.player.tryout_age_group ?? r.player.age_group) === ageFilter)
    }
    return list.sort((a, b) => {
      let diff = 0
      if (sortBy === 'name')   diff = `${a.player.last_name}${a.player.first_name}`.localeCompare(`${b.player.last_name}${b.player.first_name}`)
      else if (sortBy === 'tryout') diff = (a.tryoutAvg    ?? -1) - (b.tryoutAvg    ?? -1)
      else if (sortBy === 'eval')   diff = (a.coachEvalAvg ?? -1) - (b.coachEvalAvg ?? -1)
      else if (sortBy === 'gc')     diff = (a.gcScore      ?? -1) - (b.gcScore      ?? -1)
      else diff = (a.combinedScore ?? -1) - (b.combinedScore ?? -1)
      return diff * sortDir
    })
  }, [ranked, ageFilter, sortBy, sortDir])

  function toggleSort(col: typeof sortBy) {
    if (sortBy === col) setSortDir(d => d === -1 ? 1 : -1)
    else { setSortBy(col); setSortDir(-1) }
  }

  const ageCutoff = cutoffs[ageFilter] ?? { blue: 12, white: 12 }
  function setCutoff(field: 'blue' | 'white', val: number) {
    setCutoffs(prev => ({
      ...prev,
      [ageFilter]: { ...(prev[ageFilter] ?? { blue: 12, white: 12 }), [field]: Math.max(0, val) },
    }))
  }

  function exportCsv() {
    const rows = [
      ['Rank', 'Name', 'Age Group', 'Tryout AG', 'Jersey', 'Prior Team', 'Tryout Score', 'Coach Eval', 'GC Score', 'OPS', 'ERA', 'WHIP', 'Combined', 'Tryout Flag', 'Eval Flag', 'GC Flag', 'Team'],
      ...filtered.map((r, i) => [
        String(r.combinedScore != null ? i + 1 : '–'),
        `${r.player.first_name} ${r.player.last_name}`,
        r.player.age_group,
        r.player.tryout_age_group ?? '',
        r.player.jersey_number ?? '',
        r.player.prior_team ?? '',
        r.tryoutAvg?.toFixed(2) ?? '',
        r.coachEvalAvg?.toFixed(2) ?? '',
        r.gcScore?.toFixed(2) ?? '',
        r.gcStat?.ops?.toFixed(3) ?? '',
        r.gcStat?.era?.toFixed(2) ?? '',
        r.gcStat?.whip?.toFixed(2) ?? '',
        r.combinedScore?.toFixed(2) ?? '',
        r.tryoutFlag ? '⚠' : '',
        r.evalFlag   ? '⚠' : '',
        r.gcFlag     ? '⚠' : '',
        r.assignedTeam ? (teams.find(t => t.id === r.assignedTeam)?.name ?? '') : '',
      ])
    ]
    const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `rankings-${ageFilter}-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleShare() {
    if (!season) return
    setSharingBusy(true)
    if (shareToken) {
      await navigator.clipboard.writeText(`${window.location.origin}/tryouts/rankings/${shareToken}`)
      setShareCopied(true); setTimeout(() => setShareCopied(false), 2000)
      setSharingBusy(false); return
    }
    const res  = await fetch('/api/tryouts/rankings-share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seasonId: season.id, orgId: params.orgId, action: 'generate' }) })
    const json = await res.json()
    if (json.token) {
      setShareToken(json.token)
      await navigator.clipboard.writeText(`${window.location.origin}/tryouts/rankings/${json.token}`)
      setShareCopied(true); setTimeout(() => setShareCopied(false), 2000)
    }
    setSharingBusy(false)
  }

  async function revokeShare() {
    if (!season || !shareToken) return
    setSharingBusy(true)
    await fetch('/api/tryouts/rankings-share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seasonId: season.id, orgId: params.orgId, action: 'revoke' }) })
    setShareToken(null); setSharingBusy(false)
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  const thStyle: React.CSSProperties = {
    padding: '7px 10px', fontSize: '10px', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    color: s.dim, textAlign: 'right', whiteSpace: 'nowrap',
    cursor: 'pointer', userSelect: 'none',
    background: 'var(--bg)',
  }

  const tdStyle: React.CSSProperties = {
    padding: '9px 10px', textAlign: 'right', verticalAlign: 'middle',
    borderBottom: '0.5px solid rgba(var(--fg-rgb),0.05)',
  }

  function sortArrow(col: typeof sortBy) {
    if (sortBy !== col) return <span style={{ opacity: 0.25 }}> ↕</span>
    return <span style={{ color: 'var(--accent)' }}>{sortDir === -1 ? ' ↓' : ' ↑'}</span>
  }

  // ── Loading / no season ───────────────────────────────────────────────────

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>
  )

  const withScores = ranked.filter(r => r.combinedScore != null).length
  const flagged    = filtered.filter(r => r.tryoutFlag || r.evalFlag || r.gcFlag).length
  const ageGroups  = season?.age_groups ?? []
  const teamOptions = (ag: string) => teams.filter(t => t.age_group === ag || t.age_group === 'all')

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800 }}>Rankings</h1>
          {season && <div style={{ fontSize: '13px', color: s.muted, marginTop: '2px' }}>{season.label}</div>}
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowWeights(v => !v)} style={{
            padding: '7px 14px', borderRadius: '6px',
            border: `0.5px solid ${showWeights ? 'var(--accent)' : 'var(--border-md)'}`,
            background: showWeights ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
            color: showWeights ? 'var(--accent)' : s.muted,
            fontSize: '12px', cursor: 'pointer',
          }}>⚖ Weights</button>
          <button onClick={handleShare} disabled={sharingBusy} style={{
            padding: '7px 14px', borderRadius: '6px',
            border: `0.5px solid ${shareToken ? 'rgba(109,184,117,0.5)' : 'var(--border-md)'}`,
            background: shareToken ? 'rgba(109,184,117,0.1)' : 'var(--bg-input)',
            color: shareToken ? '#6DB875' : s.muted,
            fontSize: '12px', cursor: sharingBusy ? 'not-allowed' : 'pointer',
          }}>{shareCopied ? '✓ Copied!' : shareToken ? '⎋ Copy link' : '⎋ Share'}</button>
          {shareToken && (
            <button onClick={revokeShare} disabled={sharingBusy} style={{
              padding: '7px 14px', borderRadius: '6px',
              border: '0.5px solid rgba(232,112,96,0.4)',
              background: 'rgba(232,112,96,0.08)', color: '#E87060',
              fontSize: '12px', cursor: 'pointer',
            }}>Revoke</button>
          )}
          <button onClick={exportCsv} style={{
            padding: '7px 14px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
            background: 'var(--bg-input)', color: s.muted, fontSize: '12px', cursor: 'pointer',
          }}>↓ CSV</button>
        </div>
      </div>

      {/* Weight panel */}
      {showWeights && (() => {
        const totalW = tryoutWeight + evalWeight + gcWeight || 1
        const tPct = Math.round((tryoutWeight / totalW) * 100)
        const ePct = Math.round((evalWeight   / totalW) * 100)
        const gPct = 100 - tPct - ePct
        return (
          <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '0.75rem' }}>Combined score weighting</div>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              {([
                { label: 'Tryout',     val: tryoutWeight, set: setTryoutWeight, pct: tPct },
                { label: 'Coach eval', val: evalWeight,   set: setEvalWeight,   pct: ePct },
                { label: 'GC stats',   val: gcWeight,     set: setGcWeight,     pct: gPct },
              ] as const).map(({ label, val, set, pct }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '12px', color: s.muted, width: '72px', flexShrink: 0 }}>{label}</span>
                  <input type="range" min={0} max={100} value={Math.round(val * 100)}
                    onChange={e => set(Number(e.target.value) / 100)}
                    style={{ width: '120px' }} />
                  <span style={{ fontSize: '12px', fontWeight: 700, minWidth: '28px' }}>{Math.round(val * 100)}</span>
                  <span style={{ fontSize: '11px', color: s.dim }}>= {pct}%</span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: '11px', color: s.dim, marginTop: '8px' }}>
              Weights normalize automatically among available data. A player with no GC stats uses tryout + eval at 100%.
            </div>
          </div>
        )
      })()}

      {/* Summary chips */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {[
          { label: 'Players',  val: ranked.length,  color: undefined },
          { label: 'Scored',   val: withScores,     color: '#6DB875' },
          ...(flagged > 0 ? [{ label: `${flagged} variance flag${flagged !== 1 ? 's' : ''}`, val: null, color: '#E8A020' as string }] : []),
        ].map(({ label, val, color }) => (
          <div key={label} style={{ padding: '6px 14px', borderRadius: '8px', background: color ? `${color}18` : 'var(--bg-card)', border: `0.5px solid ${color ? `${color}55` : 'var(--border)'}` }}>
            {val != null && <span style={{ fontSize: '16px', fontWeight: 800, color: color ?? 'var(--fg)', marginRight: '5px' }}>{val}</span>}
            <span style={{ fontSize: '11px', color: color ?? s.muted }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        {['all', ...ageGroups].map(ag => (
          <button key={ag} onClick={() => setAgeFilter(ag)} style={{
            padding: '5px 12px', borderRadius: '20px', border: '0.5px solid',
            borderColor: ageFilter === ag ? 'var(--accent)' : 'var(--border-md)',
            background: ageFilter === ag ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
            color: ageFilter === ag ? 'var(--accent)' : s.muted,
            fontSize: '12px', fontWeight: ageFilter === ag ? 700 : 400, cursor: 'pointer',
          }}>{ag === 'all' ? 'All ages' : ag}</button>
        ))}
      </div>

      {/* Cutoff controls — only when a single age group is selected */}
      {ageFilter !== 'all' && filtered.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '1rem', padding: '10px 14px', background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '10px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', fontWeight: 700 }}>Cutoff lines</span>
          {[
            { key: 'blue'  as const, label: 'Blue',  color: '#4090E0' },
            { key: 'white' as const, label: 'White', color: s.muted },
          ].map(({ key, label, color }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color, minWidth: '36px' }}>{label}</span>
              <button onClick={() => setCutoff(key, ageCutoff[key] - 1)} style={{ width: '22px', height: '22px', borderRadius: '4px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: s.muted, fontSize: '14px', cursor: 'pointer', lineHeight: 1 }}>−</button>
              <span style={{ fontSize: '13px', fontWeight: 800, minWidth: '24px', textAlign: 'center' }}>{ageCutoff[key]}</span>
              <button onClick={() => setCutoff(key, ageCutoff[key] + 1)} style={{ width: '22px', height: '22px', borderRadius: '4px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: s.muted, fontSize: '14px', cursor: 'pointer', lineHeight: 1 }}>+</button>
            </div>
          ))}
          <span style={{ fontSize: '11px', color: s.dim }}>
            Blue: {ageCutoff.blue} · White: {ageCutoff.white} · Cut: {Math.max(0, filtered.length - ageCutoff.blue - ageCutoff.white)}
          </span>
        </div>
      )}

      {/* Variance legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px', fontSize: '11px', color: s.dim }}>
        <span style={{ display: 'inline-block', width: '14px', height: '14px', borderRadius: '3px', background: 'rgba(232,160,32,0.22)', border: '0.5px solid rgba(232,160,32,0.5)', verticalAlign: 'middle' }} />
        <span>Component score differs from combined by ≥ {VARIANCE_THRESHOLD} — review this player</span>
      </div>

      {/* Rankings table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '14px' }}>
          No players found. Import registration data and add scores to see rankings.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                <th style={{ ...thStyle, textAlign: 'left', width: '36px' }}>#</th>
                <th style={{ ...thStyle, textAlign: 'left', cursor: 'pointer' }} onClick={() => toggleSort('name')}>
                  Player{sortArrow('name')}
                </th>
                <th style={{ ...thStyle, width: '80px' }} onClick={() => toggleSort('tryout')}>
                  Tryout{sortArrow('tryout')}
                </th>
                <th style={{ ...thStyle, width: '80px' }} onClick={() => toggleSort('eval')}>
                  Coach Eval{sortArrow('eval')}
                </th>
                <th style={{ ...thStyle, width: '80px' }} onClick={() => toggleSort('gc')}>
                  GC Stats{sortArrow('gc')}
                </th>
                <th style={{ ...thStyle, width: '88px', color: 'var(--accent)' }} onClick={() => toggleSort('combined')}>
                  Combined{sortArrow('combined')}
                </th>
                {teams.length > 0 && (
                  <th style={{ ...thStyle, textAlign: 'left', width: '130px' }}>Team</th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, idx) => {
                const rank = row.combinedScore != null ? idx + 1 : null
                const tOpt = teamOptions(row.player.tryout_age_group ?? row.player.age_group)
                const assignedTeam = teams.find(t => t.id === row.assignedTeam)

                // Cutoff dividers
                const showBlueLine  = ageFilter !== 'all' && idx === ageCutoff.blue
                const showWhiteLine = ageFilter !== 'all' && idx === ageCutoff.blue + ageCutoff.white

                // Group color for row left-border
                const inBlue  = ageFilter !== 'all' && idx < ageCutoff.blue
                const inWhite = ageFilter !== 'all' && idx >= ageCutoff.blue && idx < ageCutoff.blue + ageCutoff.white

                const rowBorderColor = inBlue ? 'rgba(64,144,224,0.45)' : inWhite ? 'rgba(var(--fg-rgb),0.2)' : 'transparent'

                const cellBase: React.CSSProperties = { ...tdStyle }
                const flagCell: React.CSSProperties = { ...tdStyle, background: 'rgba(232,160,32,0.15)', position: 'relative' }

                return (
                  <>
                    {showBlueLine && (
                      <tr key={`cut-blue-${idx}`}>
                        <td colSpan={teams.length > 0 ? 7 : 6} style={{ padding: '0', border: 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px' }}>
                            <div style={{ flex: 1, height: '1.5px', background: 'rgba(64,144,224,0.5)' }} />
                            <span style={{ fontSize: '10px', fontWeight: 800, color: '#4090E0', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                              Blue / White cutoff
                            </span>
                            <div style={{ flex: 1, height: '1.5px', background: 'rgba(64,144,224,0.5)' }} />
                          </div>
                        </td>
                      </tr>
                    )}
                    {showWhiteLine && (
                      <tr key={`cut-white-${idx}`}>
                        <td colSpan={teams.length > 0 ? 7 : 6} style={{ padding: '0', border: 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px' }}>
                            <div style={{ flex: 1, height: '1.5px', background: 'rgba(var(--fg-rgb),0.25)' }} />
                            <span style={{ fontSize: '10px', fontWeight: 800, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                              White / Cut line
                            </span>
                            <div style={{ flex: 1, height: '1.5px', background: 'rgba(var(--fg-rgb),0.25)' }} />
                          </div>
                        </td>
                      </tr>
                    )}
                    <tr
                      key={row.player.id}
                      style={{
                        borderLeft: `3px solid ${rowBorderColor}`,
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(var(--fg-rgb),0.015)',
                      }}
                    >
                      {/* Rank */}
                      <td style={{ ...tdStyle, textAlign: 'left', fontWeight: 700, color: s.dim, fontSize: '12px' }}>
                        {rank ?? '–'}
                      </td>

                      {/* Player */}
                      <td style={{ ...tdStyle, textAlign: 'left' }}>
                        <div style={{ fontWeight: 700 }}>
                          {row.player.last_name}, {row.player.first_name}
                        </div>
                        <div style={{ display: 'flex', gap: '5px', marginTop: '2px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(var(--fg-rgb),0.07)', color: s.dim, fontWeight: 600 }}>
                            {row.player.tryout_age_group ?? row.player.age_group}
                          </span>
                          {row.player.jersey_number && (
                            <span style={{ fontSize: '10px', color: s.dim }}>#{row.player.jersey_number}</span>
                          )}
                          {row.player.prior_team && (
                            <span style={{ fontSize: '10px', padding: '1px 5px', borderRadius: '3px', background: 'rgba(64,160,232,0.1)', color: '#40A0E8', fontWeight: 600 }}>
                              {row.player.prior_team}
                            </span>
                          )}
                          <span style={{ fontSize: '10px', color: s.dim }}>
                            {row.scoreCount > 0 ? `${row.scoreCount}×try` : ''}
                            {row.evalCount  > 0 ? ` ${row.evalCount}×eval` : ''}
                            {row.hasGc ? ' GC' : ''}
                          </span>
                        </div>
                      </td>

                      {/* Tryout score */}
                      <td style={row.tryoutFlag ? flagCell : cellBase}>
                        {row.tryoutAvg != null
                          ? <><span style={{ fontWeight: 700 }}>{row.tryoutAvg.toFixed(2)}</span>{row.tryoutFlag && <span title="Variance flag" style={{ fontSize: '10px', marginLeft: '3px' }}>⚠</span>}</>
                          : <span style={{ color: s.dim }}>—</span>
                        }
                      </td>

                      {/* Coach eval score */}
                      <td style={row.evalFlag ? flagCell : cellBase}>
                        {row.coachEvalAvg != null
                          ? <><span style={{ fontWeight: 700 }}>{row.coachEvalAvg.toFixed(2)}</span>{row.evalFlag && <span title="Variance flag" style={{ fontSize: '10px', marginLeft: '3px' }}>⚠</span>}</>
                          : <span style={{ color: s.dim }}>—</span>
                        }
                      </td>

                      {/* GC stats */}
                      <td style={row.gcFlag ? flagCell : cellBase}>
                        {row.gcStat != null ? (
                          <>
                            <span style={{ fontWeight: 700 }}>
                              {row.gcStat.ops != null
                                ? row.gcStat.ops.toFixed(3)
                                : row.gcStat.era != null
                                  ? row.gcStat.era.toFixed(2)
                                  : '—'}
                            </span>
                            <span style={{ fontSize: '10px', color: s.dim, display: 'block' }}>
                              {row.gcStat.ops != null ? 'OPS' : row.gcStat.era != null ? 'ERA' : ''}
                            </span>
                            {row.gcFlag && <span title="Variance flag" style={{ fontSize: '10px' }}>⚠</span>}
                          </>
                        ) : <span style={{ color: s.dim }}>—</span>}
                      </td>

                      {/* Combined */}
                      <td style={{ ...tdStyle, fontWeight: 800, fontSize: '15px', color: row.combinedScore != null ? 'var(--accent)' : s.dim }}>
                        {row.combinedScore?.toFixed(2) ?? '—'}
                      </td>

                      {/* Team assignment */}
                      {teams.length > 0 && (
                        <td style={{ ...tdStyle, textAlign: 'left' }}>
                          <select
                            value={row.assignedTeam ?? ''}
                            onChange={e => assignTeam(row.player.id, e.target.value || null)}
                            disabled={assigning === row.player.id}
                            style={{
                              background: assignedTeam ? 'rgba(109,184,117,0.1)' : 'var(--bg-input)',
                              border: `0.5px solid ${assignedTeam ? 'rgba(109,184,117,0.3)' : 'var(--border-md)'}`,
                              borderRadius: '6px', padding: '4px 8px', fontSize: '12px',
                              color: assignedTeam ? '#6DB875' : s.muted, cursor: 'pointer',
                              width: '100%',
                            }}
                          >
                            <option value="">Assign…</option>
                            {tOpt.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                          </select>
                        </td>
                      )}
                    </tr>
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  )
}
