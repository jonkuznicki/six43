'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../lib/supabase'
import { setSelectedTeamId } from '../../lib/selectedTeam'

type PlanSlot = { id?: string; player_id: string; notes: string }
type ActualPitcher = { player: any; playerId: string; slotId: string; innings: number; pitchCount: number | null; firstInning: number }

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function shortName(player: any) {
  if (!player) return '—'
  return `${player.first_name[0]}. ${player.last_name}`
}

function daysRest(lastPitchedDate: string | undefined, gameDate: string): string {
  if (!lastPitchedDate) return ''
  const last = new Date(lastPitchedDate + 'T12:00:00')
  const scheduled = new Date(gameDate + 'T12:00:00')
  const days = Math.round((scheduled.getTime() - last.getTime()) / (1000 * 60 * 60 * 24))
  if (days <= 0) return ' · same day'
  if (days === 1) return ' · 1d rest'
  return ` · ${days}d rest`
}

const HEADER_STYLE: React.CSSProperties = {
  fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`,
  textAlign: 'center', padding: '0 2px',
}
const CELL_SEL: React.CSSProperties = {
  width: '100%', padding: '6px 4px', borderRadius: '5px',
  border: '0.5px solid var(--border-md)', background: 'var(--bg-input)',
  color: 'var(--fg)', fontSize: '11px', boxSizing: 'border-box', cursor: 'pointer',
}
const MIN_SLOTS = 4
const MAX_SLOTS = 9

export default function PitchingPage() {
  const supabase = createClient()
  const [loading, setLoading]               = useState(true)
  const [seasons, setSeasons]               = useState<any[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState('')
  const [activeSeason, setActiveSeason]     = useState<any>(null)
  const [players, setPlayers]               = useState<any[]>([])
  const [upcoming, setUpcoming]             = useState<any[]>([])
  const [finalized, setFinalized]           = useState<any[]>([])
  const [plans, setPlans]                   = useState<Record<string, Record<number, PlanSlot>>>({})
  const [actualPitching, setActualPitching] = useState<Record<string, ActualPitcher[]>>({})
  const [lastPitched, setLastPitched]       = useState<Record<string, string>>({})
  const [saving, setSaving]                 = useState<string | null>(null)
  const [editingPitch, setEditingPitch]     = useState<Record<string, string>>({}) // slotId → draft value
  const [slotCount, setSlotCount]           = useState(MIN_SLOTS)
  const [pitchLimit, setPitchLimit]         = useState<number | null>(null)
  const [pitchLimitDraft, setPitchLimitDraft] = useState('')
  const [lineupPitchers, setLineupPitchers] = useState<Record<string, string[]>>({}) // gameId → ordered player_ids
  // Each entry = a scheduled (non-final) game where the player actually has P innings in the lineup
  const [scheduledPitchHistory, setScheduledPitchHistory] = useState<Array<{ playerId: string; gameDate: string }>>([])
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null)
  const didScrollRef = useRef(false)

  useEffect(() => { init() }, [])
  useEffect(() => {
    if (!loading && !didScrollRef.current) {
      didScrollRef.current = true
      // Mobile: scroll to upcoming anchor
      if (window.innerWidth < 768) {
        const el = document.getElementById('pitching-upcoming-anchor')
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 16, behavior: 'instant' })
      } else {
        // Desktop: auto-select first upcoming (or last finalized)
        const first = upcoming[0] ?? finalized[finalized.length - 1] ?? null
        if (first && !selectedGameId) setSelectedGameId(first.id)
      }
    }
  }, [loading])
  useEffect(() => {
    if (!selectedSeasonId) return
    didScrollRef.current = false
    loadSeason(selectedSeasonId)
    // Persist selected team across all pages when season changes
    const season = seasons.find(s => s.id === selectedSeasonId)
    if (season?.team_id) setSelectedTeamId(season.team_id)
  }, [selectedSeasonId])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: teams } = await supabase.from('teams').select('id').eq('is_active', true)
    const teamIds = (teams ?? []).map((t: any) => t.id)
    if (!teamIds.length) { setLoading(false); return }
    const { data: seasonRows } = await supabase
      .from('seasons')
      .select('id, name, is_active, team_id, pitch_count_limit, team:teams(name)')
      .in('team_id', teamIds)
      .order('created_at', { ascending: false })
    setSeasons(seasonRows ?? [])

    // Prefer the cookie-stored team's active season
    const cookieMatch = document.cookie.match(/(?:^|; )selected_team_id=([^;]*)/)
    const storedTeamId = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null
    const preferred = storedTeamId
      ? (seasonRows ?? []).find((s: any) => s.team_id === storedTeamId && s.is_active)
        ?? (seasonRows ?? []).find((s: any) => s.team_id === storedTeamId)
      : null
    const active = preferred
      ?? (seasonRows ?? []).find((s: any) => s.is_active)
      ?? seasonRows?.[0]
    setActiveSeason(active)
    if (active) setSelectedSeasonId(active.id)
    else setLoading(false)
  }

  async function loadSeason(seasonId: string) {
    setLoading(true)
    const season = seasons.find(s => s.id === seasonId)
    const limit = season?.pitch_count_limit ?? null
    setPitchLimit(limit)
    setPitchLimitDraft(limit != null ? String(limit) : '')

    const { data: playerRows } = await supabase
      .from('players')
      .select('id, first_name, last_name, jersey_number')
      .eq('season_id', seasonId)
      .eq('status', 'active')
      .order('last_name')
    setPlayers(playerRows ?? [])

    const { data: gameRows } = await supabase
      .from('games')
      .select('id, opponent, game_date, location, status, innings_played')
      .eq('season_id', seasonId)
      .order('game_date', { ascending: true })

    const upcomingGames  = (gameRows ?? []).filter((g: any) => g.status !== 'final')
    const finalizedGames = (gameRows ?? []).filter((g: any) => g.status === 'final')
    setUpcoming(upcomingGames)
    setFinalized(finalizedGames)

    // Load pitcher plans + lineup data for upcoming games
    const upcomingIds = upcomingGames.map((g: any) => g.id)
    let upLineupSlotsData: any[] = []
    if (upcomingIds.length) {
      const { data: planRows } = await supabase
        .from('pitcher_plans')
        .select('id, game_id, player_id, pitcher_slot, notes')
        .in('game_id', upcomingIds)
        .eq('is_planned', true)
      const plansMap: Record<string, Record<number, PlanSlot>> = {}
      for (const row of planRows ?? []) {
        if (!plansMap[row.game_id]) plansMap[row.game_id] = {}
        plansMap[row.game_id][row.pitcher_slot] = {
          id: row.id, player_id: row.player_id, notes: row.notes ?? '',
        }
      }
      setPlans(plansMap)
      // Set initial slot count from highest filled slot + 1 empty
      const maxFilled = Math.max(MIN_SLOTS, ...Object.values(plansMap).flatMap(g => Object.keys(g).map(Number)))
      setSlotCount(Math.min(MAX_SLOTS, maxFilled + 1))

      // Load lineup data for upcoming games (for "sync from lineup" + scheduled pitch history)
      const { data: upLineupSlots } = await supabase
        .from('lineup_slots')
        .select('game_id, player_id, inning_positions, availability')
        .in('game_id', upcomingIds)
      upLineupSlotsData = upLineupSlots ?? []

      // lineupPitchers: who has actual P innings in each upcoming game's saved lineup
      const lpMap: Record<string, string[]> = {}
      for (const game of upcomingGames) {
        const gameSlots = upLineupSlotsData.filter(
          (s: any) => s.game_id === game.id && s.availability !== 'absent'
        )
        const pitchers: { playerId: string; firstInning: number }[] = []
        for (const slot of gameSlots) {
          const pos = slot.inning_positions ?? []
          const firstInning = pos.findIndex((p: string | null) => p === 'P')
          if (firstInning >= 0) pitchers.push({ playerId: slot.player_id, firstInning })
        }
        pitchers.sort((a, b) => a.firstInning - b.firstInning)
        if (pitchers.length) lpMap[game.id] = pitchers.map(p => p.playerId)
      }
      setLineupPitchers(lpMap)

      // scheduledPitchHistory: one entry per (player, game) with actual P innings in non-final lineup
      const sph: Array<{ playerId: string; gameDate: string }> = []
      for (const slot of upLineupSlotsData) {
        if (slot.availability === 'absent') continue
        const game = upcomingGames.find((g: any) => g.id === slot.game_id)
        if (!game?.game_date) continue
        const innings = (slot.inning_positions ?? []).filter((p: string | null) => p === 'P').length
        if (innings > 0) sph.push({ playerId: slot.player_id, gameDate: game.game_date })
      }
      setScheduledPitchHistory(sph)
    }

    // Load actual pitching data (from lineup slots) including pitch counts
    const finalizedIds = finalizedGames.map((g: any) => g.id)
    if (finalizedIds.length) {
      const { data: slotRows } = await supabase
        .from('lineup_slots')
        .select('id, game_id, player_id, inning_positions, availability, pitch_count, player:players(first_name, last_name, jersey_number)')
        .in('game_id', finalizedIds)

      const actualMap: Record<string, ActualPitcher[]> = {}
      const lastPitchedMap: Record<string, string> = {}

      for (const slot of slotRows ?? []) {
        if (slot.availability === 'absent') continue
        const game = finalizedGames.find((g: any) => g.id === slot.game_id)
        const maxInn = game?.innings_played ?? 9
        const positions = (slot.inning_positions ?? []).slice(0, maxInn)
        const innings = positions.filter((p: string | null) => p === 'P').length
        const firstInning = positions.findIndex((p: string | null) => p === 'P')
        if (innings > 0) {
          if (!actualMap[slot.game_id]) actualMap[slot.game_id] = []
          actualMap[slot.game_id].push({
            player: slot.player,
            playerId: slot.player_id,
            slotId: slot.id,
            innings,
            pitchCount: slot.pitch_count ?? null,
            firstInning,
          })
          if (game && (!lastPitchedMap[slot.player_id] || game.game_date > lastPitchedMap[slot.player_id])) {
            lastPitchedMap[slot.player_id] = game.game_date
          }
        }
      }
      for (const id of Object.keys(actualMap)) {
        actualMap[id].sort((a, b) => a.firstInning - b.firstInning)
      }
      setActualPitching(actualMap)
      setLastPitched(lastPitchedMap)
    }

    setLoading(false)
  }

  async function setPlanPlayer(gameId: string, slot: number, playerId: string) {
    const key = `${gameId}-${slot}`
    setSaving(key)
    const existing = plans[gameId]?.[slot]
    if (!playerId) {
      if (existing?.id) await supabase.from('pitcher_plans').delete().eq('id', existing.id)
      setPlans(prev => {
        const g = { ...(prev[gameId] ?? {}) }
        delete g[slot]
        return { ...prev, [gameId]: g }
      })
    } else if (existing?.id) {
      await supabase.from('pitcher_plans').update({ player_id: playerId }).eq('id', existing.id)
      setPlans(prev => ({
        ...prev,
        [gameId]: { ...prev[gameId], [slot]: { ...existing, player_id: playerId } },
      }))
    } else {
      const { data } = await supabase.from('pitcher_plans').insert({
        game_id: gameId, player_id: playerId,
        pitcher_slot: slot, is_planned: true,
      }).select().single()
      if (data) {
        setPlans(prev => ({
          ...prev,
          [gameId]: { ...(prev[gameId] ?? {}), [slot]: { id: data.id, player_id: playerId, notes: '' } },
        }))
      }
    }
    setSaving(null)
  }

  async function savePitchCount(slotId: string, gameId: string, value: string) {
    const count = value === '' ? null : parseInt(value)
    if (count !== null && (isNaN(count) || count < 0)) return
    await supabase.from('lineup_slots').update({ pitch_count: count }).eq('id', slotId)
    setActualPitching(prev => ({
      ...prev,
      [gameId]: (prev[gameId] ?? []).map(p =>
        p.slotId === slotId ? { ...p, pitchCount: count } : p
      ),
    }))
    // Clear draft
    setEditingPitch(prev => { const n = { ...prev }; delete n[slotId]; return n })
  }

  async function savePitchLimit(value: string) {
    const num = value === '' ? null : parseInt(value)
    if (num !== null && (isNaN(num) || num < 1)) return
    setPitchLimit(num)
    await supabase.from('seasons').update({ pitch_count_limit: num }).eq('id', selectedSeasonId)
    setSeasons(prev => prev.map(s => s.id === selectedSeasonId ? { ...s, pitch_count_limit: num } : s))
  }

  async function syncFromLineup(gameId: string) {
    const pitcherIds = lineupPitchers[gameId] ?? []
    for (let i = 0; i < Math.min(pitcherIds.length, slotCount); i++) {
      await setPlanPlayer(gameId, i + 1, pitcherIds[i])
    }
  }

  // Returns the most recent date a player pitched BEFORE the given game date,
  // considering: final game actuals + scheduled game lineup P innings + earlier upcoming plans
  function effectiveLastPitched(playerId: string, beforeDate: string): string | undefined {
    let best = lastPitched[playerId] // from final games (already in the past)

    // Actual P innings in any scheduled game before this date
    for (const { playerId: pid, gameDate } of scheduledPitchHistory) {
      if (pid === playerId && gameDate < beforeDate && (!best || gameDate > best)) {
        best = gameDate
      }
    }

    // Pitcher plans for any earlier upcoming game
    for (const earlierGame of upcoming) {
      if (!earlierGame.game_date || earlierGame.game_date >= beforeDate) continue
      const isPlanned = Object.values(plans[earlierGame.id] ?? {}).some(
        (s: PlanSlot) => s.player_id === playerId
      )
      if (isPlanned && (!best || earlierGame.game_date > best)) best = earlierGame.game_date
    }

    return best
  }

  // Season pitch count totals per player
  const seasonPitchTotals: Record<string, { name: string; total: number; games: number; overLimit: number }> = {}
  for (const pitchers of Object.values(actualPitching)) {
    for (const p of pitchers) {
      if (!p.player) continue
      const name = shortName(p.player)
      if (!seasonPitchTotals[p.playerId]) {
        seasonPitchTotals[p.playerId] = { name, total: 0, games: 0, overLimit: 0 }
      }
      const entry = seasonPitchTotals[p.playerId]
      entry.games++
      if (p.pitchCount != null) {
        entry.total += p.pitchCount
        if (pitchLimit != null && p.pitchCount > pitchLimit) entry.overLimit++
      }
    }
  }
  const seasonTotalsList = Object.values(seasonPitchTotals).sort((a, b) => b.total - a.total)

  // Compute how many columns to show for past games
  const maxActualPitchers = Math.max(
    MIN_SLOTS,
    ...Object.values(actualPitching).map(arr => arr.length)
  )

  const upcomingGrid = `140px repeat(${slotCount}, 1fr)`
  const pastGrid     = `120px repeat(${maxActualPitchers}, 1fr)`
  const upcomingMinW = `${300 + slotCount * 80}px`

  // ── Desktop detail panel renderers ───────────────────────────────────────

  function renderDesktopGameList() {
    return (
      <>
        {finalized.length > 0 && (
          <div style={{ marginBottom: upcoming.length > 0 ? '1rem' : 0 }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
              color: `rgba(var(--fg-rgb), 0.3)`, padding: '4px 10px', marginBottom: '4px' }}>
              Past
            </div>
            {finalized.map(game => {
              const pitchers = actualPitching[game.id] ?? []
              const isSelected = selectedGameId === game.id
              return (
                <button key={game.id} onClick={() => setSelectedGameId(game.id)} style={{
                  width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none',
                  padding: '8px 10px', borderRadius: '8px',
                  background: isSelected ? 'rgba(75,156,211,0.1)' : 'transparent',
                  marginBottom: '2px', transition: 'background 0.12s', opacity: 0.8,
                }}>
                  <div style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 400,
                    color: isSelected ? 'var(--fg)' : `rgba(var(--fg-rgb), 0.65)`,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    vs {game.opponent}
                  </div>
                  <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '1px' }}>
                    {formatDate(game.game_date)}
                    {pitchers.length > 0 ? ` · ${pitchers.map(p => shortName(p.player)).join(', ')}` : ''}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {upcoming.length > 0 && (
          <div id="pitching-upcoming-anchor">
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase',
              color: `rgba(var(--fg-rgb), 0.3)`, padding: '4px 10px', marginBottom: '4px',
              marginTop: finalized.length > 0 ? '0.25rem' : 0 }}>
              Upcoming
            </div>
            {upcoming.map(game => {
              const isSelected = selectedGameId === game.id
              const assignedCount = Object.values(plans[game.id] ?? {}).filter((p: PlanSlot) => p.player_id).length
              return (
                <button key={game.id} onClick={() => setSelectedGameId(game.id)} style={{
                  width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none',
                  padding: '8px 10px', borderRadius: '8px',
                  background: isSelected ? 'rgba(75,156,211,0.1)' : 'transparent',
                  marginBottom: '2px', transition: 'background 0.12s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '13px', fontWeight: isSelected ? 600 : 400,
                      color: isSelected ? 'var(--fg)' : `rgba(var(--fg-rgb), 0.75)`,
                      flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      vs {game.opponent}
                    </span>
                    {assignedCount > 0 && (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)', flexShrink: 0 }}>
                        {assignedCount}P
                      </span>
                    )}
                    {isSelected && <span style={{ color: 'var(--accent)', fontSize: '13px', flexShrink: 0 }}>›</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '1px' }}>
                    {formatDate(game.game_date)}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </>
    )
  }

  function renderDesktopUpcomingDetail(game: any) {
    const gamePlans  = plans[game.id] ?? {}
    const hasPitchers = (lineupPitchers[game.id]?.length ?? 0) > 0
    const btnBase: React.CSSProperties = {
      width: 24, height: 24, borderRadius: 4, border: '0.5px solid var(--border-md)',
      background: 'transparent', fontSize: 16,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    }
    return (
      <div>
        {/* Header */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, marginBottom: '4px' }}>
            vs {game.opponent}
          </h2>
          <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)` }}>
            {formatDate(game.game_date)}{game.location ? ` · ${game.location}` : ''}
          </div>
        </div>

        {/* Controls row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button onClick={() => setSlotCount(c => Math.max(1, c - 1))} disabled={slotCount <= 1}
              style={{ ...btnBase, cursor: slotCount <= 1 ? 'not-allowed' : 'pointer',
                color: slotCount <= 1 ? `rgba(var(--fg-rgb),0.2)` : `rgba(var(--fg-rgb),0.55)` }}>−</button>
            <span style={{ fontSize: 12, color: `rgba(var(--fg-rgb),0.5)`, minWidth: 60, textAlign: 'center' }}>
              {slotCount} pitcher{slotCount !== 1 ? 's' : ''}
            </span>
            <button onClick={() => setSlotCount(c => Math.min(MAX_SLOTS, c + 1))} disabled={slotCount >= MAX_SLOTS}
              style={{ ...btnBase, cursor: slotCount >= MAX_SLOTS ? 'not-allowed' : 'pointer',
                color: slotCount >= MAX_SLOTS ? `rgba(var(--fg-rgb),0.2)` : `rgba(var(--fg-rgb),0.55)` }}>+</button>
          </div>
          <button
            onClick={() => hasPitchers && syncFromLineup(game.id)}
            title={hasPitchers ? 'Copy pitcher order from saved lineup' : 'No pitchers assigned in lineup yet'}
            style={{
              fontSize: '12px', fontWeight: 700, padding: '5px 12px', borderRadius: '6px',
              cursor: hasPitchers ? 'pointer' : 'default',
              border: `0.5px solid ${hasPitchers ? 'rgba(75,156,211,0.4)' : 'var(--border-subtle)'}`,
              background: hasPitchers ? 'rgba(75,156,211,0.08)' : 'transparent',
              color: hasPitchers ? '#4B9CD3' : `rgba(var(--fg-rgb), 0.22)`,
            }}
          >
            ↓ from lineup
          </button>
        </div>

        {/* Pitcher slot rows */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '2rem' }}>
          {Array.from({ length: slotCount }, (_, i) => {
            const slot = i + 1
            const plan = gamePlans[slot]
            const isSaving = saving === `${game.id}-${slot}`

            let restWarning: { label: string; color: string } | null = null
            if (plan?.player_id) {
              const effLast = effectiveLastPitched(plan.player_id, game.game_date)
              if (effLast) {
                const days = Math.round(
                  (new Date(game.game_date + 'T12:00:00').getTime() - new Date(effLast + 'T12:00:00').getTime()) / 86400000
                )
                if (days <= 1)      restWarning = { label: days <= 0 ? 'Same day!' : '1d rest ⚠', color: '#E87060' }
                else if (days <= 3) restWarning = { label: `${days}d rest ⚠`, color: '#E8A020' }
              }
            }

            return (
              <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: `rgba(var(--fg-rgb), 0.35)`, minWidth: '22px', textAlign: 'right' }}>
                  P{slot}
                </div>
                <select
                  value={plan?.player_id ?? ''}
                  onChange={e => setPlanPlayer(game.id, slot, e.target.value)}
                  disabled={isSaving}
                  style={{
                    ...CELL_SEL, flex: 1, fontSize: '13px', padding: '8px 10px',
                    opacity: isSaving ? 0.5 : 1,
                    borderColor: restWarning ? restWarning.color : undefined,
                  }}
                >
                  <option value="">— unassigned —</option>
                  {players.map(p => (
                    <option key={p.id} value={p.id}>
                      #{p.jersey_number} {p.last_name}{daysRest(effectiveLastPitched(p.id, game.game_date), game.game_date)}
                    </option>
                  ))}
                </select>
                {restWarning ? (
                  <span style={{ fontSize: '12px', fontWeight: 700, color: restWarning.color, minWidth: '68px', flexShrink: 0 }}>
                    {restWarning.label}
                  </span>
                ) : (
                  <span style={{ minWidth: '68px' }} />
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function renderDesktopPastDetail(game: any) {
    const pitchers = actualPitching[game.id] ?? []
    return (
      <div>
        {/* Header */}
        <div style={{ marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, marginBottom: '4px' }}>
            vs {game.opponent}
          </h2>
          <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)` }}>
            {formatDate(game.game_date)}
          </div>
        </div>

        {pitchers.length === 0 && (
          <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.35)`, padding: '2rem 0' }}>
            No pitchers recorded for this game.
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '2rem' }}>
          {pitchers.map((p, i) => {
            const draftKey = p.slotId
            const isDrafting = draftKey in editingPitch
            const draftVal = editingPitch[draftKey] ?? ''
            const overLimit = pitchLimit != null && p.pitchCount != null && p.pitchCount > pitchLimit
            return (
              <div key={p.slotId} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '10px',
                padding: '12px 16px',
              }}>
                <div style={{ fontSize: '11px', fontWeight: 700, color: `rgba(var(--fg-rgb), 0.3)`, minWidth: '20px' }}>
                  P{i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>{shortName(p.player)}</div>
                  <div style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 700 }}>{p.innings} inn</div>
                </div>
                {isDrafting ? (
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]*"
                    value={draftVal} autoFocus
                    onChange={e => setEditingPitch(prev => ({ ...prev, [draftKey]: e.target.value.replace(/\D/g, '') }))}
                    onBlur={() => savePitchCount(p.slotId, game.id, draftVal)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                      if (e.key === 'Escape') setEditingPitch(prev => { const n = { ...prev }; delete n[draftKey]; return n })
                    }}
                    style={{
                      width: '80px', padding: '6px 8px', borderRadius: '6px',
                      border: '0.5px solid var(--accent)', background: 'var(--bg-input)',
                      color: 'var(--fg)', fontSize: '13px', textAlign: 'center', boxSizing: 'border-box',
                    }}
                  />
                ) : (
                  <button
                    onClick={() => setEditingPitch(prev => ({ ...prev, [draftKey]: p.pitchCount != null ? String(p.pitchCount) : '' }))}
                    title={overLimit ? `Exceeds ${pitchLimit}p limit` : 'Click to edit pitch count'}
                    style={{
                      padding: '6px 14px', borderRadius: '6px', cursor: 'pointer',
                      border: overLimit ? '0.5px solid rgba(232,112,96,0.6)' : p.pitchCount != null ? '0.5px solid var(--border-md)' : '0.5px dashed var(--border-md)',
                      background: overLimit ? 'rgba(232,112,96,0.1)' : 'transparent',
                      color: overLimit ? '#E87060' : p.pitchCount != null ? `rgba(var(--fg-rgb), 0.7)` : `rgba(var(--fg-rgb), 0.25)`,
                      fontSize: '13px', fontWeight: overLimit ? 700 : 400,
                      minWidth: '80px', textAlign: 'center',
                    }}
                  >
                    {p.pitchCount != null ? `${p.pitchCount}p${overLimit ? ' ⚠' : ''}` : '+ pitches'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function renderDesktopDetail() {
    if (!selectedGameId) {
      return (
        <div style={{ padding: '3rem 0', textAlign: 'center', color: `rgba(var(--fg-rgb), 0.3)`, fontSize: '14px' }}>
          Select a game to view pitcher details.
        </div>
      )
    }
    const upcomingGame = upcoming.find(g => g.id === selectedGameId)
    if (upcomingGame) return renderDesktopUpcomingDetail(upcomingGame)
    const pastGame = finalized.find(g => g.id === selectedGameId)
    if (pastGame) return renderDesktopPastDetail(pastGame)
    return null
  }

  function renderSeasonTotals() {
    if (seasonTotalsList.length === 0) return null
    return (
      <div style={{ marginTop: '2rem' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '8px' }}>
          Season pitch totals
        </div>
        <div style={{ background: 'var(--bg-card)', borderRadius: '10px', border: '0.5px solid var(--border-subtle)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '0.5px solid var(--border-subtle)' }}>
                <th style={{ ...HEADER_STYLE, textAlign: 'left', padding: '8px 12px' }}>Pitcher</th>
                <th style={{ ...HEADER_STYLE, padding: '8px 8px' }}>Games</th>
                <th style={{ ...HEADER_STYLE, padding: '8px 8px' }}>Total</th>
                <th style={{ ...HEADER_STYLE, padding: '8px 8px' }}>Avg/game</th>
                {pitchLimit != null && <th style={{ ...HEADER_STYLE, padding: '8px 12px 8px 4px' }}>Over limit</th>}
              </tr>
            </thead>
            <tbody>
              {seasonTotalsList.map((entry, idx) => {
                const avg = entry.games > 0 ? (entry.total / entry.games).toFixed(0) : '—'
                const hasOverLimit = entry.overLimit > 0
                return (
                  <tr key={idx} style={{ borderTop: idx > 0 ? '0.5px solid var(--border-subtle)' : 'none' }}>
                    <td style={{ fontSize: '13px', fontWeight: 500, padding: '8px 12px' }}>{entry.name}</td>
                    <td style={{ fontSize: '12px', textAlign: 'center', padding: '8px', color: `rgba(var(--fg-rgb), 0.5)` }}>{entry.games}</td>
                    <td style={{ fontSize: '13px', fontWeight: 700, textAlign: 'center', padding: '8px',
                      color: hasOverLimit ? '#E87060' : 'var(--fg)' }}>
                      {entry.total > 0 ? `${entry.total}p` : '—'}
                    </td>
                    <td style={{ fontSize: '12px', textAlign: 'center', padding: '8px', color: `rgba(var(--fg-rgb), 0.5)` }}>
                      {entry.total > 0 ? `${avg}p` : '—'}
                    </td>
                    {pitchLimit != null && (
                      <td style={{ fontSize: '12px', textAlign: 'center', padding: '8px 12px 8px 4px' }}>
                        {hasOverLimit
                          ? <span style={{ color: '#E87060', fontWeight: 700 }}>{entry.overLimit}×</span>
                          : <span style={{ color: `rgba(var(--fg-rgb), 0.2)` }}>—</span>}
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────────────────

  return (
    <main
      className="pitching-page-main"
      style={{
        minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
        fontFamily: 'sans-serif', maxWidth: '540px', margin: '0 auto',
        padding: '1.5rem 1rem 6rem',
      }}
    >

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.25rem' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '2px' }}>Pitcher Planner</h1>
          {activeSeason && (
            <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)` }}>
              {(activeSeason as any).team?.name} · {activeSeason.name}
            </div>
          )}
        </div>
        {!loading && selectedSeasonId && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '3px', flexShrink: 0 }}>
            <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.35)`, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
              Pitch limit
            </div>
            <input
              type="text"
              inputMode="numeric"
              placeholder="no limit"
              value={pitchLimitDraft}
              onChange={e => setPitchLimitDraft(e.target.value.replace(/\D/g, ''))}
              onBlur={() => savePitchLimit(pitchLimitDraft)}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              style={{
                width: '72px', padding: '5px 8px', borderRadius: '6px', textAlign: 'center',
                border: pitchLimit != null ? '0.5px solid rgba(232,160,32,0.5)' : '0.5px solid var(--border-md)',
                background: 'var(--bg-input)', color: pitchLimit != null ? '#E8A020' : 'var(--fg)',
                fontSize: '13px', fontWeight: pitchLimit != null ? 700 : 400,
              }}
            />
            {pitchLimit != null && (
              <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)` }}>per game</div>
            )}
          </div>
        )}
      </div>

      {seasons.length > 1 && (
        <select
          value={selectedSeasonId}
          onChange={e => setSelectedSeasonId(e.target.value)}
          style={{
            width: '100%', padding: '9px 12px', borderRadius: '8px',
            border: '0.5px solid var(--border-md)',
            background: 'var(--bg-card)', color: 'var(--fg)',
            fontSize: '14px', fontWeight: 600, cursor: 'pointer',
            marginBottom: '1.25rem', marginTop: '0.75rem',
          }}
        >
          {seasons.map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.team?.name} — {s.name}{s.is_active ? ' ✓' : ''}
            </option>
          ))}
        </select>
      )}

      {loading && (
        <div style={{ textAlign: 'center', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '4rem' }}>Loading…</div>
      )}

      {!loading && upcoming.length === 0 && finalized.length === 0 && (
        <div style={{ textAlign: 'center', marginTop: '4rem', padding: '0 1rem' }}>
          <div style={{ fontSize: '32px', marginBottom: '12px' }}>🎯</div>
          <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--fg)', marginBottom: '8px' }}>
            No games scheduled yet
          </div>
          <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`, lineHeight: 1.6, maxWidth: '280px', margin: '0 auto 20px' }}>
            Pitch counts and rest days will appear here once you have games on your schedule.
          </div>
          <a href="/games" style={{
            display: 'inline-block', fontSize: '13px', fontWeight: 600, padding: '9px 20px', borderRadius: '7px',
            border: '0.5px solid var(--border-md)', background: 'transparent',
            color: `rgba(var(--fg-rgb), 0.6)`, textDecoration: 'none',
          }}>
            Go to Games →
          </a>
        </div>
      )}

      {/* ── Mobile layout (hidden on desktop via CSS) ── */}
      {!loading && (
        <div className="pitching-mobile-layout">
        <>
          {/* ── PAST GAMES ── */}
          {finalized.length > 0 && (
            <div style={{ marginTop: seasons.length <= 1 ? '1rem' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '8px' }}>
                <div style={{
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`,
                }}>
                  Past games
                </div>
                <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.25)` }}>
                  tap pitch count to edit
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                {/* Column headers */}
                <div style={{
                  display: 'grid', gridTemplateColumns: pastGrid,
                  gap: '6px', marginBottom: '4px', padding: '0 2px',
                }}>
                  <div style={{ ...HEADER_STYLE, textAlign: 'left' }}>Game</div>
                  {Array.from({ length: maxActualPitchers }, (_, i) => (
                    <div key={i} style={HEADER_STYLE}>P{i + 1}</div>
                  ))}
                </div>

                {finalized.map((game, idx) => {
                  const pitchers = actualPitching[game.id] ?? []
                  return (
                    <div key={game.id} style={{
                      display: 'grid', gridTemplateColumns: pastGrid,
                      gap: '6px',
                      background: idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card-alt)',
                      borderRadius: '8px', padding: '10px',
                      marginBottom: '4px', alignItems: 'start',
                      border: '0.5px solid var(--border-subtle)',
                    }}>
                      {/* Game info */}
                      <div style={{ paddingTop: '2px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.2 }}>
                          vs {game.opponent}
                        </div>
                        <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '2px' }}>
                          {formatDate(game.game_date)}
                        </div>
                      </div>

                      {/* Pitcher cells */}
                      {Array.from({ length: maxActualPitchers }, (_, i) => {
                        const p = pitchers[i]
                        if (!p) return (
                          <div key={i} style={{ textAlign: 'center', paddingTop: '2px' }}>
                            <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.2)` }}>—</div>
                          </div>
                        )

                        const draftKey = p.slotId
                        const isDrafting = draftKey in editingPitch
                        const draftVal = editingPitch[draftKey] ?? ''
                        const overLimit = pitchLimit != null && p.pitchCount != null && p.pitchCount > pitchLimit

                        return (
                          <div key={i} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--fg)', lineHeight: 1.2, marginBottom: '2px' }}>
                              {shortName(p.player)}
                            </div>
                            <div style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 700, marginBottom: '3px' }}>
                              {p.innings} inn
                            </div>
                            {isDrafting ? (
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={draftVal}
                                autoFocus
                                onChange={e => setEditingPitch(prev => ({
                                  ...prev, [draftKey]: e.target.value.replace(/\D/g, ''),
                                }))}
                                onBlur={() => savePitchCount(p.slotId, game.id, draftVal)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                                  if (e.key === 'Escape') {
                                    setEditingPitch(prev => { const n = { ...prev }; delete n[draftKey]; return n })
                                  }
                                }}
                                style={{
                                  width: '100%', padding: '3px 4px', borderRadius: '4px',
                                  border: '0.5px solid var(--accent)', background: 'var(--bg-input)',
                                  color: 'var(--fg)', fontSize: '11px', textAlign: 'center',
                                  boxSizing: 'border-box',
                                }}
                              />
                            ) : (
                              <button
                                onClick={() => setEditingPitch(prev => ({
                                  ...prev, [draftKey]: p.pitchCount != null ? String(p.pitchCount) : '',
                                }))}
                                title={overLimit ? `Exceeds ${pitchLimit}p limit` : undefined}
                                style={{
                                  width: '100%', padding: '3px 4px', borderRadius: '4px',
                                  border: overLimit
                                    ? '0.5px solid rgba(232,112,96,0.6)'
                                    : p.pitchCount != null
                                      ? '0.5px solid var(--border-md)'
                                      : '0.5px dashed var(--border-md)',
                                  background: overLimit ? 'rgba(232,112,96,0.1)' : 'transparent',
                                  color: overLimit ? '#E87060' : p.pitchCount != null ? `rgba(var(--fg-rgb), 0.6)` : `rgba(var(--fg-rgb), 0.2)`,
                                  fontSize: '11px', cursor: 'pointer',
                                  textAlign: 'center', fontWeight: overLimit ? 700 : 400,
                                }}
                              >
                                {p.pitchCount != null ? `${p.pitchCount}p${overLimit ? ' ⚠' : ''}` : '+ pitches'}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── UPCOMING ── */}
          {upcoming.length > 0 && (
            <div id="pitching-upcoming-anchor" style={{ marginTop: finalized.length > 0 ? '1.75rem' : seasons.length <= 1 ? '1rem' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{
                  fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
                  textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`,
                }}>
                  Upcoming
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    onClick={() => setSlotCount(c => Math.max(1, c - 1))}
                    disabled={slotCount <= 1}
                    style={{
                      width: 24, height: 24, borderRadius: 4, border: '0.5px solid var(--border-md)',
                      background: 'transparent', cursor: slotCount <= 1 ? 'not-allowed' : 'pointer',
                      color: slotCount <= 1 ? `rgba(var(--fg-rgb),0.2)` : `rgba(var(--fg-rgb),0.55)`,
                      fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}
                  >−</button>
                  <span style={{ fontSize: 11, color: `rgba(var(--fg-rgb),0.4)`, minWidth: 48, textAlign: 'center' }}>
                    {slotCount} pitcher{slotCount !== 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => setSlotCount(c => Math.min(MAX_SLOTS, c + 1))}
                    disabled={slotCount >= MAX_SLOTS}
                    style={{
                      width: 24, height: 24, borderRadius: 4, border: '0.5px solid var(--border-md)',
                      background: 'transparent', cursor: slotCount >= MAX_SLOTS ? 'not-allowed' : 'pointer',
                      color: slotCount >= MAX_SLOTS ? `rgba(var(--fg-rgb),0.2)` : `rgba(var(--fg-rgb),0.55)`,
                      fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                    }}
                  >+</button>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: upcomingGrid,
                  gap: '6px', marginBottom: '4px', minWidth: upcomingMinW, padding: '0 2px',
                }}>
                  <div style={{ ...HEADER_STYLE, textAlign: 'left' }}>Game</div>
                  {Array.from({ length: slotCount }, (_, i) => (
                    <div key={i + 1} style={HEADER_STYLE}>P{i + 1}</div>
                  ))}
                </div>

                {upcoming.map((game, idx) => {
                  const gamePlans = plans[game.id] ?? {}
                  return (
                    <div key={game.id} style={{
                      display: 'grid', gridTemplateColumns: upcomingGrid,
                      gap: '6px', minWidth: upcomingMinW,
                      background: idx % 2 === 0 ? 'var(--bg-card)' : 'var(--bg-card-alt)',
                      borderRadius: '8px', padding: '10px',
                      marginBottom: '4px', alignItems: 'center',
                      border: '0.5px solid var(--border-subtle)',
                    }}>
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.2 }}>
                          vs {game.opponent}
                        </div>
                        <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '2px' }}>
                          {formatDate(game.game_date)}
                          {game.location ? ` · ${game.location}` : ''}
                        </div>
                        {(() => {
                          const hasPitchers = (lineupPitchers[game.id]?.length ?? 0) > 0
                          return (
                            <button
                              onClick={() => hasPitchers && syncFromLineup(game.id)}
                              title={hasPitchers ? 'Copy pitcher order from saved lineup' : 'No pitchers assigned in lineup yet — build a lineup first'}
                              style={{
                                marginTop: '5px', fontSize: '9px', fontWeight: 700,
                                padding: '2px 6px', borderRadius: '4px',
                                cursor: hasPitchers ? 'pointer' : 'default',
                                border: `0.5px solid ${hasPitchers ? 'rgba(75,156,211,0.4)' : 'var(--border-subtle)'}`,
                                background: hasPitchers ? 'rgba(75,156,211,0.08)' : 'transparent',
                                color: hasPitchers ? '#4B9CD3' : `rgba(var(--fg-rgb), 0.22)`,
                              }}
                            >
                              ↓ from lineup
                            </button>
                          )
                        })()}
                      </div>

                      {Array.from({ length: slotCount }, (_, i) => {
                        const slot = i + 1
                        const plan = gamePlans[slot]
                        const isSaving = saving === `${game.id}-${slot}`

                        let restWarning: { label: string; color: string } | null = null
                        if (plan?.player_id) {
                          const effLast = effectiveLastPitched(plan.player_id, game.game_date)
                          if (effLast) {
                            const days = Math.round(
                              (new Date(game.game_date + 'T12:00:00').getTime() -
                               new Date(effLast + 'T12:00:00').getTime()) / 86400000
                            )
                            if (days <= 1)      restWarning = { label: days <= 0 ? 'Same day!' : '1d rest ⚠', color: '#E87060' }
                            else if (days <= 3) restWarning = { label: `${days}d rest ⚠`, color: '#E8A020' }
                          }
                        }

                        return (
                          <div key={slot}>
                            <select
                              value={plan?.player_id ?? ''}
                              onChange={e => setPlanPlayer(game.id, slot, e.target.value)}
                              disabled={isSaving}
                              style={{
                                ...CELL_SEL,
                                opacity: isSaving ? 0.5 : 1,
                                borderColor: restWarning ? restWarning.color : undefined,
                              }}
                            >
                              <option value="">—</option>
                              {players.map(p => (
                                <option key={p.id} value={p.id}>
                                  #{p.jersey_number} {p.last_name}{daysRest(effectiveLastPitched(p.id, game.game_date), game.game_date)}
                                </option>
                              ))}
                            </select>
                            {restWarning && (
                              <div style={{
                                fontSize: '9px', fontWeight: 700, textAlign: 'center',
                                marginTop: '2px', color: restWarning.color,
                              }}>
                                {restWarning.label}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── SEASON TOTALS ── */}
          {seasonTotalsList.length > 0 && (
            <div style={{ marginTop: '1.75rem' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '8px' }}>
                Season pitch totals
              </div>
              <div style={{ background: 'var(--bg-card)', borderRadius: '10px', border: '0.5px solid var(--border-subtle)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '0.5px solid var(--border-subtle)' }}>
                      <th style={{ ...HEADER_STYLE, textAlign: 'left', padding: '8px 12px' }}>Pitcher</th>
                      <th style={{ ...HEADER_STYLE, padding: '8px 8px' }}>Games</th>
                      <th style={{ ...HEADER_STYLE, padding: '8px 8px' }}>Total</th>
                      <th style={{ ...HEADER_STYLE, padding: '8px 8px' }}>Avg/game</th>
                      {pitchLimit != null && <th style={{ ...HEADER_STYLE, padding: '8px 12px 8px 4px' }}>Over limit</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {seasonTotalsList.map((entry, idx) => {
                      const avg = entry.games > 0 ? (entry.total / entry.games).toFixed(0) : '—'
                      const hasOverLimit = entry.overLimit > 0
                      return (
                        <tr key={idx} style={{ borderTop: idx > 0 ? '0.5px solid var(--border-subtle)' : 'none' }}>
                          <td style={{ fontSize: '13px', fontWeight: 500, padding: '8px 12px' }}>{entry.name}</td>
                          <td style={{ fontSize: '12px', textAlign: 'center', padding: '8px', color: `rgba(var(--fg-rgb), 0.5)` }}>{entry.games}</td>
                          <td style={{ fontSize: '13px', fontWeight: 700, textAlign: 'center', padding: '8px',
                            color: hasOverLimit ? '#E87060' : 'var(--fg)' }}>
                            {entry.total > 0 ? `${entry.total}p` : '—'}
                          </td>
                          <td style={{ fontSize: '12px', textAlign: 'center', padding: '8px', color: `rgba(var(--fg-rgb), 0.5)` }}>
                            {entry.total > 0 ? `${avg}p` : '—'}
                          </td>
                          {pitchLimit != null && (
                            <td style={{ fontSize: '12px', textAlign: 'center', padding: '8px 12px 8px 4px' }}>
                              {hasOverLimit
                                ? <span style={{ color: '#E87060', fontWeight: 700 }}>{entry.overLimit}×</span>
                                : <span style={{ color: `rgba(var(--fg-rgb), 0.2)` }}>—</span>}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
        </div>
      )}

      {/* ── Desktop two-panel layout (hidden on mobile via CSS) ── */}
      {!loading && (upcoming.length > 0 || finalized.length > 0) && (
        <div className="pitching-desktop-layout">
          <div className="pitching-list-panel">
            {renderDesktopGameList()}
          </div>
          <div className="pitching-detail-panel">
            {renderDesktopDetail()}
            {renderSeasonTotals()}
          </div>
        </div>
      )}
    </main>
  )
}
