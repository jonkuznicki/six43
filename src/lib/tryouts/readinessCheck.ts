/**
 * Shared "is this age group ready for team selection" computation.
 *
 * Pulled out of readiness/page.tsx so Overview's Team Selection step and the
 * Readiness page can't independently drift on what "ready" means — both call
 * this with the same raw rows. Deliberately UI-agnostic (no labels, no
 * hrefs, no historical-season copy) — pages own presentation, this owns the
 * business rule.
 *
 * Distinguishes MISSING DATA (tone 'warn') from a BLOCKING issue (tone
 * 'bad'): the combined-score formula (computeCombinedScore in
 * scoring/combinedScore.ts) already redistributes weight across whatever
 * sources are present, so a team with no GC stats yet or partial coach
 * evals isn't broken — it's just incomplete. A blocking issue is one that
 * makes "ready" unreachable outright: no registration data at all, zero
 * tryout sessions ever created, or an unresolved player age-eligibility
 * problem.
 */

export type CheckTone = 'good' | 'warn' | 'bad' | 'neutral'
export type Overall = 'ready' | 'needs_attention' | 'not_ready'

export interface CheckResult { tone: CheckTone; count?: number; total?: number }
export interface TeamCheck {
  teamId: string; teamName: string; tone: CheckTone; count: number; total: number
  jobId?: string | null                                             // gcStats rows only
  jobStatus?: string | null                                         // gcStats rows only — raw tryout_import_jobs.status
  draftStatus?: 'not_started' | 'in_progress' | 'submitted'         // coachEvals rows only — from tryout_team_eval_statuses
}
export interface SessionCheck { sessionId: string; label: string; status: 'ready' | 'partial' | 'not_started' }

export interface AgeGroupReadiness {
  ageGroup:      string
  playerCount:   number
  registration:  CheckResult
  priorRoster:   CheckResult
  coachEvals:    TeamCheck[]
  gcStats:       TeamCheck[]
  sessions:      SessionCheck[]
  sessionsTone:  CheckTone
  ageIssues:     CheckResult
  overall:       Overall
}

export type TeamEvalStatusMap = Map<string, { status: 'not_started' | 'in_progress' | 'submitted' }>

export interface ReadinessInput {
  season:      { age_groups: string[]; year: number }
  players:     { id: string; age_group: string; tryout_age_group: string | null; dob: string | null }[]
  teams:       { id: string; name: string; age_group: string }[]
  sessions:    { id: string; label: string; age_group: string; min_score_pct: number }[]
  gcJobs:      { id: string; team_id: string | null; status: string }[]
  coachEvals:  { player_id: string; team_label: string; status: string }[]
  teamEvalStatus: TeamEvalStatusMap
  checkins:    { session_id: string; player_id: string | null }[]
  scores:      { session_id: string; player_id: string }[]
  priorContext: { player_id: string; prior_team_name: string | null }[]
  regStaging:  { player_id: string; age_group: string | null; dob: string | null }[]
}

// ── Baseball-age helpers ──────────────────────────────────────────────────

export function calcBaseballAge(dob: string, seasonYear: number): number {
  const cutoff = new Date(seasonYear, 4, 1) // May 1
  const birth  = new Date(dob)
  let age = cutoff.getFullYear() - birth.getFullYear()
  const dm = cutoff.getMonth() - birth.getMonth()
  if (dm < 0 || (dm === 0 && cutoff.getDate() < birth.getDate())) age--
  return age
}

function ageGroupMax(ag: string | null): number | null {
  if (!ag) return null
  const m = ag.match(/(\d+)/)
  return m ? parseInt(m[1]) : null
}

function isAgeBlocking(dob: string | null, tryoutAgeGroup: string | null, seasonYear: number): boolean {
  if (!dob) return true
  const max = ageGroupMax(tryoutAgeGroup)
  if (max == null) return false // no tryout group set yet isn't an eligibility problem by itself
  return calcBaseballAge(dob, seasonYear) > max // overage
}

const MIN_PCT = 0.90

