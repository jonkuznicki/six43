'use client'

import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '../../lib/supabase'
import { formatTime } from '../../lib/formatTime'

function parseScore(notes: string | null): { us: number; them: number } | null {
  try {
    const p = JSON.parse(notes ?? '{}')
    if (p._score != null) return p._score
    if (p._box) {
      const hasData = [...(p._box.us ?? []), ...(p._box.them ?? [])].some((v: number | null) => v !== null)
      if (!hasData) return null
      const us   = (p._box.us   ?? []).reduce((a: number, v: number | null) => a + (v ?? 0), 0)
      const them = (p._box.them ?? []).reduce((a: number, v: number | null) => a + (v ?? 0), 0)
      return { us, them }
    }
    return null
  } catch { return null }
}

function writeScore(notes: string | null, us: number, them: number): string {
  try {
    const p = JSON.parse(notes ?? '{}')
    p._score = { us, them }
    return JSON.stringify(p)
  } catch { return JSON.stringify({ _score: { us, them } }) }
}

const STATUS: Record<string, { bg: string; color: string; label: string }> = {
  scheduled:   { bg: 'var(--bg-card)',          color: `rgba(var(--fg-rgb), 0.5)`, label: 'Scheduled' },
  in_progress: { bg: 'rgba(232,160,32,0.2)',    color: '#E8A020',                  label: 'Live' },
  final:       { bg: 'rgba(45,106,53,0.2)',     color: '#6DB875',                  label: 'Final' },
}

export default function GameCard({ game, teamName }: { game: any; teamName: string }) {
  const supabase = createClient()
  const [notes, setNotes]         = useState<string | null>(game.notes)
  const [status, setStatus]       = useState<string>(game.status)
  const [showSheet, setShowSheet] = useState(false)
  const [usScore, setUsScore]     = useState('')
  const [themScore, setThemScore] = useState('')
  const [saving, setSaving]       = useState(false)

  const score = parseScore(notes)
  const sc = STATUS[status] ?? STATUS.scheduled

  const date = new Date(game.game_date + 'T12:00:00')
  const formatted = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  function openSheet() {
    setUsScore(score != null ? String(score.us) : '')
    setThemScore(score != null ? String(score.them) : '')
    setShowSheet(true)
  }

  async function saveScore() {
    const us   = parseInt(usScore)   || 0
    const them = parseInt(themScore) || 0
    setSaving(true)
    const newNotes = writeScore(notes, us, them)
    await supabase.from('games').update({ notes: newNotes, status: 'final' }).eq('id', game.id)
    setNotes(newNotes)
    setStatus('final')
    setSaving(false)
    setShowSheet(false)
  }

  return (
    <>
      <div style={{
        background: 'var(--bg-card)', border: '0.5px solid var(--border)',
        borderRadius: '10px', marginBottom: '8px', display: 'flex', overflow: 'hidden',
      }}>
        {/* Main card — navigates to detail */}
        <Link href={`/games/${game.id}`} style={{ textDecoration: 'none', flex: 1, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--fg)', marginBottom: '4px' }}>
                vs {game.opponent}
              </div>
              <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.45)` }}>
                {formatted}{game.location ? ` · ${game.location}` : ''}
                {game.game_time ? ` · ${formatTime(game.game_time)}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px',
                borderRadius: '4px', background: sc.bg, color: sc.color }}>
                {sc.label}
              </span>
              <span style={{ color: `rgba(var(--fg-rgb), 0.25)`, fontSize: '16px' }}>›</span>
            </div>
          </div>
        </Link>

        {/* Score tap zone */}
        <button onClick={openSheet} style={{
          flexShrink: 0, width: '72px',
          border: 'none', borderLeft: '0.5px solid var(--border-subtle)',
          background: score != null ? 'rgba(45,106,53,0.06)' : 'transparent',
          cursor: 'pointer', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: '2px', padding: 0,
        }}>
          {score != null ? (
            <>
              <div style={{ fontSize: '17px', fontWeight: 800, color: 'var(--fg)', lineHeight: 1 }}>
                {score.us}–{score.them}
              </div>
              <div style={{ fontSize: '9px', color: `rgba(var(--fg-rgb), 0.35)`,
                textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                score
              </div>
            </>
          ) : (
            <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)`,
              textAlign: 'center', lineHeight: 1.4, padding: '0 8px' }}>
              Add<br />score
            </div>
          )}
        </button>
      </div>

      {/* Quick score sheet */}
      {showSheet && (
        <div onClick={() => setShowSheet(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg2)', borderRadius: '16px 16px 0 0',
            padding: '1.25rem 1rem 2.5rem', width: '100%', maxWidth: '480px',
            border: '0.5px solid var(--border)',
          }}>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '2px' }}>Quick score</div>
            <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '1.5rem' }}>
              vs {game.opponent} · {formatted}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '1.5rem' }}>
              {([
                { label: teamName, value: usScore,   set: setUsScore },
                { label: game.opponent, value: themScore, set: setThemScore },
              ] as const).map(({ label, value, set }) => (
                <div key={label}>
                  <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.45)`,
                    marginBottom: '6px', textAlign: 'center', fontWeight: 500 }}>
                    {label}
                  </div>
                  <input
                    type="text" inputMode="numeric" pattern="[0-9]*"
                    value={value}
                    onChange={e => set(e.target.value.replace(/\D/g, ''))}
                    placeholder="0"
                    style={{
                      width: '100%', padding: '14px 0', textAlign: 'center',
                      fontSize: '36px', fontWeight: 800,
                      background: 'var(--bg-input)', color: 'var(--fg)',
                      border: '0.5px solid var(--border-md)', borderRadius: '8px',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowSheet(false)} style={{
                flex: 1, padding: '12px', borderRadius: '6px',
                border: '0.5px solid var(--border-strong)', background: 'transparent',
                color: `rgba(var(--fg-rgb), 0.6)`, fontSize: '13px', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={saveScore} disabled={saving} style={{
                flex: 2, padding: '12px', borderRadius: '6px', border: 'none',
                background: 'var(--accent)', color: 'var(--accent-text)',
                fontSize: '13px', fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              }}>{saving ? 'Saving…' : 'Save & mark final'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
