'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { setSelectedTeamId } from '../../lib/selectedTeam'
import Link from 'next/link'

// Positions in display order (positions view uses grouped OF)
const INFIELD   = ['P','C','1B','2B','SS','3B']
const OF_POS    = ['LF','CF','LC','RC','RF']
const POS_COLS  = [...INFIELD, 'OF'] // columns shown in positions view

const POS_COLORS: Record<string, string> = {
  P: '#E8C060', C: '#E090B0',
  '1B': '#80B0E8', '2B': '#80B0E8', SS: '#80B0E8', '3B': '#80B0E8',
  LF: '#6DB875', CF: '#6DB875', LC: '#6DB875', RC: '#6DB875', RF: '#6DB875',
}

type StatRow = {
  player_id: string
  first_name: string
  last_name: string
  jersey_number: number
  innings_p: number; innings_c: number
  innings_1b: number; innings_2b: number; innings_ss: number; innings_3b: number
  innings_lf: number; innings_cf: number; innings_rf: number
  innings_bench: number; innings_infield: number; innings_outfield: number
  innings_total: number; innings_all: number; bench_pct: number
  innings_lc?: number; innings_rc?: number
  innings_target?: number | null
}

function pct(val: number) {
  return Math.round(val * 100) + '%'
}

function BenchBar({ pct: p }: { pct: number }) {
  const pctVal = Math.round(p * 100)
  const color = pctVal > 50 ? '#E87060' : pctVal > 33 ? '#E8A020' : '#6DB875'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
      <div style={{ flex: 1, height: '6px', background: 'var(--border-subtle)', borderRadius: '3px', overflow: 'hidden' }}>
        <div style={{ width: `${pctVal}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.3s' }} />
      </div>
      <span style={{ fontSize: '11px', color, fontWeight: 600, minWidth: '30px', textAlign: 'right' }}>
        {pctVal}%
      </span>
    </div>
  )
}

// ── Baseball diamond heat-map ─────────────────────────────────────────────────
function DiamondChart({ row, compact = false }: { row: StatRow; compact?: boolean }) {
  const W = compact ? 130 : 256
  const H = Math.round(W * 0.92)

  const positions = [
    { key: 'innings_p',  label: 'P',  fx: 0.500, fy: 0.672, color: '#E8C060' },
    { key: 'innings_c',  label: 'C',  fx: 0.500, fy: 0.935, color: '#E090B0' },
    { key: 'innings_1b', label: '1B', fx: 0.810, fy: 0.624, color: '#80B0E8' },
    { key: 'innings_2b', label: '2B', fx: 0.655, fy: 0.420, color: '#80B0E8' },
    { key: 'innings_ss', label: 'SS', fx: 0.332, fy: 0.488, color: '#80B0E8' },
    { key: 'innings_3b', label: '3B', fx: 0.190, fy: 0.624, color: '#80B0E8' },
    { key: 'innings_lf', label: 'LF', fx: 0.118, fy: 0.208, color: '#6DB875' },
    { key: 'innings_cf', label: 'CF', fx: 0.500, fy: 0.068, color: '#6DB875' },
    { key: 'innings_rf', label: 'RF', fx: 0.882, fy: 0.208, color: '#6DB875' },
    { key: 'innings_lc', label: 'LC', fx: 0.295, fy: 0.105, color: '#6DB875' },
    { key: 'innings_rc', label: 'RC', fx: 0.705, fy: 0.105, color: '#6DB875' },
  ] as const

  const counts = positions.map(p => (row[p.key as keyof StatRow] as number | undefined) ?? 0)
  // Only show LC/RC if the team uses them
  const usesLC = counts[9] > 0
  const usesRC = counts[10] > 0
  const visiblePositions = positions.filter((_, i) =>
    i < 9 || (i === 9 && usesLC) || (i === 10 && usesRC)
  )
  const visibleCounts = counts.filter((_, i) =>
    i < 9 || (i === 9 && usesLC) || (i === 10 && usesRC)
  )

  const max = Math.max(...visibleCounts, 1)
  const baseR = compact ? 7.5 : 13

  const hX = 0.500 * W, hY = 0.935 * H
  const fX = 0.810 * W, fY = 0.624 * H
  const sX = 0.500 * W, sY = 0.255 * H
  const tX = 0.190 * W, tY = 0.624 * H

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: `${W}px`, display: 'block' }}>
      {/* Outfield fill */}
      <path d={`M ${0.07*W} ${0.50*H} Q ${0.50*W} ${-0.14*H} ${0.93*W} ${0.50*H} Z`}
        style={{ fill: 'rgba(109,184,117,0.07)' }} />
      {/* Infield diamond */}
      <polygon points={`${hX},${hY} ${fX},${fY} ${sX},${sY} ${tX},${tY}`}
        style={{ fill: 'rgba(232,160,32,0.05)', stroke: 'rgba(232,160,32,0.2)', strokeWidth: 0.75 }} />
      {/* Foul lines */}
      <line x1={hX} y1={hY} x2={0.04*W} y2={0.09*H} style={{ stroke: 'rgba(255,255,255,0.07)', strokeWidth: 1 }} />
      <line x1={hX} y1={hY} x2={0.96*W} y2={0.09*H} style={{ stroke: 'rgba(255,255,255,0.07)', strokeWidth: 1 }} />
      {/* Position nodes */}
      {visiblePositions.map((p, i) => {
        const count = visibleCounts[i]
        const intensity = count / max
        const cx = p.fx * W
        const cy = p.fy * H
        const r = count > 0 ? baseR * (0.6 + intensity * 0.55) : baseR * 0.48
        const fillOp = count > 0 ? 0.10 + intensity * 0.58 : 0.04
        const strokeOp = count > 0 ? 0.40 + intensity * 0.60 : 0.12
        return (
          <g key={p.label}>
            {count > 0 && (
              <circle cx={cx} cy={cy} r={r + (compact ? 5 : 8)}
                style={{ fill: p.color, fillOpacity: intensity * 0.09 }} />
            )}
            <circle cx={cx} cy={cy} r={r}
              style={{ fill: p.color, fillOpacity: fillOp, stroke: p.color, strokeWidth: compact ? 1 : 1.5, strokeOpacity: strokeOp }} />
            {!compact && (
              <text x={cx} y={cy - r - 3} textAnchor="middle"
                style={{ fontSize: '7.5px', fontWeight: 700, fill: p.color, fillOpacity: Math.min(1, strokeOp + 0.1) }}>
                {p.label}
              </text>
            )}
            <text x={cx} y={cy + (compact ? 2.5 : 3.5)} textAnchor="middle"
              style={{ fontSize: compact ? '6.5px' : '8.5px', fontWeight: 800, fill: p.color, fillOpacity: count > 0 ? 0.92 : 0.18 }}>
              {count > 0 ? count : (compact ? '' : p.label)}
            </text>
            {compact && count === 0 && (
              <text x={cx} y={cy + 2.5} textAnchor="middle"
                style={{ fontSize: '5.5px', fontWeight: 700, fill: p.color, fillOpacity: 0.18 }}>
                {p.label}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

// ── Stacked position-distribution bar ────────────────────────────────────────
function PositionBar({ row }: { row: StatRow }) {
  const total = row.innings_all
  if (!total) return null
  const infieldInn = (row.innings_1b ?? 0) + (row.innings_2b ?? 0) + (row.innings_ss ?? 0) + (row.innings_3b ?? 0)
  const segments = [
    { label: 'P',      val: row.innings_p ?? 0,         color: '#E8C060' },
    { label: 'C',      val: row.innings_c ?? 0,         color: '#E090B0' },
    { label: 'Infield',val: infieldInn,                  color: '#80B0E8' },
    { label: 'Outfield',val: row.innings_outfield ?? 0, color: '#6DB875' },
    { label: 'Bench',  val: row.innings_bench ?? 0,     color: 'rgba(150,150,160,0.45)' },
  ].filter(s => s.val > 0)
  return (
    <div style={{ display: 'flex', height: '7px', borderRadius: '4px', overflow: 'hidden', gap: '1px' }}>
      {segments.map(s => (
        <div key={s.label}
          title={`${s.label}: ${s.val} inn (${Math.round(s.val/total*100)}%)`}
          style={{ flex: s.val, background: s.color, minWidth: '2px', transition: 'flex 0.4s' }} />
      ))}
    </div>
  )
}

// ── Legend for the position bar ───────────────────────────────────────────────
function PositionBarLegend({ row }: { row: StatRow }) {
  const total = row.innings_all
  if (!total) return null
  const infieldInn = (row.innings_1b ?? 0) + (row.innings_2b ?? 0) + (row.innings_ss ?? 0) + (row.innings_3b ?? 0)
  const items = [
    { label: 'P',  val: row.innings_p ?? 0,         color: '#E8C060' },
    { label: 'C',  val: row.innings_c ?? 0,         color: '#E090B0' },
    { label: 'IF', val: infieldInn,                  color: '#80B0E8' },
    { label: 'OF', val: row.innings_outfield ?? 0,  color: '#6DB875' },
    { label: 'B',  val: row.innings_bench ?? 0,     color: 'rgba(150,150,160,0.55)' },
  ].filter(s => s.val > 0)
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '5px' }}>
      {items.map(s => (
        <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
          <div style={{ width: '7px', height: '7px', borderRadius: '2px', background: s.color, flexShrink: 0 }} />
          <span style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.5)` }}>{s.label} {s.val}</span>
        </div>
      ))}
    </div>
  )
}

