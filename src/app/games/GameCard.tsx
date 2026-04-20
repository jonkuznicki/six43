'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../lib/supabase'
import { formatTime } from '../../lib/formatTime'
import { parseScore } from '../../lib/parseScore'

function writeScore(notes: string | null, us: number, them: number): string {
  try {
    const p = JSON.parse(notes ?? '{}')
    p._score = { us, them }
    return JSON.stringify(p)
  } catch { return JSON.stringify({ _score: { us, them } }) }
}

const STATUS: Record<string, { bg: string; color: string; label: string }> = {
  scheduled:    { bg: 'var(--bg-card)',          color: `rgba(var(--fg-rgb), 0.5)`, label: 'Scheduled' },
  lineup_ready: { bg: 'rgba(59,109,177,0.18)',   color: '#80B0E8',                  label: 'Lineup Ready' },
  in_progress:  { bg: 'rgba(75,156,211,0.2)',    color: '#4B9CD3',                  label: 'Live' },
  final:        { bg: 'rgba(45,106,53,0.2)',     color: '#6DB875',                  label: 'Final' },
}

export default function GameCard({ game, teamName }: { game: any; teamName: string }) {
  const supabase = createClient()
  const router = useRouter()
  const [notes, setNotes]             = useState<string | null>(game.notes)
  const [status, setStatus]           = useState<string>(game.status)
  const [showScore, setShowScore]     = useState(false)
  const [showMenu, setShowMenu]       = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]       = useState(false)
  const [usScore, setUsScore]         = useState('')
  const [themScore, setThemScore]     = useState('')
  const [saving, setSaving]           = useState(false)

  const score = parseScore(notes)
  const sc = STATUS[status] ?? STATUS.scheduled

  const date = new Date(game.game_date + 'T12:00:00')
  const formatted = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  const isFinished = status === 'final' || status === 'in_progress'
  // For lineup_ready games, go straight to the lineup; otherwise start at attendance
  const lineupHref = status === 'lineup_ready'
    ? `/games/${game.id}/lineup`
    : `/games/${game.id}/attendance`
  const lineupLabel = status === 'lineup_ready' ? 'View lineup' : 'Lineup'

  function openScore() {
    setUsScore(score != null ? String(score.us) : '')
    setThemScore(score != null ? String(score.them) : '')
    setShowScore(true)
  }

  function openMenu() {
    setConfirmDelete(false)
    setShowMenu(true)
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
    setShowScore(false)
  }

  async function deleteGame() {
    setDeleting(true)
    await supabase.from('games').delete().eq('id', game.id)
    router.refresh()
  }

  const isFinal       = status === 'final'
  const isUpcoming    = !isFinal
  const isPlaceholder = !!game.is_placeholder
  const today         = new Date().toISOString().split('T')[0]
  const isStale       = isPlaceholder && game.game_date < today

  return (
    <>
      <div style={{
        background: 'var(--bg-card)',
        border: isPlaceholder
          ? `1px dashed ${isStale ? 'rgba(232,112,96,0.45)' : 'rgba(var(--fg-rgb), 0.2)'}`
          : isUpcoming
            ? '0.5px solid var(--border-md)'
            : '0.5px solid var(--border-subtle)',
        borderRadius: '10px', marginBottom: '8px', display: 'flex', overflow: 'hidden',
        opacity: isFinal ? 0.7 : 1,
      }}>
        {/* Main card area */}
        <Link href={`/games/${game.id}`} style={{ textDecoration: 'none', flex: 1, padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: isUpcoming ? '16px' : '14px', fontWeight: isUpcoming ? 600 : 400, color: 'var(--fg)' }}>
                  {isPlaceholder ? game.opponent : `vs ${game.opponent}`}
                </span>
                {isPlaceholder && (
                  <span style={{
                    fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '20px',
                    background: isStale ? 'rgba(232,112,96,0.1)' : 'rgba(var(--fg-rgb),0.06)',
                    color: isStale ? '#E87060' : `rgba(var(--fg-rgb), 0.4)`,
                    border: `0.5px solid ${isStale ? 'rgba(232,112,96,0.3)' : 'rgba(var(--fg-rgb), 0.15)'}`,
                  }}>
                    {isStale ? 'Needs swap' : 'TBD'}
                  </span>
                )}
              </div>
              <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), ${isUpcoming ? '0.55' : '0.35'})` }}>
                {formatted}{game.location ? ` · ${game.location}` : ''}
                {game.game_time ? ` · ${formatTime(game.game_time)}` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {!isPlaceholder && (
                <span style={{ fontSize: '11px', fontWeight: 500, padding: '2px 8px',
                  borderRadius: '4px', background: sc.bg, color: sc.color }}>
                  {sc.label}
                </span>
              )}
              <span style={{ color: `rgba(var(--fg-rgb), 0.25)`, fontSize: '16px' }}>›</span>
            </div>
          </div>
        </Link>

        {/* ⋯ menu button */}
        <button onClick={openMenu} style={{
          flexShrink: 0, width: '36px',
          border: 'none', borderLeft: '0.5px solid var(--border-subtle)',
          background: 'transparent', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: `rgba(var(--fg-rgb), 0.3)`, fontSize: '16px', padding: 0,
          letterSpacing: '1px',
        }}>
          ···
        </button>

        {/* Print shortcut — visible directly for lineup_ready games */}
        {status === 'lineup_ready' && (
          <Link
            href={`/games/${game.id}/print`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              flexShrink: 0, width: '36px', textDecoration: 'none',
              borderLeft: '0.5px solid var(--border-subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: `rgba(var(--fg-rgb), 0.35)`, fontSize: '15px',
            }}
            title="Print lineup"
          >
            🖨
          </Link>
        )}

        {/* Right action: score (finished) or lineup (upcoming) */}
        {isFinished ? (
          <button onClick={openScore} style={{
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
        ) : (
          <Link href={lineupHref} style={{
            flexShrink: 0, width: '72px', textDecoration: 'none',
            borderLeft: '0.5px solid var(--border-subtle)',
            background: status === 'lineup_ready' ? 'rgba(59,109,177,0.08)' : 'transparent',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: '3px', padding: 0,
          }}>
            <div style={{ fontSize: '18px', lineHeight: 1 }}>
              {status === 'lineup_ready' ? '✓' : '📋'}
            </div>
            <div style={{ fontSize: '10px',
              color: status === 'lineup_ready' ? '#80B0E8' : 'var(--accent)',
              fontWeight: 600, textAlign: 'center', lineHeight: 1.3 }}>
              {lineupLabel}
            </div>
          </Link>
        )}
      </div>

      {/* ⋯ action sheet */}
      {showMenu && (
        <div onClick={() => setShowMenu(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg2)', borderRadius: '16px 16px 0 0',
            padding: '1.25rem 1rem 2.5rem', width: '100%', maxWidth: '480px',
            border: '0.5px solid var(--border)',
          }}>
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '2px' }}>
              vs {game.opponent}
            </div>
            <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '1.25rem' }}>
              {formatted}
            </div>

            {/* Actions */}
            <Link href={`/games/${game.id}`} style={{ textDecoration: 'none', display: 'block', marginBottom: '8px' }}>
              <div style={{
                padding: '12px 14px', borderRadius: '8px',
                border: '0.5px solid var(--border-md)', background: 'transparent',
                fontSize: '14px', color: 'var(--fg)',
              }}>
                View / edit game →
              </div>
            </Link>

            {!isFinished && (
              <Link href={lineupHref} style={{ textDecoration: 'none', display: 'block', marginBottom: '8px' }}>
                <div style={{
                  padding: '12px 14px', borderRadius: '8px',
                  border: '0.5px solid var(--border-md)', background: 'transparent',
                  fontSize: '14px', color: 'var(--fg)',
                }}>
                  {lineupLabel} →
                </div>
              </Link>
            )}

            {status === 'lineup_ready' && (
              <>
                <Link
                  href={`/games/${game.id}/gameday`}
                  style={{ textDecoration: 'none', display: 'block', marginBottom: '8px' }}
                >
                  <div style={{
                    padding: '12px 14px', borderRadius: '8px',
                    border: '0.5px solid var(--border-md)', background: 'transparent',
                    fontSize: '14px', color: 'var(--fg)',
                  }}>
                    ⚾ Game day view →
                  </div>
                </Link>
                <Link
                  href={`/games/${game.id}/print`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'none', display: 'block', marginBottom: '8px' }}
                >
                  <div style={{
                    padding: '12px 14px', borderRadius: '8px',
                    border: '0.5px solid var(--border-md)', background: 'transparent',
                    fontSize: '14px', color: 'var(--fg)',
                  }}>
                    🖨 Print lineup + exchange card →
                  </div>
                </Link>
              </>
            )}

            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} style={{
                width: '100%', padding: '12px 14px', borderRadius: '8px',
                border: '0.5px solid rgba(192,57,43,0.3)', background: 'rgba(192,57,43,0.06)',
                color: '#E87060', fontSize: '14px', cursor: 'pointer', textAlign: 'left',
              }}>
                Delete game
              </button>
            ) : (
              <div style={{
                padding: '12px 14px', borderRadius: '8px',
                background: 'rgba(192,57,43,0.08)', border: '0.5px solid rgba(192,57,43,0.3)',
              }}>
                <div style={{ fontSize: '13px', color: '#E87060', marginBottom: '10px' }}>
                  Delete this game? This cannot be undone.
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => setConfirmDelete(false)} style={{
                    flex: 1, padding: '9px', borderRadius: '6px',
                    border: '0.5px solid var(--border-strong)', background: 'transparent',
                    color: `rgba(var(--fg-rgb), 0.6)`, fontSize: '13px', cursor: 'pointer',
                  }}>Cancel</button>
                  <button onClick={deleteGame} disabled={deleting} style={{
                    flex: 1, padding: '9px', borderRadius: '6px', border: 'none',
                    background: '#C0392B', color: 'white', fontSize: '13px', fontWeight: 700,
                    cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1,
                  }}>{deleting ? 'Deleting…' : 'Yes, delete'}</button>
                </div>
              </div>
            )}

            <button onClick={() => setShowMenu(false)} style={{
              width: '100%', marginTop: '10px', padding: '11px',
              border: '0.5px solid var(--border-strong)', borderRadius: '8px',
              background: 'transparent', color: `rgba(var(--fg-rgb), 0.5)`,
              fontSize: '13px', cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Quick score sheet */}
      {showScore && (
        <div onClick={() => setShowScore(false)} style={{
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
              <button onClick={() => setShowScore(false)} style={{
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
