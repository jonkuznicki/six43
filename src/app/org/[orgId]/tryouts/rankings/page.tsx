'use client'

import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'
import PlayerCard from './PlayerCard'
import PlayerCompare from './PlayerCompare'
import type { GcStatDef } from '../../../../../lib/tryouts/gcStatDefs'
import { computeTryoutScore, computePitchingScore, type ScoringCategory } from '../../../../../lib/tryouts/computeScore'

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
  season_year:      string
  computed_score:   number | null
  coach_eval_score: number | null
  intangibles_score: number | null
  scores:           Record<string, number> | null
  comments:         string | null
}

interface EvalConfigRow {
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
}

interface Team {
  id:              string
  name:            string
  age_group:       string
  color:           string | null
  eval_multiplier: number
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

// ── Rank helpers ───────────────────────────────────────────────────────────────

/** Dense rank (ties share the same rank, no gaps). High-value = rank 1. */
function denseRank(
  items: Array<{ id: string; v: number | null }>,
): Map<string, number> {
  const sorted = items.filter(x => x.v != null).sort((a, b) => b.v! - a.v!)
  const map = new Map<string, number>()
  let rank = 1
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].v === sorted[i - 1].v) {
      map.set(sorted[i].id, map.get(sorted[i - 1].id)!)
    } else {
      map.set(sorted[i].id, rank)
    }
    rank++
  }
  return map
}

/** Compute section average from a scores JSON using matching field keys. */
function sectionAvg(
  scores: Record<string, number> | null,
  keys:   string[],
): number | null {
  if (!scores || keys.length === 0) return null
  const vals = keys.map(k => scores[k]).filter((v): v is number => typeof v === 'number')
  return vals.length > 0 ? vals.reduce((a, b) => a + b) / vals.length : null
}

