'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../../../lib/supabase'
import Link from 'next/link'
import { StatusPill, type StatusTone } from '../../../../components/ui/StatusPill'
import { isHistoricalSeason } from '../../../../lib/tryouts/season'
import { computeAgeGroupReadiness, type AgeGroupReadiness, type TeamEvalStatusMap } from '../../../../lib/tryouts/readinessCheck'

interface OrgData { name: string; sport: string }
interface Season  { id: string; label: string; year: number; age_groups: string[] }
interface Team    { id: string; name: string; age_group: string }
interface Session { id: string; label: string; age_group: string; status: string; min_score_pct: number }
interface ImportJob { id: string; team_id: string | null; status: string }
interface CoachEval { player_id: string; team_label: string; status: string }
interface CheckinRow { session_id: string; player_id: string | null }
interface ScoreRow { session_id: string; player_id: string }
interface PlayerRow { id: string; age_group: string; tryout_age_group: string | null; dob: string | null }
interface PriorContextRow { player_id: string; prior_team_name: string | null; source_season_id: string | null; updated_at: string }
interface RegStagingRow { player_id: string; age_group: string | null; dob: string | null; imported_at: string }
interface TeamEvalStatusRow { team_label: string; status: 'not_started' | 'in_progress' | 'submitted' }

// Tone for a preparation-flow step. 'empty' = nothing to show yet (distinct
// from 'warn' — an org just starting a season shouldn't see amber warnings
// for steps it hasn't reached).
type StepTone = 'good' | 'warn' | 'bad' | 'empty'
const STEP_TONE: Record<StepTone, StatusTone> = { good: 'good', warn: 'warn', bad: 'bad', empty: 'neutral' }

function Step({
  num, title, desc, tone, status, detail, href, hrefLabel, orgId,
}: {
  num: number; title: string; desc: string; tone: StepTone; status: string; detail?: string
  href: string; hrefLabel: string; orgId: string
}) {
  const s = { muted: `rgba(var(--fg-rgb),0.55)`, dim: `rgba(var(--fg-rgb),0.35)` }
  return (
    <div style={{
      display: 'flex', gap: '14px', padding: '16px 18px',
      background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '10px',
    }}>
      <div style={{
        flexShrink: 0, width: '26px', height: '26px', borderRadius: '50%',
        border: '0.5px solid var(--border-md)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '12px', fontWeight: 800, color: s.muted, marginTop: '1px',
      }}>{num}</div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '2px' }}>
          <span style={{ fontSize: '14.5px', fontWeight: 800 }}>{title}</span>
          <StatusPill size="sm" tone={STEP_TONE[tone]}>{status}</StatusPill>
        </div>
        <p style={{ fontSize: '12px', color: s.dim, margin: '2px 0 0', lineHeight: 1.5 }}>{desc}</p>
        {detail && <p style={{ fontSize: '12px', color: s.muted, margin: '4px 0 0', lineHeight: 1.5 }}>{detail}</p>}
      </div>

      <Link href={`/org/${orgId}/tryouts/${href}`} style={{
        flexShrink: 0, alignSelf: 'center', fontSize: '12.5px', fontWeight: 700,
        color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap',
      }}>{hrefLabel}</Link>
    </div>
  )
}

