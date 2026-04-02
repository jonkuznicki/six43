'use client'

import { useState } from 'react'
import { createClient } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'

interface Props {
  game: {
    id: string
    season_id: string
    opponent: string
    location: string | null
    innings_played: number
    game_time: string | null
  }
}

export default function DuplicateGameButton({ game }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [showSheet, setShowSheet] = useState(false)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)

  async function duplicate() {
    setSaving(true)

    // Create the new game
    const { data: newGame, error } = await supabase
      .from('games')
      .insert({
        season_id: game.season_id,
        opponent: game.opponent,
        game_date: date,
        game_time: game.game_time,
        location: game.location,
        innings_played: game.innings_played,
        status: 'scheduled',
      })
      .select()
      .single()

    if (error || !newGame) {
      setSaving(false)
      return
    }

    // Copy lineup slots from original game (same players/batting order, blank positions)
    const { data: slots } = await supabase
      .from('lineup_slots')
      .select('player_id, batting_order, availability')
      .eq('game_id', game.id)

    if (slots && slots.length > 0) {
      const blankPositions = Array(9).fill(null)
      await supabase.from('lineup_slots').insert(
        slots.map(s => ({
          game_id: newGame.id,
          player_id: s.player_id,
          batting_order: s.batting_order,
          availability: 'available',
          inning_positions: blankPositions,
        }))
      )
    }

    router.push(`/games/${newGame.id}`)
  }

  return (
    <>
      <button
        onClick={() => setShowSheet(true)}
        style={{
          width: '100%', padding: '12px', borderRadius: '8px',
          border: '0.5px solid var(--border-md)', background: 'transparent',
          color: `rgba(var(--fg-rgb), 0.7)`, fontSize: '13px',
          cursor: 'pointer', textAlign: 'center',
        }}
      >
        Duplicate game
      </button>

      {showSheet && (
        <div
          onClick={() => !saving && setShowSheet(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg2)', borderRadius: '16px 16px 0 0',
              padding: '1.25rem 1rem 2.5rem', width: '100%', maxWidth: '480px',
              border: '0.5px solid var(--border)',
            }}
          >
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '2px' }}>
              Duplicate game
            </div>
            <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '1.5rem' }}>
              vs {game.opponent} · same roster & settings, blank lineup
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '5px' }}>
                New date
              </div>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: '6px',
                  border: '0.5px solid var(--border-md)',
                  background: 'var(--bg-input)', color: 'var(--fg)',
                  fontSize: '14px', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setShowSheet(false)}
                disabled={saving}
                style={{
                  flex: 1, padding: '12px', borderRadius: '6px',
                  border: '0.5px solid var(--border-strong)', background: 'transparent',
                  color: `rgba(var(--fg-rgb), 0.6)`, fontSize: '13px', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={duplicate}
                disabled={saving || !date}
                style={{
                  flex: 2, padding: '12px', borderRadius: '6px', border: 'none',
                  background: 'var(--accent)', color: 'var(--accent-text)',
                  fontSize: '13px', fontWeight: 700,
                  cursor: (saving || !date) ? 'not-allowed' : 'pointer',
                  opacity: (saving || !date) ? 0.7 : 1,
                }}
              >
                {saving ? 'Creating…' : 'Create duplicate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
