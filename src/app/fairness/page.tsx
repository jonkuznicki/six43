'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
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

  useEffect(() => { init() }, [])
  useEffect(() => { if (selectedSeasonId) loadStats(selectedSeasonId) }, [selectedSeasonId])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: teams } = await supabase
      .from('teams').select('id').eq('is_active', true)
    const teamIds = (teams ?? []).map((t: any) => t.id)
    if (!teamIds.length) { setLoading(false); return }

    const { data: seasonRows } = await supabase
      .from('seasons')
      .select('id, name, is_active, team:teams(name)')
      .in('team_id', teamIds)
      .order('created_at', { ascending: false })

    setSeasons(seasonRows ?? [])
    const active = (seasonRows ?? []).find((s: any) => s.is_active) ?? seasonRows?.[0]
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
      .select('id, innings_played')
      .eq('season_id', seasonId)
      .eq('status', 'final')

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
        .select('player_id, inning_positions, game_id')
        .in('game_id', gameIds)

      for (const slot of slots ?? []) {
        const game = (games ?? []).find((g: any) => g.id === slot.game_id)
        const maxInn = game?.innings_played ?? 9
        const positions: string[] = slot.inning_positions ?? []
        positions.slice(0, maxInn).forEach((pos: string) => {
          if (pos === 'LC') lcMap[slot.player_id] = (lcMap[slot.player_id] ?? 0) + 1
          if (pos === 'RC') rcMap[slot.player_id] = (rcMap[slot.player_id] ?? 0) + 1
        })
      }
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

      {/* View toggle */}
      <div style={{ display: 'flex', background: 'var(--bg-input)',
        borderRadius: '6px', padding: '2px', gap: '2px', marginBottom: '1rem', width: 'fit-content' }}>
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

      {loading && (
        <div style={{ textAlign: 'center', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '4rem' }}>
          Loading…
        </div>
      )}

      {!loading && stats.length === 0 && (
        <div style={{ textAlign: 'center', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '4rem', fontSize: '14px' }}>
          No finalized games yet. Mark games as Finished to see playing time stats.
        </div>
      )}

      {!loading && stats.length > 0 && (
        <>
          {/* Season summary bar */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            {[
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
                return (
                  <div key={row.player_id} style={{
                    background: 'var(--bg-card)',
                    border: '0.5px solid var(--border-subtle)',
                    borderRadius: '8px', padding: '10px 12px', marginBottom: '6px',
                  }}>
                    {/* Player name + totals */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.3)`, width: '22px', textAlign: 'right' }}>
                        {row.jersey_number}
                      </span>
                      <span style={{ fontSize: '14px', fontWeight: 600, flex: 1 }}>
                        {row.first_name} {row.last_name}
                      </span>
                      <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)` }}>
                        {row.innings_all} inn
                      </span>
                    </div>

                    {/* Bench % bar */}
                    <BenchBar pct={row.bench_pct} />

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

                    {/* Key KPIs */}
                    <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                      {[
                        { label: 'Bench', value: `${benchPctVal}%`, color: benchColor },
                        { label: 'Pitcher', value: row.innings_p, color: '#E8C060' },
                        { label: 'Infield %', value: `${infieldPct}%`, color: '#80B0E8' },
                        { label: 'Catcher', value: row.innings_c, color: '#E090B0' },
                        { label: 'Total', value: row.innings_all, color: `rgba(var(--fg-rgb), 0.55)` },
                      ].map(kpi => (
                        <div key={kpi.label} style={{
                          flex: 1, background: 'var(--bg-input)', borderRadius: '6px',
                          padding: '5px 4px', textAlign: 'center',
                        }}>
                          <div style={{ fontSize: '12px', fontWeight: 700, color: kpi.color }}>
                            {kpi.value}
                          </div>
                          <div style={{ fontSize: '8px', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '1px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                            {kpi.label}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {/* ── POSITIONS VIEW ── */}
          {view === 'positions' && (
            <div style={{ overflowX: 'auto' }}>
              {/* Table header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: `20px 120px repeat(${POS_COLS.length}, 34px) 40px 40px`,
                gap: '2px', marginBottom: '4px', paddingBottom: '6px',
                borderBottom: '0.5px solid var(--border)',
                minWidth: '420px',
              }}>
                <div />
                <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.35)` }}>Player</div>
                {POS_COLS.map(p => (
                  <div key={p} style={{
                    fontSize: '9px', fontWeight: 700, textAlign: 'center',
                    color: p === 'OF' ? '#6DB875' : (POS_COLORS[p] ?? `rgba(var(--fg-rgb), 0.4)`),
                  }}>{p}</div>
                ))}
                <div style={{ fontSize: '9px', color: `rgba(var(--fg-rgb), 0.35)`, textAlign: 'center' }}>Fld</div>
                <div style={{ fontSize: '9px', color: `rgba(var(--fg-rgb), 0.35)`, textAlign: 'center' }}>B%</div>
              </div>

              {sorted.map((row, idx) => {
                const benchPctVal = Math.round(row.bench_pct * 100)
                const benchColor = benchPctVal > 50 ? '#E87060' : benchPctVal > 33 ? '#E8A020' : '#6DB875'
                const ofTotal = OF_POS.reduce((sum, p) => {
                  const key = `innings_${p.toLowerCase()}` as keyof StatRow
                  return sum + ((row[key] as number) ?? 0)
                }, 0)
                return (
                  <div key={row.player_id} style={{
                    display: 'grid',
                    gridTemplateColumns: `20px 120px repeat(${POS_COLS.length}, 34px) 40px 40px`,
                    gap: '2px',
                    background: idx % 2 === 0 ? 'var(--bg-card-alt)' : 'transparent',
                    borderRadius: '4px', padding: '3px 0',
                    minWidth: '420px',
                    alignItems: 'center',
                  }}>
                    <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.25)`, textAlign: 'right', paddingRight: '4px' }}>
                      {row.jersey_number}
                    </div>
                    <div style={{ fontSize: '12px', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.first_name[0]}. {row.last_name}
                    </div>
                    {INFIELD.map(p => {
                      const key = `innings_${p.toLowerCase()}` as keyof StatRow
                      const count = (row[key] as number) ?? 0
                      return (
                        <div key={p} style={{ textAlign: 'center', fontSize: '12px', fontWeight: count > 0 ? 700 : 400,
                          color: count > 0 ? (POS_COLORS[p] ?? 'var(--fg)') : `rgba(var(--fg-rgb), 0.12)` }}>
                          {count > 0 ? count : '·'}
                        </div>
                      )
                    })}
                    {/* Grouped OF column */}
                    <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: ofTotal > 0 ? 700 : 400,
                      color: ofTotal > 0 ? '#6DB875' : `rgba(var(--fg-rgb), 0.12)` }}>
                      {ofTotal > 0 ? ofTotal : '·'}
                    </div>
                    <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: 600, color: `rgba(var(--fg-rgb), 0.6)` }}>
                      {row.innings_total}
                    </div>
                    <div style={{ textAlign: 'center', fontSize: '11px', fontWeight: 700, color: benchColor }}>
                      {benchPctVal}%
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </main>
  )
}