/** Weighted average of scored fields using the org's eval config weights (weight > 0 only). */
function computeWeightedEvalScore(
  scores: Record<string, number> | null,
  config: EvalConfigRow[],
): number | null {
  if (!scores || config.length === 0) return null
  const active = config.filter(c => c.weight > 0 && typeof scores[c.field_key] === 'number')
  if (active.length === 0) return null
  const totalWeight = active.reduce((s, c) => s + c.weight, 0)
  if (totalWeight === 0) return null
  const weighted = active.reduce((s, c) => s + scores[c.field_key] * c.weight, 0)
  return Math.round(weighted / totalWeight * 100) / 100
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
  const [teams,         setTeams]         = useState<Team[]>([])
  const [assignments,   setAssignments]   = useState<Record<string, string>>({})
  const [notesMap,      setNotesMap]      = useState<Record<string, string>>({})
  const [excludedMap,   setExcludedMap]   = useState<Record<string, boolean>>({})
  const [acceptedMap,   setAcceptedMap]   = useState<Record<string, boolean>>({})
  const [actionCounts,       setActionCounts]       = useState<Record<string, number>>({}) // team_id -> open action items
  const [playerActionCounts, setPlayerActionCounts] = useState<Record<string, number>>({}) // player_id -> open action items
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
      .select('id, label, year, age_groups, rankings_share_token')
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

      supabase.from('tryout_coach_evals')
        .select('player_id, season_year, computed_score, coach_eval_score, intangibles_score, scores, comments')
        .eq('org_id', params.orgId)
        .in('season_year', [String(seasonData.year), String(seasonData.year - 1)])
        .eq('status', 'submitted'),

      supabase.from('tryout_coach_eval_config')
        .select('field_key, section, weight')
        .eq('org_id', params.orgId)
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
        .select('team_id, player_id, status')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id)
        .in('status', ['open', 'waiting', 'in_progress', 'blocked']),
    ])

    setPlayers(playerData ?? [])
    setTryoutRows(tryoutData ?? [])
    setEvalRows(evalData ?? [])
    setEvalConfig(evalCfgData ?? [])
    console.warn('[six43 debug] evalConfig rows:', evalCfgData?.length, evalCfgData?.filter((c: any) => c.section === 'intangibles'))
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
    for (const a of (actionItemData ?? [])) {
      if (a.team_id)   teamCounts[a.team_id]     = (teamCounts[a.team_id]     ?? 0) + 1
      if (a.player_id) playerCounts[a.player_id] = (playerCounts[a.player_id] ?? 0) + 1
    }
    setActionCounts(teamCounts)
    setPlayerActionCounts(playerCounts)

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

  const ranked = useMemo((): RankedPlayer[] => {
    // Per-player tryout: average across evaluators
    const tryoutByPlayer = new Map<string, TryoutScoreRow[]>()
    for (const r of tryoutRows) {
      if (!tryoutByPlayer.has(r.player_id)) tryoutByPlayer.set(r.player_id, [])
      tryoutByPlayer.get(r.player_id)!.push(r)
    }

    // Per-player eval: prefer the higher season_year when evals exist for multiple years
    const evalByPlayer = new Map<string, CoachEvalRow>()
    for (const r of evalRows) {
      const existing = evalByPlayer.get(r.player_id)
      if (!existing || Number(r.season_year) > Number(existing.season_year)) {
        evalByPlayer.set(r.player_id, r)
      }
    }

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

        // Coach eval
        const evalRow = evalByPlayer.get(player.id) ?? null
        const rawCoachEval     = computeWeightedEvalScore(evalRow?.scores ?? null, evalConfig)
        const assignedTeamId   = assignments[player.id] ?? null
        const assignedTeam     = teams.find(t => t.id === assignedTeamId)
        const evalMultiplier   = assignedTeam?.eval_multiplier ?? 1.0
        const coachEval        = rawCoachEval != null
          ? Math.round(rawCoachEval * evalMultiplier * 100) / 100
          : null
        const intangibles      = sectionAvg(evalRow?.scores ?? null, intangiblesKeys)
        const teamPitching     = sectionAvg(evalRow?.scores ?? null, pitchingKeys)
        const teamHitting      = sectionAvg(evalRow?.scores ?? null, hittingKeys)
        const evalSpeed        = evalRow?.scores?.['speed']       != null ? Number(evalRow.scores['speed'])       : null
        const evalAthleticism  = evalRow?.scores?.['athleticism'] != null ? Number(evalRow.scores['athleticism']) : null
        const coachComments    = evalRow?.comments ?? null

        // GC
        const gcRow          = gcByPlayer.get(player.id) ?? null
        const gcHittingScore  = gcRow?.gc_hitting_score  ?? null
        const gcPitchingScore = gcRow?.gc_pitching_score ?? null

        // Combined: 33% tryout + 67% eval; falls back to whichever is available
        let combinedScore: number | null = null
        if (tryoutScore != null && coachEval != null) {
          combinedScore = tryoutScore * 0.33 + coachEval * 0.67
        } else if (tryoutScore != null) {
          combinedScore = tryoutScore
        } else if (coachEval != null) {
          combinedScore = coachEval
        }
        if (combinedScore != null) combinedScore = Math.round(combinedScore * 100) / 100

        return {
          player,
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
  }, [players, tryoutRows, evalRows, gcRows, assignments, notesMap, excludedMap, acceptedMap, evalConfig, pitchingKeys, hittingKeys, intangiblesKeys, scoringConfig])

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
            {tOpts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
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
                  style={{ cursor: 'pointer', accentColor: '#6DB875' }} />
                <span style={{ fontSize: '10px', fontWeight: 700, color: row.isAccepted ? '#6DB875' : s.dim, whiteSpace: 'nowrap' }}>
                  {row.isAccepted ? 'Accepted' : 'Accept'}
                </span>
              </label>
            )}
            {(playerActionCounts[row.player.id] ?? 0) > 0 && (
              <Link href={`/org/${params.orgId}/tryouts/action-items?player=${row.player.id}&status=open`}
                title={`${playerActionCounts[row.player.id]} open action item(s)`}
                onClick={e => e.stopPropagation()}
                style={{
                  fontSize: '10px', fontWeight: 700, color: '#E87060', flexShrink: 0,
                  padding: '1px 6px', borderRadius: '10px', background: 'rgba(232,112,96,0.12)', textDecoration: 'none',
                }}>⚑ {playerActionCounts[row.player.id]}</Link>
            )}
          </div>
        </td>
        <td style={{ ...td, textAlign: 'center', fontWeight: 800, fontSize: '14px', color: row.combinedRank ? 'var(--accent)' : s.dim, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)' }}>{fmtRank(row.combinedRank)}</td>
        <td style={{ ...td, fontWeight: 800, fontSize: '14px', color: row.combinedScore != null ? 'var(--accent)' : s.dim }}>{fmt(row.combinedScore)}</td>
        <td style={{ ...td, textAlign: 'center' }}><span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(var(--fg-rgb),0.07)', fontSize: '11px', fontWeight: 600 }}>{row.ageGroup}</span></td>
        <td style={{ ...td, textAlign: 'center', fontSize: '11px', color: row.player.grade ? s.muted : s.dim }}>{row.player.grade ?? '—'}</td>
        <td style={{ ...td, textAlign: 'left', fontSize: '11px', color: row.player.prior_team ? '#40A0E8' : s.dim, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.player.prior_team ?? '—'}</td>
        <td style={{ ...td, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)', color: row.tryoutScore != null ? '#80B0E8' : s.dim, fontWeight: row.tryoutScore != null ? 700 : 400 }}>{fmt(row.tryoutScore)}</td>
        <td style={{ ...td, textAlign: 'center', color: row.tryoutRank != null ? '#80B0E8' : s.dim, fontSize: '11px' }}>{fmtRank(row.tryoutRank)}</td>
        <td style={{ ...td, color: row.tryoutPitching != null ? '#80B0E8' : s.dim }}>{fmt(row.tryoutPitching)}</td>
        <td style={{ ...td, color: row.tryoutHitting != null ? '#80B0E8' : s.dim }}>{fmt(row.tryoutHitting)}</td>
        <td style={{ ...td, color: row.speed != null ? '#80B0E8' : s.dim }}>{row.speed != null ? `${row.speed.toFixed(2)}s` : '—'}</td>
        <td style={{ ...td, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)', color: row.coachEval != null ? '#6DB875' : s.dim, fontWeight: row.coachEval != null ? 700 : 400 }}>{fmt(row.coachEval)}</td>
        <td style={{ ...td, textAlign: 'center', color: row.coachRank != null ? '#6DB875' : s.dim, fontSize: '11px' }}>{fmtRank(row.coachRank)}</td>
        <td style={{ ...td, color: row.intangibles != null ? '#6DB875' : s.dim, fontWeight: row.intangibles != null ? 600 : 400 }}>{fmt(row.intangibles)}</td>
        <td style={{ ...td, textAlign: 'center', color: row.intangiblesRank != null ? '#6DB875' : s.dim, fontSize: '11px' }}>{fmtRank(row.intangiblesRank)}</td>
        <td style={{ ...td, color: row.teamPitching != null ? '#6DB875' : s.dim }}>{fmt(row.teamPitching)}</td>
        <td style={{ ...td, color: row.teamHitting != null ? '#6DB875' : s.dim }}>{fmt(row.teamHitting)}</td>
        <td style={{ ...td, color: row.evalSpeed != null ? '#6DB875' : s.dim }}>{row.evalSpeed?.toFixed(1) ?? '—'}</td>
        <td style={{ ...td, color: row.evalAthleticism != null ? '#6DB875' : s.dim }}>{row.evalAthleticism?.toFixed(1) ?? '—'}</td>
        <td style={{ ...td, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)', color: row.gcHittingScore != null ? '#C080E8' : s.dim, fontSize: '11px' }}>{fmt(row.gcHittingScore)}</td>
        <td style={{ ...td, color: row.gcPitchingScore != null ? '#C080E8' : s.dim, fontSize: '11px' }}>{fmt(row.gcPitchingScore)}</td>
        <td style={{ ...td, textAlign: 'center', width: '60px' }}>
          <button onClick={() => toggleExclude(row.player.id)}
            title={row.isExcluded ? 'Click to re-include' : 'Exclude from team making'}
            style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', border: '0.5px solid', borderColor: row.isExcluded ? 'rgba(232,112,96,0.5)' : 'var(--border-md)', background: row.isExcluded ? 'rgba(232,112,96,0.12)' : 'transparent', color: row.isExcluded ? '#E87060' : s.dim }}>
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
        <td style={{ ...td, textAlign: 'left', minWidth: '180px', maxWidth: '280px' }}>
          {row.coachComments
            ? <span title={row.coachComments} style={{ fontSize: '11px', color: s.muted, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'help' }}>{row.coachComments}</span>
            : <span style={{ color: s.dim, fontSize: '11px' }}>—</span>}
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
              border: '0.5px solid rgba(232,160,32,0.5)',
              background: 'rgba(232,160,32,0.12)', color: 'var(--accent)',
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
            border: `0.5px solid ${shareToken ? 'rgba(109,184,117,0.5)' : 'var(--border-md)'}`,
            background: shareToken ? 'rgba(109,184,117,0.1)' : 'var(--bg-input)',
            color: shareToken ? '#6DB875' : s.muted, fontSize: '12px', cursor: sharingBusy ? 'default' : 'pointer',
          }}>{shareCopied ? '✓ Copied!' : shareToken ? '⎋ Copy link' : '⎋ Share'}</button>
          {shareToken && (
            <button onClick={revokeShare} disabled={sharingBusy} style={{
              padding: '5px 12px', borderRadius: '6px', border: '0.5px solid rgba(232,112,96,0.4)',
              background: 'rgba(232,112,96,0.08)', color: '#E87060', fontSize: '12px', cursor: 'pointer',
            }}>Revoke</button>
          )}
          <button onClick={exportCsv} style={{
            padding: '5px 12px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
            background: 'var(--bg-input)', color: s.muted, fontSize: '12px', cursor: 'pointer',
          }}>↓ CSV</button>
        </div>
      </div>

      {/* ── Row 2: age filters + search + summary ── */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '6px', alignItems: 'center' }}>
        {['all', ...ageGroups].map(ag => (
          <button key={ag} onClick={() => setAgeFilter(ag)} style={{
            padding: '4px 10px', borderRadius: '20px', border: '0.5px solid',
            borderColor: ageFilter === ag ? 'var(--accent)' : 'var(--border-md)',
            background: ageFilter === ag ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
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
            { label: 'Assigned',  val: assignedCount,                                        color: '#6DB875' },
            { label: 'Left',      val: activeFiltered.length - assignedCount,                color: activeFiltered.length - assignedCount > 0 ? '#E8A020' : undefined },
            { label: 'Excluded',  val: excludedCount,                                        color: excludedCount > 0 ? '#E87060' : undefined },
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
          background: 'rgba(232,160,32,0.08)', border: '0.5px solid rgba(232,160,32,0.3)',
          fontSize: '11px', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <span>⚠ No teams set up yet.</span>
          <Link href={`/org/${params.orgId}/tryouts/teams`} style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>
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
                borderColor: count > 0 ? 'rgba(232,112,96,0.5)' : 'var(--border-md)',
                background: count > 0 ? 'rgba(232,112,96,0.1)' : 'var(--bg-input)',
                color: count > 0 ? '#E87060' : s.dim,
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
                <th colSpan={3} style={{ ...th, textAlign: 'center', borderBottom: 'none', padding: '4px 8px' }} />
                {/* Tryout — Score, Rank, TO Pitch, TO Hit, Speed */}
                <th colSpan={5} style={{
                  ...th, textAlign: 'center', borderBottom: 'none', padding: '4px 8px',
                  color: '#80B0E8', borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)',
                }}>Tryout</th>
                {/* Coach Eval — Score, Rank, Intangibles, Rank, Eval Pitch, Eval Hit, Speed, Athleticism */}
                <th colSpan={8} style={{
                  ...th, textAlign: 'center', borderBottom: 'none', padding: '4px 8px',
                  color: '#6DB875', borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)',
                }}>Coach Eval</th>
                {/* GC */}
                <th colSpan={2} style={{
                  ...th, textAlign: 'center', borderBottom: 'none', padding: '4px 8px',
                  color: '#C080E8', borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)',
                }}>GC Stats</th>
                {/* Excl + Notes + Comments */}
                <th colSpan={3} style={{ ...th, textAlign: 'center', borderBottom: 'none', padding: '4px 8px' }} />
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

                {/* Age + Grade + Prior Team */}
                <th style={{ ...th }} onClick={() => toggleSort('ageGroup')}>Age</th>
                <th style={{ ...th }}>Grade</th>
                <th style={{ ...th, minWidth: '80px' }}>
                  {priorYear ? `${priorYear} Team` : 'Prior Team'}
                </th>

                {/* ── Tryout (Blue) ── */}
                <th style={{ ...th, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)', color: '#80B0E8' }}
                  onClick={() => toggleSort('tryoutScore')}>Score{sortArrow('tryoutScore')}</th>
                <th style={{ ...th, color: '#80B0E8' }}
                  onClick={() => toggleSort('tryoutRank')}>#Rank{sortArrow('tryoutRank')}</th>
                <th style={{ ...th, color: '#80B0E8' }}
                  onClick={() => toggleSort('tryoutPitching')}>TO Pitch{sortArrow('tryoutPitching')}</th>
                <th style={{ ...th, color: '#80B0E8' }}
                  onClick={() => toggleSort('tryoutHitting')}>TO Hit{sortArrow('tryoutHitting')}</th>
                <th style={{ ...th, color: '#80B0E8' }}
                  onClick={() => toggleSort('speed')}>Speed{sortArrow('speed')}</th>

                {/* ── Coach Eval (Green) ── */}
                <th style={{ ...th, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)', color: '#6DB875' }}
                  onClick={() => toggleSort('coachEval')}>Score{sortArrow('coachEval')}</th>
                <th style={{ ...th, color: '#6DB875' }}
                  onClick={() => toggleSort('coachRank')}>#Rank{sortArrow('coachRank')}</th>
                <th style={{ ...th, color: '#6DB875' }}
                  onClick={() => toggleSort('intangibles')}>Intangibles{sortArrow('intangibles')}</th>
                <th style={{ ...th, color: '#6DB875' }}
                  onClick={() => toggleSort('intangiblesRank')}>#Rank{sortArrow('intangiblesRank')}</th>
                <th style={{ ...th, color: '#6DB875' }}
                  onClick={() => toggleSort('teamPitching')}>Eval Pitch{sortArrow('teamPitching')}</th>
                <th style={{ ...th, color: '#6DB875' }}
                  onClick={() => toggleSort('teamHitting')}>Eval F/H{sortArrow('teamHitting')}</th>
                <th style={{ ...th, color: '#6DB875' }}
                  onClick={() => toggleSort('evalSpeed')}>Spd{sortArrow('evalSpeed')}</th>
                <th style={{ ...th, color: '#6DB875' }}
                  onClick={() => toggleSort('evalAthleticism')}>Ath{sortArrow('evalAthleticism')}</th>

                {/* ── GC (Purple) ── */}
                <th style={{ ...th, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)', color: '#C080E8' }}
                  onClick={() => toggleSort('gcHittingScore')}>GC Hit{sortArrow('gcHittingScore')}</th>
                <th style={{ ...th, color: '#C080E8' }}
                  onClick={() => toggleSort('gcPitchingScore')}>GC Pit{sortArrow('gcPitchingScore')}</th>

                {/* Exclude */}
                <th style={{ ...th, textAlign: 'center', width: '60px', minWidth: '60px', cursor: 'default' }}>Excl</th>

                {/* Notes */}
                <th style={{ ...th, textAlign: 'left', minWidth: '160px', cursor: 'default' }}>Board Notes</th>

                {/* Comments */}
                <th style={{ ...th, textAlign: 'left', minWidth: '180px', cursor: 'default' }}>Coach Comments</th>
              </tr>
            </thead>

            <tbody>
              {isDraftMode ? (
                <>
                  {/* ── Blue zone ── */}
                  <tr key="draft-blue-header">
                    <td colSpan={24} style={{ padding: 0, border: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 10px', background: 'rgba(64,144,224,0.08)', borderBottom: '0.5px solid rgba(64,144,224,0.2)' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4090E0', flexShrink: 0 }} />
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
                    <td colSpan={24} style={{ padding: 0, border: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px' }}>
                        <div style={{ flex: 1, height: '1.5px', background: 'rgba(64,144,224,0.5)' }} />
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#4090E0', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Blue / White cutoff</span>
                        <div style={{ flex: 1, height: '1.5px', background: 'rgba(64,144,224,0.5)' }} />
                      </div>
                    </td>
                  </tr>

                  {/* ── White zone ── */}
                  <tr key="draft-white-header">
                    <td colSpan={24} style={{ padding: 0, border: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '5px 10px', background: 'rgba(var(--fg-rgb),0.04)', borderBottom: '0.5px solid rgba(var(--fg-rgb),0.1)' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: s.muted, flexShrink: 0 }} />
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
                    <td colSpan={24} style={{ padding: 0, border: 'none' }}>
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
                        <td colSpan={24} style={{ padding: 0, border: 'none' }}>
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
                        <td colSpan={24} style={{ padding: 0, border: 'none' }}>
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
                        <td colSpan={24} style={{ padding: 0, border: 'none' }}>
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
                    <td colSpan={24} style={{ padding: 0, border: 'none' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 8px 4px' }}>
                        <div style={{ flex: 1, height: '1px', background: 'rgba(232,112,96,0.3)' }} />
                        <span style={{ fontSize: '10px', fontWeight: 800, color: '#E87060', textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>Excluded from team making ({excludedFiltered.length})</span>
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
                            {tOpts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
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
                                  style={{ cursor: 'pointer', accentColor: '#6DB875' }} />
                                <span style={{ fontSize: '10px', fontWeight: 700, color: row.isAccepted ? '#6DB875' : s.dim, whiteSpace: 'nowrap' }}>
                                  {row.isAccepted ? 'Accepted' : 'Accept'}
                                </span>
                              </label>
                            )}
                          </div>
                        </td>
                        <td style={{ ...td, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)' }} colSpan={20} />
                        <td style={{ ...td, textAlign: 'center', width: '60px' }}>
                          <button onClick={() => toggleExclude(row.player.id)} title="Re-include this player"
                            style={{ padding: '2px 7px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', border: '0.5px solid rgba(232,112,96,0.5)', background: 'rgba(232,112,96,0.12)', color: '#E87060' }}>
                            Excl
                          </button>
                        </td>
                        <td style={{ ...td, textAlign: 'left', minWidth: '160px' }}>
                          <span style={{ fontSize: '12px', color: s.dim }}>{row.adminNotes ?? ''}</span>
                        </td>
                        <td style={{ ...td }} />
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
