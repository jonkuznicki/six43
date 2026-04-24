'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'
import PlayerCard from './PlayerCard'
import PlayerCompare from './PlayerCompare'
import type { GcStatDef } from '../../../../../lib/tryouts/gcStatDefs'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Player {
  id:               string
  first_name:       string
  last_name:        string
  age_group:        string
  tryout_age_group: string | null
  prior_team:       string | null
}

interface TryoutScoreRow {
  player_id:       string
  tryout_score:    number | null
  tryout_pitching: number | null
  scores:          Record<string, number> | null
}

interface CoachEvalRow {
  player_id:        string
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
  player_id:         string
  gc_computed_score: number | null
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
  id:        string
  name:      string
  age_group: string
  color:     string | null
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
  coachEval:       number | null
  intangibles:     number | null
  teamPitching:    number | null   // avg of pitching_catching section
  teamHitting:     number | null   // avg of fielding_hitting section
  coachComments:   string | null
  // GC
  gcScore:         number | null
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

// ── Component ──────────────────────────────────────────────────────────────────

export default function TeamMakingPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()

  const [season,      setSeason]      = useState<Season | null>(null)
  const [players,     setPlayers]     = useState<Player[]>([])
  const [tryoutRows,  setTryoutRows]  = useState<TryoutScoreRow[]>([])
  const [evalRows,    setEvalRows]    = useState<CoachEvalRow[]>([])
  const [evalConfig,  setEvalConfig]  = useState<EvalConfigRow[]>([])
  const [gcRows,      setGcRows]      = useState<GcStatRow[]>([])
  const [teams,       setTeams]       = useState<Team[]>([])
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [notesMap,    setNotesMap]    = useState<Record<string, string>>({})
  const [loading,     setLoading]     = useState(true)

  // Filters / sort
  const [ageFilter, setAgeFilter] = useState('all')
  const [search,    setSearch]    = useState('')
  const [sortCol,   setSortCol]   = useState('combinedRank')
  const [sortDir,   setSortDir]   = useState<1 | -1>(1)   // 1 = asc for ranks, -1 = desc for scores

  // Cutoff lines per age group
  const [cutoffs, setCutoffs] = useState<Record<string, { blue: number; white: number }>>({})

  // Player card panel
  const [panelPlayerId, setPanelPlayerId] = useState<string | null>(null)

  // Compare
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [showCompare, setShowCompare] = useState(false)

  // Inline notes edit
  const [editingNotes, setEditingNotes] = useState<string | null>(null)
  const [notesVal,     setNotesVal]     = useState('')
  const [savingNotes,  setSavingNotes]  = useState<string | null>(null)
  const notesInputRef = useRef<HTMLInputElement>(null)

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

  // Hide sidebar + zero margin on this page for maximum table width
  useEffect(() => {
    document.body.classList.add('tryout-fullscreen')
    return () => document.body.classList.remove('tryout-fullscreen')
  }, [])

  async function loadData() {
    const { data: seasonData } = await supabase
      .from('tryout_seasons')
      .select('id, label, year, age_groups, rankings_share_token')
      .eq('org_id', params.orgId).eq('is_active', true).maybeSingle()

    setSeason(seasonData)
    setShareToken(seasonData?.rankings_share_token ?? null)
    if (!seasonData) { setLoading(false); return }

    const [
      { data: playerData },
      { data: tryoutData },
      { data: evalData },
      { data: evalCfgData },
      { data: gcData },
      { data: teamData },
      { data: assignData },
      { data: combinedData },
    ] = await Promise.all([
      supabase.from('tryout_players')
        .select('id, first_name, last_name, age_group, tryout_age_group, prior_team')
        .eq('org_id', params.orgId).eq('is_active', true)
        .order('last_name').order('first_name'),

      supabase.from('tryout_scores')
        .select('player_id, tryout_score, tryout_pitching, scores')
        .eq('org_id', params.orgId),

      supabase.from('tryout_coach_evals')
        .select('player_id, coach_eval_score, intangibles_score, scores, comments')
        .eq('org_id', params.orgId).eq('status', 'submitted'),

      supabase.from('tryout_coach_eval_config')
        .select('field_key, section, weight')
        .eq('org_id', params.orgId)
        .order('sort_order'),

      supabase.from('tryout_gc_stats')
        .select('player_id, gc_computed_score, avg, obp, slg, ops, rbi, r, hr, sb, bb, so, era, whip, ip, k_bb, strike_pct, w, sv')
        .eq('org_id', params.orgId),

      supabase.from('tryout_teams')
        .select('id, name, age_group, color')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id).eq('is_active', true),

      supabase.from('tryout_team_assignments')
        .select('player_id, team_id')
        .eq('season_id', seasonData.id),

      supabase.from('tryout_combined_scores')
        .select('player_id, admin_notes')
        .eq('season_id', seasonData.id),
    ])

