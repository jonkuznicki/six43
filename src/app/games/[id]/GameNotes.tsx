'use client'

import { useState, useRef } from 'react'
import { createClient } from '../../../lib/supabase'

function readNotes(raw: string | null): string {
  try { return JSON.parse(raw ?? '{}')._notes ?? '' } catch { return '' }
}

function writeNotes(raw: string | null, text: string): string {
  try {
    const parsed = JSON.parse(raw ?? '{}')
    parsed._notes = text
    return JSON.stringify(parsed)
  } catch { return JSON.stringify({ _notes: text }) }
}

export default function GameNotes({ gameId, notes }: { gameId: string; notes: string | null }) {
  const supabase = createClient()
  const [text, setText] = useState(() => readNotes(notes))
  const [saved, setSaved] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track current raw notes so concurrent edits don't overwrite other fields
  const rawRef = useRef(notes)

  function handleChange(val: string) {
    setText(val)
    setSaved(false)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      const newRaw = writeNotes(rawRef.current, val)
      await supabase.from('games').update({ notes: newRaw }).eq('id', gameId)
      rawRef.current = newRaw
      setSaved(true)
    }, 800)
  }

  return (
    <div style={{ marginTop: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)` }}>
          Notes
        </div>
        {!saved && (
          <span style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)` }}>saving…</span>
        )}
      </div>
      <textarea
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder="e.g. Connor hurt his arm — no pitching · rainout makeup · tournament format 5 innings"
        rows={3}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: '8px',
          border: '0.5px solid var(--border-md)',
          background: 'var(--bg-input)', color: 'var(--fg)',
          fontSize: '13px', resize: 'vertical', boxSizing: 'border-box',
          fontFamily: 'sans-serif', lineHeight: 1.5,
        }}
      />
    </div>
  )
}
