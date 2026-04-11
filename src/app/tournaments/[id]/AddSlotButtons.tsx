'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase'

type GameType = 'pool_play' | 'bracket'

export default function AddSlotButtons({
  tournamentId,
  seasonId,
  inningsPerGame,
  startDate,
  endDate,
  poolCount,
  bracketCount,
}: {
  tournamentId:   string
  seasonId:       string
  inningsPerGame: number
  startDate:      string
  endDate:        string
  poolCount:      number
  bracketCount:   number
}) {
  const supabase = createClient()
  const router   = useRouter()
  const [adding, setAdding] = useState<GameType | null>(null)

  async function addSlot(type: GameType) {
    setAdding(type)
    const count    = type === 'pool_play' ? poolCount + 1 : bracketCount + 1
    const opponent = type === 'pool_play' ? `Pool Play ${count}` : `Bracket Game ${count}`

    await supabase.from('games').insert({
      season_id:      seasonId,
      tournament_id:  tournamentId,
      opponent,
      game_date:      startDate,
      game_type:      type,
      is_placeholder: true,
      status:         'scheduled',
      innings_played: inningsPerGame,
    })

    setAdding(null)
    router.refresh()
  }

  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <button onClick={() => addSlot('pool_play')} disabled={!!adding} style={{
        flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
        cursor: adding ? 'not-allowed' : 'pointer',
        border: '0.5px solid rgba(59,109,177,0.4)',
        background: 'rgba(59,109,177,0.08)', color: '#80B0E8',
        opacity: adding ? 0.6 : 1,
      }}>
        {adding === 'pool_play' ? 'Adding…' : '+ Pool play'}
      </button>
      <button onClick={() => addSlot('bracket')} disabled={!!adding} style={{
        flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
        cursor: adding ? 'not-allowed' : 'pointer',
        border: '0.5px solid rgba(232,160,32,0.4)',
        background: 'rgba(232,160,32,0.08)', color: 'var(--accent)',
        opacity: adding ? 0.6 : 1,
      }}>
        {adding === 'bracket' ? 'Adding…' : '+ Bracket game'}
      </button>
    </div>
  )
}
