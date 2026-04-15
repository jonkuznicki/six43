'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'

interface Player {
  id:           string
  first_name:   string
  last_name:    string
  age_group:    string
  jersey_number: string | null
  prior_team:    string | null
}

interface TryoutScore {
  player_id:    string
  tryout_score: number | null
  scores:       Record<string, number> | null
  evaluator_name: string | null
}

interface CoachEval {
  player_id:  string
  scores:     Record<string, number> | null
  coach_name: string | null
  status:     string
}

interface GcStat {
  player_id: string
  stats:     Record<string, number | string> | null
}

interface ScoreConfig {
  key:    string
  label:  string
  weight: number
}

interface EvalConfig {
  key:    string
  label:  string
}

interface RankedPlayer {
  player:         Player
  tryoutAvg:      number | null
  coachEvalAvg:   number | null
  combinedScore:  number | null
  scoreCount:     number
  evalCount:      number
  assignedTeam:   string | null
}

interface Season {
  id:         string
  label:      string
  age_groups: string[]
}

interface Team {
  id:    string
  name:  string
  age_group: string
  color: string | null
}

export default function RankingsPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()

  const [season,      setSeason]      = useState<Season | null>(null)
  const [players,     setPlayers]     = useState<Player[]>([])
  const [tryoutScores, setTryoutScores] = useState<TryoutScore[]>([])
  const [coachEvals,  setCoachEvals]  = useState<CoachEval[]>([])
  const [teams,       setTeams]       = useState<Team[]>([])
  const [assignments, setAssignments] = useState<Record<string, string>>({})  // playerId → teamId
  const [scoreConfig, setScoreConfig] = useState<ScoreConfig[]>([])
  const [evalConfig,  setEvalConfig]  = useState<EvalConfig[]>([])
  const [loading,     setLoading]     = useState(true)
  const [ageFilter,   setAgeFilter]   = useState('all')
  const [sortBy,      setSortBy]      = useState<'combined' | 'tryout' | 'eval' | 'name'>('combined')
  const [assigning,   setAssigning]   = useState<string | null>(null)  // playerId
  const [tryoutWeight, setTryoutWeight] = useState(0.6)
  const [showWeights,  setShowWeights] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: seasonData } = await supabase
      .from('tryout_seasons').select('id, label, age_groups')
      .eq('org_id', params.orgId).eq('is_active', true).maybeSingle()
    setSeason(seasonData)

    if (!seasonData) { setLoading(false); return }

    const [
      { data: playerData },
      { data: scoreData },
      { data: evalData },
      { data: teamData },
      { data: assignData },
      { data: scoreCfg },
      { data: evalCfg },
    ] = await Promise.all([
      supabase.from('tryout_players').select('id, first_name, last_name, age_group, jersey_number, prior_team')
        .eq('org_id', params.orgId).eq('is_active', true)
        .order('last_name').order('first_name'),
      supabase.from('tryout_scores').select('player_id, tryout_score, scores, evaluator_name')
        .eq('org_id', params.orgId),
      supabase.from('tryout_coach_evals').select('player_id, scores, coach_name, status')
        .eq('org_id', params.orgId).eq('status', 'submitted'),
      supabase.from('tryout_teams').select('id, name, age_group, color')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id).eq('is_active', true),
      supabase.from('tryout_team_assignments').select('player_id, team_id')
        .eq('season_id', seasonData.id),
      supabase.from('tryout_scoring_config').select('category_key, label, weight')
        .eq('org_id', params.orgId).eq('is_active', true).order('sort_order'),
      supabase.from('tryout_coach_eval_config').select('field_key, label')
        .eq('org_id', params.orgId).eq('is_active', true).order('sort_order'),
    ])

    setPlayers(playerData ?? [])
    setTryoutScores(scoreData ?? [])
    setCoachEvals(evalData ?? [])
    setTeams(teamData ?? [])
    setScoreConfig((scoreCfg ?? []).map((c: any) => ({ key: c.category_key, label: c.label, weight: c.weight })))
    setEvalConfig((evalCfg ?? []).map((c: any) => ({ key: c.field_key, label: c.label })))

    const assignMap: Record<string, string> = {}
    for (const a of (assignData ?? [])) assignMap[a.player_id] = a.team_id
    setAssignments(assignMap)

    setLoading(false)
  }

  async function assignTeam(playerId: string, teamId: string | null) {
    if (!season) return
    setAssigning(playerId)
    if (teamId) {
      await supabase.from('tryout_team_assignments').upsert({
        player_id: playerId, team_id: teamId, season_id: season.id, org_id: params.orgId,
      }, { onConflict: 'player_id,season_id' })
      setAssignments(prev => ({ ...prev, [playerId]: teamId }))
    } else {
      await supabase.from('tryout_team_assignments').delete()
        .eq('player_id', playerId).eq('season_id', season.id)
      setAssignments(prev => { const next = { ...prev }; delete next[playerId]; return next })
    }
    setAssigning(null)
  }

  const ranked = useMemo((): RankedPlayer[] => {
    const evalWeight = 1 - tryoutWeight

    return players.map(player => {
      const playerScores = tryoutScores.filter(s => s.player_id === player.id && s.tryout_score != null)
      const playerEvals  = coachEvals.filter(e => e.player_id === player.id)

      // Average tryout score across evaluators
      const tryoutAvg = playerScores.length > 0
        ? playerScores.reduce((sum, s) => sum + (s.tryout_score ?? 0), 0) / playerScores.length
        : null

      // Average coach eval score across all submitted evals
      let coachEvalAvg: number | null = null
      if (playerEvals.length > 0 && evalConfig.length > 0) {
        const evalAvgs = playerEvals.map(ev => {
          if (!ev.scores) return null
          const vals = evalConfig.map(f => ev.scores![f.key]).filter((v): v is number => v != null)
          return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
        }).filter((v): v is number => v != null)
        if (evalAvgs.length > 0) {
          coachEvalAvg = evalAvgs.reduce((a, b) => a + b, 0) / evalAvgs.length
        }
      }

      // Combined weighted score (both or just tryout)
      let combinedScore: number | null = null
      if (tryoutAvg != null && coachEvalAvg != null) {
        // Both components present — weight them
        // Normalize coach eval from 1-5 scale to 1-5 (same as tryout score)
        combinedScore = tryoutAvg * tryoutWeight + coachEvalAvg * evalWeight
      } else if (tryoutAvg != null) {
        combinedScore = tryoutAvg
      } else if (coachEvalAvg != null) {
        combinedScore = coachEvalAvg
      }

      return {
        player,
        tryoutAvg,
        coachEvalAvg,
        combinedScore,
        scoreCount: playerScores.length,
        evalCount:  playerEvals.length,
        assignedTeam: assignments[player.id] ?? null,
      }
    })
  }, [players, tryoutScores, coachEvals, evalConfig, tryoutWeight, assignments])

  const filtered = useMemo(() => {
    let list = ranked
    if (ageFilter !== 'all') list = list.filter(r => r.player.age_group === ageFilter)
    return list.sort((a, b) => {
      if (sortBy === 'name') return `${a.player.last_name}${a.player.first_name}`.localeCompare(`${b.player.last_name}${b.player.first_name}`)
      if (sortBy === 'tryout') return (b.tryoutAvg ?? -1) - (a.tryoutAvg ?? -1)
      if (sortBy === 'eval')   return (b.coachEvalAvg ?? -1) - (a.coachEvalAvg ?? -1)
      return (b.combinedScore ?? -1) - (a.combinedScore ?? -1)
    })
  }, [ranked, ageFilter, sortBy])

  function exportCsv() {
    const rows = [
      ['Name', 'Age Group', 'Jersey', 'Tryout Score', 'Coach Eval', 'Combined', 'Scores', 'Evals', 'Team'],
      ...filtered.map(r => [
        `${r.player.first_name} ${r.player.last_name}`,
        r.player.age_group,
        r.player.jersey_number ?? '',
        r.tryoutAvg?.toFixed(2) ?? '',
        r.coachEvalAvg?.toFixed(2) ?? '',
        r.combinedScore?.toFixed(2) ?? '',
        String(r.scoreCount),
        String(r.evalCount),
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

  const ageGroupTeams = (ag: string) => teams.filter(t => t.age_group === ag || t.age_group === 'all')

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>
  )

  const withScores   = ranked.filter(r => r.combinedScore != null).length
  const noScores     = ranked.filter(r => r.combinedScore == null).length

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', maxWidth: '900px', margin: '0 auto', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800 }}>Rankings</h1>
          {season && <div style={{ fontSize: '13px', color: s.muted, marginTop: '2px' }}>{season.label}</div>}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowWeights(v => !v)} style={{
            padding: '7px 14px', borderRadius: '6px',
            border: `0.5px solid ${showWeights ? 'var(--accent)' : 'var(--border-md)'}`,
            background: showWeights ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
            color: showWeights ? 'var(--accent)' : s.muted,
            fontSize: '12px', cursor: 'pointer',
          }}>⚖ Weights</button>
          <button onClick={exportCsv} style={{
            padding: '7px 14px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
            background: 'var(--bg-input)', color: s.muted, fontSize: '12px', cursor: 'pointer',
          }}>↓ CSV</button>
        </div>
      </div>

      {/* Weight controls */}
      {showWeights && (
        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '0.75rem' }}>Score weighting</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <label style={{ fontSize: '12px', color: s.muted }}>Tryout score</label>
            <input type="range" min={0} max={100} value={Math.round(tryoutWeight * 100)}
              onChange={e => setTryoutWeight(Number(e.target.value) / 100)}
              style={{ width: '160px' }} />
            <span style={{ fontSize: '13px', fontWeight: 700, minWidth: '36px' }}>{Math.round(tryoutWeight * 100)}%</span>
            <span style={{ fontSize: '12px', color: s.dim }}>Coach eval: {Math.round((1 - tryoutWeight) * 100)}%</span>
          </div>
          <div style={{ fontSize: '11px', color: s.dim, marginTop: '6px' }}>
            Only applies when both scores are present. Otherwise uses whichever is available.
          </div>
        </div>
      )}

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        <div style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--bg-card)', border: '0.5px solid var(--border)' }}>
          <div style={{ fontSize: '18px', fontWeight: 800 }}>{ranked.length}</div>
          <div style={{ fontSize: '11px', color: s.muted }}>Players</div>
        </div>
        <div style={{ padding: '8px 16px', borderRadius: '8px', background: 'rgba(109,184,117,0.1)', border: '0.5px solid rgba(109,184,117,0.3)' }}>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#6DB875' }}>{withScores}</div>
          <div style={{ fontSize: '11px', color: s.muted }}>Scored</div>
        </div>
        {noScores > 0 && (
          <div style={{ padding: '8px 16px', borderRadius: '8px', background: 'rgba(232,160,32,0.1)', border: '0.5px solid rgba(232,160,32,0.3)' }}>
            <div style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent)' }}>{noScores}</div>
            <div style={{ fontSize: '11px', color: s.muted }}>No scores yet</div>
          </div>
        )}
        {teams.length > 0 && (
          <div style={{ padding: '8px 16px', borderRadius: '8px', background: 'var(--bg-card)', border: '0.5px solid var(--border)' }}>
            <div style={{ fontSize: '18px', fontWeight: 800 }}>{Object.keys(assignments).length}</div>
            <div style={{ fontSize: '11px', color: s.muted }}>Assigned to teams</div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        {/* Age group chips */}
        {['all', ...(season?.age_groups ?? [])].map(ag => (
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

      {/* Rankings table */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '14px' }}>
          No players found. Import registration data and add scores to see rankings.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
          {filtered.map((row, idx) => {
            const teamOptions = ageGroupTeams(row.player.age_group)
            const assignedTeam = teams.find(t => t.id === row.assignedTeam)
            return (
              <div key={row.player.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                background: 'var(--bg-card)', border: '0.5px solid var(--border)',
                borderRadius: '10px', padding: '10px 14px',
              }}>
                {/* Rank */}
                <div style={{ fontSize: '13px', fontWeight: 700, color: s.dim, minWidth: '28px', textAlign: 'right', flexShrink: 0 }}>
                  {row.combinedScore != null ? idx + 1 : '–'}
                </div>

                {/* Name + age group */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 700, fontSize: '14px' }}>{row.player.first_name} {row.player.last_name}</span>
                    <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(var(--fg-rgb),0.07)', color: s.muted, fontWeight: 600 }}>{row.player.age_group}</span>
                    {row.player.jersey_number && (
                      <span style={{ fontSize: '11px', color: s.dim }}>#{row.player.jersey_number}</span>
                    )}
                    {row.player.prior_team && (
                      <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '4px', background: 'rgba(64,160,232,0.1)', color: '#40A0E8', fontWeight: 600 }}>
                        ↩ {row.player.prior_team}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '11px', color: s.dim, marginTop: '1px' }}>
                    {row.scoreCount > 0 ? `${row.scoreCount} tryout score${row.scoreCount !== 1 ? 's' : ''}` : 'No tryout scores'}
                    {row.evalCount > 0 ? ` · ${row.evalCount} coach eval${row.evalCount !== 1 ? 's' : ''}` : ''}
                  </div>
                </div>

                {/* Score chips */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
                  {row.tryoutAvg != null && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '14px', fontWeight: 800 }}>{row.tryoutAvg.toFixed(2)}</div>
                      <div style={{ fontSize: '10px', color: s.dim }}>tryout</div>
                    </div>
                  )}
                  {row.coachEvalAvg != null && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '14px', fontWeight: 800 }}>{row.coachEvalAvg.toFixed(2)}</div>
                      <div style={{ fontSize: '10px', color: s.dim }}>eval</div>
                    </div>
                  )}
                  {row.combinedScore != null && (
                    <div style={{ textAlign: 'center', minWidth: '44px' }}>
                      <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--accent)' }}>{row.combinedScore.toFixed(2)}</div>
                      <div style={{ fontSize: '10px', color: s.dim }}>combined</div>
                    </div>
                  )}
                </div>

                {/* Team assignment */}
                {(teamOptions.length > 0 || assignedTeam) && (
                  <div style={{ flexShrink: 0 }}>
                    <select
                      value={row.assignedTeam ?? ''}
                      onChange={e => assignTeam(row.player.id, e.target.value || null)}
                      disabled={assigning === row.player.id}
                      style={{
                        background: assignedTeam ? 'rgba(109,184,117,0.1)' : 'var(--bg-input)',
                        border: `0.5px solid ${assignedTeam ? 'rgba(109,184,117,0.3)' : 'var(--border-md)'}`,
                        borderRadius: '6px', padding: '5px 8px', fontSize: '12px',
                        color: assignedTeam ? '#6DB875' : s.muted, cursor: 'pointer',
                        maxWidth: '120px',
                      }}
                    >
                      <option value="">Assign team</option>
                      {teamOptions.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
