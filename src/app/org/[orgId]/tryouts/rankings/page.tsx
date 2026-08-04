'use client'

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'
import PlayerCard from './PlayerCard'
import PlayerCompare from './PlayerCompare'
import type { GcStatDef } from '../../../../../lib/tryouts/gcStatDefs'
import { computeTryoutScore, computePitchingScore, type ScoringCategory } from '../../../../../lib/tryouts/computeScore'
import {
  denseRank,
  averagePresent,
  computeCoachEvalScore,
  computeIntangiblesScore,
  computeCombinedScore,
  selectActiveSeasonCoachEvals,
  selectActiveSeasonEvalConfig,
  DEFAULT_SEASON_WEIGHTS,
  type SeasonWeights,
} from '../../../../../lib/tryouts/scoring/combinedScore'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Player {
  id:               string
  first_name:       string
  last_name:        string
  age_group:        string
  tryout_age_group: string | null
  prior_team:       string | null
  grade:            string | null
}

interface TryoutScoreRow {
  player_id:       string
  tryout_score:    number | null
  tryout_pitching: number | null
  scores:          Record<string, number> | null
}

interface CoachEvalRow {
  player_id:        string
  season_id:        string | null
  season_year:      string
  computed_score:   number | null
  coach_eval_score: number | null
  intangibles_score: number | null
  scores:           Record<string, number> | null
  comments:         string | null
}

interface EvalConfigRow {
  season_id: string | null
  field_key: string
  section:   string
  weight:    number
}

interface GcStatRow {
  player_id:          string
  gc_computed_score:  number | null
  gc_hitting_score:   number | null
  gc_pitching_score:  number | null
  // Batting
  avg:               number | null
  obp:               number | null
  slg:               number | null
  ops:               number | null
  rbi:               number | null
  r:                 number | null
  hr:                number | null
  sb:                number | null
  bb:                number | null
  so:                number | null
  // Pitching
  era:               number | null
  whip:              number | null
  ip:                number | null
  k:                 number | null
  bb_allowed:        number | null
  bf:                number | null
  baa:               number | null
  bb_per_inn:        number | null
  k_bb:              number | null
  strike_pct:        number | null
  w:                 number | null
  sv:                number | null
}

interface Season {
  id:                   string
  label:                string
  year:                 number
  age_groups:           string[]
  rankings_share_token: string | null
  tryout_weight:        number
  coach_eval_weight:    number
  intangibles_weight:   number
  prior_stats_weight:   number
}

interface Team {
  id:              string
  name:            string
  age_group:       string
  color:           string | null
  eval_multiplier: number
}

// Lightweight action-item shape for the Rankings/PlayerCard "Follow-up"
// integration — deliberately not the full ActionItem record the dedicated
// Action Items page manages (title/status/owner/due date is all this needs).
export interface PlayerActionItem {
  id:         string
  title:      string
  details:    string | null
  status:     string
  owner_name: string | null
  due_date:   string | null
}

// Snapshot of "what was true before this season" — seeded explicitly via
// "Seed Prior Rosters from <season>" (Seasons page). Replaces reading
// tryout_players.prior_team, which used to get silently overwritten by
// every subsequent season's import.
export interface PriorContextRow {
  player_id:       string
  prior_team_name: string | null
  prior_age_group: string | null
}

interface RankedPlayer {
  player:          Player
  ageGroup:        string
  // Tryout data (placeholder until tryout scoring is built)
  tryoutScore:     number | null
  tryoutPitching:  number | null
  tryoutHitting:   number | null
  speed:           number | null   // raw 60yd time in seconds
  // Coach eval
  coachEval:        number | null  // computed_score — weighted avg of all scored fields
  intangibles:      number | null
  teamPitching:     number | null  // avg of pitching_catching section
  teamHitting:      number | null  // avg of fielding_hitting section
  evalSpeed:        number | null  // coach-scored speed (1–5)
  evalAthleticism:  number | null  // coach-scored athleticism (1–5)
  coachComments:    string | null
  // GC
  gcHittingScore:  number | null
  gcPitchingScore: number | null
  priorStatScore:  number | null  // avg(gcHittingScore, gcPitchingScore) — the actual combined-score input
  // Combined (33% tryout + 67% eval; falls back to whichever is available)
  combinedScore:   number | null
  // Ranks within age group (populated by computeRanks)
  combinedRank:    number | null
  tryoutRank:      number | null
  coachRank:       number | null
  intangiblesRank: number | null
  // Assignment
  assignedTeamId:  string | null
  // Admin notes
  adminNotes:      string | null
  // Exclude from team-making
  isExcluded:      boolean
  // Whether the player has accepted their roster spot (only relevant once assigned)
  isAccepted:      boolean
}

// ── Display-only helper ─────────────────────────────────────────────────────────
// (Combined-score math lives in lib/tryouts/scoring/combinedScore.ts — this one
// is purely for the informational teamPitching/teamHitting display columns,
// which are not inputs to the combined score.)

/** Compute section average from a scores JSON using matching field keys. */
function sectionAvg(
  scores: Record<string, number> | null,
  keys:   string[],
): number | null {
  if (!scores || keys.length === 0) return null
  const vals = keys.map(k => scores[k]).filter((v): v is number => typeof v === 'number')
  return vals.length > 0 ? vals.reduce((a, b) => a + b) / vals.length : null
}

// ── Component ──────────────────────────────────────────────────────────────────

