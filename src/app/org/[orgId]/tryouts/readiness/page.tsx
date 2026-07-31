'use client'

import { useState, useEffect, useMemo, type ReactNode } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'
import { PageHeader } from '../PageHeader'
import { StatusPill, type StatusTone } from '../../../../../components/ui/StatusPill'
import { isHistoricalSeason } from '../../../../../lib/tryouts/season'
import { computeAgeGroupReadiness, type AgeGroupReadiness, type CheckTone, type Overall, type TeamEvalStatusMap } from '../../../../../lib/tryouts/readinessCheck'

interface Season   { id: string; label: string; age_groups: string[]; year: number }
interface Team     { id: string; name: string; age_group: string }
interface Session  { id: string; label: string; age_group: string; session_date: string; min_score_pct: number; status: string }
interface ImportJob { id: string; type: string; status: string; team_id: string | null; rows_total: number | null; rows_unresolved: number | null; filename: string; created_at: string }
interface CoachEval { player_id: string; team_label: string; status: string; season_id: string }
interface CheckinRow { session_id: string; player_id: string | null }
interface ScoreRow   { session_id: string; player_id: string }
interface PlayerRow  { id: string; age_group: string; tryout_age_group: string | null; dob: string | null }
interface RegStagingRow { player_id: string; age_group: string | null; dob: string | null }
interface PriorContextRow { player_id: string; prior_team_name: string | null }
interface TeamEvalStatusRow { team_label: string; status: 'not_started' | 'in_progress' | 'submitted'; coach_name: string | null; opened_at: string | null; last_saved_at: string | null; submitted_at: string | null }

const CHECK_TONE: Record<CheckTone, StatusTone> = { good: 'good', warn: 'warn', bad: 'bad', neutral: 'neutral' }