export default function TryoutsOverviewPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()

  const [org,      setOrg]      = useState<OrgData | null>(null)
  const [season,   setSeason]   = useState<Season | null>(null)
  const [allSeasons, setAllSeasons] = useState<{ id: string; label: string; year: number }[]>([])
  const [memberCount, setMemberCount] = useState(0)
  const [scoringConfigured, setScoringConfigured] = useState(false)
  const [teams,     setTeams]     = useState<Team[]>([])
  const [sessions,  setSessions]  = useState<Session[]>([])
  const [gcJobs,    setGcJobs]    = useState<ImportJob[]>([])
  const [coachEvals, setCoachEvals] = useState<CoachEval[]>([])
  const [teamEvalStatus, setTeamEvalStatus] = useState<TeamEvalStatusMap>(new Map())
  const [checkins,  setCheckins]  = useState<CheckinRow[]>([])
  const [scores,    setScores]    = useState<ScoreRow[]>([])
  const [players,   setPlayers]   = useState<PlayerRow[]>([])
  const [priorContext, setPriorContext] = useState<PriorContextRow[]>([])
  const [regStaging, setRegStaging] = useState<RegStagingRow[]>([])
  const [loading,   setLoading]   = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: orgData }, { data: seasonData }, { data: allSeasonsData }] = await Promise.all([
      supabase.from('tryout_orgs').select('name, sport').eq('id', params.orgId).single(),
      supabase.from('tryout_seasons').select('id, label, year, age_groups').eq('org_id', params.orgId).eq('is_active', true).maybeSingle(),
      supabase.from('tryout_seasons').select('id, label, year').eq('org_id', params.orgId),
    ])
    setOrg(orgData)
    setSeason(seasonData)
    setAllSeasons(allSeasonsData ?? [])

    if (!seasonData) { setLoading(false); return }

    const [
      { count: memberCt }, { data: scoringCfg },
      { data: teamData }, { data: sessionData }, { data: jobData },
      { data: evalData }, { data: scoreData }, { data: playerData },
      { data: priorContextData }, { data: regStagingData }, { data: evalStatusData },
    ] = await Promise.all([
      supabase.from('tryout_org_members').select('*', { count: 'exact', head: true }).eq('org_id', params.orgId).eq('is_active', true),
      supabase.from('tryout_scoring_config').select('id').eq('season_id', seasonData.id).limit(1),
      supabase.from('tryout_teams').select('id, name, age_group').eq('org_id', params.orgId).eq('season_id', seasonData.id).eq('is_active', true),
      supabase.from('tryout_sessions').select('id, label, age_group, status, min_score_pct').eq('org_id', params.orgId).eq('season_id', seasonData.id),
      supabase.from('tryout_import_jobs').select('id, team_id, status').eq('org_id', params.orgId).eq('type', 'gc_stats'),
      supabase.from('tryout_coach_evals').select('player_id, team_label, status').eq('org_id', params.orgId).eq('season_id', seasonData.id),
      supabase.from('tryout_scores').select('session_id, player_id').eq('org_id', params.orgId),
      supabase.from('tryout_players').select('id, age_group, tryout_age_group, dob').eq('org_id', params.orgId).eq('is_active', true),
      supabase.from('tryout_prior_roster_context').select('player_id, prior_team_name, source_season_id, updated_at').eq('season_id', seasonData.id),
      supabase.from('tryout_registration_staging').select('player_id, age_group, dob, imported_at').eq('season_id', seasonData.id),
      supabase.rpc('tryout_team_eval_statuses', { p_org_id: params.orgId, p_season_id: seasonData.id }),
    ])

    const sessionIds = (sessionData ?? []).map((s: any) => s.id)
    const { data: checkinData } = sessionIds.length > 0
      ? await supabase.from('tryout_checkins').select('session_id, player_id').in('session_id', sessionIds)
      : { data: [] }

    setMemberCount(memberCt ?? 0)
    setScoringConfigured((scoringCfg ?? []).length > 0)
    setTeams(teamData ?? [])
    setSessions(sessionData ?? [])
    setGcJobs(jobData ?? [])
    setCoachEvals(evalData ?? [])
    setCheckins(checkinData ?? [])
    setScores(scoreData ?? [])
    setPlayers(playerData ?? [])
    setPriorContext(priorContextData ?? [])
    setRegStaging(regStagingData ?? [])
    const statusRows: TeamEvalStatusRow[] = Array.isArray(evalStatusData) ? evalStatusData : []
    setTeamEvalStatus(new Map(statusRows.map(r => [r.team_label, { status: r.status }])))
    setLoading(false)
  }

  const historical = useMemo(() => season ? isHistoricalSeason(season, allSeasons) : false, [season, allSeasons])
  const isFirstSeason = allSeasons.length <= 1

  const readiness = useMemo((): AgeGroupReadiness[] => {
    if (!season) return []
    return computeAgeGroupReadiness({
      season, players, teams, sessions, gcJobs, coachEvals, teamEvalStatus, checkins, scores, priorContext, regStaging,
    })
  }, [season, players, teams, sessions, gcJobs, coachEvals, teamEvalStatus, checkins, scores, priorContext, regStaging])

  const s = { muted: `rgba(var(--fg-rgb), 0.55)` as const, dim: `rgba(var(--fg-rgb), 0.35)` as const }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>
  )

  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>

      {/* Page header */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '6px' }}>
          {org?.name ?? 'Organization'}
        </div>
        <h1 style={{ fontSize: '26px', fontWeight: 800, marginBottom: '6px' }}>Tryouts</h1>
        {season ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '14px', fontWeight: 700 }}>{season.label}</span>
            <span style={{ fontSize: '13px', color: s.muted }}>{season.age_groups.join(', ')}</span>
            {historical && <StatusPill tone="neutral" size="sm">Past season</StatusPill>}
            <Link href={`/org/${params.orgId}/tryouts/seasons`} style={{ fontSize: '12px', color: 'var(--accent)', textDecoration: 'none' }}>Change season →</Link>
          </div>
        ) : (
          <Link href={`/org/${params.orgId}/tryouts/seasons`} style={{ fontSize: '13px', color: 'var(--status-warn)', textDecoration: 'none', fontWeight: 600 }}>
            No active season — set one up →
          </Link>
        )}
      </div>

      {!season ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: s.dim, fontSize: '14px' }}>
          Create a season in <Link href={`/org/${params.orgId}/tryouts/seasons`} style={{ color: 'var(--accent)' }}>Seasons</Link> to start preparing for tryouts.
        </div>
      ) : (() => {
        // ── Step computations — derived from the same raw rows Readiness uses,
        // so the two screens can never disagree about what's done. ──

        // 1. Season Setup
        const setupTone: StepTone = scoringConfigured ? 'good' : 'warn'
        const setupStatus = scoringConfigured ? 'Configured' : 'Scoring not set up'
        const setupDetail = `${season.age_groups.length} age group${season.age_groups.length === 1 ? '' : 's'} · ${memberCount} staff member${memberCount === 1 ? '' : 's'}${scoringConfigured ? '' : ' · scoring weights not configured'}`

        // 2. Prior Rosters
        const priorCount = priorContext.length
        let priorTone: StepTone, priorStatus: string, priorDetail: string
        if (priorCount > 0) {
          const sourceCounts = new Map<string, number>()
          for (const r of priorContext) if (r.source_season_id) sourceCounts.set(r.source_season_id, (sourceCounts.get(r.source_season_id) ?? 0) + 1)
          const topSource = Array.from(sourceCounts.entries()).sort((a, b) => b[1] - a[1])[0]
          const sourceLabel = topSource ? allSeasons.find(s2 => s2.id === topSource[0])?.label : null
          const lastSeeded = priorContext.reduce((max, r) => r.updated_at > max ? r.updated_at : max, priorContext[0].updated_at)
          priorTone = 'good'; priorStatus = `${priorCount} seeded`
          priorDetail = `${sourceLabel ? `From ${sourceLabel} · ` : ''}last run ${new Date(lastSeeded).toLocaleDateString()}`
        } else if (isFirstSeason) {
          priorTone = 'empty'; priorStatus = 'First season'
          priorDetail = 'No previous season to seed from — use the Registration import’s Prior Team column instead if you have legacy data.'
        } else {
          priorTone = 'warn'; priorStatus = 'Not seeded'
          priorDetail = 'Run "Seed Prior Rosters from…" on Seasons to carry forward last season’s final rosters.'
        }

        // 3. Registration
        const regCount = regStaging.length
        const regTone: StepTone = regCount > 0 ? 'good' : 'bad'
        const regLastImport = regCount > 0 ? regStaging.reduce((max, r) => r.imported_at > max ? r.imported_at : max, regStaging[0].imported_at) : null
        const regDetail = regCount > 0 ? `${regCount} registered · last import ${new Date(regLastImport!).toLocaleDateString()}` : 'No registrations imported yet'

        // 4. GameChanger — aggregate per-team checks already computed for Readiness
        const gcAll = readiness.flatMap(r => r.gcStats)
        const gcTone: StepTone = gcAll.length === 0 ? 'empty' : gcAll.every(r => r.tone === 'good') ? 'good' : 'warn'
        const gcDone = gcAll.filter(r => r.tone === 'good').length
        const gcStatus = gcAll.length === 0 ? 'No teams yet' : `${gcDone}/${gcAll.length} teams`
        const gcDetail = gcAll.length === 0 ? 'Create teams before uploading GameChanger exports' : `${gcAll.length - gcDone} team${gcAll.length - gcDone === 1 ? '' : 's'} still need stats uploaded`

        // 5. Coach Evaluations
        const evalAll = readiness.flatMap(r => r.coachEvals).filter(r => r.tone !== 'neutral')
        const evalTone: StepTone = evalAll.length === 0 ? 'empty' : evalAll.every(r => r.tone === 'good') ? 'good' : 'warn'
        const evalDone = evalAll.filter(r => r.tone === 'good').length
        const evalStatus = evalAll.length === 0 ? 'No teams yet' : `${evalDone}/${evalAll.length} teams complete`
        const evalDetail = evalAll.length === 0 ? 'Coach evals become available once teams have returning players' : `${evalAll.length - evalDone} team${evalAll.length - evalDone === 1 ? '' : 's'} still in progress or not started`

        // 6. Tryout Sessions
        const groupsWithSessions = readiness.filter(r => r.sessions.length > 0)
        const sessionsTone: StepTone = sessions.length === 0 ? 'empty' : groupsWithSessions.every(r => r.sessionsTone === 'good') && groupsWithSessions.length === readiness.length ? 'good' : 'warn'
        const openSessions = sessions.filter(s2 => s2.status === 'open').length
        const sessionsStatus = sessions.length === 0 ? 'No sessions created' : `${sessions.length} session${sessions.length === 1 ? '' : 's'}${openSessions > 0 ? ` · ${openSessions} open` : ''}`
        const sessionsDetail = sessions.length === 0 ? 'Schedule tryout sessions for each age group' : `Scoring complete for ${groupsWithSessions.filter(r => r.sessionsTone === 'good').length}/${readiness.length} age groups`

        // 7. Team Selection — the readiness rollup itself
        const readyCt = readiness.filter(r => r.overall === 'ready').length
        const attentionCt = readiness.filter(r => r.overall === 'needs_attention').length
        const notReadyCt = readiness.filter(r => r.overall === 'not_ready').length
        const selectionTone: StepTone = notReadyCt > 0 ? 'bad' : attentionCt > 0 ? 'warn' : 'good'
        const selectionStatus = `${readyCt}/${readiness.length} age groups ready`
        const selectionDetail = notReadyCt > 0
          ? `${notReadyCt} age group${notReadyCt === 1 ? '' : 's'} blocked — see Readiness for why`
          : attentionCt > 0
          ? `${attentionCt} age group${attentionCt === 1 ? '' : 's'} still need attention`
          : 'All age groups are clear for team selection'

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <Step num={1} title="Season Setup" desc="Age groups, staff, and scoring weights." orgId={params.orgId}
              tone={setupTone} status={setupStatus} detail={setupDetail} href="seasons" hrefLabel="Seasons →" />
            <Step num={2} title="Prior Rosters" desc="Carry forward last season's final rosters as this season's starting point." orgId={params.orgId}
              tone={priorTone} status={priorStatus} detail={priorDetail} href="seasons" hrefLabel="Seasons →" />
            <Step num={3} title="Registration" desc="Import this season's tryout sign-ups." orgId={params.orgId}
              tone={regTone} status={regTone === 'good' ? 'Imported' : 'Not started'} detail={regDetail} href="imports?type=registration" hrefLabel="Imports →" />
            <Step num={4} title="GameChanger" desc="Import last season's stats per team." orgId={params.orgId}
              tone={gcTone} status={gcStatus} detail={gcDetail} href="imports?type=gc_stats" hrefLabel="Imports →" />
            <Step num={5} title="Coach Evaluations" desc="Coaches evaluate players from their prior-season roster." orgId={params.orgId}
              tone={evalTone} status={evalStatus} detail={evalDetail} href="coach-evals" hrefLabel="Coach Evals →" />
            <Step num={6} title="Tryout Sessions" desc="Schedule sessions, check players in, and enter scores." orgId={params.orgId}
              tone={sessionsTone} status={sessionsStatus} detail={sessionsDetail} href="sessions" hrefLabel="Sessions →" />
            <Step num={7} title="Team Selection" desc="Once every age group is ready, build teams in Rankings." orgId={params.orgId}
              tone={selectionTone} status={selectionStatus} detail={selectionDetail} href="readiness" hrefLabel="Readiness →" />

            <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '0.5px solid var(--border)', display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
              <Link href={`/org/${params.orgId}/tryouts/data-hub`} style={{ fontSize: '13px', color: s.muted, textDecoration: 'none' }}>Data Hub — player-level detail →</Link>
              <Link href={`/org/${params.orgId}/tryouts/registration`} style={{ fontSize: '13px', color: s.muted, textDecoration: 'none' }}>Registration dashboard →</Link>
              <Link href={`/org/${params.orgId}/tryouts/rankings`} style={{ fontSize: '13px', color: s.muted, textDecoration: 'none' }}>Rankings →</Link>
            </div>
          </div>
        )
      })()}

    </main>
  )
}
