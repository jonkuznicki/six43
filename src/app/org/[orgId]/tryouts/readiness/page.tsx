'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'

interface Season   { id: string; label: string; age_groups: string[]; year: number; min_score_pct?: number }
interface Team     { id: string; name: string; age_group: string }
interface Session  { id: string; label: string; age_group: string; session_date: string; min_score_pct: number }
interface ImportJob { id: string; type: string; status: string; team_id: string | null; rows_total: number | null; rows_unresolved: number | null; filename: string; created_at: string }
interface CoachEval { player_id: string; team_label: string; status: string; season_id: string }
interface CheckinRow { session_id: string; player_id: string | null }
interface ScoreRow   { session_id: string; player_id: string }

type ReadinessStatus = 'ready' | 'partial' | 'not_started'

interface AgeGroupReadiness {
  ageGroup:       string
  playerCount:    number
  coachEvals:     { team: Team; status: ReadinessStatus; submittedCount: number; totalPlayers: number }[]
  gcStats:        { team: Team; status: ReadinessStatus; jobId: string | null; rowsMatched: number | null; rowsTotal: number | null }[]
  sessions:       { session: Session; status: ReadinessStatus; scoredCount: number; checkinCount: number }[]
  overall:        ReadinessStatus
}

export default function ReadinessPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()

  const [season,    setSeason]    = useState<Season | null>(null)
  const [teams,     setTeams]     = useState<Team[]>([])
  const [sessions,  setSessions]  = useState<Session[]>([])
  const [importJobs, setImportJobs] = useState<ImportJob[]>([])
  const [coachEvals, setCoachEvals] = useState<CoachEval[]>([])
  const [checkins,  setCheckins]  = useState<CheckinRow[]>([])
  const [scores,    setScores]    = useState<ScoreRow[]>([])
  const [players,   setPlayers]   = useState<{ id: string; age_group: string; prior_team: string | null }[]>([])
  const [loading,   setLoading]   = useState(true)
  const [drill,     setDrill]     = useState<string | null>(null)  // expanded age group

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: seasonData } = await supabase
      .from('tryout_seasons').select('id, label, age_groups, year')
      .eq('org_id', params.orgId).eq('is_active', true).maybeSingle()
    setSeason(seasonData)
    if (!seasonData) { setLoading(false); return }

    const [
      { data: teamData }, { data: sessionData }, { data: jobData },
      { data: evalData }, { data: scoreData }, { data: playerData },
    ] = await Promise.all([
      supabase.from('tryout_teams').select('id, name, age_group')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id).eq('is_active', true),
      supabase.from('tryout_sessions').select('id, label, age_group, session_date, min_score_pct')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id),
      supabase.from('tryout_import_jobs').select('id, type, status, team_id, rows_total, rows_unresolved, filename, created_at')
        .eq('org_id', params.orgId).eq('type', 'gc_stats'),
      supabase.from('tryout_coach_evals').select('player_id, team_label, status, season_id')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id),
      supabase.from('tryout_scores').select('session_id, player_id')
        .eq('org_id', params.orgId),
      supabase.from('tryout_players').select('id, age_group, prior_team')
        .eq('org_id', params.orgId).eq('is_active', true),
    ])

    const sessionIds = (sessionData ?? []).map((s: any) => s.id)
    const { data: checkinData } = sessionIds.length > 0
      ? await supabase.from('tryout_checkins').select('session_id, player_id').in('session_id', sessionIds)
      : { data: [] }

    setTeams(teamData ?? [])
    setSessions(sessionData ?? [])
    setImportJobs(jobData ?? [])
    setCoachEvals(evalData ?? [])
    setCheckins(checkinData ?? [])
    setScores(scoreData ?? [])
    setPlayers(playerData ?? [])
    setLoading(false)
  }

  const readiness = useMemo((): AgeGroupReadiness[] => {
    if (!season) return []
    const MIN_PCT = 0.90

    return season.age_groups.map(ag => {
      const agPlayers  = players.filter(p => p.age_group === ag)
      const agTeams    = teams.filter(t => t.age_group === ag)
      const agSessions = sessions.filter(s => s.age_group === ag)

      // Coach evals per team
      const coachEvalRows = agTeams.map(team => {
        const teamPlayers  = agPlayers.filter(p => p.prior_team === team.name)
        const submitted    = coachEvals.filter(e => e.team_label === team.name && e.status === 'submitted')
        const uniquePlayers = new Set(submitted.map(e => e.player_id)).size
        const total         = teamPlayers.length || 1
        const status: ReadinessStatus =
          uniquePlayers >= total ? 'ready' :
          uniquePlayers > 0 ? 'partial' : 'not_started'
        return { team, status, submittedCount: uniquePlayers, totalPlayers: teamPlayers.length }
      })

      // GC stats per team
      const gcRows = agTeams.map(team => {
        const job = importJobs.find(j => j.team_id === team.id)
        const status: ReadinessStatus =
          job?.status === 'complete' ? 'ready' :
          job?.status === 'needs_review' ? 'partial' : 'not_started'
        return { team, status, jobId: job?.id ?? null, rowsMatched: job ? (job.rows_total ?? 0) - (job.rows_unresolved ?? 0) : null, rowsTotal: job?.rows_total ?? null }
      })

      // Tryout scores per session
      const sessionRows = agSessions.map(sess => {
        const sessCheckins = checkins.filter(c => c.session_id === sess.id && c.player_id)
        const sessScores   = scores.filter(sc => sc.session_id === sess.id)
        const scoredIds    = new Set(sessScores.map(sc => sc.player_id))
        const pct          = sessCheckins.length > 0 ? scoredIds.size / sessCheckins.length : 0
        const threshold    = sess.min_score_pct ?? MIN_PCT
        const status: ReadinessStatus =
          sessCheckins.length > 0 && pct >= threshold ? 'ready' :
          scoredIds.size > 0 ? 'partial' : 'not_started'
        return { session: sess, status, scoredCount: scoredIds.size, checkinCount: sessCheckins.length }
      })

      const allReady = coachEvalRows.every(r => r.status === 'ready') &&
                       gcRows.every(r => r.status === 'ready') &&
                       sessionRows.some(r => r.status === 'ready')
      const anyStarted = coachEvalRows.some(r => r.status !== 'not_started') ||
                         gcRows.some(r => r.status !== 'not_started') ||
                         sessionRows.some(r => r.status !== 'not_started')
      const overall: ReadinessStatus = allReady ? 'ready' : anyStarted ? 'partial' : 'not_started'

      return { ageGroup: ag, playerCount: agPlayers.length, coachEvals: coachEvalRows, gcStats: gcRows, sessions: sessionRows, overall }
    })
  }, [season, teams, sessions, importJobs, coachEvals, checkins, scores, players])

  const readyCt   = readiness.filter(r => r.overall === 'ready').length
  const partialCt = readiness.filter(r => r.overall === 'partial').length
  const notCt     = readiness.filter(r => r.overall === 'not_started').length

  const s = { muted: `rgba(var(--fg-rgb),0.55)`, dim: `rgba(var(--fg-rgb),0.35)` }

  function StatusDot({ status }: { status: ReadinessStatus }) {
    const color = status === 'ready' ? '#6DB875' : status === 'partial' ? '#E8A020' : s.muted
    const label = status === 'ready' ? '✅' : status === 'partial' ? '🟡' : '⬜'
    return <span style={{ color, fontWeight: 700 }}>{label}</span>
  }

  function ColStatus({ status }: { status: ReadinessStatus }) {
    const bg    = status === 'ready' ? 'rgba(109,184,117,0.12)' : status === 'partial' ? 'rgba(232,160,32,0.1)' : 'rgba(var(--fg-rgb),0.04)'
    const color = status === 'ready' ? '#6DB875' : status === 'partial' ? '#E8A020' : s.dim
    return (
      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: bg, color, fontWeight: 700 }}>
        {status === 'ready' ? 'Ready' : status === 'partial' ? 'Partial' : 'Not started'}
      </span>
    )
  }

  if (loading) return <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>

  if (!season) return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>
      <div style={{ textAlign: 'center', padding: '4rem', color: s.dim }}>
        No active season. <Link href={`/org/${params.orgId}/tryouts/seasons`} style={{ color: 'var(--accent)' }}>Set one up →</Link>
      </div>
    </main>
  )

  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>Readiness Dashboard</h1>
        <div style={{ fontSize: '13px', color: s.muted }}>{season.label}</div>
      </div>

      {/* Summary bar */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {[
          { label: `${readyCt} Ready`,    bg: 'rgba(109,184,117,0.1)', border: 'rgba(109,184,117,0.3)', color: '#6DB875', show: readyCt > 0 },
          { label: `${partialCt} Partial`, bg: 'rgba(232,160,32,0.1)',  border: 'rgba(232,160,32,0.3)',  color: '#E8A020', show: partialCt > 0 },
          { label: `${notCt} Not started`, bg: 'rgba(var(--fg-rgb),0.04)', border: 'var(--border)', color: s.muted, show: notCt > 0 },
        ].filter(i => i.show).map(item => (
          <div key={item.label} style={{ padding: '8px 16px', borderRadius: '8px', background: item.bg, border: `0.5px solid ${item.border}`, fontSize: '13px', fontWeight: 700, color: item.color }}>
            {item.label}
          </div>
        ))}
      </div>

      {/* Age group sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {readiness.map(ag => (
          <div key={ag.ageGroup} style={{
            background: 'var(--bg-card)', border: `0.5px solid ${ag.overall === 'ready' ? 'rgba(109,184,117,0.3)' : ag.overall === 'partial' ? 'rgba(232,160,32,0.3)' : 'var(--border)'}`,
            borderRadius: '12px', overflow: 'hidden',
          }}>
            {/* Age group header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 18px', cursor: 'pointer',
              background: ag.overall === 'ready' ? 'rgba(109,184,117,0.06)' : ag.overall === 'partial' ? 'rgba(232,160,32,0.04)' : 'transparent',
            }} onClick={() => setDrill(drill === ag.ageGroup ? null : ag.ageGroup)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px', fontWeight: 800 }}>{ag.ageGroup}</span>
                <span style={{ fontSize: '12px', color: s.dim }}>{ag.playerCount} players</span>
                <ColStatus status={ag.overall} />
              </div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                {ag.overall === 'ready' && (
                  <Link href={`/org/${params.orgId}/tryouts/rankings?ageGroup=${ag.ageGroup}`}
                    onClick={e => e.stopPropagation()}
                    style={{
                      padding: '6px 14px', borderRadius: '6px', border: 'none',
                      background: '#6DB875', color: 'white',
                      fontSize: '12px', fontWeight: 700, textDecoration: 'none',
                    }}>
                    Go to Team Builder →
                  </Link>
                )}
                <span style={{ fontSize: '14px', color: s.dim }}>{drill === ag.ageGroup ? '▾' : '▸'}</span>
              </div>
            </div>

            {/* Summary row — always visible */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: '0.5px solid var(--border)' }}>
              {/* Coach Evals */}
              <div style={{ padding: '12px 16px', borderRight: '0.5px solid var(--border)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: s.dim, marginBottom: '8px' }}>Coach Evals</div>
                {ag.coachEvals.length === 0 ? (
                  <div style={{ fontSize: '12px', color: s.dim }}>No teams configured</div>
                ) : ag.coachEvals.map(r => (
                  <div key={r.team.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', fontSize: '12px' }}>
                    <span><StatusDot status={r.status} /> {r.team.name}</span>
                    <span style={{ color: s.dim }}>{r.submittedCount}/{r.totalPlayers}</span>
                  </div>
                ))}
              </div>

              {/* GC Stats */}
              <div style={{ padding: '12px 16px', borderRight: '0.5px solid var(--border)' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: s.dim, marginBottom: '8px' }}>GC Stats</div>
                {ag.gcStats.length === 0 ? (
                  <div style={{ fontSize: '12px', color: s.dim }}>No teams configured</div>
                ) : ag.gcStats.map(r => (
                  <div key={r.team.id} style={{ fontSize: '12px', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span><StatusDot status={r.status} /> {r.team.name}</span>
                      {r.rowsTotal != null && <span style={{ color: s.dim }}>{r.rowsMatched}/{r.rowsTotal}</span>}
                    </div>
                    {r.status === 'not_started' && (
                      <Link href={`/org/${params.orgId}/tryouts/imports`} style={{ fontSize: '11px', color: 'var(--accent)' }}>Upload ↗</Link>
                    )}
                    {r.status === 'partial' && r.jobId && (
                      <Link href={`/org/${params.orgId}/tryouts/imports/${r.jobId}`} style={{ fontSize: '11px', color: '#E8A020' }}>Review ↗</Link>
                    )}
                  </div>
                ))}
              </div>

              {/* Tryout Scores */}
              <div style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: s.dim, marginBottom: '8px' }}>Tryout Scores</div>
                {ag.sessions.length === 0 ? (
                  <div style={{ fontSize: '12px', color: s.dim }}>No sessions scheduled</div>
                ) : ag.sessions.map(r => (
                  <div key={r.session.id} style={{ fontSize: '12px', marginBottom: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span><StatusDot status={r.status} /> {r.session.label}</span>
                      <span style={{ color: s.dim }}>{r.scoredCount}/{r.checkinCount}</span>
                    </div>
                    {r.status !== 'ready' && (
                      <Link href={`/org/${params.orgId}/tryouts/sessions/${r.session.id}/enter`} style={{ fontSize: '11px', color: r.status === 'not_started' ? s.dim : 'var(--accent)' }}>
                        {r.checkinCount === 0 ? 'Check in players ↗' : 'Enter scores ↗'}
                      </Link>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Drill-down */}
            {drill === ag.ageGroup && (
              <div style={{ borderTop: '0.5px solid var(--border)', padding: '12px 16px', background: 'rgba(var(--fg-rgb),0.02)' }}>
                <div style={{ fontSize: '12px', color: s.dim, marginBottom: '8px', fontWeight: 600 }}>Missing items</div>
                {ag.coachEvals.filter(r => r.status !== 'ready').map(r => (
                  <div key={r.team.id} style={{ fontSize: '12px', color: s.muted, marginBottom: '4px' }}>
                    ⬜ Coach evals: {r.team.name} — {r.submittedCount}/{r.totalPlayers} players submitted
                    <Link href={`/org/${params.orgId}/tryouts/coach/${r.team.id}/eval`} style={{ color: 'var(--accent)', marginLeft: '6px' }}>View →</Link>
                  </div>
                ))}
                {ag.gcStats.filter(r => r.status !== 'ready').map(r => (
                  <div key={r.team.id} style={{ fontSize: '12px', color: s.muted, marginBottom: '4px' }}>
                    ⬜ GC stats: {r.team.name} — {r.status === 'not_started' ? 'not uploaded' : 'has unresolved matches'}
                    <Link href={r.jobId ? `/org/${params.orgId}/tryouts/imports/${r.jobId}` : `/org/${params.orgId}/tryouts/imports`} style={{ color: 'var(--accent)', marginLeft: '6px' }}>{r.status === 'not_started' ? 'Upload →' : 'Review →'}</Link>
                  </div>
                ))}
                {ag.sessions.filter(r => r.status !== 'ready').map(r => (
                  <div key={r.session.id} style={{ fontSize: '12px', color: s.muted, marginBottom: '4px' }}>
                    ⬜ {r.session.label}: {r.scoredCount}/{r.checkinCount} players scored
                    <Link href={`/org/${params.orgId}/tryouts/sessions/${r.session.id}/enter`} style={{ color: 'var(--accent)', marginLeft: '6px' }}>Enter scores →</Link>
                  </div>
                ))}
                {ag.coachEvals.every(r => r.status === 'ready') && ag.gcStats.every(r => r.status === 'ready') && ag.sessions.every(r => r.status === 'ready') && (
                  <div style={{ fontSize: '12px', color: '#6DB875' }}>✅ All data complete for this age group.</div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}
