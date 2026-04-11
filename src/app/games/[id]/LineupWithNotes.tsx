'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase'

const POSITION_COLORS: Record<string, { bg: string; color: string }> = {
  P:     { bg: 'rgba(232,160,32,0.2)',    color: '#E8C060' },
  C:     { bg: 'rgba(192,80,120,0.2)',    color: '#E090B0' },
  '1B':  { bg: 'rgba(59,109,177,0.2)',    color: '#80B0E8' },
  '2B':  { bg: 'rgba(59,109,177,0.2)',    color: '#80B0E8' },
  SS:    { bg: 'rgba(59,109,177,0.2)',     color: '#80B0E8' },
  '3B':  { bg: 'rgba(59,109,177,0.2)',    color: '#80B0E8' },
  LF:    { bg: 'rgba(45,106,53,0.2)',     color: '#6DB875' },
  CF:    { bg: 'rgba(45,106,53,0.2)',     color: '#6DB875' },
  LC:    { bg: 'rgba(45,106,53,0.2)',     color: '#6DB875' },
  RC:    { bg: 'rgba(45,106,53,0.2)',     color: '#6DB875' },
  RF:    { bg: 'rgba(45,106,53,0.2)',     color: '#6DB875' },
  Bench: { bg: 'var(--bg-card)',           color: `rgba(var(--fg-rgb), 0.4)` },
}

function PositionChip({ position }: { position: string | null }) {
  if (!position) return (
    <span style={{
      fontSize: '10px', padding: '2px 6px', borderRadius: '3px',
      background: 'var(--bg-card)', color: `rgba(var(--fg-rgb), 0.2)`,
      border: '0.5px dashed var(--border-md)',
    }}>—</span>
  )
  const c = POSITION_COLORS[position] ?? POSITION_COLORS.Bench
  return (
    <span style={{
      fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '3px',
      background: c.bg, color: c.color, minWidth: '28px',
      textAlign: 'center', display: 'inline-block',
    }}>
      {position === 'Bench' ? 'B' : position}
    </span>
  )
}

type Slot = {
  id: string
  player_id: string
  inning_positions: (string | null)[]
  player: {
    first_name: string
    last_name: string
    jersey_number: number | null
  }
}

type Props = {
  slots: Slot[]
  inningCount: number
  seasonId: string
  gameDate: string  // YYYY-MM-DD
}

export default function LineupWithNotes({ slots, inningCount, seasonId, gameDate }: Props) {
  const innings = Array.from({ length: inningCount }, (_, i) => i)
  const supabase = createClient()

  const [notePlayer, setNotePlayer] = useState<Slot | null>(null)
  const [noteBody, setNoteBody] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)

  function openModal(slot: Slot) {
    setNotePlayer(slot)
    setNoteBody('')
    setSavedId(null)
  }

  function closeModal() {
    setNotePlayer(null)
    setNoteBody('')
    setSavedId(null)
  }

  async function saveNote() {
    if (!notePlayer || !noteBody.trim()) return
    setSaving(true)
    const { data, error } = await supabase
      .from('player_eval_notes')
      .insert({
        player_id: notePlayer.player_id,
        season_id: seasonId,
        note_date: gameDate,
        body: noteBody.trim(),
      })
      .select()
      .single()
    setSaving(false)
    if (!error && data) {
      setSavedId(data.id)
      setNoteBody('')
    }
  }

  return (
    <>
      {/* Inning header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `24px 1fr repeat(${inningCount}, 32px)`,
        gap: '4px', padding: '0 8px', marginBottom: '6px',
      }}>
        <span style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)` }}>#</span>
        <span style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)` }}>Player</span>
        {innings.map(i => (
          <span key={i} style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)`, textAlign: 'center' }}>
            {i + 1}
          </span>
        ))}
      </div>

      {slots.map((slot) => (
        <div key={slot.id} style={{
          display: 'grid',
          gridTemplateColumns: `24px 1fr repeat(${inningCount}, 32px)`,
          gap: '4px', padding: '8px',
          background: 'var(--bg-card)',
          border: '0.5px solid var(--border-subtle)',
          borderRadius: '6px', marginBottom: '4px', alignItems: 'center',
        }}>
          <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.3)` }}>
            {slot.player?.jersey_number}
          </span>
          <button
            onClick={() => openModal(slot)}
            style={{
              fontSize: '13px', background: 'none', border: 'none', padding: 0,
              color: 'var(--fg)', cursor: 'pointer', textAlign: 'left',
              textDecoration: 'underline', textDecorationStyle: 'dotted',
              textDecorationColor: `rgba(var(--fg-rgb), 0.25)`,
              textUnderlineOffset: '3px',
            }}
          >
            {slot.player?.first_name[0]}. {slot.player?.last_name}
          </button>
          {innings.map(i => (
            <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
              <PositionChip position={slot.inning_positions[i]} />
            </div>
          ))}
        </div>
      ))}

      {/* Note modal */}
      {notePlayer && (
        <div
          onClick={closeModal}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg2)', borderRadius: '16px 16px 0 0', padding: '1.5rem',
              width: '100%', maxWidth: '480px', border: '0.5px solid var(--border)',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>
                  {notePlayer.player?.first_name} {notePlayer.player?.last_name}
                </div>
                <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '2px' }}>
                  Player note · {gameDate}
                </div>
              </div>
              <button
                onClick={closeModal}
                style={{
                  fontSize: '22px', lineHeight: 1, background: 'none', border: 'none',
                  color: `rgba(var(--fg-rgb), 0.35)`, cursor: 'pointer', padding: '0 4px',
                }}
              >×</button>
            </div>

            {savedId && (
              <div style={{
                fontSize: '12px', color: '#6DB875',
                background: 'rgba(45,106,53,0.15)', border: '0.5px solid rgba(45,106,53,0.3)',
                borderRadius: '6px', padding: '8px 12px', marginBottom: '12px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>Note saved</span>
                <Link
                  href="/roster"
                  style={{ color: '#6DB875', fontWeight: 600, textDecoration: 'underline', textUnderlineOffset: '2px' }}
                >
                  View in Roster →
                </Link>
              </div>
            )}

            <textarea
              value={noteBody}
              onChange={e => setNoteBody(e.target.value)}
              placeholder="Write a note while it's fresh…"
              rows={4}
              autoFocus
              style={{
                width: '100%', boxSizing: 'border-box',
                background: 'var(--bg-input)', border: '0.5px solid var(--border-md)',
                borderRadius: '8px', padding: '10px 12px',
                color: 'var(--fg)', fontSize: '14px', lineHeight: 1.5,
                resize: 'none', outline: 'none', fontFamily: 'inherit',
              }}
            />

            <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
              <button
                onClick={closeModal}
                style={{
                  flex: 1, padding: '11px', borderRadius: '6px',
                  border: '0.5px solid var(--border-strong)', background: 'transparent',
                  color: `rgba(var(--fg-rgb), 0.6)`, fontSize: '13px', cursor: 'pointer',
                }}
              >
                {savedId ? 'Done' : 'Cancel'}
              </button>
              <button
                onClick={saveNote}
                disabled={saving || !noteBody.trim()}
                style={{
                  flex: 2, padding: '11px', borderRadius: '6px', border: 'none',
                  background: saving || !noteBody.trim() ? 'var(--bg-card)' : 'var(--accent)',
                  color: saving || !noteBody.trim() ? `rgba(var(--fg-rgb), 0.3)` : 'var(--accent-text)',
                  fontSize: '13px', fontWeight: 700,
                  cursor: saving || !noteBody.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving…' : 'Save note'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