type SortKey = 'name' | 'bench_pct' | 'innings_total' | 'innings_infield' | 'innings_outfield' | 'innings_bench'

export default function FairnessPage() {
  const supabase = createClient()
  const [stats, setStats] = useState<StatRow[]>([])
  const [seasons, setSeasons] = useState<any[]>([])
  const [activeSeason, setActiveSeason] = useState<any>(null)
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [sortKey, setSortKey] = useState<SortKey>('batting_order' as any)
  const [sortDir, setSortDir] = useState<1 | -1>(1)
  const [view, setView] = useState<'summary' | 'positions'>('summary')
  const [games, setGames] = useState<any[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState<StatRow | null>(null)
  const [playerSlots, setPlayerSlots] = useState<any[]>([])
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [gameCount, setGameCount] = useState(0)
  const [benchPatterns, setBenchPatterns] = useState<Record<string, number[]>>({})

  useEffect(() => { init() }, [])
  useEffect(() => {
    if (!selectedSeasonId) return
    loadStats(selectedSeasonId)
    const season = seasons.find((s: any) => s.id === selectedSeasonId)
    if (season?.team_id) setSelectedTeamId(season.team_id)
  }, [selectedSeasonId])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: teams } = await supabase
      .from('teams').select('id').eq('is_active', true)
    const teamIds = (teams ?? []).map((t: any) => t.id)
    if (!teamIds.length) { setLoading(false); return }

    const { data: seasonRows } = await supabase
      .from('seasons')
      .select('id, name, is_active, team_id, team:teams(name)')
      .in('team_id', teamIds)
      .order('created_at', { ascending: false })

    setSeasons(seasonRows ?? [])

    // Prefer the cookie-stored team's active season
    const cookieMatch = document.cookie.match(/(?:^|; )selected_team_id=([^;]*)/)
    const storedTeamId = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null
    const preferred = storedTeamId
      ? (seasonRows ?? []).find((s: any) => s.team_id === storedTeamId && s.is_active)
        ?? (seasonRows ?? []).find((s: any) => s.team_id === storedTeamId)
      : null
    const active = preferred
      ?? (seasonRows ?? []).find((s: any) => s.is_active)
      ?? seasonRows?.[0]
    setActiveSeason(active)
    if (active) setSelectedSeasonId(active.id)
    else setLoading(false)
  }

  async function loadStats(seasonId: string) {
    setLoading(true)

    const { data: viewData } = await supabase
      .from('season_position_stats')
      .select('*')
      .eq('season_id', seasonId)

    const { data: games } = await supabase
      .from('games')
      .select('id, innings_played, opponent, game_date')
      .eq('season_id', seasonId)
      .eq('status', 'final')
      .order('game_date', { ascending: false })
    setGames(games ?? [])
    setGameCount((games ?? []).length)

    const gameIds = (games ?? []).map((g: any) => g.id)
    const lcMap: Record<string, number> = {}
    const rcMap: Record<string, number> = {}

    // Load player targets for this season
    const { data: playerData } = await supabase
      .from('players')
      .select('id, innings_target')
      .eq('season_id', seasonId)
    const targetMap: Record<string, number | null> = {}
    for (const p of playerData ?? []) targetMap[p.id] = p.innings_target

    if (gameIds.length) {
      const { data: slots } = await supabase
        .from('lineup_slots')
        .select('player_id, inning_positions, game_id, availability')
        .in('game_id', gameIds)

      const benchByInning: Record<string, Record<number, { benched: number; played: number }>> = {}

      for (const slot of slots ?? []) {
        const game = (games ?? []).find((g: any) => g.id === slot.game_id)
        const maxInn = game?.innings_played ?? 9
        const positions: (string | null)[] = slot.inning_positions ?? []

        positions.slice(0, maxInn).forEach((pos) => {
          if (pos === 'LC') lcMap[slot.player_id] = (lcMap[slot.player_id] ?? 0) + 1
          if (pos === 'RC') rcMap[slot.player_id] = (rcMap[slot.player_id] ?? 0) + 1
        })

        if (slot.availability === 'absent') continue
        if (!benchByInning[slot.player_id]) benchByInning[slot.player_id] = {}
        positions.slice(0, maxInn).forEach((pos, idx) => {
          if (!benchByInning[slot.player_id][idx]) benchByInning[slot.player_id][idx] = { benched: 0, played: 0 }
          benchByInning[slot.player_id][idx].played++
          if (!pos || pos === 'Bench') benchByInning[slot.player_id][idx].benched++
        })
      }

      // Flag innings where benched ≥ 50% of the time in ≥ 2 games
      const patterns: Record<string, number[]> = {}
      for (const [playerId, inningMap] of Object.entries(benchByInning)) {
        const flagged = Object.entries(inningMap)
          .filter(([, { benched, played }]) => played >= 2 && benched / played >= 0.5)
          .map(([idx]) => Number(idx))
          .sort((a, b) => a - b)
        if (flagged.length) patterns[playerId] = flagged
      }
      setBenchPatterns(patterns)
    }

    const rows: StatRow[] = (viewData ?? []).map((r: any) => ({
      ...r,
      innings_lc: lcMap[r.player_id] ?? 0,
      innings_rc: rcMap[r.player_id] ?? 0,
      innings_target: targetMap[r.player_id] ?? null,
    }))

    setStats(rows)
    setLoading(false)
  }

  async function openPlayer(row: StatRow) {
    setSelectedPlayer(row)
    setPlayerSlots([])
    if (!games.length) return
    setLoadingDetail(true)
    const gameIds = games.map(g => g.id)
    const { data } = await supabase
      .from('lineup_slots')
      .select('game_id, inning_positions, availability')
      .eq('player_id', row.player_id)
      .in('game_id', gameIds)
    setPlayerSlots(data ?? [])
    setLoadingDetail(false)
  }

  function sort(key: SortKey) {
    if (sortKey === key) setSortDir(d => d === 1 ? -1 : 1)
    else { setSortKey(key); setSortDir(key === 'name' ? 1 : -1) }
  }

  function getVal(row: StatRow, key: SortKey): number | string {
    if (key === 'name') return row.last_name
    return (row as any)[key] ?? 0
  }

  const sorted = [...stats].sort((a, b) => {
    const av = getVal(a, sortKey), bv = getVal(b, sortKey)
    return av < bv ? -sortDir : av > bv ? sortDir : 0
  })

  const avgBench = stats.length
    ? stats.reduce((s, r) => s + r.bench_pct, 0) / stats.length
    : 0

  const totalInnings = stats.reduce((s, r) => Math.max(s, r.innings_all), 0)

  function SortBtn({ k, label }: { k: SortKey; label: string }) {
    const active = sortKey === k
    return (
      <button onClick={() => sort(k)} style={{
        fontSize: '10px', fontWeight: active ? 700 : 500,
        color: active ? 'var(--accent)' : `rgba(var(--fg-rgb), 0.4)`,
        background: 'transparent', border: 'none', cursor: 'pointer', padding: '2px 0',
        display: 'flex', alignItems: 'center', gap: '2px',
      }}>
        {label}{active ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
      </button>
    )
  }

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto',
      padding: '1.5rem 1rem 6rem',
    }}>
      <Link href="/games" style={{
        fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`,
        textDecoration: 'none', display: 'block', marginBottom: '1rem',
      }}>‹ Games</Link>

      {/* Header */}
      <div style={{ marginBottom: '0.25rem' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '2px' }}>Playing Time</h1>
        {activeSeason && (
          <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)` }}>
            {(activeSeason as any).team?.name} · {activeSeason.name}
          </div>
        )}
      </div>

      {/* Season picker */}
      {seasons.length > 1 && (
        <select
          value={selectedSeasonId}
          onChange={e => setSelectedSeasonId(e.target.value)}
          style={{
            width: '100%', padding: '9px 12px', borderRadius: '8px',
            border: '0.5px solid var(--border-md)',
            background: 'var(--bg-card)', color: 'var(--fg)',
            fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            marginBottom: '1.25rem', marginTop: '0.75rem',
          }}
        >
          {seasons.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.team?.name} — {s.name}{s.is_active ? ' ✓' : ''}
            </option>
          ))}
        </select>
      )}

      {/* View toggle + Pitching link */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', background: 'var(--bg-input)',
          borderRadius: '6px', padding: '2px', gap: '2px' }}>
          {(['summary', 'positions'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '5px 14px', borderRadius: '4px', border: 'none',
              background: view === v ? 'var(--accent)' : 'transparent',
              color: view === v ? 'var(--accent-text)' : `rgba(var(--fg-rgb), 0.5)`,
              fontSize: '12px', fontWeight: view === v ? 700 : 400, cursor: 'pointer',
            }}>
              {v === 'summary' ? 'Summary' : 'By position'}
            </button>
          ))}
        </div>
        <Link href="/pitching" style={{
          fontSize: '12px', fontWeight: 600, color: `rgba(var(--fg-rgb), 0.45)`,
          textDecoration: 'none', padding: '5px 12px', borderRadius: '6px',
          border: '0.5px solid var(--border-md)', whiteSpace: 'nowrap',
        }}>
          Pitching log →
        </Link>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '4rem' }}>
          Loading…
        </div>
      )}

      {!loading && stats.length === 0 && (
        <div style={{ textAlign: 'center', marginTop: '4rem', padding: '0 1rem' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--fg)', marginBottom: '8px' }}>
            No stats yet
          </div>
          <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`, lineHeight: 1.6, maxWidth: '280px', margin: '0 auto' }}>
            Playing time stats appear here after you mark games as Final. Build a lineup and finish a game to see how time is distributed.
          </div>
        </div>
      )}

      {!loading && stats.length > 0 && (
        <>
          {/* Season summary bar */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Games', value: gameCount },
              { label: 'Players', value: stats.length },
              { label: 'Avg bench', value: pct(avgBench), color: avgBench > 0.4 ? '#E87060' : avgBench > 0.25 ? '#E8A020' : '#6DB875' },
              { label: 'Max innings', value: totalInnings },
            ].map(s => (
              <div key={s.label} style={{
                background: 'var(--bg-card)', border: '0.5px solid var(--border-subtle)',
                borderRadius: '8px', padding: '10px 16px', flex: 1, minWidth: '80px',
              }}>
                <div style={{ fontSize: '18px', fontWeight: 700, color: (s as any).color ?? 'var(--fg)' }}>
                  {s.value}
                </div>
                <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '2px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {s.label}
                </div>
              </div>
            ))}
          </div>

          {/* ── SUMMARY VIEW ── */}
          {view === 'summary' && (
            <>
              {/* Sort controls */}
              <div style={{ display: 'flex', gap: '12px', marginBottom: '8px', paddingLeft: '4px' }}>
                <span style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)` }}>Sort:</span>
                <SortBtn k="name" label="Name" />
                <SortBtn k="bench_pct" label="Bench %" />
                <SortBtn k="innings_total" label="Field inn" />
                <SortBtn k="innings_bench" label="Bench inn" />
              </div>

              {sorted.map(row => {
                const infieldInn = (row.innings_1b ?? 0) + (row.innings_2b ?? 0) + (row.innings_ss ?? 0) + (row.innings_3b ?? 0)
                const infieldPct = row.innings_total > 0 ? Math.round(infieldInn / row.innings_total * 100) : 0
                const benchPctVal = Math.round(row.bench_pct * 100)
                const benchColor = benchPctVal > 50 ? '#E87060' : benchPctVal > 33 ? '#E8A020' : '#6DB875'
                const behindTarget = (row.innings_target ?? 0) > 0 && row.innings_total < row.innings_target!
                const alertLevel = benchPctVal > 50 ? 'red' : (benchPctVal > 33 || behindTarget) ? 'amber' : null
                const alertBorder = alertLevel === 'red' ? '#E87060' : alertLevel === 'amber' ? '#E8A020' : 'var(--border-subtle)'
                return (
                  <div key={row.player_id} onClick={() => openPlayer(row)} style={{
                    background: 'var(--bg-card)',
                    border: `0.5px solid ${alertBorder}`,
                    borderLeft: alertLevel ? `3px solid ${alertBorder}` : `0.5px solid ${alertBorder}`,
                    borderRadius: '8px', padding: '10px 12px', marginBottom: '6px',
                    cursor: 'pointer',
                  }}>
                    {/* Player name + totals */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.3)`, width: '22px', textAlign: 'right' }}>
                        {row.jersey_number}
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: 600, flex: 1 }}>
                        {row.first_name} {row.last_name}
                      </span>
                      {benchPctVal > 50 && (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#E87060',
                          background: 'rgba(232,112,96,0.12)', borderRadius: '4px', padding: '2px 6px' }}>
                          Too much bench
                        </span>
                      )}
                      {benchPctVal <= 50 && behindTarget && (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#E8A020',
                          background: 'rgba(232,160,32,0.12)', borderRadius: '4px', padding: '2px 6px' }}>
                          Below target
                        </span>
                      )}
                      <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)` }}>
                        {row.innings_all} inn
                      </span>
                    </div>

                    {/* Bench % bar */}
                    <BenchBar pct={row.bench_pct} />

                    {/* Bench pattern flags */}
                    {(benchPatterns[row.player_id]?.length ?? 0) > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '9px', color: `rgba(var(--fg-rgb), 0.35)`, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                          Often benched:
                        </span>
                        {benchPatterns[row.player_id].map(i => (
                          <span key={i} style={{
                            fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: '3px',
                            background: 'rgba(232,160,32,0.12)', color: '#E8A020',
                            border: '0.5px solid rgba(232,160,32,0.25)',
                          }}>
                            Inn {i + 1}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Target progress */}
                    {(row.innings_target ?? 0) > 0 && (() => {
                      const t = row.innings_target!
                      const f = row.innings_total ?? 0
                      const met = f >= t
                      return (
                        <div style={{ marginTop: '6px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                            <span style={{ fontSize: '9px', color: `rgba(var(--fg-rgb), 0.4)`, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                              Target ({t} field inn)
                            </span>
                            <span style={{ fontSize: '9px', fontWeight: 700, color: met ? '#6DB875' : '#E8A020' }}>
                              {f}/{t}{met ? ' ✓' : ''}
                            </span>
                          </div>
                          <div style={{ height: '4px', background: 'var(--border-subtle)', borderRadius: '2px', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.round(Math.min(1, f / t) * 100)}%`, height: '100%',
                              background: met ? '#6DB875' : '#E8A020', borderRadius: '2px' }} />
                          </div>
                        </div>
                      )
                    })()}

                    {/* Position distribution bar */}
                    <div style={{ marginTop: '8px' }}>
                      <PositionBar row={row} />
                      <PositionBarLegend row={row} />
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {/* ── POSITIONS VIEW ── */}
          {view === 'positions' && (
            <div>
              <p style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '14px', lineHeight: 1.5 }}>
                Tap any player to see their full position breakdown on the field.
              </p>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '8px',
              }}>
                {sorted.map(row => {
                  const benchPctVal = Math.round(row.bench_pct * 100)
                  const benchColor = benchPctVal > 50 ? '#E87060' : benchPctVal > 33 ? '#E8A020' : '#6DB875'
                  return (
                    <div
                      key={row.player_id}
                      onClick={() => openPlayer(row)}
                      style={{
                        background: 'var(--bg-card)',
                        border: '0.5px solid var(--border)',
                        borderRadius: '10px', padding: '10px 8px',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s',
                      }}
                    >
                      {/* Name + bench % */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <div>
                          <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.3)`, marginRight: '4px' }}>
                            #{row.jersey_number}
                          </span>
                          <span style={{ fontSize: '12px', fontWeight: 700 }}>
                            {row.first_name[0]}. {row.last_name}
                          </span>
                        </div>
                        <span style={{ fontSize: '10px', fontWeight: 700, color: benchColor }}>
                          {benchPctVal}%B
                        </span>
                      </div>
                      {/* Mini diamond */}
                      <DiamondChart row={row} compact />
                      {/* Position bar */}
                      <div style={{ marginTop: '6px' }}>
                        <PositionBar row={row} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
      {/* ── PLAYER DETAIL SHEET ── */}
      {selectedPlayer && (
        <div onClick={() => setSelectedPlayer(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg2)', borderRadius: '16px 16px 0 0',
            width: '100%', maxWidth: '600px',
            border: '0.5px solid var(--border)',
            maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          }}>
            {/* Sheet header */}
            <div style={{ padding: '1rem 1.25rem 0.75rem', borderBottom: '0.5px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>
                  #{selectedPlayer.jersey_number} {selectedPlayer.first_name} {selectedPlayer.last_name}
                </div>
                <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '2px' }}>
                  {selectedPlayer.innings_all} total inn · {Math.round(selectedPlayer.bench_pct * 100)}% bench
                </div>
              </div>
              <button onClick={() => setSelectedPlayer(null)} style={{
                background: 'transparent', border: 'none', fontSize: '20px',
                color: `rgba(var(--fg-rgb), 0.35)`, cursor: 'pointer', padding: '4px',
              }}>✕</button>
            </div>

            {/* Diamond heat map */}
            <div style={{ padding: '1rem 1.25rem 0.5rem', borderBottom: '0.5px solid var(--border-subtle)' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '8px' }}>
                Position heat map — season to date
              </div>
              <div style={{ maxWidth: '260px', margin: '0 auto' }}>
                <DiamondChart row={selectedPlayer} />
              </div>
              {/* Bench + total pills */}
              <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
                {[
                  { label: 'P', val: selectedPlayer.innings_p, color: '#E8C060' },
                  { label: 'C', val: selectedPlayer.innings_c, color: '#E090B0' },
                  { label: 'IF', val: (selectedPlayer.innings_1b??0)+(selectedPlayer.innings_2b??0)+(selectedPlayer.innings_ss??0)+(selectedPlayer.innings_3b??0), color: '#80B0E8' },
                  { label: 'OF', val: selectedPlayer.innings_outfield, color: '#6DB875' },
                  { label: 'Bench', val: selectedPlayer.innings_bench, color: '#E87060' },
                ].filter(x => x.val > 0).map(x => (
                  <div key={x.label} style={{
                    fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px',
                    background: `${x.color}18`, border: `0.5px solid ${x.color}44`, color: x.color,
                  }}>
                    {x.label} {x.val}
                  </div>
                ))}
              </div>
            </div>

            {/* Bench by inning */}
            {!loadingDetail && playerSlots.length > 0 && (() => {
              const freq: Record<number, { benched: number; played: number }> = {}
              for (const slot of playerSlots) {
                if (slot.availability === 'absent') continue
                const game = games.find((g: any) => g.id === slot.game_id)
                const maxInn = game?.innings_played ?? 6
                const positions: (string | null)[] = (slot.inning_positions ?? []).slice(0, maxInn)
                positions.forEach((pos, idx) => {
                  if (!freq[idx]) freq[idx] = { benched: 0, played: 0 }
                  freq[idx].played++
                  if (!pos || pos === 'Bench') freq[idx].benched++
                })
              }
              const maxIdx = Math.max(...Object.keys(freq).map(Number))
              if (maxIdx < 0) return null
              return (
                <div style={{ padding: '0.75rem 1.25rem', borderBottom: '0.5px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '8px' }}>
                    Bench frequency by inning
                  </div>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-end' }}>
                    {Array.from({ length: maxIdx + 1 }, (_, i) => {
                      const { benched = 0, played = 0 } = freq[i] ?? {}
                      const pctVal = played > 0 ? benched / played : 0
                      const color = pctVal >= 0.5 ? '#E87060' : pctVal >= 0.33 ? '#E8A020' : '#6DB875'
                      return (
                        <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                          <div style={{ fontSize: '9px', fontWeight: 700, color, marginBottom: '3px' }}>
                            {played > 0 ? Math.round(pctVal * 100) + '%' : '—'}
                          </div>
                          <div style={{ height: '32px', background: 'var(--border-subtle)', borderRadius: '3px', overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
                            <div style={{
                              width: '100%',
                              height: `${Math.round(pctVal * 100)}%`,
                              background: color,
                              borderRadius: '3px',
                              minHeight: pctVal > 0 ? '2px' : 0,
                            }} />
                          </div>
                          <div style={{ fontSize: '8px', color: `rgba(var(--fg-rgb), 0.3)`, marginTop: '3px' }}>Inn {i + 1}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* Game list */}
            <div style={{ overflowY: 'auto', padding: '0.75rem 1.25rem 2rem' }}>
              {loadingDetail && (
                <div style={{ textAlign: 'center', color: `rgba(var(--fg-rgb), 0.35)`, padding: '2rem' }}>
                  Loading…
                </div>
              )}
              {!loadingDetail && games.map(game => {
                const slot = playerSlots.find(s => s.game_id === game.id)
                const absent = slot?.availability === 'absent'
                const maxInn = game.innings_played ?? 6
                const positions: (string | null)[] = slot?.inning_positions?.slice(0, maxInn) ?? []
                const fieldInn = positions.filter(p => p && p !== 'Bench').length
                const benchInn = positions.filter(p => p === 'Bench').length
                const date = new Date(game.game_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

                const POS_CHIP_COLORS: Record<string, string> = {
                  P: '#E8C060', C: '#E090B0',
                  '1B': '#80B0E8', '2B': '#80B0E8', SS: '#80B0E8', '3B': '#80B0E8',
                  LF: '#6DB875', CF: '#6DB875', LC: '#6DB875', RC: '#6DB875', RF: '#6DB875',
                }

                return (
                  <div key={game.id} style={{
                    borderBottom: '0.5px solid var(--border-subtle)',
                    padding: '10px 0',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>vs {game.opponent}</span>
                        <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, marginLeft: '8px' }}>{date}</span>
                      </div>
                      {absent ? (
                        <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)` }}>Absent</span>
                      ) : !slot ? (
                        <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.25)` }}>—</span>
                      ) : (
                        <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.45)` }}>
                          {fieldInn} field · {benchInn} bench
                        </span>
                      )}
                    </div>
                    {!absent && slot && (
                      <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                        {positions.map((pos, i) => {
                          const color = pos && pos !== 'Bench' ? POS_CHIP_COLORS[pos] : null
                          return (
                            <div key={i} style={{
                              fontSize: '10px', fontWeight: 600,
                              padding: '2px 5px', borderRadius: '3px', minWidth: '24px', textAlign: 'center',
                              background: color ? `${color}22` : 'var(--bg-input)',
                              color: color ?? `rgba(var(--fg-rgb), 0.25)`,
                              border: `0.5px solid ${color ? `${color}44` : 'var(--border-subtle)'}`,
                            }}>
                              {pos === 'Bench' ? 'B' : (pos ?? '—')}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              {!loadingDetail && games.length === 0 && (
                <div style={{ textAlign: 'center', color: `rgba(var(--fg-rgb), 0.35)`, padding: '2rem', fontSize: '13px' }}>
                  No finalized games yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