export function computeAgeGroupReadiness(input: ReadinessInput): AgeGroupReadiness[] {
  const { season, players, teams, sessions, gcJobs, coachEvals, teamEvalStatus, checkins, scores, priorContext, regStaging } = input

  const priorTeamByPlayer = new Map(priorContext.map(pc => [pc.player_id, pc.prior_team_name]))
  const regDobByPlayer    = new Map(regStaging.map(r => [r.player_id, r.dob]))
  const registeredPlayerIds = new Set(regStaging.map(r => r.player_id))
  const seasonHasAnyPriorContext = priorContext.length > 0

  return season.age_groups.map(ag => {
    const agPlayers  = players.filter(p => p.age_group === ag)
    const agTeams     = teams.filter(t => t.age_group === ag)
    const agSessions  = sessions.filter(s => s.age_group === ag)

    // ── Registration loaded — blocking ──
    const agRegCount = regStaging.filter(r => r.age_group === ag).length
    const registration: CheckResult = agRegCount > 0 ? { tone: 'good', count: agRegCount } : { tone: 'bad', count: 0 }

    // ── Prior roster context — informational, never blocking ──
    const agPriorCount = agPlayers.filter(p => priorTeamByPlayer.has(p.id)).length
    const priorRoster: CheckResult = !seasonHasAnyPriorContext
      ? { tone: 'neutral', count: 0 }
      : agPriorCount > 0
      ? { tone: 'good', count: agPriorCount }
      : { tone: 'warn', count: 0 }

    // ── Coach evals per team — never blocking (score redistributes) ──
    const coachEvalRows: TeamCheck[] = agTeams.map(team => {
      const teamPlayers  = agPlayers.filter(p => priorTeamByPlayer.get(p.id) === team.name)
      const submitted     = coachEvals.filter(e => e.team_label === team.name && e.status === 'submitted')
      const uniquePlayers = new Set(submitted.map(e => e.player_id)).size
      const total         = teamPlayers.length
      const draft          = teamEvalStatus.get(team.name)
      const tone: CheckTone = total === 0 ? 'neutral' : uniquePlayers >= total ? 'good' : 'warn'
      return { teamId: team.id, teamName: team.name, tone, count: uniquePlayers, total, draftStatus: draft?.status ?? 'not_started' }
    })

    // ── GC stats per team — never blocking (score redistributes) ──
    const gcRows: TeamCheck[] = agTeams.map(team => {
      const job = gcJobs.find(j => j.team_id === team.id)
      const tone: CheckTone = job?.status === 'complete' ? 'good' : 'warn'
      return { teamId: team.id, teamName: team.name, tone, count: job?.status === 'complete' ? 1 : 0, total: 1, jobId: job?.id ?? null, jobStatus: job?.status ?? null }
    })

    // ── Tryout scores per session — blocking only if no session ever exists ──
    const sessionRows: SessionCheck[] = agSessions.map(sess => {
      const sessCheckins = checkins.filter(c => c.session_id === sess.id && c.player_id)
      const sessScores   = scores.filter(sc => sc.session_id === sess.id)
      const scoredIds    = new Set(sessScores.map(sc => sc.player_id))
      const pct          = sessCheckins.length > 0 ? scoredIds.size / sessCheckins.length : 0
      const threshold    = sess.min_score_pct ?? MIN_PCT
      const status: 'ready' | 'partial' | 'not_started' =
        sessCheckins.length > 0 && pct >= threshold ? 'ready' :
        scoredIds.size > 0 ? 'partial' : 'not_started'
      return { sessionId: sess.id, label: sess.label, status }
    })
    const anySessionReady = sessionRows.some(r => r.status === 'ready')
    const sessionsTone: CheckTone = agSessions.length === 0 ? 'bad' : anySessionReady ? 'good' : 'warn'

    // ── Age-group eligibility — blocking (only among registered candidates) ──
    const ageIssueCount = agPlayers.filter(p => {
      if (!registeredPlayerIds.has(p.id)) return false
      const dob = p.dob ?? regDobByPlayer.get(p.id) ?? null
      return isAgeBlocking(dob, p.tryout_age_group ?? p.age_group, season.year)
    }).length
    const ageIssues: CheckResult = { tone: ageIssueCount > 0 ? 'bad' : 'good', count: ageIssueCount }

    // ── Overall ──
    const blocking = registration.tone === 'bad' || sessionsTone === 'bad' || ageIssues.tone === 'bad'
    const missing =
      priorRoster.tone === 'warn' ||
      coachEvalRows.some(r => r.tone === 'warn') ||
      gcRows.some(r => r.tone === 'warn') ||
      sessionsTone === 'warn'
    const overall: Overall = blocking ? 'not_ready' : missing ? 'needs_attention' : 'ready'

    return {
      ageGroup: ag, playerCount: agPlayers.length,
      registration, priorRoster, coachEvals: coachEvalRows, gcStats: gcRows,
      sessions: sessionRows, sessionsTone, ageIssues, overall,
    }
  })
}
