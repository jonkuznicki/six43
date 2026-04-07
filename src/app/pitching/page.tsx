'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { setSelectedTeamId } from '../../lib/selectedTeam'

type PlanSlot = { id?: string; player_id: string; notes: string }
type ActualPitcher = { player: any; playerId: string; slotId: string; innings: number; pitchCount: number | null }

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
  const [lineupPitchers, setLineupPitchers] = useState<Record<string, string[]>>({}) // gameId → ordered player_ids

  useEffect(() => { init() }, [])
  useEffect(() => {
    if (!selectedSeasonId) return
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
      .select('id, name, is_active, team_id, team:teams(name)')
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
    setFinalized([...finalizedGames].reverse())

    // Load pitcher plans for upcoming games
    const upcomingIds = upcomingGames.map((g: any) => g.id)
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

      // Load lineup P-assignments for upcoming games (to enable "sync from lineup")
      const { data: upLineupSlots } = await supabase
        .from('lineup_slots')
        .select('game_id, player_id, inning_positions, availability')
        .in('game_id', upcomingIds)
      const lpMap: Record<string, string[]> = {}
      for (const game of upcomingGames) {
        const gameSlots = (upLineupSlots ?? []).filter(
          (s: any) => s.game_id === game.id && s.availability !== 'absent'
        )
        const pitchers: { playerId: string; count: number }[] = []
        for (const slot of gameSlots) {
          const count = (slot.inning_positions ?? []).filter((p: string | null) => p === 'P').length
          if (count > 0) pitchers.push({ playerId: slot.player_id, count })
        }
        pitchers.sort((a, b) => b.count - a.count)
        if (pitchers.length) lpMap[game.id] = pitchers.map(p => p.playerId)
      }
      setLineupPitchers(lpMap)
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
        const innings = (slot.inning_positions ?? [])
          .slice(0, maxInn)
          .filter((p: string | null) => p === 'P').length
        if (innings > 0) {
          if (!actualMap[slot.game_id]) actualMap[slot.game_id] = []
          actualMap[slot.game_id].push({
            player: slot.player,
            playerId: slot.player_id,
            slotId: slot.id,
            innings,
            pitchCount: slot.pitch_count ?? null,
          })
          if (game && (!lastPitchedMap[slot.player_id] || game.game_date > lastPitchedMap[slot.player_id])) {
            lastPitchedMap[slot.player_id] = game.game_date
          }
        }
      }
      for (const id of Object.keys(actualMap)) {
        actualMap[id].sort((a, b) => b.innings - a.innings)
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

  async function syncFromLineup(gameId: string) {
    const pitcherIds = lineupPitchers[gameId] ?? []
    for (let i = 0; i < Math.min(pitcherIds.length, slotCount); i++) {
      await setPlanPlayer(gameId, i + 1, pitcherIds[i])
    }
  }

  // Compute how many columns to show for past games
  const maxActualPitchers = Math.max(
    MIN_SLOTS,
    ...Object.values(actualPitching).map(arr => arr.length)
  )

  const upcomingGrid = `140px repeat(${slotCount}, 1fr)`
  const pastGrid     = `140px repeat(${maxActualPitchers}, 1fr)`
  const upcomingMinW = `${300 + slotCount * 80}px`
  const pastMinW     = `${300 + maxActualPitchers * 80}px`

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '540px', margin: '0 auto',
      padding: '1.5rem 1rem 6rem',
    }}>

      {/* Header */}
      <div style={{ marginBottom: '0.25rem' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '2px' }}>Pitcher Planner</h1>
        {activeSeason && (
          <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)` }}>
            {(activeSeason as any).team?.name} · {activeSeason.name}
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
        <div style={{ textAlign: 'center', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '4rem', fontSize: '14px' }}>
          No games scheduled yet.
        </div>
      )}

      {!loading && (
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
                  gap: '6px', marginBottom: '4px', minWidth: pastMinW, padding: '0 2px',
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
                      gap: '6px', minWidth: pastMinW,
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

                      {/* Pitcher cells — as many as pitched */}
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

                        return (
                          <div key={i} style={{ textAlign: 'center' }}>
                            {/* Name */}
                            <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--fg)', lineHeight: 1.2, marginBottom: '2px' }}>
                              {shortName(p.player)}
                            </div>
                            {/* Innings */}
                            <div style={{ fontSize: '10px', color: 'var(--accent)', fontWeight: 700, marginBottom: '3px' }}>
                              {p.innings} inn
                            </div>
                            {/* Pitch count — editable */}
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
                                style={{
                                  width: '100%', padding: '3px 4px', borderRadius: '4px',
                                  border: p.pitchCount != null
                                    ? '0.5px solid var(--border-md)'
                                    : '0.5px dashed var(--border-md)',
                                  background: 'transparent',
                                  color: p.pitchCount != null ? `rgba(var(--fg-rgb), 0.6)` : `rgba(var(--fg-rgb), 0.2)`,
                                  fontSize: '11px', cursor: 'pointer',
                                  textAlign: 'center',
                                }}
                              >
                                {p.pitchCount != null ? `${p.pitchCount}p` : '+ pitches'}
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
            <div style={{ marginTop: finalized.length > 0 ? '1.75rem' : seasons.length <= 1 ? '1rem' : 0 }}>
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
                        {lineupPitchers[game.id]?.length > 0 && (
                          <button
                            onClick={() => syncFromLineup(game.id)}
                            style={{
                              marginTop: '5px', fontSize: '9px', fontWeight: 700,
                              padding: '2px 6px', borderRadius: '4px', cursor: 'pointer',
                              border: '0.5px solid var(--border-md)',
                              background: 'transparent', color: `rgba(var(--fg-rgb), 0.5)`,
                            }}
                          >
                            ↓ from lineup
                          </button>
                        )}
                      </div>

                      {Array.from({ length: slotCount }, (_, i) => {
                        const slot = i + 1
                        const plan = gamePlans[slot]
                        const isSaving = saving === `${game.id}-${slot}`

                        // Rest-day warning for the planned pitcher
                        let restWarning: { label: string; color: string } | null = null
                        if (plan?.player_id && lastPitched[plan.player_id]) {
                          const last = new Date(lastPitched[plan.player_id] + 'T12:00:00')
                          const gd   = new Date(game.game_date + 'T12:00:00')
                          const days = Math.round((gd.getTime() - last.getTime()) / 86400000)
                          if (days <= 1)      restWarning = { label: days <= 0 ? 'Same day!' : '1d rest ⚠', color: '#E87060' }
                          else if (days <= 3) restWarning = { label: `${days}d rest ⚠`, color: '#E8A020' }
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
                                borderColor: restWarning
                                  ? restWarning.color
                                  : undefined,
                              }}
                            >
                              <option value="">—</option>
                              {players.map(p => (
                                <option key={p.id} value={p.id}>
                                  #{p.jersey_number} {p.last_name}{daysRest(lastPitched[p.id], game.game_date)}
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
        </>
      )}
    </main>
  )
}