function TeamMakingPageInner({ params }: { params: { orgId: string } }) {
  const supabase     = createClient()
  const searchParams = useSearchParams()

  const [season,        setSeason]        = useState<Season | null>(null)
  const [players,       setPlayers]       = useState<Player[]>([])
  const [tryoutRows,    setTryoutRows]    = useState<TryoutScoreRow[]>([])
  const [evalRows,      setEvalRows]      = useState<CoachEvalRow[]>([])
  const [evalConfig,    setEvalConfig]    = useState<EvalConfigRow[]>([])
  const [scoringConfig, setScoringConfig] = useState<ScoringCategory[]>([])
  const [gcRows,        setGcRows]        = useState<GcStatRow[]>([])
  const [priorContext,  setPriorContext]  = useState<PriorContextRow[]>([])
  const [teams,         setTeams]         = useState<Team[]>([])
  const [assignments,   setAssignments]   = useState<Record<string, string>>({})
  const [notesMap,      setNotesMap]      = useState<Record<string, string>>({})
  const [excludedMap,   setExcludedMap]   = useState<Record<string, boolean>>({})
  const [acceptedMap,   setAcceptedMap]   = useState<Record<string, boolean>>({})
  const [actionCounts,       setActionCounts]       = useState<Record<string, number>>({}) // team_id -> open action items
  const [playerActionCounts, setPlayerActionCounts] = useState<Record<string, number>>({}) // player_id -> open action items
  const [playerActionsMap,   setPlayerActionsMap]   = useState<Record<string, PlayerActionItem[]>>({}) // player_id -> open action items (full)
  const [loading,       setLoading]       = useState(true)

  // Filters / sort
  const [ageFilter, setAgeFilter] = useState('all')
  const [search,    setSearch]    = useState('')
  const [sortCol,   setSortCol]   = useState('combinedRank')
  const [sortDir,   setSortDir]   = useState<1 | -1>(1)   // 1 = asc for ranks, -1 = desc for scores

  // Cutoff lines per age group — persisted to localStorage keyed by org+season
  const [cutoffs, setCutoffs] = useState<Record<string, { blue: number; white: number }>>(() => {
    try {
      const raw = localStorage.getItem(`tryout_cutoffs_${params.orgId}`)
      return raw ? JSON.parse(raw) : {}
    } catch { return {} }
  })

  // Scoring detail view — expands the table with extra score-breakdown
  // columns (rank/pitching/hitting/intangibles/etc). Off by default to keep
  // the board-meeting view clean; purely a display toggle, not persisted.
  const [showScoreDetail, setShowScoreDetail] = useState(false)

  // Player card panel
  const [panelPlayerId, setPanelPlayerId] = useState<string | null>(null)

  // Compare
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [showCompare, setShowCompare] = useState(false)

  // Inline notes edit
  const [editingNotes, setEditingNotes] = useState<string | null>(null)
  const [notesVal,     setNotesVal]     = useState('')
  const [savingNotes,  setSavingNotes]  = useState<string | null>(null)
  const notesInputRef = useRef<HTMLTextAreaElement>(null)

  // Team assigning
  const [assigning, setAssigning] = useState<string | null>(null)

  // Share link
  const [shareToken,  setShareToken]  = useState<string | null>(null)
  const [sharingBusy, setSharingBusy] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  useEffect(() => { loadData() }, [])
  useEffect(() => {
    if (editingNotes && notesInputRef.current) notesInputRef.current.focus()
  }, [editingNotes])
  useEffect(() => {
    try { localStorage.setItem(`tryout_cutoffs_${params.orgId}`, JSON.stringify(cutoffs)) } catch { /* ignore */ }
  }, [cutoffs])

  // Deep-link support from the Action Items page: ?player=<id> opens that
  // player's card, ?team=<id> jumps the age filter to that team's group.
  useEffect(() => {
    if (teams.length === 0 && players.length === 0) return
    const playerId = searchParams.get('player')
    const teamId   = searchParams.get('team')
    if (playerId) setPanelPlayerId(playerId)
    if (teamId) {
      const team = teams.find(t => t.id === teamId)
      if (team?.age_group) setAgeFilter(team.age_group.toUpperCase())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teams, players])

  async function loadData() {
    const { data: seasonData } = await supabase
      .from('tryout_seasons')
      .select('id, label, year, age_groups, rankings_share_token, tryout_weight, coach_eval_weight, intangibles_weight, prior_stats_weight')
      .eq('org_id', params.orgId).eq('is_active', true).maybeSingle()

    setSeason(seasonData)
    setShareToken(seasonData?.rankings_share_token ?? null)
    if (!seasonData) { setLoading(false); return }

    const { data: sessionRows } = await supabase
      .from('tryout_sessions')
      .select('id')
      .eq('season_id', seasonData.id)
    const sessionIds = (sessionRows ?? []).map((s: any) => s.id as string)

    const [
      { data: playerData },
      { data: tryoutData },
      { data: evalData },
      { data: evalCfgData },
      { data: scoringCfgData },
      { data: gcData },
      { data: teamData },
      { data: assignData },
      { data: combinedData },
      { data: actionItemData },
      { data: priorContextData },
    ] = await Promise.all([
      supabase.from('tryout_players')
        .select('id, first_name, last_name, age_group, tryout_age_group, prior_team, grade')
        .eq('org_id', params.orgId).eq('is_active', true)
        .order('last_name').order('first_name'),

      sessionIds.length > 0
        ? supabase.from('tryout_scores')
            .select('player_id, tryout_score, tryout_pitching, scores')
            .in('session_id', sessionIds)
        : Promise.resolve({ data: [] as any[], error: null }),

      // Season-scoped, not a [this year, last year] window — a player with
      // no evaluation for THIS season has no eval, full stop. Never fall
      // back to a prior season's submission. See combinedScore.ts.
      supabase.from('tryout_coach_evals')
        .select('player_id, season_id, season_year, computed_score, coach_eval_score, intangibles_score, scores, comments')
        .eq('org_id', params.orgId)
        .eq('season_id', seasonData.id)
        .eq('status', 'submitted'),

      supabase.from('tryout_coach_eval_config')
        .select('season_id, field_key, section, weight')
        .eq('org_id', params.orgId)
        .eq('season_id', seasonData.id)
        .order('sort_order'),

      supabase.from('tryout_scoring_config')
        .select('category, label, weight, is_optional, is_tiebreaker, subcategories, sort_order')
        .eq('season_id', seasonData.id)
        .order('sort_order'),

      supabase.from('tryout_gc_stats')
        .select('player_id, gc_computed_score, gc_hitting_score, gc_pitching_score, avg, obp, slg, ops, rbi, r, hr, sb, bb, so, era, whip, ip, k, bb_allowed, bf, baa, bb_per_inn, k_bb, strike_pct, w, sv')
        .eq('org_id', params.orgId).eq('season_year', String(seasonData.year - 1)),

      supabase.from('tryout_teams')
        .select('id, name, age_group, color, eval_multiplier')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id),

      supabase.from('tryout_team_assignments')
        .select('player_id, team_id, is_accepted')
        .eq('season_id', seasonData.id),

      supabase.from('tryout_combined_scores')
        .select('player_id, admin_notes, is_excluded')
        .eq('season_id', seasonData.id),

      supabase.from('tryout_action_items')
        .select('id, team_id, player_id, title, details, status, owner_name, due_date, updated_at')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id)
        .in('status', ['open', 'waiting', 'in_progress', 'blocked'])
        .order('updated_at', { ascending: false }),

      // "Previous team" for the active season — seeded explicitly from a
      // completed prior season's final roster (Seasons page). Replaces the
      // old tryout_players.prior_team read, which froze/degraded across
      // seasons since nothing reset it.
      supabase.from('tryout_prior_roster_context')
        .select('player_id, prior_team_name, prior_age_group')
        .eq('season_id', seasonData.id),
    ])

    setPlayers(playerData ?? [])
    setTryoutRows(tryoutData ?? [])
    setEvalRows(evalData ?? [])
    setPriorContext(priorContextData ?? [])
    setEvalConfig(evalCfgData ?? [])
    setScoringConfig((scoringCfgData ?? []).map((c: any) => ({
      category: c.category, label: c.label, weight: c.weight,
      is_optional: c.is_optional, is_tiebreaker: c.is_tiebreaker ?? false,
      subcategories: c.subcategories ?? [],
    })))
    setGcRows(gcData ?? [])
    setTeams(teamData ?? [])

    const asgn: Record<string, string>  = {}
    const acc:  Record<string, boolean> = {}
    for (const a of (assignData ?? [])) {
      asgn[a.player_id] = a.team_id
      acc[a.player_id]  = !!a.is_accepted
    }
    setAssignments(asgn)
    setAcceptedMap(acc)

    const notes:    Record<string, string>  = {}
    const excluded: Record<string, boolean> = {}
    for (const c of (combinedData ?? [])) {
      if (c.admin_notes) notes[c.player_id]    = c.admin_notes
      if (c.is_excluded) excluded[c.player_id] = true
    }
    setNotesMap(notes)
    setExcludedMap(excluded)

    const teamCounts:   Record<string, number> = {}
    const playerCounts: Record<string, number> = {}
    const playerActions: Record<string, PlayerActionItem[]> = {}
    for (const a of (actionItemData ?? [])) {
      if (a.team_id)   teamCounts[a.team_id]     = (teamCounts[a.team_id]     ?? 0) + 1
      if (a.player_id) {
        playerCounts[a.player_id] = (playerCounts[a.player_id] ?? 0) + 1
        if (!playerActions[a.player_id]) playerActions[a.player_id] = []
        playerActions[a.player_id].push({
          id: a.id, title: a.title, details: a.details, status: a.status,
          owner_name: a.owner_name, due_date: a.due_date,
        })
      }
    }
    setActionCounts(teamCounts)
    setPlayerActionCounts(playerCounts)
    setPlayerActionsMap(playerActions)

    setLoading(false)
  }

  // ── Notes save ───────────────────────────────────────────────────────────────

  async function saveNotes(playerId: string, val: string) {
    if (!season) return
    const player = players.find(p => p.id === playerId)
    setSavingNotes(playerId)
    await supabase.from('tryout_combined_scores').upsert(
      {
        player_id:   playerId,
        org_id:      params.orgId,
        season_id:   season.id,
        age_group:   player?.tryout_age_group ?? player?.age_group ?? null,
        admin_notes: val.trim() || null,
      },
      { onConflict: 'player_id,season_id' }
    )
    setNotesMap(prev => ({ ...prev, [playerId]: val.trim() }))
    setSavingNotes(null)
    setEditingNotes(null)
  }

  // ── Exclude toggle ───────────────────────────────────────────────────────────

  async function toggleExclude(playerId: string) {
    if (!season) return
    const next = !excludedMap[playerId]
    const player = players.find(p => p.id === playerId)
    setExcludedMap(prev => ({ ...prev, [playerId]: next }))
    await supabase.from('tryout_combined_scores').upsert(
      {
        player_id:   playerId,
        org_id:      params.orgId,
        season_id:   season.id,
        age_group:   player?.tryout_age_group ?? player?.age_group ?? null,
        is_excluded: next,
      },
      { onConflict: 'player_id,season_id' }
    )
  }

  // ── Team assignment save ──────────────────────────────────────────────────────

  async function assignTeam(playerId: string, teamId: string | null) {
    if (!season) return
    setAssigning(playerId)
    if (teamId) {
      // Assigning or reassigning always resets acceptance — the player needs
      // to accept the (new) roster spot again.
      const { error } = await supabase.from('tryout_team_assignments').upsert(
        { player_id: playerId, team_id: teamId, season_id: season.id, org_id: params.orgId, assigned_by: 'manual', is_accepted: false },
        { onConflict: 'player_id,season_id' }
      )
      if (!error) {
        setAssignments(prev => ({ ...prev, [playerId]: teamId }))
        setAcceptedMap(prev => ({ ...prev, [playerId]: false }))
      }
      else console.error('assignTeam upsert failed:', error.message)
    } else {
      const { error } = await supabase.from('tryout_team_assignments').delete()
        .eq('player_id', playerId).eq('season_id', season.id)
      if (!error) {
        setAssignments(prev => { const n = { ...prev }; delete n[playerId]; return n })
        setAcceptedMap(prev => { const n = { ...prev }; delete n[playerId]; return n })
      }
      else console.error('assignTeam delete failed:', error.message)
    }
    setAssigning(null)
  }

  // ── Accepted toggle ──────────────────────────────────────────────────────────

  async function toggleAccepted(playerId: string) {
    if (!season) return
    const teamId = assignments[playerId]
    if (!teamId) return   // only relevant once a player is assigned to a team
    const next = !acceptedMap[playerId]
    setAcceptedMap(prev => ({ ...prev, [playerId]: next }))
    const { error } = await supabase.from('tryout_team_assignments')
      .update({ is_accepted: next })
      .eq('player_id', playerId).eq('season_id', season.id)
    if (error) {
      console.error('toggleAccepted failed:', error.message)
      setAcceptedMap(prev => ({ ...prev, [playerId]: !next }))
    }
  }

  // ── Action items (lightweight — full management stays on the Action Items page) ──

  const CLOSED_ACTION_STATUSES = ['completed', 'cancelled']

  async function quickSetActionItemStatus(playerId: string, itemId: string, status: string) {
    const isClosing = CLOSED_ACTION_STATUSES.includes(status)
    setPlayerActionsMap(prev => {
      const next = { ...prev }
      const list = (next[playerId] ?? []).filter(a => a.id !== itemId || !isClosing).map(a => a.id === itemId ? { ...a, status } : a)
      next[playerId] = isClosing ? list.filter(a => a.id !== itemId) : list
      return next
    })
    setPlayerActionCounts(prev => isClosing ? { ...prev, [playerId]: Math.max(0, (prev[playerId] ?? 1) - 1) } : prev)
    const { error } = await supabase.from('tryout_action_items')
      .update({ status, completed_at: isClosing ? new Date().toISOString() : null })
      .eq('id', itemId)
    if (error) { console.error('quickSetActionItemStatus failed:', error.message); await loadData() }
  }

  async function quickCreateActionItem(row: RankedPlayer, title?: string) {
    if (!season) return
    const { data: { user } } = await supabase.auth.getUser()
    const payload = {
      org_id: params.orgId, season_id: season.id,
      age_group: row.ageGroup, team_id: row.assignedTeamId, player_id: row.player.id,
      title: title?.trim() || `Follow up on ${row.player.first_name} ${row.player.last_name}`,
      status: 'open', created_by: user?.id ?? null,
    }
    const { data, error } = await supabase.from('tryout_action_items').insert(payload).select('id, title, details, status, owner_name, due_date').single()
    if (error) { console.error('quickCreateActionItem failed:', error.message); return }
    setPlayerActionsMap(prev => ({ ...prev, [row.player.id]: [data as PlayerActionItem, ...(prev[row.player.id] ?? [])] }))
    setPlayerActionCounts(prev => ({ ...prev, [row.player.id]: (prev[row.player.id] ?? 0) + 1 }))
  }

  // ── Compare toggle ───────────────────────────────────────────────────────────

  function toggleCompare(playerId: string) {
    setCompareIds(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : prev.length < 4 ? [...prev, playerId] : prev
    )
  }

  // ── Share link ────────────────────────────────────────────────────────────────

  async function handleShare() {
    if (!season) return
    setSharingBusy(true)
    if (shareToken) {
      await navigator.clipboard.writeText(`${window.location.origin}/tryouts/rankings/${shareToken}`)
      setShareCopied(true); setTimeout(() => setShareCopied(false), 2000)
      setSharingBusy(false); return
    }
    const res  = await fetch('/api/tryouts/rankings-share', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seasonId: season.id, orgId: params.orgId, action: 'generate' }),
    })
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
    await fetch('/api/tryouts/rankings-share', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seasonId: season.id, orgId: params.orgId, action: 'revoke' }),
    })
    setShareToken(null); setSharingBusy(false)
  }

  // ── Score computation ─────────────────────────────────────────────────────────

  const pitchingKeys = useMemo(
    () => evalConfig.filter(c => c.section === 'pitching_catching').map(c => c.field_key),
    [evalConfig]
  )
  const hittingKeys = useMemo(
    () => evalConfig.filter(c => c.section === 'fielding_hitting').map(c => c.field_key),
    [evalConfig]
  )
  const intangiblesKeys = useMemo(
    () => evalConfig.filter(c => c.section === 'intangibles').map(c => c.field_key),
    [evalConfig]
  )

  const seasonWeights: SeasonWeights = useMemo(() => season ? {
    tryoutWeight:      season.tryout_weight,
    coachEvalWeight:   season.coach_eval_weight,
    intangiblesWeight: season.intangibles_weight,
    priorStatsWeight:  season.prior_stats_weight,
  } : DEFAULT_SEASON_WEIGHTS, [season])

  const priorTeamMap = useMemo(
    () => new Map(priorContext.map(pc => [pc.player_id, pc.prior_team_name])),
    [priorContext]
  )

  const ranked = useMemo((): RankedPlayer[] => {
    // Per-player tryout: average across evaluators
    const tryoutByPlayer = new Map<string, TryoutScoreRow[]>()
    for (const r of tryoutRows) {
      if (!tryoutByPlayer.has(r.player_id)) tryoutByPlayer.set(r.player_id, [])
      tryoutByPlayer.get(r.player_id)!.push(r)
    }

    // Per-player eval — constrained to the active season only. See
    // selectActiveSeasonCoachEvals in combinedScore.ts: a player with no
    // row for this season_id has no eval, never a prior season's.
    const evalByPlayer = season
      ? selectActiveSeasonCoachEvals(evalRows, season.id)
      : new Map<string, CoachEvalRow>()

    const scopedEvalConfig = season
      ? selectActiveSeasonEvalConfig(evalConfig, season.id)
      : []

    // Per-player GC
    const gcByPlayer = new Map<string, GcStatRow>()
    for (const r of gcRows) gcByPlayer.set(r.player_id, r)

    const base: Array<Omit<RankedPlayer, 'combinedRank' | 'tryoutRank' | 'coachRank' | 'intangiblesRank'>> =
      players.map(player => {
        const ag = ((player.tryout_age_group ?? player.age_group) ?? '?U').toUpperCase()

        // Tryout — use stored tryout_score; fall back to computing from scores JSONB
        const tRows = tryoutByPlayer.get(player.id) ?? []
        const resolvedScores = tRows.map(r => {
          if (r.tryout_score != null) return r.tryout_score
          if (r.scores && scoringConfig.length > 0) return computeTryoutScore(r.scores, scoringConfig)
          return null
        })
        const validT = resolvedScores.filter((v): v is number => v != null)
        const tryoutScore = validT.length > 0
          ? validT.reduce((s, v) => s + v, 0) / validT.length
          : null
        const resolvedPitching = tRows.map(r => {
          if (r.tryout_pitching != null) return r.tryout_pitching
          if (r.scores && scoringConfig.length > 0) return computePitchingScore(r.scores, scoringConfig)
          return null
        })
        const validTP = resolvedPitching.filter((v): v is number => v != null)
        const tryoutPitching = validTP.length > 0
          ? validTP.reduce((s, v) => s + v, 0) / validTP.length
          : null
        // Tryout hitting — look for 'hitting' category in scores JSON
        let tryoutHitting: number | null = null
        let speed: number | null = null
        for (const r of tRows) {
          if (!r.scores) continue
          // Look for a hitting subcategory key
          const hk = Object.keys(r.scores).find(k => k.toLowerCase().includes('hit'))
          if (hk && tryoutHitting == null) tryoutHitting = r.scores[hk]
          // Look for a speed / 60yd key
          const sk = Object.keys(r.scores).find(k =>
            k.toLowerCase().includes('speed') || k.toLowerCase().includes('60')
          )
          if (sk && speed == null) speed = r.scores[sk]
        }

        // Coach eval — recomputed live from raw scores + the org's *current*
        // eval config (not the stale computed_score/coach_eval_score snapshot
        // taken at submission time), so Scoring Setup changes take effect
        // immediately. coachEval and intangibles are section-scoped and
        // mutually exclusive — see combinedScore.ts — so neither double-counts
        // the other in the combined score below.
        const evalRow = evalByPlayer.get(player.id) ?? null
        const rawCoachEval     = computeCoachEvalScore(evalRow?.scores ?? null, scopedEvalConfig)
        const assignedTeamId   = assignments[player.id] ?? null
        const assignedTeam     = teams.find(t => t.id === assignedTeamId)
        const evalMultiplier   = assignedTeam?.eval_multiplier ?? 1.0
        const coachEval        = rawCoachEval != null
          ? Math.round(rawCoachEval * evalMultiplier * 100) / 100
          : null
        const intangibles      = computeIntangiblesScore(evalRow?.scores ?? null, scopedEvalConfig)
        const teamPitching     = sectionAvg(evalRow?.scores ?? null, pitchingKeys)
        const teamHitting      = sectionAvg(evalRow?.scores ?? null, hittingKeys)
        const evalSpeed        = evalRow?.scores?.['speed']       != null ? Number(evalRow.scores['speed'])       : null
        const evalAthleticism  = evalRow?.scores?.['athleticism'] != null ? Number(evalRow.scores['athleticism']) : null
        const coachComments    = evalRow?.comments ?? null

        // GC
        const gcRow          = gcByPlayer.get(player.id) ?? null
        const gcHittingScore  = gcRow?.gc_hitting_score  ?? null
        const gcPitchingScore = gcRow?.gc_pitching_score ?? null
        const priorStatScore  = averagePresent([gcHittingScore, gcPitchingScore])

        // Combined: per the season's configured weights (tryout / coach eval /
        // intangibles / prior stats), redistributed across whichever
        // components are actually present for this player. See
        // lib/tryouts/scoring/combinedScore.ts for the shared formula used
        // here and on the per-team roster page.
        const combinedScore = computeCombinedScore(
          { tryoutScore, coachEvalScore: coachEval, intangiblesScore: intangibles, priorStatScore },
          seasonWeights,
        )

        // "Prior team" for display/search/export comes from the season-scoped
        // seed data, not the legacy tryout_players.prior_team field — falls
        // back to it only if this season hasn't been seeded yet.
        const playerForDisplay = { ...player, prior_team: priorTeamMap.get(player.id) ?? player.prior_team }

        return {
          player: playerForDisplay,
          ageGroup:       ag,
          tryoutScore,
          tryoutPitching,
          tryoutHitting,
          speed,
          coachEval,
          intangibles,
          teamPitching,
          teamHitting,
          evalSpeed,
          evalAthleticism,
          coachComments,
          gcHittingScore,
          gcPitchingScore,
          priorStatScore,
          combinedScore,
          assignedTeamId: assignments[player.id] ?? null,
          adminNotes:     notesMap[player.id] ?? null,
          isExcluded:     excludedMap[player.id] ?? false,
          isAccepted:     acceptedMap[player.id] ?? false,
        }
      })

    // Compute ranks within each age group
    const byAge = new Map<string, typeof base>()
    for (const p of base) {
      if (!byAge.has(p.ageGroup)) byAge.set(p.ageGroup, [])
      byAge.get(p.ageGroup)!.push(p)
    }

    const combinedRankMap    = new Map<string, number>()
    const tryoutRankMap      = new Map<string, number>()
    const coachRankMap       = new Map<string, number>()
    const intangiblesRankMap = new Map<string, number>()

    for (const group of Array.from(byAge.values())) {
      denseRank(group.map(p => ({ id: p.player.id, v: p.combinedScore }))).forEach((v, k) => combinedRankMap.set(k, v))
      denseRank(group.map(p => ({ id: p.player.id, v: p.tryoutScore   }))).forEach((v, k) => tryoutRankMap.set(k, v))
      denseRank(group.map(p => ({ id: p.player.id, v: p.coachEval     }))).forEach((v, k) => coachRankMap.set(k, v))
      denseRank(group.map(p => ({ id: p.player.id, v: p.intangibles   }))).forEach((v, k) => intangiblesRankMap.set(k, v))
    }

    return base.map(p => ({
      ...p,
      combinedRank:    combinedRankMap.get(p.player.id)    ?? null,
      tryoutRank:      tryoutRankMap.get(p.player.id)      ?? null,
      coachRank:       coachRankMap.get(p.player.id)       ?? null,
      intangiblesRank: intangiblesRankMap.get(p.player.id) ?? null,
    }))
  }, [players, tryoutRows, evalRows, gcRows, assignments, notesMap, excludedMap, acceptedMap, evalConfig, season, priorTeamMap, pitchingKeys, hittingKeys, intangiblesKeys, scoringConfig, seasonWeights])

  // ── Filter + sort ─────────────────────────────────────────────────────────────

  const { activeFiltered, excludedFiltered } = useMemo(() => {
    let list = ranked
    if (ageFilter !== 'all') list = list.filter(r => r.ageGroup === ageFilter)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(r =>
        `${r.player.first_name} ${r.player.last_name}`.toLowerCase().includes(q) ||
        (r.player.prior_team ?? '').toLowerCase().includes(q) ||
        (r.ageGroup ?? '').toLowerCase().includes(q)
      )
    }

    const numVal = (r: RankedPlayer): number => {
      switch (sortCol) {
        case 'combinedRank':    return r.combinedRank    ?? 9999
        case 'combinedScore':   return r.combinedScore   ?? -1
        case 'tryoutScore':     return r.tryoutScore     ?? -1
        case 'tryoutRank':      return r.tryoutRank      ?? 9999
        case 'coachEval':       return r.coachEval       ?? -1
        case 'coachRank':       return r.coachRank       ?? 9999
        case 'intangibles':     return r.intangibles     ?? -1
        case 'intangiblesRank': return r.intangiblesRank ?? 9999
        case 'teamPitching':    return r.teamPitching    ?? -1
        case 'tryoutPitching':  return r.tryoutPitching  ?? -1
        case 'teamHitting':     return r.teamHitting     ?? -1
        case 'tryoutHitting':   return r.tryoutHitting   ?? -1
        case 'evalSpeed':       return r.evalSpeed       ?? -1
        case 'evalAthleticism': return r.evalAthleticism ?? -1
        case 'speed':           return r.speed           ?? 9999
        case 'gcHittingScore':  return r.gcHittingScore  ?? -1
        case 'gcPitchingScore': return r.gcPitchingScore ?? -1
        case 'priorStatScore':  return r.priorStatScore  ?? -1
        case 'name': return 0
        default:                return r.combinedRank    ?? 9999
      }
    }

    const sorted = [...list].sort((a, b) => {
      if (sortCol === 'name') {
        const na = `${a.player.last_name}${a.player.first_name}`
        const nb = `${b.player.last_name}${b.player.first_name}`
        return na.localeCompare(nb) * sortDir
      }
      return (numVal(a) - numVal(b)) * sortDir
    })

    return {
      activeFiltered:   sorted.filter(r => !r.isExcluded),
      excludedFiltered: sorted.filter(r => r.isExcluded),
    }
  }, [ranked, ageFilter, search, sortCol, sortDir])

  const filtered = activeFiltered

  function toggleSort(col: string) {
    if (sortCol === col) {
      setSortDir(d => d === 1 ? -1 : 1)
    } else {
      setSortCol(col)
      // Rank columns: ascending by default (rank 1 first). Score columns: descending (high first).
      const rankCols = ['combinedRank', 'tryoutRank', 'coachRank', 'intangiblesRank', 'speed']
      setSortDir(rankCols.includes(col) ? 1 : -1)
    }
  }

  function sortArrow(col: string) {
    if (sortCol !== col) return <span style={{ opacity: 0.2 }}> ↕</span>
    return <span style={{ color: 'var(--accent)' }}>{sortDir === 1 ? ' ↑' : ' ↓'}</span>
  }

  // ── Cutoff helpers ────────────────────────────────────────────────────────────

  const ageCutoff = cutoffs[ageFilter] ?? { blue: 0, white: 0 }
  function setCutoff(field: 'blue' | 'white', val: number) {
    setCutoffs(prev => ({
      ...prev,
      [ageFilter]: { ...(prev[ageFilter] ?? { blue: 0, white: 0 }), [field]: Math.max(0, val) },
    }))
  }

  // ── CSV export ────────────────────────────────────────────────────────────────

  function exportCsv() {
    if (!season) return
    const priorYear = season.year - 1
    const rows = [
      [
        'Next Season Team', 'Accepted', 'Notes', 'Combined Rank', 'Player', 'Age Group', 'Grade', `${priorYear} Team`,
        'Combined Score',
        'Tryout Score', 'Tryout Rank', 'TO Pitching', 'TO Hitting', 'Speed (60yd)',
        'Coach Eval', 'Coach Rank', 'Intangibles', 'Intangibles Rank', 'Eval Pitching', 'Eval Hitting', 'Eval Speed', 'Eval Athleticism',
        'GC Hitting', 'GC Pitching',
        'Comments',
      ],
      ...filtered.map(r => {
        const team = teams.find(t => t.id === r.assignedTeamId)
        return [
          team?.name ?? '',
          r.assignedTeamId ? (r.isAccepted ? 'Yes' : 'No') : '',
          r.adminNotes ?? '',
          String(r.combinedRank ?? ''),
          `${r.player.last_name}, ${r.player.first_name}`,
          r.ageGroup,
          r.player.grade ?? '',
          r.player.prior_team ?? '',
          r.combinedScore?.toFixed(2)    ?? '',
          r.tryoutScore?.toFixed(2)      ?? '',
          String(r.tryoutRank             ?? ''),
          r.tryoutPitching?.toFixed(2)   ?? '',
          r.tryoutHitting?.toFixed(2)    ?? '',
          r.speed?.toFixed(2)            ?? '',
          r.coachEval?.toFixed(2)        ?? '',
          String(r.coachRank              ?? ''),
          r.intangibles?.toFixed(2)      ?? '',
          String(r.intangiblesRank        ?? ''),
          r.teamPitching?.toFixed(2)     ?? '',
          r.teamHitting?.toFixed(2)      ?? '',
          r.evalSpeed?.toFixed(1)        ?? '',
          r.evalAthleticism?.toFixed(1)  ?? '',
          r.gcHittingScore?.toFixed(2)   ?? '',
          r.gcPitchingScore?.toFixed(2)  ?? '',
          r.coachComments ?? '',
        ]
      }),
    ]
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `team-making-${ageFilter}-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Derived stats ─────────────────────────────────────────────────────────────

  // Derive age groups from actual player data, normalized uppercase, sorted numerically, 8U–14U only
  const ageGroups = useMemo(() => {
    const groups = Array.from(new Set(ranked.map(r => r.ageGroup).filter(Boolean))) as string[]
    return groups
      .filter(ag => { const n = parseInt(ag); return n >= 8 && n <= 14 })
      .sort((a, b) => parseInt(a) - parseInt(b))
  }, [ranked])
  const priorYear     = season ? season.year - 1 : null
  const assignedCount = activeFiltered.filter(r => r.assignedTeamId).length
  const excludedCount = excludedFiltered.length
  const teamOptions   = (ag: string) => {
    const matched = teams.filter(t => (t.age_group ?? '').toLowerCase() === ag.toLowerCase() || t.age_group === 'all')
    return matched.length > 0 ? matched : teams  // fallback: show all teams
  }
  // Fill count per team — shown in the assignment dropdown so admins can see
  // "Blue (11)" at a glance without switching to the Teams page mid-meeting.
  const teamFillCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const teamId of Object.values(assignments)) counts[teamId] = (counts[teamId] ?? 0) + 1
    return counts
  }, [assignments])

  // ── Styles ────────────────────────────────────────────────────────────────────

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  const th: React.CSSProperties = {
    padding: '6px 8px', fontSize: '10px', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.05em',
    color: s.dim, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none',
    background: 'var(--bg)', borderBottom: '0.5px solid var(--border)',
    position: 'sticky', top: 0, zIndex: 2,
    textAlign: 'right',
  }
  const td: React.CSSProperties = {
    padding: '7px 8px', textAlign: 'right', verticalAlign: 'middle',
    borderBottom: '0.5px solid rgba(var(--fg-rgb),0.05)', fontSize: '13px',
  }
  // Sticky column: Team
  const stickyTeamTh: React.CSSProperties = {
    ...th, position: 'sticky', left: 0, zIndex: 4, textAlign: 'left',
    boxShadow: '2px 0 4px rgba(var(--fg-rgb),0.04)',
  }
  const stickyTeamTd: React.CSSProperties = {
    ...td, position: 'sticky', left: 0, zIndex: 1, background: 'var(--bg)',
    textAlign: 'left', boxShadow: '2px 0 4px rgba(var(--fg-rgb),0.04)',
  }
  // Sticky column: Player name
  const TEAM_W = 110
  const stickyPlayerTh: React.CSSProperties = {
    ...th, position: 'sticky', left: TEAM_W, zIndex: 4, textAlign: 'left',
    boxShadow: '2px 0 5px rgba(var(--fg-rgb),0.06)',
  }
  const stickyPlayerTd: React.CSSProperties = {
    ...td, position: 'sticky', left: TEAM_W, zIndex: 1, background: 'var(--bg)',
    textAlign: 'left', boxShadow: '2px 0 5px rgba(var(--fg-rgb),0.06)',
  }
  const numCell = (v: number | null, dec = 2, highlight = false): React.CSSProperties => ({
    ...td,
    fontWeight: highlight ? 800 : v != null ? 600 : 400,
    color: v != null
      ? highlight ? 'var(--accent)' : 'var(--fg)'
      : s.dim,
  })

  function fmt(v: number | null, dec = 2) { return v != null ? v.toFixed(dec) : '—' }
  function fmtRank(v: number | null) { return v != null ? String(v) : '—' }

  // Style for the small rank cells shown in Scoring Detail view.
  const rankCell = (v: number | null): React.CSSProperties => ({
    ...td, textAlign: 'center', fontSize: '11px', color: v != null ? s.muted : s.dim,
  })

  // Number of columns in the base (summary) table vs. how many extra
  // columns Scoring Detail view adds — used to size colSpan on the
  // full-width zone/separator rows so they still span the whole table.
  const BASE_COL_COUNT   = 12
  const DETAIL_COL_COUNT = 13
  const totalCols = BASE_COL_COUNT + (showScoreDetail ? DETAIL_COL_COUNT : 0)

  // Discoverability cue for the merged Tryout/Coach Eval/Prior Stats columns —
  // each row's cell carries a native title tooltip with the sub-score
  // breakdown; this just tells users to look for it, once, in the header.
  const breakdownHint = (
    <span title="Hover a player's score in this column for the breakdown" style={{ opacity: 0.5, marginLeft: '2px', cursor: 'help' }}>ⓘ</span>
  )

  // ── Draft board (assignment-aware positioning) ────────────────────────────
  type DraftZone = 'blue-assigned' | 'blue-fill' | 'white-assigned' | 'white-fill' | 'bubble'

  const isDraftMode = ageFilter !== 'all' && (ageCutoff.blue > 0 || ageCutoff.white > 0)

  const blueTeamId: string | null = !isDraftMode ? null :
    (teams.find(t => t.name.toLowerCase().includes('blue') && (t.age_group ?? '').toLowerCase() === ageFilter.toLowerCase()) ??
     teams.find(t => t.name.toLowerCase().includes('blue')))?.id ?? null
  const whiteTeamId: string | null = !isDraftMode ? null :
    (teams.find(t => t.name.toLowerCase().includes('white') && (t.age_group ?? '').toLowerCase() === ageFilter.toLowerCase()) ??
     teams.find(t => t.name.toLowerCase().includes('white')))?.id ?? null

  const draftBlueAsgn   = isDraftMode ? activeFiltered.filter(r => r.assignedTeamId === blueTeamId)  : []
  const draftWhiteAsgn  = isDraftMode ? activeFiltered.filter(r => r.assignedTeamId === whiteTeamId) : []
  const draftUnassigned = isDraftMode ? activeFiltered.filter(r => !r.assignedTeamId) : []
  const draftBlueOpen   = Math.max(0, ageCutoff.blue  - draftBlueAsgn.length)
  const draftWhiteOpen  = Math.max(0, ageCutoff.white - draftWhiteAsgn.length)
  const draftBlueFill   = draftUnassigned.slice(0, draftBlueOpen)
  const draftWhiteFill  = draftUnassigned.slice(draftBlueOpen, draftBlueOpen + draftWhiteOpen)
  const draftBlueFillIds  = new Set(draftBlueFill.map(r => r.player.id))
  const draftWhiteFillIds = new Set(draftWhiteFill.map(r => r.player.id))
  const draftBubble = isDraftMode ? activeFiltered.filter(r =>
    r.assignedTeamId !== blueTeamId && r.assignedTeamId !== whiteTeamId &&
    !draftBlueFillIds.has(r.player.id) && !draftWhiteFillIds.has(r.player.id)
  ) : []

  // One compact "Follow-up" indicator instead of separate signals for open
  // action items / blocked items / notes — consolidates what used to be a
  // single action-item-only badge.
  function followUpInfo(playerId: string): { fg: string; bg: string; title: string; count: number } | null {
    const actions    = playerActionsMap[playerId] ?? []
    const openCount  = playerActionCounts[playerId] ?? 0
    const hasBlocked = actions.some(a => a.status === 'blocked')
    const hasNotes   = !!notesMap[playerId]
    if (openCount === 0 && !hasNotes) return null
    const fg = hasBlocked ? 'var(--status-bad)' : openCount > 0 ? 'var(--status-warn)' : 'var(--status-info)'
    const bg = hasBlocked ? 'var(--status-bad-bg)' : openCount > 0 ? 'var(--status-warn-bg)' : 'var(--status-info-bg)'
    const title = [
      openCount > 0 && `${openCount} open action item${openCount > 1 ? 's' : ''}${hasBlocked ? ' (blocked)' : ''}`,
      hasNotes && 'has notes',
    ].filter(Boolean).join(' · ')
    return { fg, bg, title, count: openCount }
  }

  const renderRow = (row: RankedPlayer, zone: DraftZone | null, altRow: boolean) => {
    const team      = teams.find(t => t.id === row.assignedTeamId)
    const tOpts     = teamOptions(row.ageGroup)
    const teamColor = team?.color ?? '#6DB875'
    const borderC =
      zone === 'blue-assigned'  ? 'rgba(64,144,224,0.85)' :
      zone === 'blue-fill'      ? 'rgba(64,144,224,0.35)' :
      zone === 'white-assigned' ? 'rgba(180,180,180,0.85)' :
      zone === 'white-fill'     ? 'rgba(180,180,180,0.35)' : 'transparent'
    const rowBg =
      zone === 'blue-assigned'  ? 'rgba(64,144,224,0.07)' :
      zone === 'blue-fill'      ? 'rgba(64,144,224,0.03)' :
      zone === 'white-assigned' ? 'rgba(var(--fg-rgb),0.05)' :
      zone === 'white-fill'     ? 'rgba(var(--fg-rgb),0.02)' :
      altRow ? 'rgba(var(--fg-rgb),0.015)' : 'transparent'
    return (
      <tr key={row.player.id} style={{ borderLeft: `3px solid ${borderC}`, background: rowBg }}>
        <td style={{ ...td, padding: '7px 4px', textAlign: 'center', width: '28px' }}>
          <input type="checkbox" checked={compareIds.includes(row.player.id)}
            onChange={() => toggleCompare(row.player.id)}
            title={compareIds.length >= 4 && !compareIds.includes(row.player.id) ? 'Max 4 players' : 'Compare'}
            disabled={compareIds.length >= 4 && !compareIds.includes(row.player.id)}
            style={{ cursor: 'pointer', accentColor: 'var(--accent)' }} />
        </td>
        <td style={{ ...stickyTeamTd, background: 'var(--bg)', width: `${TEAM_W}px` }}>
          <select value={row.assignedTeamId ?? ''} onChange={e => assignTeam(row.player.id, e.target.value || null)}
            disabled={assigning === row.player.id}
            style={{ background: team ? `${teamColor}18` : 'var(--bg-input)', border: `0.5px solid ${team ? `${teamColor}55` : 'var(--border-md)'}`, borderRadius: '5px', padding: '4px 6px', fontSize: '12px', color: team ? teamColor : s.muted, cursor: assigning === row.player.id ? 'default' : 'pointer', width: '100%', fontWeight: team ? 700 : 400 }}>
            <option value="">—</option>
            {tOpts.map(t => <option key={t.id} value={t.id}>{t.name} ({teamFillCounts[t.id] ?? 0})</option>)}
          </select>
        </td>
        <td style={{ ...stickyPlayerTd, background: 'var(--bg)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div onClick={() => setPanelPlayerId(row.player.id)}
              style={{ fontWeight: 700, fontSize: '13px', cursor: 'pointer', color: 'var(--fg)' }}
              onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg)')}>
              {row.player.last_name}, {row.player.first_name}
            </div>
            {row.assignedTeamId && (
              <label
                title={row.isAccepted ? 'Player has accepted their roster spot — click to unmark' : 'Mark player as having accepted their roster spot'}
                style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', flexShrink: 0 }}
                onClick={e => e.stopPropagation()}>
                <input type="checkbox" checked={row.isAccepted}
                  onChange={() => toggleAccepted(row.player.id)}
                  style={{ cursor: 'pointer', accentColor: row.isAccepted ? 'var(--status-good)' : 'var(--status-warn)' }} />
                <span style={{ fontSize: '10px', fontWeight: 700, color: row.isAccepted ? 'var(--status-good)' : 'var(--status-warn)', whiteSpace: 'nowrap' }}>
                  {row.isAccepted ? 'Accepted' : 'Pending'}
                </span>
              </label>
            )}
            {followUpInfo(row.player.id) && (() => {
              const fu = followUpInfo(row.player.id)!
              return (
                <Link href={`/org/${params.orgId}/tryouts/action-items?player=${row.player.id}&status=open`}
                  title={fu.title}
                  onClick={e => e.stopPropagation()}
                  style={{
                    fontSize: '10px', fontWeight: 700, color: fu.fg, flexShrink: 0,
                    padding: '1px 6px', borderRadius: '10px', background: fu.bg, textDecoration: 'none',
                  }}>⚑{fu.count > 0 ? ` ${fu.count}` : ''}</Link>
              )
            })()}
          </div>
        </td>
        <td style={{ ...td, textAlign: 'center', fontWeight: 800, fontSize: '14px', color: row.combinedRank ? 'var(--accent)' : s.dim, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)' }}>{fmtRank(row.combinedRank)}</td>
        <td style={{ ...td, fontWeight: 800, fontSize: '14px', color: row.combinedScore != null ? 'var(--accent)' : s.dim }}>{fmt(row.combinedScore)}</td>
        <td style={{ ...td, textAlign: 'center' }}><span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(var(--fg-rgb),0.07)', fontSize: '11px', fontWeight: 600 }}>{row.ageGroup}</span></td>
        <td style={{ ...td, textAlign: 'left', fontSize: '11px', color: row.player.prior_team ? 'var(--status-info)' : s.dim, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.player.prior_team ?? '—'}</td>
        <td title={[row.tryoutPitching != null && `Pitch ${fmt(row.tryoutPitching)}`, row.tryoutHitting != null && `Hit ${fmt(row.tryoutHitting)}`, row.speed != null && `Speed ${row.speed.toFixed(2)}s`].filter(Boolean).join(' · ') || undefined}
          style={{ ...td, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)', color: row.tryoutScore != null ? '#80B0E8' : s.dim, fontWeight: row.tryoutScore != null ? 700 : 400, cursor: row.tryoutScore != null ? 'help' : 'default' }}>{fmt(row.tryoutScore)}</td>
        {showScoreDetail && (
          <>
            <td style={rankCell(row.tryoutRank)}>{fmtRank(row.tryoutRank)}</td>
            <td style={numCell(row.tryoutPitching)}>{fmt(row.tryoutPitching)}</td>
            <td style={numCell(row.tryoutHitting)}>{fmt(row.tryoutHitting)}</td>
            <td style={{ ...td, color: row.speed != null ? 'var(--fg)' : s.dim }}>{row.speed != null ? `${row.speed.toFixed(2)}s` : '—'}</td>
          </>
        )}
        <td title={[row.intangibles != null && `Intangibles ${fmt(row.intangibles)}`, row.teamPitching != null && `Pitch ${fmt(row.teamPitching)}`, row.teamHitting != null && `Hit ${fmt(row.teamHitting)}`].filter(Boolean).join(' · ') || undefined}
          style={{ ...td, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)', color: row.coachEval != null ? '#6DB875' : s.dim, fontWeight: row.coachEval != null ? 700 : 400, cursor: row.coachEval != null ? 'help' : 'default' }}>{fmt(row.coachEval)}</td>
        {showScoreDetail && (
          <>
            <td style={rankCell(row.coachRank)}>{fmtRank(row.coachRank)}</td>
            <td style={numCell(row.intangibles)} title="Intangibles score (coachability, attitude, work ethic)">{fmt(row.intangibles)}</td>
            <td style={rankCell(row.intangiblesRank)}>{fmtRank(row.intangiblesRank)}</td>
            <td style={numCell(row.teamPitching)}>{fmt(row.teamPitching)}</td>
            <td style={numCell(row.teamHitting)}>{fmt(row.teamHitting)}</td>
            <td style={numCell(row.evalSpeed)}>{fmt(row.evalSpeed)}</td>
            <td style={numCell(row.evalAthleticism)}>{fmt(row.evalAthleticism)}</td>
          </>
        )}
        <td title={[row.gcHittingScore != null && `GC Hit ${fmt(row.gcHittingScore)}`, row.gcPitchingScore != null && `GC Pitch ${fmt(row.gcPitchingScore)}`].filter(Boolean).join(' · ') || undefined}
          style={{ ...td, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)', color: row.priorStatScore != null ? '#C080E8' : s.dim, fontSize: '11px', cursor: row.priorStatScore != null ? 'help' : 'default' }}>{fmt(row.priorStatScore)}</td>
        {showScoreDetail && (
          <>
            <td style={numCell(row.gcHittingScore)}>{fmt(row.gcHittingScore)}</td>
            <td style={numCell(row.gcPitchingScore)}>{fmt(row.gcPitchingScore)}</td>
          </>
        )}
        <td style={{ ...td, textAlign: 'center', width: '60px' }}>
          <button onClick={() => toggleExclude(row.player.id)}
            title={row.isExcluded ? 'Click to re-include' : 'Exclude from team making'}
            style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', border: '0.5px solid', borderColor: row.isExcluded ? 'var(--status-bad)' : 'var(--border-md)', background: row.isExcluded ? 'var(--status-bad-bg)' : 'transparent', color: row.isExcluded ? 'var(--status-bad)' : s.dim }}>
            {row.isExcluded ? 'Excl' : '—'}
          </button>
        </td>
        <td style={{ ...td, textAlign: 'left', minWidth: '160px', verticalAlign: 'top', paddingTop: '6px' }}>
          {editingNotes === row.player.id ? (
            <textarea ref={notesInputRef} value={notesVal}
              onChange={e => setNotesVal(e.target.value)}
              onBlur={() => saveNotes(row.player.id, notesVal)}
              onKeyDown={e => { if (e.key === 'Escape') setEditingNotes(null) }}
              rows={3}
              style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid var(--accent)', borderRadius: '4px', padding: '3px 6px', fontSize: '12px', color: 'var(--fg)', outline: 'none', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.4 }} />
          ) : (
            <div onClick={() => { setEditingNotes(row.player.id); setNotesVal(row.adminNotes ?? '') }}
              title="Click to add board notes"
              style={{ cursor: 'text', minHeight: '22px', padding: '2px 4px', borderRadius: '4px', color: row.adminNotes ? 'var(--fg)' : s.dim, fontSize: '12px', whiteSpace: 'pre-wrap', lineHeight: 1.4, border: '1px solid transparent', transition: 'border-color 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-md)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}>
              {savingNotes === row.player.id ? <span style={{ color: s.dim }}>Saving…</span>
                : row.adminNotes || <span style={{ color: s.dim }}>+ add note</span>}
            </div>
          )}
        </td>
      </tr>
    )
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading…
    </main>
  )

  if (!season) return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>
      <p style={{ color: s.muted }}>No active season found. Create a season first.</p>
    </main>
  )

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <main className="page-wide" style={{ height: '100dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '1rem 1.5rem 0.5rem' }}>

      {/* ── Row 1: title + actions ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '12px', color: s.dim, textDecoration: 'none' }}>‹ Tryouts</Link>
          <span style={{ fontSize: '18px', fontWeight: 800 }}>Team Making</span>
          <span style={{ fontSize: '12px', color: s.muted }}>{season.label}</span>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {compareIds.length >= 2 && (
            <button onClick={() => setShowCompare(true)} style={{
              padding: '5px 12px', borderRadius: '6px',
              border: '0.5px solid rgba(var(--accent-rgb),0.5)',
              background: 'rgba(var(--accent-rgb),0.12)', color: 'var(--accent)',
              fontSize: '12px', fontWeight: 700, cursor: 'pointer',
            }}>Compare {compareIds.length}</button>
          )}
          {compareIds.length > 0 && (
            <button onClick={() => setCompareIds([])} style={{
              padding: '5px 10px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
              background: 'var(--bg-input)', color: s.dim, fontSize: '12px', cursor: 'pointer',
            }}>Clear</button>
          )}
          <button onClick={handleShare} disabled={sharingBusy} style={{
            padding: '5px 12px', borderRadius: '6px',
            border: `0.5px solid ${shareToken ? 'var(--status-good)' : 'var(--border-md)'}`,
            background: shareToken ? 'var(--status-good-bg)' : 'var(--bg-input)',
            color: shareToken ? 'var(--status-good)' : s.muted, fontSize: '12px', cursor: sharingBusy ? 'default' : 'pointer',
          }}>{shareCopied ? '✓ Copied!' : shareToken ? '⎋ Copy link' : '⎋ Share'}</button>
          {shareToken && (
            <button onClick={revokeShare} disabled={sharingBusy} style={{
              padding: '5px 12px', borderRadius: '6px', border: '0.5px solid var(--status-bad)',
              background: 'var(--status-bad-bg)', color: 'var(--status-bad)', fontSize: '12px', cursor: 'pointer',
            }}>Revoke</button>
          )}
          <button onClick={exportCsv} style={{
            padding: '5px 12px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
            background: 'var(--bg-input)', color: s.muted, fontSize: '12px', cursor: 'pointer',
          }}>↓ CSV</button>
          <button onClick={() => setShowScoreDetail(v => !v)}
            title="Show every score component behind each player's ranking — rank, pitching/hitting, intangibles, and prior-stat breakdowns"
            style={{
              padding: '5px 12px', borderRadius: '6px',
              border: `0.5px solid ${showScoreDetail ? 'var(--accent)' : 'var(--border-md)'}`,
              background: showScoreDetail ? 'rgba(var(--accent-rgb),0.12)' : 'var(--bg-input)',
              color: showScoreDetail ? 'var(--accent)' : s.muted,
              fontSize: '12px', fontWeight: showScoreDetail ? 700 : 400, cursor: 'pointer',
            }}>{showScoreDetail ? 'Hide Score Details' : 'Show Score Details'}</button>
        </div>
      </div>

      {/* ── Row 2: age filters + search + summary ── */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px', alignItems: 'center' }}>
        {['all', ...ageGroups].map(ag => (
          <button key={ag} onClick={() => setAgeFilter(ag)} style={{
            padding: '4px 10px', borderRadius: '20px', border: '0.5px solid',
            borderColor: ageFilter === ag ? 'var(--accent)' : 'var(--border-md)',
            background: ageFilter === ag ? 'rgba(var(--accent-rgb),0.1)' : 'var(--bg-input)',
            color: ageFilter === ag ? 'var(--accent)' : s.muted,
            fontSize: '11px', fontWeight: ageFilter === ag ? 700 : 400, cursor: 'pointer',
          }}>{ag === 'all' ? 'All ages' : ag}</button>
        ))}
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search…"
          style={{
            background: 'var(--bg-input)', border: '0.5px solid var(--border-md)',
            borderRadius: '6px', padding: '4px 8px', fontSize: '11px', color: 'var(--fg)', width: '130px',
          }}
        />
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px' }}>
          {[
            { label: 'Active',    val: activeFiltered.length,                                color: undefined as string | undefined },
            { label: 'Assigned',  val: assignedCount,                                        color: 'var(--status-good)' },
            { label: 'Left',      val: activeFiltered.length - assignedCount,                color: activeFiltered.length - assignedCount > 0 ? 'var(--status-warn)' : undefined },
            { label: 'Excluded',  val: excludedCount,                                        color: excludedCount > 0 ? 'var(--status-bad)' : undefined },
          ].map(({ label, val, color }) => (
            <div key={label} style={{
              padding: '3px 10px', borderRadius: '6px',
              background: color ? `${color}18` : 'var(--bg-card)',
              border: `0.5px solid ${color ? `${color}55` : 'var(--border)'}`,
              display: 'flex', alignItems: 'center', gap: '4px',
            }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: color ?? 'var(--fg)' }}>{val}</span>
              <span style={{ fontSize: '10px', color: color ?? s.dim }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── No teams warning (compact) ── */}
      {teams.length === 0 && (
        <div style={{
          marginBottom: '6px', padding: '6px 12px', borderRadius: '6px',
          background: 'var(--status-warn-bg)', border: '0.5px solid var(--border-md)',
          fontSize: '11px', color: 'var(--status-warn)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span>⚠ No teams set up yet.</span>
          <Link href={`/org/${params.orgId}/tryouts/teams`} style={{ color: 'var(--status-warn)', fontWeight: 700, textDecoration: 'none' }}>
            Create teams → (use the "+ New team" button)
          </Link>
        </div>
      )}

      {/* ── Open action items per team ── */}
      {teams.filter(t => ageFilter === 'all' || t.age_group === ageFilter).length > 0 && (
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '10px', fontWeight: 700, color: s.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Action items</span>
          {teams.filter(t => ageFilter === 'all' || t.age_group === ageFilter).map(t => {
            const count = actionCounts[t.id] ?? 0
            return (
              <Link key={t.id} href={`/org/${params.orgId}/tryouts/action-items?team=${t.id}&status=open`} style={{
                padding: '3px 9px', borderRadius: '20px', border: '0.5px solid',
                borderColor: count > 0 ? 'var(--status-bad)' : 'var(--border-md)',
                background: count > 0 ? 'var(--status-bad-bg)' : 'var(--bg-input)',
                color: count > 0 ? 'var(--status-bad)' : s.dim,
                fontSize: '11px', fontWeight: count > 0 ? 700 : 400, textDecoration: 'none',
              }}>{t.name} · {count} open</Link>
            )
          })}
        </div>
      )}

      {/* ── Cutoff controls (single age group only) ── */}
      {ageFilter !== 'all' && filtered.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px',
          padding: '6px 12px', background: 'var(--bg-card)', border: '0.5px solid var(--border)',
          borderRadius: '8px', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '11px', fontWeight: 700 }}>Cutoffs</span>
          {([
            { key: 'blue' as const, label: 'Blue',  color: '#4090E0' },
            { key: 'white' as const, label: 'White', color: s.muted },
          ]).map(({ key, label, color }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color, minWidth: '32px' }}>{label}</span>
              <button onClick={() => setCutoff(key, ageCutoff[key] - 1)} style={{ width: '20px', height: '20px', borderRadius: '4px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: s.muted, fontSize: '13px', cursor: 'pointer', lineHeight: 1 }}>−</button>
              <span style={{ fontSize: '12px', fontWeight: 800, minWidth: '20px', textAlign: 'center' }}>{ageCutoff[key]}</span>
              <button onClick={() => setCutoff(key, ageCutoff[key] + 1)} style={{ width: '20px', height: '20px', borderRadius: '4px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: s.muted, fontSize: '13px', cursor: 'pointer', lineHeight: 1 }}>+</button>
            </div>
          ))}
          <span style={{ fontSize: '10px', color: s.dim }}>
            Blue: {ageCutoff.blue} · White: {ageCutoff.white} · Cut: {Math.max(0, filtered.length - ageCutoff.blue - ageCutoff.white)}
          </span>
        </div>
      )}

      {/* ── Table ── */}
      {filtered.length === 0 ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: s.dim, fontSize: '14px' }}>
          No players found. Import registration data to get started.
        </div>
      ) : (
        <div style={{ flex: 1, overflow: 'auto', minHeight: 0, borderRadius: '8px', border: '0.5px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              {/* ── Section header row ── */}
              <tr style={{ borderBottom: 'none' }}>
                {/* Sticky columns */}
                <th colSpan={3} style={{ ...th, top: 0, zIndex: 4, borderBottom: 'none', padding: '4px 8px' }} />
                {/* Combined */}
                <th colSpan={2} style={{
                  ...th, textAlign: 'center', borderBottom: 'none', padding: '4px 8px',
                  color: 'var(--accent)', borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)',
                }}>Combined</th>
                {/* Identity */}
                <th colSpan={2} style={{ ...th, textAlign: 'center', borderBottom: 'none', padding: '4px 8px' }} />
                {/* Tryout */}
                <th colSpan={showScoreDetail ? 5 : 1} style={{
                  ...th, textAlign: 'center', borderBottom: 'none', padding: '4px 8px',
                  color: '#80B0E8', borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)',
                }}>Tryout</th>
                {/* Coach Eval */}
                <th colSpan={showScoreDetail ? 8 : 1} style={{
                  ...th, textAlign: 'center', borderBottom: 'none', padding: '4px 8px',
                  color: '#6DB875', borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)',
                }}>Coach Eval</th>
                {/* GC / Prior Stats */}
                <th colSpan={showScoreDetail ? 3 : 1} style={{
                  ...th, textAlign: 'center', borderBottom: 'none', padding: '4px 8px',
                  color: '#C080E8', borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)',
                }}>Prior Stats</th>
                {/* Excl + Notes */}
                <th colSpan={2} style={{ ...th, textAlign: 'center', borderBottom: 'none', padding: '4px 8px' }} />
              </tr>

              {/* ── Column header row ── */}
              <tr>
                {/* Compare checkbox */}
                <th style={{ ...th, width: '28px', minWidth: '28px', padding: '6px 4px', cursor: 'default' }} />
                {/* Sticky: Team */}
                <th style={{ ...stickyTeamTh, width: `${TEAM_W}px`, minWidth: `${TEAM_W}px` }}
                  onClick={() => toggleSort('team')}>
                  Next Team
                </th>
                {/* Sticky: Player */}
                <th style={{ ...stickyPlayerTh, width: '230px', minWidth: '220px' }}
                  onClick={() => toggleSort('name')}>
                  Player{sortArrow('name')}
                </th>

                {/* Combined */}
                <th style={{ ...th, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)', color: 'var(--accent)' }}
                  onClick={() => toggleSort('combinedRank')}>#Comb{sortArrow('combinedRank')}</th>
                <th style={{ ...th, color: 'var(--accent)' }}
                  onClick={() => toggleSort('combinedScore')}>Score{sortArrow('combinedScore')}</th>

                {/* Age + Prior Team */}
                <th style={{ ...th }} onClick={() => toggleSort('ageGroup')}>Age</th>
                <th style={{ ...th, minWidth: '80px' }}>
                  {priorYear ? `${priorYear} Team` : 'Prior Team'}
                </th>

                {/* Tryout — single column; breakdown on hover, full detail in PlayerCard.
                    In Scoring Detail view, the breakdown is also broken out into its own columns. */}
                <th style={{ ...th, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)', color: '#80B0E8' }}
                  onClick={() => toggleSort('tryoutScore')}>Score{breakdownHint}{sortArrow('tryoutScore')}</th>
                {showScoreDetail && (
                  <>
                    <th title="Tryout rank within age group" style={{ ...th, color: '#80B0E8' }}
                      onClick={() => toggleSort('tryoutRank')}>Rank{sortArrow('tryoutRank')}</th>
                    <th title="Tryout pitching component" style={{ ...th, color: '#80B0E8' }}
                      onClick={() => toggleSort('tryoutPitching')}>Pitch{sortArrow('tryoutPitching')}</th>
                    <th title="Tryout hitting component" style={{ ...th, color: '#80B0E8' }}
                      onClick={() => toggleSort('tryoutHitting')}>Hit{sortArrow('tryoutHitting')}</th>
                    <th title="60-yard dash time, in seconds (lower is better)" style={{ ...th, color: '#80B0E8' }}
                      onClick={() => toggleSort('speed')}>60yd{sortArrow('speed')}</th>
                  </>
                )}

                {/* Coach Eval — single column; breakdown on hover, full detail in PlayerCard.
                    In Scoring Detail view, Intangibles gets its own visible column, plus the
                    remaining eval sub-scores. */}
                <th style={{ ...th, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)', color: '#6DB875' }}
                  onClick={() => toggleSort('coachEval')}>Score{breakdownHint}{sortArrow('coachEval')}</th>
                {showScoreDetail && (
                  <>
                    <th title="Coach eval rank within age group" style={{ ...th, color: '#6DB875' }}
                      onClick={() => toggleSort('coachRank')}>Rank{sortArrow('coachRank')}</th>
                    <th title="Intangibles score — coachability, attitude, work ethic (this season only)" style={{ ...th, color: '#6DB875' }}
                      onClick={() => toggleSort('intangibles')}>Intangibles{sortArrow('intangibles')}</th>
                    <th title="Intangibles rank within age group" style={{ ...th, color: '#6DB875' }}
                      onClick={() => toggleSort('intangiblesRank')}>Int.Rank{sortArrow('intangiblesRank')}</th>
                    <th title="Coach-scored pitching/catching section average" style={{ ...th, color: '#6DB875' }}
                      onClick={() => toggleSort('teamPitching')}>Pitch{sortArrow('teamPitching')}</th>
                    <th title="Coach-scored fielding/hitting section average" style={{ ...th, color: '#6DB875' }}
                      onClick={() => toggleSort('teamHitting')}>Hit{sortArrow('teamHitting')}</th>
                    <th title="Coach-rated speed (1–5)" style={{ ...th, color: '#6DB875' }}
                      onClick={() => toggleSort('evalSpeed')}>Speed{sortArrow('evalSpeed')}</th>
                    <th title="Coach-rated athleticism (1–5)" style={{ ...th, color: '#6DB875' }}
                      onClick={() => toggleSort('evalAthleticism')}>Athl{sortArrow('evalAthleticism')}</th>
                  </>
                )}

                {/* GC / Prior Stats — single column; hit/pitch breakdown on hover.
                    In Scoring Detail view, hitting/pitching are broken out. */}
                <th style={{ ...th, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)', color: '#C080E8' }}
                  onClick={() => toggleSort('priorStatScore')}>Score{breakdownHint}{sortArrow('priorStatScore')}</th>
                {showScoreDetail && (
                  <>
                    <th title={`GameChanger hitting score (${priorYear ?? 'prior season'})`} style={{ ...th, color: '#C080E8' }}
                      onClick={() => toggleSort('gcHittingScore')}>Hit{sortArrow('gcHittingScore')}</th>
                    <th title={`GameChanger pitching score (${priorYear ?? 'prior season'})`} style={{ ...th, color: '#C080E8' }}
                      onClick={() => toggleSort('gcPitchingScore')}>Pitch{sortArrow('gcPitchingScore')}</th>
                  </>
                )}

                {/* Exclude */}
                <th style={{ ...th, textAlign: 'center', width: '60px', minWidth: '60px', cursor: 'default' }}>Excl</th>

                {/* Notes */}
                <th style={{ ...th, textAlign: 'left', minWidth: '160px', cursor: 'default' }}>Board Notes</th>
              </tr>
            </thead>

            <tbody>
              {isDraftMode ? (
                <>
                  {/* ── Blue zone ── */}
                  <tr key="draft-blue-header">
                    <td colSpan={totalCols} style={{ padding: 0, border: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 10px', background: 'rgba(64,144,224,0.08)', borderBottom: '0.5px solid rgba(64,144,224,0.2)' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: '#4090E0' }}>Blue</span>
                        <span style={{ fontSize: '11px', color: '#4090E0', opacity: 0.8 }}>
                          {draftBlueAsgn.length} confirmed · {draftBlueFill.length} tentative
                          {draftBlueOpen - draftBlueFill.length > 0 && <span style={{ marginLeft: '6px', fontWeight: 700 }}>· {draftBlueOpen - draftBlueFill.length} open</span>}
                          {draftBlueOpen - draftBlueFill.length === 0 && draftBlueAsgn.length + draftBlueFill.length > 0 && <span style={{ marginLeft: '6px', opacity: 0.6 }}>· full</span>}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: '10px', color: '#4090E0', opacity: 0.6 }}>{draftBlueAsgn.length + draftBlueFill.length}/{ageCutoff.blue} spots</span>
                      </div>
                    </td>
                  </tr>
                  {draftBlueAsgn.map((row, i) => renderRow(row, 'blue-assigned', i % 2 !== 0))}
                  {draftBlueFill.map((row, i) => renderRow(row, 'blue-fill', (draftBlueAsgn.length + i) % 2 !== 0))}

                  {/* ── Blue / White separator ── */}
                  <tr key="draft-blue-white-sep">
                    <td colSpan={totalCols} style={{ padding: 0, border: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px' }}>
                        <div style={{ flex: 1, height: '1.5px', background: 'rgba(64,144,224,0.5)' }} />
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#4090E0', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Blue / White cutoff</span>
                        <div style={{ flex: 1, height: '1.5px', background: 'rgba(64,144,224,0.5)' }} />
                      </div>
                    </td>
                  </tr>

                  {/* ── White zone ── */}
                  <tr key="draft-white-header">
                    <td colSpan={totalCols} style={{ padding: 0, border: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 10px', background: 'rgba(var(--fg-rgb),0.04)', borderBottom: '0.5px solid rgba(var(--fg-rgb),0.1)' }}>
                        <span style={{ fontSize: '11px', fontWeight: 800, color: s.muted }}>White</span>
                        <span style={{ fontSize: '11px', color: s.muted, opacity: 0.8 }}>
                          {draftWhiteAsgn.length} confirmed · {draftWhiteFill.length} tentative
                          {draftWhiteOpen - draftWhiteFill.length > 0 && <span style={{ marginLeft: '6px', fontWeight: 700 }}>· {draftWhiteOpen - draftWhiteFill.length} open</span>}
                          {draftWhiteOpen - draftWhiteFill.length === 0 && draftWhiteAsgn.length + draftWhiteFill.length > 0 && <span style={{ marginLeft: '6px', opacity: 0.6 }}>· full</span>}
                        </span>
                        <span style={{ marginLeft: 'auto', fontSize: '10px', color: s.muted, opacity: 0.6 }}>{draftWhiteAsgn.length + draftWhiteFill.length}/{ageCutoff.white} spots</span>
                      </div>
                    </td>
                  </tr>
                  {draftWhiteAsgn.map((row, i) => renderRow(row, 'white-assigned', i % 2 !== 0))}
                  {draftWhiteFill.map((row, i) => renderRow(row, 'white-fill', (draftWhiteAsgn.length + i) % 2 !== 0))}

                  {/* ── White / Cut separator ── */}
                  <tr key="draft-white-cut-sep">
                    <td colSpan={totalCols} style={{ padding: 0, border: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px' }}>
                        <div style={{ flex: 1, height: '1.5px', background: 'rgba(var(--fg-rgb),0.25)' }} />
                        <span style={{ fontSize: '10px', fontWeight: 800, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>White / Cut line</span>
                        <div style={{ flex: 1, height: '1.5px', background: 'rgba(var(--fg-rgb),0.25)' }} />
                      </div>
                    </td>
                  </tr>

                  {/* ── Bubble ── */}
                  {draftBubble.length > 0 && (
                    <>
                      <tr key="draft-bubble-header">
                        <td colSpan={totalCols} style={{ padding: 0, border: 'none' }}>
                          <div style={{ padding: '5px 10px' }}>
                            <span style={{ fontSize: '11px', fontWeight: 800, color: s.dim, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Bubble · {draftBubble.length} players</span>
                          </div>
                        </td>
                      </tr>
                      {draftBubble.map((row, i) => renderRow(row, 'bubble', i % 2 !== 0))}
                    </>
                  )}
                </>
              ) : (
                activeFiltered.map((row, idx) => {
                  const isBlue   = ageFilter !== 'all' && ageCutoff.blue  > 0 && idx <  ageCutoff.blue
                  const isWhite  = ageFilter !== 'all' && ageCutoff.white > 0 && idx >= ageCutoff.blue && idx < ageCutoff.blue + ageCutoff.white
                  const zone: DraftZone | null = isBlue ? 'blue-fill' : isWhite ? 'white-fill' : null
                  const showBlueLine  = ageFilter !== 'all' && ageCutoff.blue  > 0 && idx === ageCutoff.blue
                  const showWhiteLine = ageFilter !== 'all' && ageCutoff.white > 0 && idx === ageCutoff.blue + ageCutoff.white
                  return (
                    <React.Fragment key={row.player.id}>
                    {showBlueLine && (
                      <tr key={`cut-b-${idx}`}>
                        <td colSpan={totalCols} style={{ padding: 0, border: 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px' }}>
                            <div style={{ flex: 1, height: '1.5px', background: 'rgba(64,144,224,0.5)' }} />
                            <span style={{ fontSize: '10px', fontWeight: 800, color: '#4090E0', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Blue / White cutoff</span>
                            <div style={{ flex: 1, height: '1.5px', background: 'rgba(64,144,224,0.5)' }} />
                          </div>
                        </td>
                      </tr>
                    )}
                    {showWhiteLine && (
                      <tr key={`cut-w-${idx}`}>
                        <td colSpan={totalCols} style={{ padding: 0, border: 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px' }}>
                            <div style={{ flex: 1, height: '1.5px', background: 'rgba(var(--fg-rgb),0.25)' }} />
                            <span style={{ fontSize: '10px', fontWeight: 800, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>White / Cut line</span>
                            <div style={{ flex: 1, height: '1.5px', background: 'rgba(var(--fg-rgb),0.25)' }} />
                          </div>
                        </td>
                      </tr>
                    )}

                    {renderRow(row, zone, idx % 2 !== 0)}
                  </React.Fragment>
                )
              })
              )}
              {/* ── Excluded players section ── */}
              {excludedFiltered.length > 0 && (
                <>
                  <tr>
                    <td colSpan={totalCols} style={{ padding: 0, border: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 8px 4px' }}>
                        <div style={{ flex: 1, height: '1px', background: 'rgba(232,112,96,0.3)' }} />
                        <span style={{ fontSize: '10px', fontWeight: 800, color: 'var(--status-bad)', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Excluded from team making ({excludedFiltered.length})</span>
                        <div style={{ flex: 1, height: '1px', background: 'rgba(232,112,96,0.3)' }} />
                      </div>
                    </td>
                  </tr>
                  {excludedFiltered.map((row, idx) => {
                    const team  = teams.find(t => t.id === row.assignedTeamId)
                    const tOpts = teamOptions(row.ageGroup)
                    const teamColor = team?.color ?? '#6DB875'
                    return (
                      <tr key={`excl-${row.player.id}`} style={{ opacity: 0.45 }}>
                        <td style={{ ...td, padding: '7px 4px', textAlign: 'center', width: '28px' }} />
                        <td style={{ ...stickyTeamTd, background: 'var(--bg)', width: `${TEAM_W}px` }}>
                          <select value={row.assignedTeamId ?? ''} onChange={e => assignTeam(row.player.id, e.target.value || null)}
                            style={{ background: team ? `${teamColor}18` : 'var(--bg-input)', border: `0.5px solid ${team ? `${teamColor}55` : 'var(--border-md)'}`, borderRadius: '5px', padding: '4px 6px', fontSize: '12px', color: team ? teamColor : s.muted, width: '100%', fontWeight: team ? 700 : 400 }}>
                            <option value="">—</option>
                            {tOpts.map(t => <option key={t.id} value={t.id}>{t.name} ({teamFillCounts[t.id] ?? 0})</option>)}
                          </select>
                        </td>
                        <td style={{ ...stickyPlayerTd, background: 'var(--bg)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 700, fontSize: '13px', textDecoration: 'line-through', color: s.muted }}>
                              {row.player.last_name}, {row.player.first_name}
                            </span>
                            {row.assignedTeamId && (
                              <label
                                title={row.isAccepted ? 'Player has accepted their roster spot — click to unmark' : 'Mark player as having accepted their roster spot'}
                                style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer', flexShrink: 0 }}>
                                <input type="checkbox" checked={row.isAccepted}
                                  onChange={() => toggleAccepted(row.player.id)}
                                  style={{ cursor: 'pointer', accentColor: row.isAccepted ? 'var(--status-good)' : 'var(--status-warn)' }} />
                                <span style={{ fontSize: '10px', fontWeight: 700, color: row.isAccepted ? 'var(--status-good)' : 'var(--status-warn)', whiteSpace: 'nowrap' }}>
                                  {row.isAccepted ? 'Accepted' : 'Pending'}
                                </span>
                              </label>
                            )}
                          </div>
                        </td>
                        <td style={{ ...td, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)' }} colSpan={7 + (showScoreDetail ? DETAIL_COL_COUNT : 0)} />
                        <td style={{ ...td, textAlign: 'center', width: '60px' }}>
                          <button onClick={() => toggleExclude(row.player.id)} title="Re-include this player"
                            style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', border: '0.5px solid var(--status-bad)', background: 'var(--status-bad-bg)', color: 'var(--status-bad)' }}>
                            Excl
                          </button>
                        </td>
                        <td style={{ ...td, textAlign: 'left', minWidth: '160px' }}>
                          <span style={{ fontSize: '12px', color: s.dim }}>{row.adminNotes ?? ''}</span>
                        </td>
                      </tr>
                    )
                  })}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Player Compare modal ── */}
      {showCompare && compareIds.length >= 2 && (
        <PlayerCompare
          players={compareIds.map(id => ranked.find(r => r.player.id === id)!).filter(Boolean)}
          gcRows={gcRows}
          teams={teams}
          ranked={ranked}
          onClose={() => setShowCompare(false)}
        />
      )}

      {/* ── Player Card panel ── */}
      {panelPlayerId && (() => {
        const rp = ranked.find(r => r.player.id === panelPlayerId)
        if (!rp) return null
        const gc = gcRows.find(g => g.player_id === panelPlayerId) ?? null
        const ageGroup = rp.ageGroup
        const ageGroupPlayerIds = new Set(ranked.filter(r => r.ageGroup === ageGroup).map(r => r.player.id))
        const ageGroupGcRows = gcRows.filter(g => ageGroupPlayerIds.has(g.player_id))
        const totalInAge = ranked.filter(r => r.ageGroup === ageGroup).length
        return (
          <PlayerCard
            player={rp}
            gcRow={gc}
            ageGroupGcRows={ageGroupGcRows}
            teams={teams}
            totalInAge={totalInAge}
            weights={seasonWeights}
            orgId={params.orgId}
            actionItems={playerActionsMap[panelPlayerId] ?? []}
            onQuickActionStatus={(itemId, status) => quickSetActionItemStatus(panelPlayerId, itemId, status)}
            onQuickCreateAction={(title) => quickCreateActionItem(rp, title)}
            onToggleAccepted={() => toggleAccepted(panelPlayerId)}
            onClose={() => setPanelPlayerId(null)}
          />
        )
      })()}

    </main>
  )
}

export default function TeamMakingPage({ params }: { params: { orgId: string } }) {
  return (
    <Suspense fallback={
      <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading…
      </main>
    }>
      <TeamMakingPageInner params={params} />
    </Suspense>
  )
}
