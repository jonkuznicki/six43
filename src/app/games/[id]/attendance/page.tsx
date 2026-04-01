'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function AttendancePage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const router = useRouter()
  const [game, setGame] = useState<any>(null)
  const [playerRows, setPlayerRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Set of player IDs marked absent
  const [absentIds, setAbsentIds] = useState<Set<string>>(new Set())

  useEffect(() => { load() }, [])

  async function load() {
    const { data: gameData } = await supabase
      .from('games')
      .select('id, opponent, game_date, season_id, innings_played')
      .eq('id', params.id)
      .single()
    setGame(gameData)

    if (!gameData) { setLoading(false); return }

    // Get the team for this game's season
    const { data: season } = await supabase
      .from('seasons')
      .select('team_id')
      .eq('id', gameData.season_id)
      .single()

    if (!season) { setLoading(false); return }

    // All active players for this season's roster
    const { data: players } = await supabase
      .from('players')
      .select('id, first_name, last_name, jersey_number, batting_pref_order')
      .eq('season_id', gameData.season_id)
      .eq('status', 'active')
      .order('batting_pref_order', { ascending: true, nullsFirst: false })

    // Existing slots for this game (if any)
    const { data: existingSlots } = await supabase
      .from('lineup_slots')
      .select('id, player_id, availability, batting_order, inning_positions')
      .eq('game_id', params.id)

    const slotMap = new Map((existingSlots ?? []).map((s: any) => [s.player_id, s]))

    // Merge: every active player gets a row, with their existing slot data if present
    const rows = (players ?? []).map((p: any, i: number) => {
      const slot = slotMap.get(p.id)
      return {
        player: p,
        slotId: slot?.id ?? null,
        availability: slot?.availability ?? 'available',
        battingOrder: slot?.batting_order ?? i + 1,
        inningPositions: slot?.inning_positions ?? null,
      }
    })

    setPlayerRows(rows)
    setAbsentIds(new Set(
      rows.filter(r => r.availability === 'absent').map(r => r.player.id)
    ))
    setLoading(false)
  }

  function toggle(playerId: string) {
    setAbsentIds(prev => {
      const next = new Set(prev)
      if (next.has(playerId)) next.delete(playerId)
      else next.add(playerId)
      return next
    })
  }

  async function continueToLineup() {
    setSaving(true)
    const emptyPositions = [null, null, null, null, null, null, null, null, null]

    await Promise.all(playerRows.map((row, i) => {
      const isAbsent = absentIds.has(row.player.id)
      const newAvail = isAbsent ? 'absent' : 'available'

      if (row.slotId) {
        // Only update if availability changed
        if ((row.availability === 'absent') !== isAbsent) {
          return supabase.from('lineup_slots').update({
            availability: newAvail,
            inning_positions: isAbsent ? emptyPositions : row.inningPositions,
          }).eq('id', row.slotId)
        }
        return Promise.resolve()
      } else {
        // Create new slot
        return supabase.from('lineup_slots').insert({
          game_id: params.id,
          player_id: row.player.id,
          batting_order: i + 1,
          availability: newAvail,
          inning_positions: emptyPositions,
        })
      }
    }))

    router.push(`/games/${params.id}/lineup`)
  }

  if (loading) return (
    <main style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--fg)',
      fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading...
    </main>
  )

  const presentCount = playerRows.length - absentIds.size

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '480px', margin: '0 auto', padding: '1.5rem 1rem 6rem' }}>

      <Link href={`/games/${params.id}`} style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`,
        textDecoration: 'none', display: 'block', marginBottom: '1rem' }}>
        ‹ vs {game?.opponent}
      </Link>

      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>Who's playing?</h1>
      <p style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`, marginBottom: '1.5rem' }}>
        Tap to mark a player absent.
      </p>

      {playerRows.length === 0 && (
        <div style={{ textAlign: 'center', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '3rem', fontSize: '14px' }}>
          No active players on this team's roster.{' '}
          <Link href="/settings" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            Manage roster in Settings →
          </Link>
        </div>
      )}

      <div style={{ marginBottom: '1.25rem' }}>
        {playerRows.map(row => {
          const player = row.player
          const absent = absentIds.has(player.id)
          return (
            <button
              key={player.id}
              onClick={() => toggle(player.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                width: '100%', padding: '12px 14px', marginBottom: '6px',
                background: absent ? 'rgba(192,57,43,0.06)' : 'var(--bg-card)',
                border: absent ? '0.5px solid rgba(192,57,43,0.2)' : '0.5px solid var(--border)',
                borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
              }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '13px', fontWeight: 700,
                background: absent ? 'rgba(192,57,43,0.15)' : 'rgba(45,106,53,0.15)',
                color: absent ? '#E87060' : '#6DB875',
              }}>
                {absent ? '✕' : '✓'}
              </div>
              <span style={{
                flex: 1, fontSize: '15px', fontWeight: 500,
                color: absent ? `rgba(var(--fg-rgb), 0.35)` : 'var(--fg)',
                textDecoration: absent ? 'line-through' : 'none',
              }}>
                {player.first_name} {player.last_name}
              </span>
              <span style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.3)`, flexShrink: 0 }}>
                #{player.jersey_number}
              </span>
            </button>
          )
        })}
      </div>

      {playerRows.length > 0 && (
        <>
          <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`,
            textAlign: 'center', marginBottom: '12px' }}>
            {presentCount} playing{absentIds.size > 0 ? ` · ${absentIds.size} absent` : ''}
          </div>
          <button onClick={continueToLineup} disabled={saving || presentCount === 0} style={{
            width: '100%', padding: '14px', borderRadius: '8px', border: 'none',
            background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '15px', fontWeight: 700,
            cursor: (saving || presentCount === 0) ? 'not-allowed' : 'pointer',
            opacity: (saving || presentCount === 0) ? 0.7 : 1,
          }}>
            {saving ? 'Saving…' : 'Continue to lineup →'}
          </button>
        </>
      )}
    </main>
  )
}
