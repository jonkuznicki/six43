'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'

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

  useEffect(() => { init() }, [])
  useEffect(() => { if (selectedSeasonId) loadSeason(selectedSeasonId) }, [selectedSeasonId])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: teams } = await supabase.from('teams').select('id').eq('is_active', true)
    const teamIds = (teams ?? []).map((t: any) => t.id)
    if (!teamIds.length) { setLoading(false); return }
    const { data: seasonRows } = await supabase
      .from('seasons')
      .select('id, name, is_active, team:teams(name)')
      .in('team_id', teamIds)
      .order('created_at', { ascending: false })
    setSeasons(seasonRows ?? [])
    const active = (seasonRows ?? []).find((s: any) => s.is_active) ?? seasonRows?.[0]
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

  // Compute how many pitcher slots to show for upcoming games
  const maxFilledSlot = Math.max(
    MIN_SLOTS,
    ...Object.values(plans).flatMap(g => Object.keys(g).map(Number))
  )
  const upcomingSlotCount = Math.min(MAX_SLOTS, maxFilledSlot + 1)

  // Compute how many columns to show for past games
  const maxActualPitchers = Math.max(
    MIN_SLOTS,
    ...Object.values(actualPitching).map(arr => arr.length)
  )

  const upcomingGrid = `140px repeat(${upcomingSlotCount}, 1fr)`
  const pastGrid     = `140px repeat(${maxActualPitchers}, 1fr)`
  const upcomingMinW = `${300 + upcomingSlotCount * 80}px`
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
              <div style={{
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '8px',
              }}>
                Upcoming
              </div>

              <div style={{ overflowX: 'auto' }}>
                <div style={{
                  display: 'grid', gridTemplateColumns: upcomingGrid,
                  gap: '6px', marginBottom: '4px', minWidth: upcomingMinW, padding: '0 2px',
                }}>
                  <div style={{ ...HEADER_STYLE, textAlign: 'left' }}>Game</div>
                  {Array.from({ length: upcomingSlotCount }, (_, i) => (
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
                      </div>

                      {Array.from({ length: upcomingSlotCount }, (_, i) => {
                        const slot = i + 1
                        const plan = gamePlans[slot]
                        const isSaving = saving === `${game.id}-${slot}`
                        return (
                          <select
                            key={slot}
                            value={plan?.player_id ?? ''}
                            onChange={e => setPlanPlayer(game.id, slot, e.target.value)}
                            disabled={isSaving}
                            style={{ ...CELL_SEL, opacity: isSaving ? 0.5 : 1 }}
                          >
                            <option value="">—</option>
                            {players.map(p => (
                              <option key={p.id} value={p.id}>
                                #{p.jersey_number} {p.last_name}{daysRest(lastPitched[p.id], game.game_date)}
                              </option>
                            ))}
                          </select>
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
