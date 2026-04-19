'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '../../lib/supabase'
import { formatTime } from '../../lib/formatTime'

const POS_COLOR: Record<string, { bg: string; color: string }> = {
  P:     { bg: 'rgba(75,156,211,0.22)',  color: '#4B9CD3' },
  C:     { bg: 'rgba(192,80,120,0.22)', color: '#E090B0' },
  '1B':  { bg: 'transparent', color: '#80B0E8' },
  '2B':  { bg: 'transparent', color: '#80B0E8' },
  SS:    { bg: 'transparent', color: '#80B0E8' },
  '3B':  { bg: 'transparent', color: '#80B0E8' },
  LF:    { bg: 'transparent', color: '#6DB875' },
  CF:    { bg: 'transparent', color: '#6DB875' },
  LC:    { bg: 'transparent', color: '#6DB875' },
  RC:    { bg: 'transparent', color: '#6DB875' },
  RF:    { bg: 'transparent', color: '#6DB875' },
  Bench: { bg: 'transparent', color: 'rgba(160,160,160,0.75)' },
}

const STATUS_LABEL: Record<string, { color: string; label: string }> = {
  scheduled:    { color: `rgba(var(--fg-rgb), 0.45)`, label: 'Scheduled' },
  lineup_ready: { color: '#80B0E8',                   label: 'Lineup Ready' },
  in_progress:  { color: '#4B9CD3',                   label: 'Live' },
  final:        { color: '#6DB875',                   label: 'Final' },
}

