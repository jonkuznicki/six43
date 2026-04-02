'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'

type PlanSlot = { id?: string; player_id: string; notes: string }

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export default function PitchingPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [seasons, setSeasons] = useState<any[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState('')
  const [activeSeason, setActiveSeason] = useState<any>(null)
  const [players, setPlayers] = useState<any[]>([])
  const [upcoming, setUpcoming] = useState<any[]>([])
  const [finalized, setFinalized] = useState<any[]>([])
  // plans[gameId][slot 1-4] = { id?, player_id, notes }
  const [plans, setPlans] = useState<Record<string, Record<number, PlanSlot>>>({})
  // actualPitching[gameId] = [{ player, innings }]
  const [actualPitching, setActualPitching] = useState<Record<string, { player: any; innings: number }[]>>({})
  const [saving, setSaving] = useState<string | null>(null)

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

    const upcomingGames = (gameRows ?? []).filter((g: any) => g.status !== 'final')
    const finalizedGames = (gameRows ?? []).filter((g: any) => g.status === 'final')
    setUpcoming(upcomingGames)
    setFinalized([...finalizedGames].reverse()) // most recent first

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

    // Compute actual pitching from lineup_slots for finalized games
    const finalizedIds = finalizedGames.map((g: any) => g.id)
    if (finalizedIds.length) {
      const { data: slotRows } = await supabase
        .from('lineup_slots')
        .select('game_id, player_id, inning_positions, availability, player:players(first_name, last_name, jersey_number)')
        .in('game_id', finalizedIds)

      const actualMap: Record<string, { player: any; innings: number }[]> = {}
      for (const slot of slotRows ?? []) {
        if (slot.availability === 'absent') continue
        const game = finalizedGames.find((g: any) => g.id === slot.game_id)
        const maxInn = game?.innings_played ?? 9
        const innings = (slot.inning_positions ?? [])
          .slice(0, maxInn)
          .filter((p: string | null) => p === 'P').length
        if (innings > 0) {
          if (!actualMap[slot.game_id]) actualMap[slot.game_id] = []
          actualMap[slot.game_id].push({ player: slot.player, innings })
        }
      }
      for (const id of Object.keys(actualMap)) {
        actualMap[id].sort((a, b) => b.innings - a.innings)
      }
      setActualPitching(actualMap)
    }

    setLoading(false)
  }

  async function setPlanPlayer(gameId: string, slot: number, playerId: string) {
    const key = `${gameId}-${slot}`
    setSaving(key)
    const existing = plans[gameId]?.[slot]

    if (!playerId) {
      if (existing?.id) {
        await supabase.from('pitcher_plans').delete().eq('id', existing.id)
      }
      setPlans(prev => {
        const gamePlans = { ...(prev[gameId] ?? {}) }
        delete gamePlans[slot]
        return { ...prev, [gameId]: gamePlans }
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
        pitcher_slot: slot, is_planned: true, notes: null,
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

  async function savePlanNotes(gameId: string, slot: number, notes: string) {
    const existing = plans[gameId]?.[slot]
    if (!existing?.id) return
    await supabase.from('pitcher_plans').update({ notes: notes || null }).eq('id', existing.id)
    setPlans(prev => ({
      ...prev,
      [gameId]: { ...prev[gameId], [slot]: { ...existing, notes } },
    }))
  }

  const sel: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: '6px',
    border: '0.5px solid var(--border-md)', background: 'var(--bg-input)',
    color: 'var(--fg)', fontSize: '13px', boxSizing: 'border-box',
  }

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '480px', margin: '0 auto',
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

      {/* Season picker */}
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
        <div style={{ textAlign: 'center', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '4rem' }}>
          Loading…
        </div>
      )}

      {!loading && upcoming.length === 0 && finalized.length === 0 && (
        <div style={{ textAlign: 'center', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '4rem', fontSize: '14px' }}>
          No games scheduled yet.
        </div>
      )}

      {!loading && (
        <>
          {/* ── UPCOMING ── */}
          {upcoming.length > 0 && (
            <>
              <div style={{
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`,
                marginBottom: '8px', marginTop: seasons.length <= 1 ? '1rem' : 0,
              }}>
                Upcoming
              </div>

              {upcoming.map(game => {
                const gamePlans = plans[game.id] ?? {}
                return (
                  <div key={game.id} style={{
                    background: 'var(--bg-card)', border: '0.5px solid var(--border)',
                    borderRadius: '10px', padding: '12px 14px', marginBottom: '10px',
                  }}>
                    {/* Game header */}
                    <div style={{ marginBottom: '10px' }}>
                      <div style={{ fontSize: '15px', fontWeight: 600 }}>vs {game.opponent}</div>
                      <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '2px' }}>
                        {formatDate(game.game_date)}{game.location ? ` · ${game.location}` : ''}
                      </div>
                    </div>

                    {/* Pitcher slots */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                      {[1, 2, 3, 4].map(slot => {
                        const plan = gamePlans[slot]
                        const key = `${game.id}-${slot}`
                        const isSaving = saving === key
                        return (
                          <div key={slot} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {/* Slot label */}
                            <div style={{
                              width: '24px', height: '24px', borderRadius: '50%', flexShrink: 0,
                              background: plan?.player_id ? 'rgba(232,160,32,0.15)' : 'var(--bg-input)',
                              border: `0.5px solid ${plan?.player_id ? 'rgba(232,160,32,0.4)' : 'var(--border-md)'}`,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '10px', fontWeight: 700,
                              color: plan?.player_id ? 'var(--accent)' : `rgba(var(--fg-rgb), 0.3)`,
                            }}>
                              P{slot}
                            </div>

                            {/* Player dropdown */}
                            <select
                              value={plan?.player_id ?? ''}
                              onChange={e => setPlanPlayer(game.id, slot, e.target.value)}
                              disabled={isSaving}
                              style={{ ...sel, flex: 1, opacity: isSaving ? 0.6 : 1 }}
                            >
                              <option value="">— Select pitcher —</option>
                              {players.map(p => (
                                <option key={p.id} value={p.id}>
                                  #{p.jersey_number} {p.first_name} {p.last_name}
                                </option>
                              ))}
                            </select>

                            {/* Notes (only shown when player is set) */}
                            {plan?.player_id && (
                              <input
                                type="text"
                                placeholder="notes"
                                defaultValue={plan.notes}
                                onBlur={e => savePlanNotes(game.id, slot, e.target.value)}
                                style={{
                                  width: '80px', flexShrink: 0, padding: '8px 8px',
                                  borderRadius: '6px', border: '0.5px solid var(--border-md)',
                                  background: 'var(--bg-input)', color: 'var(--fg)',
                                  fontSize: '11px', boxSizing: 'border-box',
                                }}
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </>
          )}

          {/* ── PAST GAMES ── */}
          {finalized.length > 0 && (
            <>
              <div style={{
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`,
                marginBottom: '8px', marginTop: upcoming.length > 0 ? '1.5rem' : '1rem',
              }}>
                Past games
              </div>

              {finalized.map(game => {
                const pitchers = actualPitching[game.id] ?? []
                return (
                  <div key={game.id} style={{
                    background: 'var(--bg-card)', border: '0.5px solid var(--border)',
                    borderRadius: '10px', padding: '12px 14px', marginBottom: '8px',
                  }}>
                    <div style={{ marginBottom: pitchers.length > 0 ? '10px' : 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 600 }}>vs {game.opponent}</div>
                      <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '2px' }}>
                        {formatDate(game.game_date)}{game.location ? ` · ${game.location}` : ''}
                      </div>
                    </div>

                    {pitchers.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {pitchers.map(({ player, innings }) => (
                          <div key={player?.jersey_number} style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                          }}>
                            <span style={{
                              fontSize: '11px', color: `rgba(var(--fg-rgb), 0.3)`,
                              width: '22px', textAlign: 'right', flexShrink: 0,
                            }}>
                              #{player?.jersey_number}
                            </span>
                            <span style={{ fontSize: '13px', fontWeight: 500, minWidth: '120px' }}>
                              {player?.first_name} {player?.last_name}
                            </span>
                            {/* Innings bar */}
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <div style={{
                                height: '6px', borderRadius: '3px',
                                background: 'rgba(232,160,32,0.35)',
                                width: `${Math.round((innings / (game.innings_played ?? 6)) * 100)}%`,
                                minWidth: '12px',
                              }} />
                              <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 700, flexShrink: 0 }}>
                                {innings} inn
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.25)`, marginTop: '4px' }}>
                        No pitching data in lineup
                      </div>
                    )}
                  </div>
                )
              })}
            </>
          )}
        </>
      )}
    </main>
  )
}
