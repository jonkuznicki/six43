'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase'

function fmt(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function fmtTime(t: string | null) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  return ` · ${h % 12 || 12}:${String(m).padStart(2, '0')}${ampm}`
}

export default function SwapButton({ placeholder, seasonId }: { placeholder: any; seasonId: string }) {
  const supabase = createClient()
  const router   = useRouter()

  const [open,         setOpen]         = useState(false)
  const [candidates,   setCandidates]   = useState<any[]>([])
  const [loading,      setLoading]      = useState(false)
  const [selected,     setSelected]     = useState<any>(null)
  const [confirming,   setConfirming]   = useState(false)
  const [swapping,     setSwapping]     = useState(false)
  const [error,        setError]        = useState('')

  async function openSheet() {
    setOpen(true)
    setSelected(null)
    setConfirming(false)
    setError('')
    setLoading(true)

    // Find unassigned real games in the same season (not placeholders, no tournament yet)
    const { data } = await supabase
      .from('games')
      .select('id, opponent, game_date, game_time, location')
      .eq('season_id', seasonId)
      .eq('is_placeholder', false)
      .is('tournament_id', null)
      .in('status', ['scheduled', 'lineup_ready'])
      .order('game_date', { ascending: true })

    setCandidates(data ?? [])
    setLoading(false)
  }

  async function confirmSwap() {
    if (!selected) return
    setSwapping(true)
    setError('')

    const res = await fetch('/api/tournaments/swap', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ placeholder_id: placeholder.id, real_game_id: selected.id }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Swap failed.')
      setSwapping(false)
      return
    }

    setOpen(false)
    router.refresh()
  }

  return (
    <>
      <button onClick={openSheet} style={{
        width: '100%', padding: '8px 14px', borderRadius: '6px', border: 'none',
        background: 'rgba(var(--fg-rgb), 0.06)', color: `rgba(var(--fg-rgb), 0.55)`,
        fontSize: '12px', fontWeight: 600, cursor: 'pointer', textAlign: 'center',
      }}>
        Swap with imported game
      </button>

      {open && (
        <div onClick={() => !swapping && setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg2)', borderRadius: '16px 16px 0 0',
            padding: '1.25rem 1rem 2.5rem', width: '100%', maxWidth: '480px',
            border: '0.5px solid var(--border)', maxHeight: '80vh', overflowY: 'auto',
          }}>
            {!confirming ? (
              <>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>
                  Swap placeholder
                </div>
                <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '1.25rem' }}>
                  Replacing: {placeholder.opponent}
                </div>

                {loading && (
                  <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.4)`, textAlign: 'center', padding: '1rem 0' }}>
                    Loading games…
                  </div>
                )}

                {!loading && candidates.length === 0 && (
                  <div style={{
                    fontSize: '13px', color: `rgba(var(--fg-rgb), 0.4)`, textAlign: 'center',
                    padding: '1rem 0', lineHeight: 1.6,
                  }}>
                    No imported games available to swap.<br />
                    <span style={{ fontSize: '12px' }}>Import games from GameChanger first.</span>
                  </div>
                )}

                {!loading && candidates.map(g => (
                  <div key={g.id}
                    onClick={() => setSelected(selected?.id === g.id ? null : g)}
                    style={{
                      padding: '12px 14px', borderRadius: '8px', marginBottom: '6px',
                      cursor: 'pointer',
                      border: selected?.id === g.id
                        ? '0.5px solid var(--accent)'
                        : '0.5px solid var(--border-md)',
                      background: selected?.id === g.id
                        ? 'rgba(232,160,32,0.08)'
                        : 'var(--bg-card)',
                    }}>
                    <div style={{ fontSize: '14px', fontWeight: 600 }}>vs {g.opponent}</div>
                    <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '2px' }}>
                      {fmt(g.game_date)}{fmtTime(g.game_time)}{g.location ? ` · ${g.location}` : ''}
                    </div>
                  </div>
                ))}

                {error && (
                  <div style={{ fontSize: '13px', color: '#E87060', margin: '8px 0' }}>{error}</div>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '1rem' }}>
                  <button onClick={() => setOpen(false)} style={{
                    flex: 1, padding: '11px', borderRadius: '6px',
                    border: '0.5px solid var(--border-strong)', background: 'transparent',
                    color: `rgba(var(--fg-rgb), 0.5)`, fontSize: '13px', cursor: 'pointer',
                  }}>Cancel</button>
                  <button
                    onClick={() => selected && setConfirming(true)}
                    disabled={!selected}
                    style={{
                      flex: 2, padding: '11px', borderRadius: '6px', border: 'none',
                      background: 'var(--accent)', color: 'var(--accent-text)',
                      fontSize: '13px', fontWeight: 700,
                      cursor: selected ? 'pointer' : 'not-allowed',
                      opacity: selected ? 1 : 0.45,
                    }}>
                    Select →
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>Confirm swap</div>
                <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '1.25rem' }}>
                  This will replace the placeholder with the real game and carry over any lineup work.
                </div>

                <div style={{
                  background: 'var(--bg-card)', border: '0.5px solid var(--border)',
                  borderRadius: '10px', padding: '12px 14px', marginBottom: '10px',
                }}>
                  <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '4px' }}>Replacing</div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>{placeholder.opponent}</div>
                </div>

                <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.4)`, textAlign: 'center', margin: '4px 0 4px', letterSpacing: '0.05em' }}>↓</div>

                <div style={{
                  background: 'rgba(232,160,32,0.08)', border: '0.5px solid rgba(232,160,32,0.35)',
                  borderRadius: '10px', padding: '12px 14px', marginBottom: '1.25rem',
                }}>
                  <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '4px' }}>Real game</div>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>vs {selected?.opponent}</div>
                  <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '2px' }}>
                    {fmt(selected?.game_date)}{fmtTime(selected?.game_time)}
                  </div>
                </div>

                {error && (
                  <div style={{ fontSize: '13px', color: '#E87060', marginBottom: '8px' }}>{error}</div>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setConfirming(false)} disabled={swapping} style={{
                    flex: 1, padding: '11px', borderRadius: '6px',
                    border: '0.5px solid var(--border-strong)', background: 'transparent',
                    color: `rgba(var(--fg-rgb), 0.5)`, fontSize: '13px', cursor: 'pointer',
                  }}>Back</button>
                  <button onClick={confirmSwap} disabled={swapping} style={{
                    flex: 2, padding: '11px', borderRadius: '6px', border: 'none',
                    background: 'var(--accent)', color: 'var(--accent-text)',
                    fontSize: '13px', fontWeight: 700,
                    cursor: swapping ? 'not-allowed' : 'pointer',
                    opacity: swapping ? 0.7 : 1,
                  }}>
                    {swapping ? 'Swapping…' : 'Confirm swap'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