export default function GamePreviewPanel({
  game,
  inningsPerGame,
}: {
  game: any
  inningsPerGame: number
}) {
  const supabase = createClient()
  const [slots,   setSlots]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('lineup_slots')
      .select('*, player:players(first_name, last_name, jersey_number)')
      .eq('game_id', game.id)
      .order('batting_order', { ascending: true, nullsFirst: false })
      .then(({ data }) => {
        setSlots(data ?? [])
        setLoading(false)
      })
  }, [game.id])

  const date      = new Date(game.game_date + 'T12:00:00')
  const formatted = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const sc        = STATUS_LABEL[game.status] ?? STATUS_LABEL.scheduled

  const activeSlots = slots.filter(s => s.availability !== 'absent')
  const hasLineup   = activeSlots.some(s => (s.inning_positions ?? []).some(Boolean))
  const innings     = Array.from({ length: inningsPerGame }, (_, i) => i)

  const lineupHref    = `/games/${game.id}/lineup/desktop`
  const isPlaceholder = !!game.is_placeholder

  return (
    <div>
      {/* Game header */}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px', flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
            {isPlaceholder ? game.opponent : `vs ${game.opponent}`}
          </h2>
          {!isPlaceholder && (
            <span style={{
              fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
              color: sc.color, border: `0.5px solid ${sc.color}55`, background: 'transparent',
            }}>
              {sc.label}
            </span>
          )}
          {isPlaceholder && (
            <span style={{
              fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
              background: 'rgba(var(--fg-rgb),0.06)', color: `rgba(var(--fg-rgb), 0.4)`,
              border: '0.5px solid rgba(var(--fg-rgb), 0.15)',
            }}>
              TBD
            </span>
          )}
        </div>
        <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)` }}>
          {formatted}
          {game.game_time ? ` · ${formatTime(game.game_time)}` : ''}
          {game.location  ? ` · ${game.location}`              : ''}
        </div>
      </div>

      {/* Lineup content */}
      {loading ? (
        <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.3)`, padding: '2.5rem 0' }}>
          Loading…
        </div>
      ) : !hasLineup ? (
        <div style={{
          background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px',
          padding: '2.5rem', textAlign: 'center', marginBottom: '1.5rem',
        }}>
          <div style={{ fontSize: '14px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '1.25rem' }}>
            No lineup built yet.
          </div>
          <Link href={lineupHref} style={{
            display: 'inline-block', fontSize: '14px', fontWeight: 700,
            background: 'var(--accent)', color: 'var(--accent-text)',
            padding: '10px 20px', borderRadius: '8px', textDecoration: 'none',
          }}>
            Build Lineup →
          </Link>
        </div>
      ) : (
        <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
            <thead>
              <tr>
                <th style={{
                  padding: '4px 6px 6px', textAlign: 'left', fontWeight: 600,
                  fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: `rgba(var(--fg-rgb), 0.3)`,
                  borderBottom: '0.5px solid var(--border)',
                }}>
                  #
                </th>
                <th style={{
                  padding: '4px 8px 6px', textAlign: 'left', fontWeight: 600,
                  fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.06em',
                  color: `rgba(var(--fg-rgb), 0.3)`, minWidth: '130px',
                  borderBottom: '0.5px solid var(--border)',
                }}>
                  Player
                </th>
                {innings.map(ii => (
                  <th key={ii} style={{
                    padding: '4px 4px 6px', textAlign: 'center', fontWeight: 600,
                    fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)`, width: '38px',
                    borderBottom: '0.5px solid var(--border)',
                  }}>
                    {ii + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeSlots.map(slot => {
                const p    = slot.player
                const name = p ? `${p.last_name}, ${p.first_name[0]}.` : '—'
                return (
                  <tr key={slot.id} style={{ borderBottom: '0.5px solid var(--border-subtle)' }}>
                    <td style={{
                      padding: '5px 6px',
                      color: `rgba(var(--fg-rgb), 0.3)`,
                      fontSize: '11px', fontWeight: 600,
                    }}>
                      {slot.batting_order ?? '—'}
                    </td>
                    <td style={{
                      padding: '5px 8px', whiteSpace: 'nowrap',
                      color: 'var(--fg)', fontSize: '13px', fontWeight: 500,
                    }}>
                      {p?.jersey_number != null && (
                        <span style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)`, marginRight: '4px' }}>
                          #{p.jersey_number}
                        </span>
                      )}
                      {name}
                    </td>
                    {innings.map(ii => {
                      const pos = (slot.inning_positions ?? [])[ii] ?? null
                      const col = pos ? (POS_COLOR[pos] ?? { bg: 'transparent', color: 'var(--fg)' }) : null
                      return (
                        <td key={ii} style={{
                          padding: '3px 2px', textAlign: 'center',
                          background: col?.bg ?? 'transparent', borderRadius: '3px',
                        }}>
                          {pos ? (
                            <span style={{ fontSize: '11px', fontWeight: 700, color: col?.color }}>
                              {pos === 'Bench' ? 'BN' : pos}
                            </span>
                          ) : (
                            <span style={{ color: `rgba(var(--fg-rgb), 0.12)` }}>·</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <Link href={lineupHref} style={{
          fontSize: '14px', fontWeight: 700,
          background: 'var(--accent)', color: 'var(--accent-text)',
          padding: '10px 18px', borderRadius: '8px', textDecoration: 'none',
          display: 'inline-block',
        }}>
          Open Full Editor →
        </Link>
        {game.status === 'lineup_ready' && (
          <Link
            href={`/games/${game.id}/print`}
            target="_blank" rel="noopener noreferrer"
            style={{
              fontSize: '14px', fontWeight: 600,
              border: '0.5px solid var(--border-md)', color: `rgba(var(--fg-rgb), 0.65)`,
              padding: '10px 18px', borderRadius: '8px', textDecoration: 'none',
              display: 'inline-block', background: 'transparent',
            }}
          >
            🖨 Print
          </Link>
        )}
        <Link href={`/games/${game.id}`} style={{
          fontSize: '14px', fontWeight: 600,
          border: '0.5px solid var(--border-md)', color: `rgba(var(--fg-rgb), 0.65)`,
          padding: '10px 18px', borderRadius: '8px', textDecoration: 'none',
          display: 'inline-block', background: 'transparent',
        }}>
          Game Details
        </Link>
      </div>
    </div>
  )
}