    setPlayers(playerData ?? [])
    setTryoutRows(tryoutData ?? [])
    setEvalRows(evalData ?? [])
    setEvalConfig(evalCfgData ?? [])
    setGcRows(gcData ?? [])
    setTeams(teamData ?? [])

    const asgn: Record<string, string> = {}
    for (const a of (assignData ?? [])) asgn[a.player_id] = a.team_id
    setAssignments(asgn)

    const notes: Record<string, string> = {}
    for (const c of (combinedData ?? [])) {
      if (c.admin_notes) notes[c.player_id] = c.admin_notes
    }
    setNotesMap(notes)
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

  // ── Team assignment save ──────────────────────────────────────────────────────

  async function assignTeam(playerId: string, teamId: string | null) {
    if (!season) return
    setAssigning(playerId)
    if (teamId) {
      await supabase.from('tryout_team_assignments').upsert(
        { player_id: playerId, team_id: teamId, season_id: season.id, org_id: params.orgId },
        { onConflict: 'player_id,season_id' }
      )
      setAssignments(prev => ({ ...prev, [playerId]: teamId }))
    } else {
      await supabase.from('tryout_team_assignments').delete()
        .eq('player_id', playerId).eq('season_id', season.id)
      setAssignments(prev => { const n = { ...prev }; delete n[playerId]; return n })
    }
    setAssigning(null)
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

  const ranked = useMemo((): RankedPlayer[] => {
    // Per-player tryout: average across evaluators
    const tryoutByPlayer = new Map<string, TryoutScoreRow[]>()
    for (const r of tryoutRows) {
      if (!tryoutByPlayer.has(r.player_id)) tryoutByPlayer.set(r.player_id, [])
      tryoutByPlayer.get(r.player_id)!.push(r)
    }

    // Per-player eval (use first submitted eval — one per player per org/year)
    const evalByPlayer = new Map<string, CoachEvalRow>()
    for (const r of evalRows) evalByPlayer.set(r.player_id, r)

    // Per-player GC
    const gcByPlayer = new Map<string, GcStatRow>()
    for (const r of gcRows) gcByPlayer.set(r.player_id, r)

    const base: Array<Omit<RankedPlayer, 'combinedRank' | 'tryoutRank' | 'coachRank' | 'intangiblesRank'>> =
      players.map(player => {
        const ag = player.tryout_age_group ?? player.age_group

        // Tryout
        const tRows = tryoutByPlayer.get(player.id) ?? []
        const validT = tRows.filter(r => r.tryout_score != null)
        const tryoutScore = validT.length > 0
          ? validT.reduce((s, r) => s + r.tryout_score!, 0) / validT.length
          : null
        const validTP = tRows.filter(r => r.tryout_pitching != null)
        const tryoutPitching = validTP.length > 0
          ? validTP.reduce((s, r) => s + r.tryout_pitching!, 0) / validTP.length
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
        const coachEval     = evalRow?.coach_eval_score  ?? null
        const intangibles   = evalRow?.intangibles_score ?? null
        const teamPitching  = sectionAvg(evalRow?.scores ?? null, pitchingKeys)
        const teamHitting   = sectionAvg(evalRow?.scores ?? null, hittingKeys)
        const coachComments = evalRow?.comments ?? null

        // GC
        const gcRow   = gcByPlayer.get(player.id) ?? null
        const gcScore = gcRow?.gc_computed_score ?? null

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
          coachComments,
          gcScore,
          combinedScore,
          assignedTeamId: assignments[player.id] ?? null,
          adminNotes:     notesMap[player.id] ?? null,
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
  }, [players, tryoutRows, evalRows, gcRows, assignments, notesMap, pitchingKeys, hittingKeys])

  // ── Filter + sort ─────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
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
        case 'speed':           return r.speed           ?? 9999  // lower = faster = better
        case 'gcScore':         return r.gcScore         ?? -1
        case 'name': return 0  // handled below
        default:                return r.combinedRank    ?? 9999
      }
    }

    return [...list].sort((a, b) => {
      if (sortCol === 'name') {
        const na = `${a.player.last_name}${a.player.first_name}`
        const nb = `${b.player.last_name}${b.player.first_name}`
        return na.localeCompare(nb) * sortDir
      }
      return (numVal(a) - numVal(b)) * sortDir
    })
  }, [ranked, ageFilter, search, sortCol, sortDir])

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
        'Next Season Team', 'Notes', 'Combined Rank', 'Player', 'Age Group', `${priorYear} Team`,
        'Combined Score', 'Tryout Score', 'Tryout Rank', 'Coach Eval', 'Coach Rank',
        'Intangibles', 'Intangibles Rank', 'Team Pitching', 'Tryout Pitching',
        'Team Hitting', 'Tryout Hitting', 'Speed (60yd)', 'GC Score', 'Comments',
      ],
      ...filtered.map(r => {
        const team = teams.find(t => t.id === r.assignedTeamId)
        return [
          team?.name ?? '',
          r.adminNotes ?? '',
          String(r.combinedRank ?? ''),
          `${r.player.last_name}, ${r.player.first_name}`,
          r.ageGroup,
          r.player.prior_team ?? '',
          r.combinedScore?.toFixed(2)    ?? '',
          r.tryoutScore?.toFixed(2)      ?? '',
          String(r.tryoutRank             ?? ''),
          r.coachEval?.toFixed(2)        ?? '',
          String(r.coachRank              ?? ''),
          r.intangibles?.toFixed(2)      ?? '',
          String(r.intangiblesRank        ?? ''),
          r.teamPitching?.toFixed(2)     ?? '',
          r.tryoutPitching?.toFixed(2)   ?? '',
          r.teamHitting?.toFixed(2)      ?? '',
          r.tryoutHitting?.toFixed(2)    ?? '',
          r.speed?.toFixed(2)            ?? '',
          r.gcScore?.toFixed(2)          ?? '',
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

  // Derive age groups from actual player data (avoids casing mismatches with season config)
  const ageGroups = useMemo(
    () => Array.from(new Set(ranked.map(r => r.ageGroup).filter(Boolean))).sort() as string[],
    [ranked]
  )
  const priorYear     = season ? season.year - 1 : null
  const assignedCount = filtered.filter(r => r.assignedTeamId).length
  const teamOptions   = (ag: string) => {
    const matched = teams.filter(t => t.age_group.toLowerCase() === ag.toLowerCase() || t.age_group === 'all')
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
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '2px' }}>Team Making</h1>
          <div style={{ fontSize: '13px', color: s.muted }}>{season.label}</div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={handleShare} disabled={sharingBusy} style={{
            padding: '7px 14px', borderRadius: '6px',
            border: `0.5px solid ${shareToken ? 'rgba(109,184,117,0.5)' : 'var(--border-md)'}`,
            background: shareToken ? 'rgba(109,184,117,0.1)' : 'var(--bg-input)',
            color: shareToken ? '#6DB875' : s.muted, fontSize: '12px', cursor: sharingBusy ? 'default' : 'pointer',
          }}>{shareCopied ? '✓ Copied!' : shareToken ? '⎋ Copy link' : '⎋ Share'}</button>
          {shareToken && (
            <button onClick={revokeShare} disabled={sharingBusy} style={{
              padding: '7px 14px', borderRadius: '6px', border: '0.5px solid rgba(232,112,96,0.4)',
              background: 'rgba(232,112,96,0.08)', color: '#E87060', fontSize: '12px', cursor: 'pointer',
            }}>Revoke</button>
          )}
          {compareIds.length >= 2 && (
            <button onClick={() => setShowCompare(true)} style={{
              padding: '7px 14px', borderRadius: '6px',
              border: '0.5px solid rgba(232,160,32,0.5)',
              background: 'rgba(232,160,32,0.12)', color: 'var(--accent)',
              fontSize: '12px', fontWeight: 700, cursor: 'pointer',
            }}>Compare {compareIds.length}</button>
          )}
          {compareIds.length > 0 && (
            <button onClick={() => setCompareIds([])} style={{
              padding: '7px 10px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
              background: 'var(--bg-input)', color: s.dim, fontSize: '12px', cursor: 'pointer',
            }}>Clear</button>
          )}
          <button onClick={exportCsv} style={{
            padding: '7px 14px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
            background: 'var(--bg-input)', color: s.muted, fontSize: '12px', cursor: 'pointer',
          }}>↓ CSV</button>
        </div>
      </div>

      {/* ── No teams warning ── */}
      {teams.length === 0 && (
        <div style={{
          marginBottom: '1rem', padding: '10px 14px', borderRadius: '8px',
          background: 'rgba(232,160,32,0.08)', border: '0.5px solid rgba(232,160,32,0.3)',
          fontSize: '12px', color: 'var(--accent)',
          display: 'flex', alignItems: 'center', gap: '10px',
        }}>
          <span>⚠ No teams set up yet — the assignment dropdown will be empty.</span>
          <Link href={`/org/${params.orgId}/tryouts/teams`} style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}>
            Set up teams →
          </Link>
        </div>
      )}

      {/* ── Summary chips ── */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {[
          { label: 'Players',  val: ranked.length,  color: undefined as string | undefined },
          { label: 'Assigned', val: assignedCount,  color: '#6DB875' },
          { label: `Unassigned`, val: ranked.length - assignedCount, color: ranked.length - assignedCount > 0 ? '#E8A020' : undefined },
        ].map(({ label, val, color }) => (
          <div key={label} style={{
            padding: '6px 14px', borderRadius: '8px',
            background: color ? `${color}18` : 'var(--bg-card)',
            border: `0.5px solid ${color ? `${color}55` : 'var(--border)'}`,
            display: 'flex', alignItems: 'center', gap: '6px',
          }}>
            <span style={{ fontSize: '15px', fontWeight: 800, color: color ?? 'var(--fg)' }}>{val}</span>
            <span style={{ fontSize: '11px', color: color ?? s.muted }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Age filters + search ── */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'center' }}>
        {['all', ...ageGroups].map(ag => (
          <button key={ag} onClick={() => setAgeFilter(ag)} style={{
            padding: '5px 12px', borderRadius: '20px', border: '0.5px solid',
            borderColor: ageFilter === ag ? 'var(--accent)' : 'var(--border-md)',
            background: ageFilter === ag ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
            color: ageFilter === ag ? 'var(--accent)' : s.muted,
            fontSize: '12px', fontWeight: ageFilter === ag ? 700 : 400, cursor: 'pointer',
          }}>{ag === 'all' ? 'All ages' : ag}</button>
        ))}
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search players…"
          style={{
            marginLeft: '4px', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)',
            borderRadius: '6px', padding: '5px 10px', fontSize: '12px', color: 'var(--fg)', width: '180px',
          }}
        />
      </div>

      {/* ── Cutoff controls (single age group only) ── */}
      {ageFilter !== 'all' && filtered.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '1rem',
          padding: '10px 14px', background: 'var(--bg-card)', border: '0.5px solid var(--border)',
          borderRadius: '10px', flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '12px', fontWeight: 700 }}>Cutoff lines</span>
          {([
            { key: 'blue' as const, label: 'Blue',  color: '#4090E0' },
            { key: 'white' as const, label: 'White', color: s.muted },
          ]).map(({ key, label, color }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '11px', fontWeight: 700, color, minWidth: '36px' }}>{label}</span>
              <button onClick={() => setCutoff(key, ageCutoff[key] - 1)} style={{ width: '22px', height: '22px', borderRadius: '4px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: s.muted, fontSize: '14px', cursor: 'pointer', lineHeight: 1 }}>−</button>
              <span style={{ fontSize: '13px', fontWeight: 800, minWidth: '24px', textAlign: 'center' }}>{ageCutoff[key]}</span>
              <button onClick={() => setCutoff(key, ageCutoff[key] + 1)} style={{ width: '22px', height: '22px', borderRadius: '4px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: s.muted, fontSize: '14px', cursor: 'pointer', lineHeight: 1 }}>+</button>
            </div>
          ))}
          <span style={{ fontSize: '11px', color: s.dim }}>
            Blue: {ageCutoff.blue} · White: {ageCutoff.white} · Cut: {Math.max(0, filtered.length - ageCutoff.blue - ageCutoff.white)}
          </span>
        </div>
      )}

      {/* ── Combined score formula note ── */}
      <div style={{ fontSize: '11px', color: s.dim, marginBottom: '10px' }}>
        Combined = 33% Tryout + 67% Coach Eval when both exist; falls back to whichever is available.
        GC score shown for reference only.
      </div>

      {/* ── Table ── */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '14px' }}>
          No players found. Import registration data to get started.
        </div>
      ) : (
        <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 290px)', borderRadius: '8px', border: '0.5px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              {/* ── Section header row ── */}
              <tr style={{ borderBottom: 'none' }}>
                {/* Sticky columns - no section label (includes checkbox col) */}
                <th colSpan={3} style={{ ...th, top: 0, zIndex: 4, borderBottom: 'none', padding: '4px 8px' }} />
                {/* Combined */}
                <th colSpan={2} style={{
                  ...th, textAlign: 'center', borderBottom: 'none', padding: '4px 8px',
                  color: 'var(--accent)', borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)',
                }}>Combined</th>
                {/* Identity */}
                <th colSpan={2} style={{ ...th, textAlign: 'center', borderBottom: 'none', padding: '4px 8px' }} />
                {/* Tryout */}
                <th colSpan={2} style={{
                  ...th, textAlign: 'center', borderBottom: 'none', padding: '4px 8px',
                  color: '#80B0E8', borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)',
                }}>Tryout</th>
                {/* Coach Eval */}
                <th colSpan={4} style={{
                  ...th, textAlign: 'center', borderBottom: 'none', padding: '4px 8px',
                  color: '#6DB875', borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)',
                }}>Coach Eval</th>
                {/* Pitching & Hitting */}
                <th colSpan={5} style={{
                  ...th, textAlign: 'center', borderBottom: 'none', padding: '4px 8px',
                  color: '#C080E8', borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)',
                }}>Pitching & Hitting</th>
                {/* GC + Notes + Comments */}
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
                <th style={{ ...stickyPlayerTh, width: '170px', minWidth: '160px' }}
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

                {/* Tryout */}
                <th style={{ ...th, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)', color: '#80B0E8' }}
                  onClick={() => toggleSort('tryoutScore')}>Score{sortArrow('tryoutScore')}</th>
                <th style={{ ...th, color: '#80B0E8' }}
                  onClick={() => toggleSort('tryoutRank')}>#Rank{sortArrow('tryoutRank')}</th>

                {/* Coach Eval */}
                <th style={{ ...th, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)', color: '#6DB875' }}
                  onClick={() => toggleSort('coachEval')}>Score{sortArrow('coachEval')}</th>
                <th style={{ ...th, color: '#6DB875' }}
                  onClick={() => toggleSort('coachRank')}>#Rank{sortArrow('coachRank')}</th>
                <th style={{ ...th, color: '#6DB875' }}
                  onClick={() => toggleSort('intangibles')}>Intangibles{sortArrow('intangibles')}</th>
                <th style={{ ...th, color: '#6DB875' }}
                  onClick={() => toggleSort('intangiblesRank')}>#Rank{sortArrow('intangiblesRank')}</th>

                {/* Pitching & Hitting */}
                <th style={{ ...th, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)', color: '#C080E8' }}
                  onClick={() => toggleSort('teamPitching')}>T.Pitch{sortArrow('teamPitching')}</th>
                <th style={{ ...th, color: '#C080E8' }}
                  onClick={() => toggleSort('tryoutPitching')}>Try.Pitch{sortArrow('tryoutPitching')}</th>
                <th style={{ ...th, color: '#C080E8' }}
                  onClick={() => toggleSort('teamHitting')}>T.Hit{sortArrow('teamHitting')}</th>
                <th style={{ ...th, color: '#C080E8' }}
                  onClick={() => toggleSort('tryoutHitting')}>Try.Hit{sortArrow('tryoutHitting')}</th>
                <th style={{ ...th, color: '#C080E8' }}
                  onClick={() => toggleSort('speed')}>Speed{sortArrow('speed')}</th>

                {/* GC */}
                <th style={{ ...th }}
                  onClick={() => toggleSort('gcScore')}>GC{sortArrow('gcScore')}</th>

                {/* Notes */}
                <th style={{ ...th, textAlign: 'left', minWidth: '120px', cursor: 'default' }}>Notes</th>

                {/* Comments */}
                <th style={{ ...th, textAlign: 'left', minWidth: '180px', cursor: 'default' }}>Coach Comments</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((row, idx) => {
                const team     = teams.find(t => t.id === row.assignedTeamId)
                const tOpts    = teamOptions(row.ageGroup)
                const isBlue   = ageFilter !== 'all' && ageCutoff.blue  > 0 && idx <  ageCutoff.blue
                const isWhite  = ageFilter !== 'all' && ageCutoff.white > 0 && idx >= ageCutoff.blue && idx < ageCutoff.blue + ageCutoff.white
                const borderC  = isBlue ? 'rgba(64,144,224,0.5)' : isWhite ? 'rgba(var(--fg-rgb),0.2)' : 'transparent'
                const showBlueLine  = ageFilter !== 'all' && ageCutoff.blue  > 0 && idx === ageCutoff.blue
                const showWhiteLine = ageFilter !== 'all' && ageCutoff.white > 0 && idx === ageCutoff.blue + ageCutoff.white
                const rowBg = idx % 2 === 0 ? 'transparent' : 'rgba(var(--fg-rgb),0.015)'

                // Team color for the assignment cell
                const teamColor = team?.name?.toLowerCase() === 'blue'  ? '#4090E0'
                                : team?.name?.toLowerCase() === 'white' ? s.muted
                                : team ? '#6DB875' : undefined

                return (
                  <>
                    {showBlueLine && (
                      <tr key={`cut-b-${idx}`}>
                        <td colSpan={21} style={{ padding: 0, border: 'none' }}>
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
                        <td colSpan={21} style={{ padding: 0, border: 'none' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px' }}>
                            <div style={{ flex: 1, height: '1.5px', background: 'rgba(var(--fg-rgb),0.25)' }} />
                            <span style={{ fontSize: '10px', fontWeight: 800, color: s.muted, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>White / Cut line</span>
                            <div style={{ flex: 1, height: '1.5px', background: 'rgba(var(--fg-rgb),0.25)' }} />
                          </div>
                        </td>
                      </tr>
                    )}

                    <tr key={row.player.id} style={{ borderLeft: `3px solid ${borderC}`, background: rowBg }}>

                      {/* ── Compare checkbox ── */}
                      <td style={{ ...td, padding: '7px 4px', textAlign: 'center', width: '28px' }}>
                        <input
                          type="checkbox"
                          checked={compareIds.includes(row.player.id)}
                          onChange={() => toggleCompare(row.player.id)}
                          title={compareIds.length >= 4 && !compareIds.includes(row.player.id) ? 'Max 4 players' : 'Compare'}
                          disabled={compareIds.length >= 4 && !compareIds.includes(row.player.id)}
                          style={{ cursor: 'pointer', accentColor: 'var(--accent)' }}
                        />
                      </td>

                      {/* ── Next Season Team (sticky) ── */}
                      <td style={{ ...stickyTeamTd, background: rowBg !== 'transparent' ? 'var(--bg)' : 'var(--bg)', width: `${TEAM_W}px` }}>
                        <select
                          value={row.assignedTeamId ?? ''}
                          onChange={e => assignTeam(row.player.id, e.target.value || null)}
                          disabled={assigning === row.player.id}
                          style={{
                            background: team ? `${teamColor}18` : 'var(--bg-input)',
                            border: `0.5px solid ${team ? `${teamColor}55` : 'var(--border-md)'}`,
                            borderRadius: '5px', padding: '4px 6px', fontSize: '12px',
                            color: team ? teamColor : s.muted,
                            cursor: assigning === row.player.id ? 'default' : 'pointer',
                            width: '100%', fontWeight: team ? 700 : 400,
                          }}
                        >
                          <option value="">—</option>
                          {tOpts.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                      </td>

                      {/* ── Player name (sticky) ── */}
                      <td style={{ ...stickyPlayerTd, background: 'var(--bg)' }}>
                        <div
                          onClick={() => setPanelPlayerId(row.player.id)}
                          style={{ fontWeight: 700, fontSize: '13px', cursor: 'pointer', color: 'var(--fg)' }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg)')}
                        >
                          {row.player.last_name}, {row.player.first_name}
                        </div>
                      </td>

                      {/* ── Combined rank + score ── */}
                      <td style={{ ...td, textAlign: 'center', fontWeight: 800, fontSize: '14px', color: row.combinedRank ? 'var(--accent)' : s.dim, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)' }}>
                        {fmtRank(row.combinedRank)}
                      </td>
                      <td style={{ ...td, fontWeight: 800, fontSize: '14px', color: row.combinedScore != null ? 'var(--accent)' : s.dim }}>
                        {fmt(row.combinedScore)}
                      </td>

                      {/* ── Age + Prior Team ── */}
                      <td style={{ ...td, textAlign: 'center' }}>
                        <span style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(var(--fg-rgb),0.07)', fontSize: '11px', fontWeight: 600 }}>
                          {row.ageGroup}
                        </span>
                      </td>
                      <td style={{ ...td, textAlign: 'left', fontSize: '11px', color: row.player.prior_team ? '#40A0E8' : s.dim, maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.player.prior_team ?? '—'}
                      </td>

                      {/* ── Tryout ── */}
                      <td style={{ ...td, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)', color: row.tryoutScore != null ? '#80B0E8' : s.dim, fontWeight: row.tryoutScore != null ? 700 : 400 }}>
                        {fmt(row.tryoutScore)}
                      </td>
                      <td style={{ ...td, textAlign: 'center', color: row.tryoutRank != null ? s.muted : s.dim, fontSize: '11px' }}>
                        {fmtRank(row.tryoutRank)}
                      </td>

                      {/* ── Coach Eval ── */}
                      <td style={{ ...td, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)', color: row.coachEval != null ? '#6DB875' : s.dim, fontWeight: row.coachEval != null ? 700 : 400 }}>
                        {fmt(row.coachEval)}
                      </td>
                      <td style={{ ...td, textAlign: 'center', color: row.coachRank != null ? s.muted : s.dim, fontSize: '11px' }}>
                        {fmtRank(row.coachRank)}
                      </td>
                      <td style={{ ...td, color: row.intangibles != null ? '#6DB875' : s.dim, fontWeight: row.intangibles != null ? 600 : 400 }}>
                        {fmt(row.intangibles)}
                      </td>
                      <td style={{ ...td, textAlign: 'center', color: row.intangiblesRank != null ? s.muted : s.dim, fontSize: '11px' }}>
                        {fmtRank(row.intangiblesRank)}
                      </td>

                      {/* ── Pitching & Hitting ── */}
                      <td style={{ ...td, borderLeft: '0.5px solid rgba(var(--fg-rgb),0.08)', color: row.teamPitching != null ? '#C080E8' : s.dim }}>
                        {fmt(row.teamPitching)}
                      </td>
                      <td style={{ ...td, color: row.tryoutPitching != null ? '#C080E8' : s.dim }}>
                        {fmt(row.tryoutPitching)}
                      </td>
                      <td style={{ ...td, color: row.teamHitting != null ? '#C080E8' : s.dim }}>
                        {fmt(row.teamHitting)}
                      </td>
                      <td style={{ ...td, color: row.tryoutHitting != null ? '#C080E8' : s.dim }}>
                        {fmt(row.tryoutHitting)}
                      </td>
                      <td style={{ ...td, color: row.speed != null ? '#C080E8' : s.dim }}>
                        {row.speed != null ? `${row.speed.toFixed(2)}s` : '—'}
                      </td>

                      {/* ── GC ── */}
                      <td style={{ ...td, color: row.gcScore != null ? s.muted : s.dim, fontSize: '11px' }}>
                        {fmt(row.gcScore)}
                      </td>

                      {/* ── Notes (inline edit) ── */}
                      <td style={{ ...td, textAlign: 'left', minWidth: '120px' }}>
                        {editingNotes === row.player.id ? (
                          <input
                            ref={notesInputRef}
                            value={notesVal}
                            onChange={e => setNotesVal(e.target.value)}
                            onBlur={() => saveNotes(row.player.id, notesVal)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { saveNotes(row.player.id, notesVal) }
                              if (e.key === 'Escape') { setEditingNotes(null) }
                            }}
                            style={{
                              width: '100%', background: 'var(--bg-input)',
                              border: '1px solid var(--accent)', borderRadius: '4px',
                              padding: '3px 6px', fontSize: '12px', color: 'var(--fg)', outline: 'none',
                            }}
                          />
                        ) : (
                          <div
                            onClick={() => { setEditingNotes(row.player.id); setNotesVal(row.adminNotes ?? '') }}
                            title="Click to edit notes"
                            style={{
                              cursor: 'text', minHeight: '22px', padding: '2px 4px', borderRadius: '4px',
                              color: row.adminNotes ? 'var(--fg)' : s.dim,
                              fontSize: '12px',
                              border: '1px solid transparent',
                              transition: 'border-color 0.1s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-md)')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                          >
                            {savingNotes === row.player.id ? <span style={{ color: s.dim }}>Saving…</span>
                              : row.adminNotes || <span style={{ color: s.dim }}>+</span>}
                          </div>
                        )}
                      </td>

                      {/* ── Coach Comments (read-only, truncated) ── */}
                      <td style={{ ...td, textAlign: 'left', minWidth: '180px', maxWidth: '280px' }}>
                        {row.coachComments ? (
                          <span
                            title={row.coachComments}
                            style={{ fontSize: '11px', color: s.muted, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'help' }}
                          >
                            {row.coachComments}
                          </span>
                        ) : <span style={{ color: s.dim, fontSize: '11px' }}>—</span>}
                      </td>

                    </tr>
                  </>
                )
              })}
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
