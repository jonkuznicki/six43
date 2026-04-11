'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type GameType = 'pool_play' | 'bracket'

type Slot = {
  localId: string
  game_type: GameType
  opponent: string
  game_date: string
  game_time: string
}

export default function NewTournamentPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [season,  setSeason]  = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState('')

  const today = new Date().toISOString().split('T')[0]
  const [name,      setName]      = useState('')
  const [startDate, setStartDate] = useState(today)
  const [endDate,   setEndDate]   = useState(today)
  const [slots,     setSlots]     = useState<Slot[]>([])

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const teamId = new URLSearchParams(window.location.search).get('teamId')
    let q = supabase
      .from('seasons')
      .select('id, name, innings_per_game, team:teams(id, name)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
    if (teamId) q = (q as any).eq('team_id', teamId)
    const { data } = await q.maybeSingle()
    setSeason(data)
    setLoading(false)
  }

  function nextLabel(type: GameType): string {
    const count = slots.filter(s => s.game_type === type).length + 1
    return type === 'pool_play' ? `Pool Play ${count}` : `Bracket Game ${count}`
  }

  function addSlot(type: GameType) {
    setSlots(prev => [...prev, {
      localId:   crypto.randomUUID(),
      game_type: type,
      opponent:  nextLabel(type),
      game_date: startDate,
      game_time: '',
    }])
  }

  function updateSlot(localId: string, patch: Partial<Slot>) {
    setSlots(prev => prev.map(s => s.localId === localId ? { ...s, ...patch } : s))
  }

  function removeSlot(localId: string) {
    setSlots(prev => prev.filter(s => s.localId !== localId))
  }

  async function save() {
    if (!name.trim())         { setError('Tournament name is required.'); return }
    if (!startDate || !endDate) { setError('Start and end dates are required.'); return }
    if (startDate > endDate)  { setError('Start date must be on or before end date.'); return }
    if (!season)              { setError('No active season found.'); return }

    setSaving(true)
    setError('')

    const { data: tournament, error: tErr } = await supabase
      .from('tournaments')
      .insert({ season_id: season.id, name: name.trim(), start_date: startDate, end_date: endDate })
      .select()
      .single()

    if (tErr || !tournament) {
      setError(tErr?.message ?? 'Failed to create tournament.')
      setSaving(false)
      return
    }

    if (slots.length > 0) {
      const rows = slots.map(s => ({
        season_id:      season.id,
        tournament_id:  tournament.id,
        opponent:       s.opponent.trim() || nextLabel(s.game_type),
        game_date:      s.game_date,
        game_time:      s.game_time || null,
        game_type:      s.game_type,
        is_placeholder: true,
        status:         'scheduled',
        innings_played: season.innings_per_game ?? 6,
      }))
      const { error: gErr } = await supabase.from('games').insert(rows)
      if (gErr) { setError(gErr.message); setSaving(false); return }
    }

    router.push(`/tournaments/${tournament.id}`)
  }

  if (loading) return (
    <main style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--fg)',
      fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading…
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '480px', margin: '0 auto', padding: '1.5rem 1rem 6rem' }}>

      <Link href="/games" style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`,
        textDecoration: 'none', display: 'block', marginBottom: '1rem' }}>‹ Games</Link>

      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>New tournament</h1>
      {season && (
        <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '1.5rem' }}>
          {(season as any).team?.name} · {season.name}
        </div>
      )}

      {!season && (
        <div style={{ fontSize: '13px', color: '#E87060', background: 'rgba(192,57,43,0.12)',
          border: '0.5px solid rgba(192,57,43,0.3)', borderRadius: '8px',
          padding: '12px 14px', marginBottom: '1.5rem' }}>
          No active season. <Link href="/settings" style={{ color: 'var(--accent)' }}>Set one up in Settings →</Link>
        </div>
      )}

      {error && (
        <div style={{ fontSize: '13px', color: '#E87060', background: 'rgba(192,57,43,0.12)',
          border: '0.5px solid rgba(192,57,43,0.3)', borderRadius: '6px',
          padding: '10px 14px', marginBottom: '1rem' }}>{error}</div>
      )}

      <Field label="Tournament name">
        <input value={name} onChange={e => setName(e.target.value)}
          placeholder="Memorial Day Invitational" autoFocus style={inp} />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', margin: '12px 0 1.5rem' }}>
        <Field label="Start date">
          <input type="date" value={startDate} style={inp}
            onChange={e => {
              setStartDate(e.target.value)
              if (e.target.value > endDate) setEndDate(e.target.value)
              // Clamp existing slots
              setSlots(prev => prev.map(s => s.game_date < e.target.value ? { ...s, game_date: e.target.value } : s))
            }} />
        </Field>
        <Field label="End date">
          <input type="date" value={endDate} min={startDate} style={inp}
            onChange={e => {
              setEndDate(e.target.value)
              setSlots(prev => prev.map(s => s.game_date > e.target.value ? { ...s, game_date: e.target.value } : s))
            }} />
        </Field>
      </div>

      {/* Slots */}
      {slots.length > 0 && (
        <div style={{ marginBottom: '1rem' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em',
            textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '8px' }}>
            Game slots
          </div>
          {slots.map(slot => (
            <div key={slot.localId} style={{
              background: 'var(--bg-card)', borderRadius: '10px', padding: '12px',
              marginBottom: '8px',
              border: slot.game_type === 'pool_play'
                ? '0.5px solid rgba(59,109,177,0.35)'
                : '0.5px solid rgba(232,160,32,0.35)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                  background: slot.game_type === 'pool_play' ? 'rgba(59,109,177,0.15)' : 'rgba(232,160,32,0.15)',
                  color: slot.game_type === 'pool_play' ? '#80B0E8' : 'var(--accent)',
                }}>
                  {slot.game_type === 'pool_play' ? 'Pool Play' : 'Bracket'}
                </span>
                <button onClick={() => removeSlot(slot.localId)} style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  color: `rgba(var(--fg-rgb), 0.3)`, fontSize: '18px', lineHeight: 1, padding: '0 2px',
                }}>×</button>
              </div>

              <Field label="Label">
                <input value={slot.opponent}
                  onChange={e => updateSlot(slot.localId, { opponent: e.target.value })}
                  style={{ ...inp, marginBottom: '8px' }} />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '8px' }}>
                <Field label="Date">
                  <input type="date" value={slot.game_date}
                    min={startDate} max={endDate} style={inp}
                    onChange={e => updateSlot(slot.localId, { game_date: e.target.value })} />
                </Field>
                <Field label="Time (optional)">
                  <input type="time" value={slot.game_time} style={inp}
                    onChange={e => updateSlot(slot.localId, { game_time: e.target.value })} />
                </Field>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add slot buttons */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem' }}>
        <button onClick={() => addSlot('pool_play')} style={{
          flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
          cursor: 'pointer', border: '0.5px solid rgba(59,109,177,0.4)',
          background: 'rgba(59,109,177,0.08)', color: '#80B0E8',
        }}>+ Pool play</button>
        <button onClick={() => addSlot('bracket')} style={{
          flex: 1, padding: '10px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
          cursor: 'pointer', border: '0.5px solid rgba(232,160,32,0.4)',
          background: 'rgba(232,160,32,0.08)', color: 'var(--accent)',
        }}>+ Bracket game</button>
      </div>

      <button onClick={save} disabled={saving || !season} style={{
        width: '100%', padding: '14px', borderRadius: '8px', border: 'none',
        background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '15px', fontWeight: 700,
        cursor: (saving || !season) ? 'not-allowed' : 'pointer',
        opacity: (saving || !season) ? 0.7 : 1,
      }}>
        {saving ? 'Creating…' : 'Create tournament'}
      </button>
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '5px' }}>{label}</div>
      {children}
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '6px',
  border: '0.5px solid var(--border-md)',
  background: 'var(--bg-input)', color: 'var(--fg)',
  fontSize: '14px', boxSizing: 'border-box',
}
