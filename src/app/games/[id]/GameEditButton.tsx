'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase'

const LOCATIONS = ['Home', 'Away', 'Neutral']

export default function GameEditButton({ game }: { game: any }) {
  const supabase = createClient()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    opponent:      game.opponent ?? '',
    game_date:     game.game_date ?? '',
    game_time:     game.game_time?.slice(0, 5) ?? '',
    location:      game.location ?? '',
    innings_played: String(game.innings_played ?? 6),
  })

  async function save() {
    if (!form.opponent.trim()) { setError('Opponent is required.'); return }
    if (!form.game_date)       { setError('Date is required.'); return }
    const inn = parseInt(form.innings_played)
    if (isNaN(inn) || inn < 1 || inn > 9) { setError('Innings must be 1–9.'); return }

    setSaving(true); setError('')
    await supabase.from('games').update({
      opponent:      form.opponent.trim(),
      game_date:     form.game_date,
      game_time:     form.game_time || null,
      location:      form.location || null,
      innings_played: inn,
    }).eq('id', game.id)

    setSaving(false)
    setOpen(false)
    router.refresh()
  }

  if (!open) return (
    <button onClick={() => setOpen(true)} style={{
      fontSize: '12px', padding: '3px 10px', borderRadius: '4px',
      border: '0.5px solid var(--border-strong)', background: 'transparent',
      color: `rgba(var(--fg-rgb), 0.45)`, cursor: 'pointer',
    }}>Edit</button>
  )

  return (
    <div onClick={() => setOpen(false)} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200,
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg2)', borderRadius: '16px 16px 0 0', padding: '1.5rem',
        width: '100%', maxWidth: '480px', border: '0.5px solid var(--border)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '1.25rem', color: 'var(--fg)' }}>Edit game</div>

        {error && (
          <div style={{ fontSize: '12px', color: '#E87060', background: 'rgba(192,57,43,0.15)',
            border: '0.5px solid rgba(192,57,43,0.3)', borderRadius: '6px',
            padding: '8px 12px', marginBottom: '12px' }}>{error}</div>
        )}

        <Label text="Opponent">
          <input value={form.opponent} onChange={e => setForm(f => ({ ...f, opponent: e.target.value }))}
            placeholder="Tigers" style={inp} />
        </Label>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', margin: '10px 0' }}>
          <Label text="Date">
            <input type="date" value={form.game_date}
              onChange={e => setForm(f => ({ ...f, game_date: e.target.value }))} style={inp} />
          </Label>
          <Label text="Time">
            <input type="time" value={form.game_time}
              onChange={e => setForm(f => ({ ...f, game_time: e.target.value }))} style={inp} />
          </Label>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
          <Label text="Location">
            <select value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} style={inp}>
              <option value="">—</option>
              {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
          </Label>
          <Label text="Innings">
            <input type="number" min={1} max={9} value={form.innings_played}
              onChange={e => setForm(f => ({ ...f, innings_played: e.target.value }))} style={inp} />
          </Label>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setOpen(false)} style={{
            flex: 1, padding: '11px', borderRadius: '6px',
            border: '0.5px solid var(--border-strong)', background: 'transparent',
            color: `rgba(var(--fg-rgb), 0.6)`, fontSize: '13px', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{
            flex: 2, padding: '11px', borderRadius: '6px', border: 'none',
            background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '13px', fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
          }}>{saving ? 'Saving…' : 'Save changes'}</button>
        </div>
      </div>
    </div>
  )
}

function Label({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '4px' }}>{text}</div>
      {children}
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', padding: '9px 10px', borderRadius: '6px',
  border: '0.5px solid var(--border-md)',
  background: 'var(--bg-input)', color: 'var(--fg)',
  fontSize: '13px', boxSizing: 'border-box',
}
