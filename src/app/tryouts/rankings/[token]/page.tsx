'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../../../lib/supabase'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Player {
  id: string; first_name: string; last_name: string
  age_group: string; jersey_number: string | null; prior_team: string | null
}
interface ScoreRow  { player_id: string; tryout_score: number | null }
interface EvalRow   { player_id: string; scores: Record<string, number> | null }
interface GcRow     { player_id: string; ops: number | null; era: number | null; whip: number | null; avg: number | null; season_year: string }
interface Assignment { player_id: string; team_id: string; team_name: string; team_color: string | null }
interface EvalField  { field_key: string; label: string }

interface RankedRow {
  player:        Player
  tryoutAvg:     number | null
  evalAvg:       number | null
  gcScore:       number | null
  gcStat:        GcRow | null
  combined:      number | null
  team:          Assignment | null
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PublicRankingsPage({ params }: { params: { token: string } }) {
  const supabase = createClient()

  const [data,      setData]      = useState<any>(null)
  const [error,     setError]     = useState<string | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [ageFilter, setAgeFilter] = useState('all')
  const [sortBy,    setSortBy]    = useState<'combined' | 'tryout' | 'eval' | 'name'>('combined')

  useEffect(() => {
    supabase.rpc('tryout_rankings_by_token', { p_token: params.token })
      .then(({ data: d, error: e }) => {
        if (e || !d) { setError('Could not load rankings.'); setLoading(false); return }
        if (d.error) { setError(d.error); setLoading(false); return }
        setData(d)
        setLoading(false)
      })
  }, [params.token])

  const ranked = useMemo((): RankedRow[] => {
    if (!data) return []

    const players: Player[]     = data.players    ?? []
    const scores: ScoreRow[]    = data.scores      ?? []
    const evals: EvalRow[]      = data.evals       ?? []
    const gcStats: GcRow[]      = data.gc_stats    ?? []
    const assignments: Assignment[] = data.assignments ?? []
    const evalConfig: EvalField[]   = data.eval_config  ?? []

    return players.map(player => {
      const playerScores = scores.filter(s => s.player_id === player.id && s.tryout_score != null)
      const playerEvals  = evals.filter(e => e.player_id === player.id)
      const stat         = gcStats.find(g => g.player_id === player.id) ?? null
      const assignment   = assignments.find(a => a.player_id === player.id) ?? null

      const tryoutAvg = playerScores.length > 0
        ? playerScores.reduce((s, r) => s + (r.tryout_score ?? 0), 0) / playerScores.length
        : null

      let evalAvg: number | null = null
      if (playerEvals.length > 0 && evalConfig.length > 0) {
        const avgs = playerEvals.map(ev => {
          if (!ev.scores) return null
          const vals = evalConfig.map(f => ev.scores![f.field_key]).filter((v): v is number => v != null)
          return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
        }).filter((v): v is number => v != null)
        if (avgs.length > 0) evalAvg = avgs.reduce((a, b) => a + b, 0) / avgs.length
      }

      let gcScore: number | null = null
      if (stat) {
        const opsScore  = stat.ops  != null ? Math.min(5, (stat.ops / 1.2) * 5) : null
        const eraScore  = stat.era  != null ? Math.max(0, 5 - (stat.era / 4.0) * 5) : null
        const whipScore = stat.whip != null ? Math.max(0, 5 - (stat.whip / 1.3) * 5) : null
        const pitchComps = [eraScore, whipScore].filter((v): v is number => v != null)
        const pitchScore = pitchComps.length > 0 ? pitchComps.reduce((a, b) => a + b, 0) / pitchComps.length : null
        if (opsScore != null && pitchScore != null && stat.era != null) gcScore = opsScore * 0.6 + pitchScore * 0.4
        else if (opsScore != null) gcScore = opsScore
        else if (pitchScore != null) gcScore = pitchScore
      }

      const components: Array<[number, number]> = []
      if (tryoutAvg != null) components.push([tryoutAvg, 0.5])
      if (evalAvg   != null) components.push([evalAvg,   0.3])
      if (gcScore   != null) components.push([gcScore,   0.2])
      const totalW  = components.reduce((s, [, w]) => s + w, 0)
      const combined = components.length > 0
        ? components.reduce((s, [score, w]) => s + score * (w / totalW), 0)
        : null

      return { player, tryoutAvg, evalAvg, gcScore, gcStat: stat, combined, team: assignment }
    })
  }, [data])

  const ageGroups = useMemo(() => {
    const groups = Array.from(new Set(ranked.map(r => r.player.age_group))).sort()
    return groups
  }, [ranked])

  const filtered = useMemo(() => {
    let list = ageFilter === 'all' ? ranked : ranked.filter(r => r.player.age_group === ageFilter)
    return list.sort((a, b) => {
      if (sortBy === 'name')   return `${a.player.last_name}${a.player.first_name}`.localeCompare(`${b.player.last_name}${b.player.first_name}`)
      if (sortBy === 'tryout') return (b.tryoutAvg ?? -1) - (a.tryoutAvg ?? -1)
      if (sortBy === 'eval')   return (b.evalAvg   ?? -1) - (a.evalAvg   ?? -1)
      return (b.combined ?? -1) - (a.combined ?? -1)
    })
  }, [ranked, ageFilter, sortBy])

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)`,
    dim:   `rgba(var(--fg-rgb), 0.35)`,
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading…
    </main>
  )

  if (error) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px' }}>
      <div style={{ fontSize: '32px' }}>⚠</div>
      <div style={{ fontSize: '16px', color: s.muted }}>{error}</div>
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', maxWidth: '820px', margin: '0 auto', padding: '2rem 1.5rem 6rem' }}>

      {/* Header */}
      <div style={{ marginBottom: '1.75rem' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '4px' }}>
          Tryout Rankings
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 800 }}>{data?.season?.label}</h1>
        <div style={{ fontSize: '12px', color: s.dim, marginTop: '4px' }}>
          Read-only view · {filtered.length} player{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Print button */}
      <button onClick={() => window.print()} style={{
        marginBottom: '1.5rem', padding: '7px 16px', borderRadius: '6px',
        border: '0.5px solid var(--border-md)', background: 'var(--bg-input)',
        color: s.muted, fontSize: '12px', cursor: 'pointer',
      }} className="no-print">⎙ Print</button>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }} className="no-print">
        {['all', ...ageGroups].map(ag => (
          <button key={ag} onClick={() => setAgeFilter(ag)} style={{
            padding: '5px 12px', borderRadius: '20px', border: '0.5px solid',
            borderColor: ageFilter === ag ? 'var(--accent)' : 'var(--border-md)',
            background: ageFilter === ag ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
            color: ageFilter === ag ? 'var(--accent)' : s.muted,
            fontSize: '12px', fontWeight: ageFilter === ag ? 700 : 400, cursor: 'pointer',
          }}>{ag === 'all' ? 'All' : ag}</button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '11px', color: s.dim }}>Sort:</span>
          {(['combined', 'tryout', 'eval', 'name'] as const).map(opt => (
            <button key={opt} onClick={() => setSortBy(opt)} style={{
              padding: '4px 10px', borderRadius: '5px', border: '0.5px solid',
              borderColor: sortBy === opt ? 'var(--accent)' : 'var(--border-md)',
              background: sortBy === opt ? 'rgba(232,160,32,0.1)' : 'transparent',
              color: sortBy === opt ? 'var(--accent)' : s.muted,
              fontSize: '11px', fontWeight: sortBy === opt ? 700 : 400, cursor: 'pointer', textTransform: 'capitalize',
            }}>{opt}</button>
          ))}
        </div>
      </div>

      {/* Rankings list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {filtered.map((row, idx) => (
          <div key={row.player.id} style={{
            display: 'flex', alignItems: 'center', gap: '10px',
            background: 'var(--bg-card)', border: '0.5px solid var(--border)',
            borderRadius: '10px', padding: '10px 14px',
          }}>
            {/* Rank */}
            <div style={{ fontSize: '13px', fontWeight: 700, color: s.dim, minWidth: '26px', textAlign: 'right', flexShrink: 0 }}>
              {row.combined != null ? idx + 1 : '–'}
            </div>

            {/* Name / tags */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 700, fontSize: '14px' }}>{row.player.first_name} {row.player.last_name}</span>
                <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(var(--fg-rgb),0.07)', color: s.muted, fontWeight: 600 }}>{row.player.age_group}</span>
                {row.player.jersey_number && <span style={{ fontSize: '11px', color: s.dim }}>#{row.player.jersey_number}</span>}
                {row.player.prior_team && (
                  <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '4px', background: 'rgba(64,160,232,0.1)', color: '#40A0E8', fontWeight: 600 }}>
                    ↩ {row.player.prior_team}
                  </span>
                )}
                {row.team && (
                  <span style={{
                    fontSize: '11px', padding: '1px 7px', borderRadius: '4px', fontWeight: 700,
                    background: row.team.team_color ? `${row.team.team_color}22` : 'rgba(109,184,117,0.1)',
                    color: row.team.team_color ?? '#6DB875',
                    border: `0.5px solid ${row.team.team_color ?? '#6DB875'}55`,
                  }}>
                    {row.team.team_name}
                  </span>
                )}
              </div>
            </div>

            {/* Scores */}
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
              {row.tryoutAvg != null && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800 }}>{row.tryoutAvg.toFixed(2)}</div>
                  <div style={{ fontSize: '10px', color: s.dim }}>tryout</div>
                </div>
              )}
              {row.evalAvg != null && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800 }}>{row.evalAvg.toFixed(2)}</div>
                  <div style={{ fontSize: '10px', color: s.dim }}>eval</div>
                </div>
              )}
              {row.gcStat != null && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', fontWeight: 800 }}>
                    {row.gcStat.ops != null ? row.gcStat.ops.toFixed(3) : row.gcStat.era != null ? row.gcStat.era.toFixed(2) : '—'}
                  </div>
                  <div style={{ fontSize: '10px', color: s.dim }}>
                    {row.gcStat.ops != null ? 'OPS' : 'ERA'}
                  </div>
                </div>
              )}
              {row.combined != null && (
                <div style={{ textAlign: 'center', minWidth: '44px' }}>
                  <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--accent)' }}>{row.combined.toFixed(2)}</div>
                  <div style={{ fontSize: '10px', color: s.dim }}>combined</div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          main { padding: 0.5rem !important; max-width: 100% !important; }
          body { background: white !important; color: black !important; }
        }
      `}</style>
    </main>
  )
}
