'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../../../../lib/supabase'
import Link from 'next/link'

interface Team {
  id:        string
  name:      string
  age_group: string
  color:     string | null
  season_id: string
}

interface RosterPlayer {
  id:                   string
  first_name:           string
  last_name:            string
  age_group:            string
  jersey_number:        string | null
  prior_team:           string | null
  grade:                string | null
  parent_email:         string | null
  parent_phone:         string | null
  guardian_first_name:  string | null
  guardian_last_name:   string | null
  tryoutAvg:            number | null
  coachEvalAvg:         number | null
  combinedScore:        number | null
  scoreCount:           number
  evalCount:            number
}

export default function TeamRosterPage({ params }: { params: { orgId: string; teamId: string } }) {
  const supabase = createClient()

  const [team,    setTeam]    = useState<Team | null>(null)
  const [players, setPlayers] = useState<RosterPlayer[]>([])
  const [loading, setLoading] = useState(true)
  const [removing, setRemoving] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: teamData } = await supabase
      .from('tryout_teams').select('id, name, age_group, color, season_id')
      .eq('id', params.teamId).single()
    setTeam(teamData)

    if (!teamData) { setLoading(false); return }

    // Get assigned players
    const { data: assignData } = await supabase
      .from('tryout_team_assignments').select('player_id')
      .eq('team_id', params.teamId).eq('season_id', teamData.season_id)

    const playerIds = (assignData ?? []).map((a: any) => a.player_id)
    if (playerIds.length === 0) { setLoading(false); return }

    const [{ data: playerData }, { data: scoreData }, { data: evalData }, { data: evalCfg }, { data: stagingData }] = await Promise.all([
      supabase.from('tryout_players')
        .select('id, first_name, last_name, age_group, jersey_number, prior_team, grade, parent_email, parent_phone, guardian_first_name, guardian_last_name')
        .in('id', playerIds),
      supabase.from('tryout_scores')
        .select('player_id, tryout_score')
        .in('player_id', playerIds),
      supabase.from('tryout_coach_evals')
        .select('player_id, scores')
        .in('player_id', playerIds).eq('status', 'submitted'),
      supabase.from('tryout_coach_eval_config')
        .select('field_key').eq('org_id', params.orgId).eq('is_active', true),
      supabase.from('tryout_registration_staging')
        .select('player_id, grade, parent_email, parent_phone, guardian_first_name, guardian_last_name')
        .eq('season_id', teamData.season_id)
        .in('player_id', playerIds),
    ])

    const evalFields = (evalCfg ?? []).map((f: any) => f.field_key)
    const stagingMap: Record<string, any> = {}
    for (const s of (stagingData ?? [])) stagingMap[s.player_id] = s

    // Aggregate scores
    const scoresByPlayer: Record<string, number[]> = {}
    for (const s of (scoreData ?? [])) {
      if (s.tryout_score != null) {
        if (!scoresByPlayer[s.player_id]) scoresByPlayer[s.player_id] = []
        scoresByPlayer[s.player_id].push(s.tryout_score)
      }
    }

    const evalsByPlayer: Record<string, number[][]> = {}
    for (const e of (evalData ?? [])) {
      if (!evalsByPlayer[e.player_id]) evalsByPlayer[e.player_id] = []
      if (e.scores) {
        const vals = evalFields.map((k: string) => e.scores[k]).filter((v: any) => v != null)
        if (vals.length > 0) evalsByPlayer[e.player_id].push(vals)
      }
    }

    const rosterPlayers: RosterPlayer[] = (playerData ?? []).map((p: any) => {
      const scores = scoresByPlayer[p.id] ?? []
      const tryoutAvg = scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : null

      const evalGroups = evalsByPlayer[p.id] ?? []
      let coachEvalAvg: number | null = null
      if (evalGroups.length > 0) {
        const perEvalAvgs = evalGroups.map((vals: number[]) => vals.reduce((a: number, b: number) => a + b, 0) / vals.length)
        coachEvalAvg = perEvalAvgs.reduce((a: number, b: number) => a + b, 0) / perEvalAvgs.length
      }

      let combinedScore: number | null = null
      if (tryoutAvg != null && coachEvalAvg != null) combinedScore = tryoutAvg * 0.6 + coachEvalAvg * 0.4
      else if (tryoutAvg != null) combinedScore = tryoutAvg
      else if (coachEvalAvg != null) combinedScore = coachEvalAvg

      const st = stagingMap[p.id] ?? {}
      return {
        ...p,
        grade:               st.grade               ?? p.grade               ?? null,
        parent_email:        st.parent_email        ?? p.parent_email        ?? null,
        parent_phone:        st.parent_phone        ?? p.parent_phone        ?? null,
        guardian_first_name: st.guardian_first_name ?? p.guardian_first_name ?? null,
        guardian_last_name:  st.guardian_last_name  ?? p.guardian_last_name  ?? null,
        tryoutAvg, coachEvalAvg, combinedScore,
        scoreCount: scores.length, evalCount: evalGroups.length,
      }
    }).sort((a: RosterPlayer, b: RosterPlayer) => (b.combinedScore ?? -1) - (a.combinedScore ?? -1))

    setPlayers(rosterPlayers)
    setLoading(false)
  }

  async function removeFromTeam(playerId: string) {
    if (!team) return
    setRemoving(playerId)
    await supabase.from('tryout_team_assignments').delete()
      .eq('player_id', playerId).eq('team_id', team.id).eq('season_id', team.season_id)
    setPlayers(prev => prev.filter(p => p.id !== playerId))
    setRemoving(null)
  }

  function exportRoster() {
    if (!team) return
    const rows = [
      ['#', 'Last Name', 'First Name', 'Age Group', 'Grade', 'Guardian First', 'Guardian Last', 'Parent Email', 'Parent Phone', 'Prior Team', 'Tryout Score', 'Coach Eval', 'Combined'],
      ...players.map((p, i) => [
        String(i + 1),
        p.last_name,
        p.first_name,
        p.age_group,
        p.grade               ?? '',
        p.guardian_first_name ?? '',
        p.guardian_last_name  ?? '',
        p.parent_email        ?? '',
        p.parent_phone        ?? '',
        p.prior_team          ?? '',
        p.tryoutAvg?.toFixed(2)    ?? '',
        p.coachEvalAvg?.toFixed(2) ?? '',
        p.combinedScore?.toFixed(2) ?? '',
      ])
    ]
    const csv  = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `${team.name.replace(/\s+/g, '-').toLowerCase()}-roster.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>
  )
  if (!team) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Team not found.</main>
  )

  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts/teams`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Teams</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {team.color && <div style={{ width: '14px', height: '14px', borderRadius: '50%', background: team.color, flexShrink: 0 }} />}
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: 800 }}>{team.name}</h1>
            <div style={{ fontSize: '13px', color: s.muted, marginTop: '2px' }}>
              {team.age_group} · {players.length} player{players.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Link href={`/org/${params.orgId}/tryouts/rankings`} style={{
            padding: '8px 14px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
            background: 'var(--bg-input)', color: s.muted, fontSize: '13px', textDecoration: 'none',
          }}>← Rankings / assign</Link>
          <button onClick={exportRoster} style={{
            padding: '8px 14px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
            background: 'var(--bg-input)', color: s.muted, fontSize: '13px', cursor: 'pointer',
          }}>↓ CSV</button>
        </div>
      </div>

      {players.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: s.dim, fontSize: '14px' }}>
          No players assigned yet.{' '}
          <Link href={`/org/${params.orgId}/tryouts/rankings`} style={{ color: 'var(--accent)' }}>Go to Rankings</Link>
          {' '}to assign players.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {players.map((player, idx) => (
            <div key={player.id} style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              background: 'var(--bg-card)', border: '0.5px solid var(--border)',
              borderRadius: '10px', padding: '12px 14px',
            }}>
              {/* Rank */}
              <div style={{ fontSize: '13px', fontWeight: 700, color: s.dim, minWidth: '24px', textAlign: 'right', flexShrink: 0 }}>
                {player.combinedScore != null ? idx + 1 : '–'}
              </div>

              {/* Player info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>{player.first_name} {player.last_name}</span>
                  {player.jersey_number && (
                    <span style={{ fontSize: '11px', color: s.dim }}>#{player.jersey_number}</span>
                  )}
                  {player.prior_team && (
                    <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '4px', background: 'rgba(var(--fg-rgb),0.06)', color: s.muted }}>
                      was: {player.prior_team}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '11px', color: s.dim, marginTop: '2px' }}>
                  {player.scoreCount > 0 ? `${player.scoreCount} tryout score${player.scoreCount !== 1 ? 's' : ''}` : 'No tryout scores'}
                  {player.evalCount > 0 ? ` · ${player.evalCount} coach eval${player.evalCount !== 1 ? 's' : ''}` : ''}
                </div>
              </div>

              {/* Scores */}
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
                {player.tryoutAvg != null && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>{player.tryoutAvg.toFixed(2)}</div>
                    <div style={{ fontSize: '10px', color: s.dim }}>tryout</div>
                  </div>
                )}
                {player.coachEvalAvg != null && (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700 }}>{player.coachEvalAvg.toFixed(2)}</div>
                    <div style={{ fontSize: '10px', color: s.dim }}>eval</div>
                  </div>
                )}
                {player.combinedScore != null && (
                  <div style={{ textAlign: 'center', minWidth: '40px' }}>
                    <div style={{ fontSize: '16px', fontWeight: 800, color: 'var(--accent)' }}>{player.combinedScore.toFixed(2)}</div>
                    <div style={{ fontSize: '10px', color: s.dim }}>combined</div>
                  </div>
                )}
              </div>

              <button
                onClick={() => removeFromTeam(player.id)}
                disabled={removing === player.id}
                style={{
                  fontSize: '11px', padding: '4px 8px', borderRadius: '4px',
                  border: '0.5px solid var(--border-md)', background: 'transparent',
                  color: s.dim, cursor: 'pointer', flexShrink: 0,
                }}
              >Remove</button>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