export default function ReadinessPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()

  const [season,    setSeason]    = useState<Season | null>(null)
  const [allSeasons, setAllSeasons] = useState<{ year: number }[]>([])
  const [teams,     setTeams]     = useState<Team[]>([])
  const [sessions,  setSessions]  = useState<Session[]>([])
  const [importJobs, setImportJobs] = useState<ImportJob[]>([])
  const [coachEvals, setCoachEvals] = useState<CoachEval[]>([])
  const [teamEvalStatus, setTeamEvalStatus] = useState<TeamEvalStatusMap>(new Map())
  const [checkins,  setCheckins]  = useState<CheckinRow[]>([])
  const [scores,    setScores]    = useState<ScoreRow[]>([])
  const [players,   setPlayers]   = useState<PlayerRow[]>([])
  const [priorContext, setPriorContext] = useState<PriorContextRow[]>([])
  const [regStaging, setRegStaging] = useState<RegStagingRow[]>([])
  const [loading,   setLoading]   = useState(true)
  const [drill,     setDrill]     = useState<string | null>(null)  // expanded age group
  const [unlocking, setUnlocking] = useState<string | null>(null)  // team label being unlocked

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: seasonData }, { data: seasonYears }] = await Promise.all([
      supabase.from('tryout_seasons').select('id, label, age_groups, year')
        .eq('org_id', params.orgId).eq('is_active', true).maybeSingle(),
      supabase.from('tryout_seasons').select('year').eq('org_id', params.orgId),
    ])
    setSeason(seasonData)
    setAllSeasons(seasonYears ?? [])
    if (!seasonData) { setLoading(false); return }

    const [
      { data: teamData }, { data: sessionData }, { data: jobData },
      { data: evalData }, { data: scoreData }, { data: playerData },
      { data: priorContextData }, { data: regStagingData }, { data: evalStatusData },
    ] = await Promise.all([
      supabase.from('tryout_teams').select('id, name, age_group')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id).eq('is_active', true),
      supabase.from('tryout_sessions').select('id, label, age_group, session_date, min_score_pct, status')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id),
      supabase.from('tryout_import_jobs').select('id, type, status, team_id, rows_total, rows_unresolved, filename, created_at')
        .eq('org_id', params.orgId).eq('type', 'gc_stats'),
      supabase.from('tryout_coach_evals').select('player_id, team_label, status, season_id')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id),
      supabase.from('tryout_scores').select('session_id, player_id')
        .eq('org_id', params.orgId),
      supabase.from('tryout_players').select('id, age_group, tryout_age_group, dob')
        .eq('org_id', params.orgId).eq('is_active', true),
      supabase.from('tryout_prior_roster_context').select('player_id, prior_team_name')
        .eq('season_id', seasonData.id),
      supabase.from('tryout_registration_staging').select('player_id, age_group, dob')
        .eq('season_id', seasonData.id),
      supabase.rpc('tryout_team_eval_statuses', { p_org_id: params.orgId, p_season_id: seasonData.id }),
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
    setPriorContext(priorContextData ?? [])
    setRegStaging(regStagingData ?? [])
    const statusRows: TeamEvalStatusRow[] = Array.isArray(evalStatusData) ? evalStatusData : []
    setTeamEvalStatus(new Map(statusRows.map(r => [r.team_label, r])))
    setLoading(false)
  }

  async function unlockEvals(teamLabel: string) {
    if (!season) return
    if (!window.confirm(`Unlock evaluations for ${teamLabel}? The coach will be able to edit and re-submit.`)) return
    setUnlocking(teamLabel)
    const res = await fetch('/api/tryouts/coach-evals/unlock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: params.orgId, seasonId: season.id, teamLabel }),
    })
    if (res.ok) {
      setCoachEvals(prev => prev.map(e =>
        e.team_label === teamLabel && e.status === 'submitted'
          ? { ...e, status: 'draft' }
          : e
      ))
    }
    setUnlocking(null)
  }

  const historical = useMemo(() => season ? isHistoricalSeason(season, allSeasons) : false, [season, allSeasons])

  const readiness = useMemo((): AgeGroupReadiness[] => {
    if (!season) return []
    return computeAgeGroupReadiness({
      season, players, teams, sessions, gcJobs: importJobs,
      coachEvals, teamEvalStatus, checkins, scores, priorContext, regStaging,
    })
  }, [season, players, teams, sessions, importJobs, coachEvals, teamEvalStatus, checkins, scores, priorContext, regStaging])

  const readyCt      = readiness.filter(r => r.overall === 'ready').length
  const attentionCt  = readiness.filter(r => r.overall === 'needs_attention').length
  const notReadyCt   = readiness.filter(r => r.overall === 'not_ready').length

  const s = { muted: `rgba(var(--fg-rgb),0.55)`, dim: `rgba(var(--fg-rgb),0.35)` }

  const OVERALL_TONE: Record<Overall, StatusTone> = { ready: 'good', needs_attention: 'warn', not_ready: 'bad' }
  const OVERALL_LABEL: Record<Overall, string> = historical
    ? { ready: 'Complete', needs_attention: 'Incomplete', not_ready: 'Incomplete' }
    : { ready: 'Ready', needs_attention: 'Needs Attention', not_ready: 'Not Ready' }
  const notReadyLabel  = historical ? 'Incomplete' : 'Not Ready'
  const attentionLabel = historical ? 'Incomplete' : 'Needs Attention'

  if (loading) return <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>

  if (!season) return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem' }}>
      <PageHeader title="Readiness" backHref={`/org/${params.orgId}/tryouts`} />
      <div style={{ textAlign: 'center', padding: '4rem', color: s.dim }}>
        No active season. <Link href={`/org/${params.orgId}/tryouts/seasons`} style={{ color: 'var(--accent)' }}>Set one up →</Link>
      </div>
    </main>
  )

  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>

      <PageHeader
        title="Readiness"
        subtitle={<>Is each age group ready for team selection? · {season.label}{historical && <span style={{ marginLeft: 8 }}><StatusPill tone="neutral" size="sm">Past season</StatusPill></span>}</>}
        backHref={`/org/${params.orgId}/tryouts`}
      />

      {/* Summary bar */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '2rem' }}>
        {[
          { label: `${readyCt} ${OVERALL_LABEL.ready}`,              tone: 'good' as StatusTone, show: readyCt > 0 },
          { label: `${attentionCt} ${OVERALL_LABEL.needs_attention}`, tone: 'warn' as StatusTone, show: attentionCt > 0 },
          { label: `${notReadyCt} ${OVERALL_LABEL.not_ready}`,        tone: 'bad' as StatusTone,  show: notReadyCt > 0 },
        ].filter(i => i.show).map(item => (
          <StatusPill key={item.label} tone={item.tone} style={{ fontSize: 13, padding: '8px 16px' }}>{item.label}</StatusPill>
        ))}
      </div>

      {/* Age group sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {readiness.map(ag => (
          <div key={ag.ageGroup} style={{
            background: 'var(--bg-card)', border: '0.5px solid var(--border)',
            borderRadius: '12px', overflow: 'hidden',
          }}>
            {/* Age group header */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '14px 18px', cursor: 'pointer',
            }} onClick={() => setDrill(drill === ag.ageGroup ? null : ag.ageGroup)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px', fontWeight: 800 }}>{ag.ageGroup}</span>
                <span style={{ fontSize: '12px', color: s.dim }}>{ag.playerCount} players</span>
                <StatusPill tone={OVERALL_TONE[ag.overall]}>{OVERALL_LABEL[ag.overall]}</StatusPill>
              </div>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                {ag.overall === 'ready' && !historical && (
                  <Link href={`/org/${params.orgId}/tryouts/rankings?ageGroup=${ag.ageGroup}`}
                    onClick={e => e.stopPropagation()}
                    style={{
                      padding: '6px 14px', borderRadius: '6px', border: 'none',
                      background: 'var(--status-good)', color: 'white',
                      fontSize: '12px', fontWeight: 700, textDecoration: 'none',
                    }}>
                    Go to Team Builder →
                  </Link>
                )}
                <span style={{ fontSize: '14px', color: s.dim }}>{drill === ag.ageGroup ? '▾' : '▸'}</span>
              </div>
            </div>

            {/* Summary row — always visible */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr 1fr 1fr', borderTop: '0.5px solid var(--border)' }}>
              <div style={{ padding: '12px 14px', borderRight: '0.5px solid var(--border)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: s.dim, marginBottom: '8px' }}>Registration</div>
                <StatusPill size="sm" tone={CHECK_TONE[ag.registration.tone]}>
                  {ag.registration.tone === 'good' ? `${ag.registration.count} registered` : notReadyLabel}
                </StatusPill>
              </div>
              <div style={{ padding: '12px 14px', borderRight: '0.5px solid var(--border)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: s.dim, marginBottom: '8px' }}>Prior Roster</div>
                <StatusPill size="sm" tone={CHECK_TONE[ag.priorRoster.tone]}>
                  {ag.priorRoster.tone === 'good' ? `${ag.priorRoster.count} returning` : ag.priorRoster.tone === 'neutral' ? 'Not seeded' : attentionLabel}
                </StatusPill>
              </div>
              <div style={{ padding: '12px 14px', borderRight: '0.5px solid var(--border)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: s.dim, marginBottom: '8px' }}>GameChanger</div>
                {ag.gcStats.length === 0
                  ? <span style={{ fontSize: 12, color: s.dim }}>No teams</span>
                  : <StatusPill size="sm" tone={ag.gcStats.every(r => r.tone === 'good') ? 'good' : 'warn'}>
                      {ag.gcStats.filter(r => r.tone === 'good').length}/{ag.gcStats.length}
                    </StatusPill>}
              </div>
              <div style={{ padding: '12px 14px', borderRight: '0.5px solid var(--border)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: s.dim, marginBottom: '8px' }}>Coach Evals</div>
                {ag.coachEvals.length === 0
                  ? <span style={{ fontSize: 12, color: s.dim }}>No teams</span>
                  : <StatusPill size="sm" tone={ag.coachEvals.every(r => r.tone !== 'warn') ? 'good' : 'warn'}>
                      {ag.coachEvals.filter(r => r.tone === 'good').length}/{ag.coachEvals.filter(r => r.tone !== 'neutral').length}
                    </StatusPill>}
              </div>
              <div style={{ padding: '12px 14px', borderRight: '0.5px solid var(--border)' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: s.dim, marginBottom: '8px' }}>Tryout Scores</div>
                <StatusPill size="sm" tone={CHECK_TONE[ag.sessionsTone]}>
                  {ag.sessions.length === 0 ? notReadyLabel : ag.sessionsTone === 'good' ? 'Scores complete' : attentionLabel}
                </StatusPill>
              </div>
              <div style={{ padding: '12px 14px' }}>
                <div style={{ fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: s.dim, marginBottom: '8px' }}>Age Issues</div>
                <StatusPill size="sm" tone={CHECK_TONE[ag.ageIssues.tone]}>
                  {ag.ageIssues.count! > 0 ? `${ag.ageIssues.count} unresolved` : 'Clear'}
                </StatusPill>
              </div>
            </div>

            {/* Drill-down */}
            {drill === ag.ageGroup && (
              <div style={{ borderTop: '0.5px solid var(--border)', padding: '14px 18px', background: 'rgba(var(--fg-rgb),0.02)' }}>

                {ag.registration.tone === 'bad' && (
                  <DrillLine label="Registration — no registrations imported for this age group" tone="bad"
                    href={`/org/${params.orgId}/tryouts/imports?type=registration`} hrefLabel="Import →" />
                )}
                {ag.ageIssues.count! > 0 && (
                  <DrillLine label={`Age eligibility — ${ag.ageIssues.count} overage or missing-DOB player${ag.ageIssues.count === 1 ? '' : 's'} must be resolved before team selection`} tone="bad"
                    href={`/org/${params.orgId}/tryouts/data-hub?ageGroup=${ag.ageGroup}&tab=age`} hrefLabel="Resolve →" />
                )}
                {ag.sessions.length === 0 && (
                  <DrillLine label="Tryout sessions — none scheduled for this age group" tone="bad"
                    href={`/org/${params.orgId}/tryouts/sessions`} hrefLabel="Create →" />
                )}
                {ag.sessions.length > 0 && ag.sessionsTone === 'warn' && (
                  <DrillLine label="Tryout scores — no session has hit its scoring threshold yet" tone="warn"
                    href={`/org/${params.orgId}/tryouts/sessions/${ag.sessions[0].sessionId}/enter`} hrefLabel="Enter scores →" />
                )}
                {ag.priorRoster.tone === 'neutral' && (
                  <DrillLine label="Prior roster — no seed has been run for this season yet" tone="warn"
                    href={`/org/${params.orgId}/tryouts/seasons`} hrefLabel="Seed →" />
                )}
                {ag.priorRoster.tone === 'warn' && (
                  <DrillLine label="Prior roster — no returning players carried into this age group; verify that's expected" tone="warn" />
                )}
                {ag.coachEvals.filter(r => r.tone === 'warn').map(r => (
                  <DrillLine
                    key={r.teamId}
                    label={`Coach eval: ${r.teamName} — ${r.count}/${r.total} submitted${r.draftStatus === 'in_progress' ? ' · coach in progress' : r.draftStatus === 'not_started' ? ' · not started by coach' : ''}`}
                    tone="warn"
                    href={`/org/${params.orgId}/tryouts/data-hub?ageGroup=${ag.ageGroup}&data=missing_eval`}
                    hrefLabel="Who's missing →"
                    extra={
                      <>
                        <Link href={`/org/${params.orgId}/tryouts/coach/${r.teamId}/eval`} style={{ color: 'var(--accent)', marginLeft: '10px', fontSize: 12 }}>Open form →</Link>
                        <button
                          onClick={() => unlockEvals(r.teamName)}
                          disabled={unlocking === r.teamName}
                          style={{ fontSize: '11px', padding: '1px 8px', marginLeft: 10, borderRadius: '4px', border: '0.5px solid var(--border)', background: 'transparent', color: s.dim, cursor: 'pointer' }}
                        >
                          {unlocking === r.teamName ? '…' : 'Unlock'}
                        </button>
                      </>
                    }
                  />
                ))}
                {ag.gcStats.filter(r => r.tone === 'warn').map(r => (
                  <DrillLine
                    key={r.teamId}
                    label={`GC stats: ${r.teamName} — ${r.jobStatus === 'needs_review' ? 'has unresolved matches' : 'not uploaded'}`}
                    tone="warn"
                    href={`/org/${params.orgId}/tryouts/data-hub?ageGroup=${ag.ageGroup}&data=missing_gc`}
                    hrefLabel="Who's missing →"
                    extra={
                      r.jobId
                        ? <Link href={`/org/${params.orgId}/tryouts/imports/${r.jobId}`} style={{ color: 'var(--accent)', marginLeft: '10px', fontSize: 12 }}>Review →</Link>
                        : <Link href={`/org/${params.orgId}/tryouts/imports?type=gc_stats`} style={{ color: 'var(--accent)', marginLeft: '10px', fontSize: 12 }}>Upload →</Link>
                    }
                  />
                ))}

                {ag.overall === 'ready' && (
                  <div style={{ fontSize: '12px', color: 'var(--status-good)' }}>
                    {historical ? '✓ All checks were complete for this age group.' : '✅ No outstanding items — ready for team selection.'}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  )
}

function DrillLine({ label, href, hrefLabel, tone, extra }: { label: string; href?: string; hrefLabel?: string; tone: 'bad' | 'warn'; extra?: ReactNode }) {
  const color = tone === 'bad' ? 'var(--status-bad)' : `rgba(var(--fg-rgb),0.55)`
  return (
    <div style={{ fontSize: '12px', color, marginBottom: '6px' }}>
      {tone === 'bad' ? '⛔' : '⚠'} {label}
      {href && <Link href={href} style={{ color: 'var(--accent)', marginLeft: '8px' }}>{hrefLabel ?? 'View →'}</Link>}
      {extra}
    </div>
  )
}
