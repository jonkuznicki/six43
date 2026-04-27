'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '../../lib/supabase'
import { formatTime } from '../../lib/formatTime'
import { parseScore, gameResult } from '../../lib/parseScore'

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
  const [playerCount, setPlayerCount] = useState<number | null>(null)

  useEffect(() => {
    setPlayerCount(null)
    supabase
      .from('lineup_slots')
      .select('id', { count: 'exact', head: true })
      .eq('game_id', game.id)
      .neq('availability', 'absent')
      .then(({ count }) => setPlayerCount(count ?? 0))
  }, [game.id])

  const date      = new Date(game.game_date + 'T12:00:00')
  const formatted = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const sc        = STATUS_LABEL[game.status] ?? STATUS_LABEL.scheduled
  const score     = game.status === 'final' ? parseScore(game.notes) : null
  const result    = score ? gameResult(score) : null
  const resultColor = result === 'W' ? '#6DB875' : result === 'L' ? '#E87060' : `rgba(var(--fg-rgb), 0.45)`
  const isPlaceholder = !!game.is_placeholder
  const lineupHref = `/games/${game.id}/lineup/desktop`

  const metaParts = [
    game.game_time ? formatTime(game.game_time) : null,
    game.location  ? game.location : null,
  ].filter(Boolean)

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '0.5px solid var(--border)',
      borderRadius: '12px',
      padding: '1.5rem',
    }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px', marginBottom: '4px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, lineHeight: 1.2 }}>
            {isPlaceholder ? game.opponent : `vs ${game.opponent}`}
          </h2>
          {score ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <span style={{
                fontSize: '11px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                color: resultColor, border: `0.5px solid ${resultColor}55`,
              }}>{result}</span>
              <span style={{ fontSize: '22px', fontWeight: 800, color: resultColor, lineHeight: 1 }}>
                {score.us}–{score.them}
              </span>
            </div>
          ) : !isPlaceholder ? (
            <span style={{
              fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
              color: sc.color, border: `0.5px solid ${sc.color}55`, flexShrink: 0,
              marginTop: '3px',
            }}>{sc.label}</span>
          ) : null}
        </div>

        <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)` }}>
          {formatted}
          {metaParts.length > 0 && ` · ${metaParts.join(' · ')}`}
        </div>
      </div>

      {/* ── Player count ── */}
      <div style={{
        fontSize: '13px',
        color: playerCount === null
          ? `rgba(var(--fg-rgb), 0.25)`
          : playerCount > 0
            ? `rgba(var(--fg-rgb), 0.5)`
            : `rgba(var(--fg-rgb), 0.3)`,
        marginBottom: '1.25rem',
        fontStyle: playerCount === null ? 'italic' : 'normal',
      }}>
        {playerCount === null
          ? 'Loading…'
          : playerCount > 0
            ? `${playerCount} player${playerCount !== 1 ? 's' : ''} in lineup`
            : 'No lineup yet'}
      </div>

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Link href={lineupHref} style={{
          fontSize: '14px', fontWeight: 700,
          background: 'var(--accent)', color: 'var(--accent-text)',
          padding: '10px 20px', borderRadius: '8px', textDecoration: 'none',
          display: 'inline-block', flexShrink: 0,
        }}>
          {playerCount ? 'Edit Lineup →' : 'Build Lineup →'}
        </Link>

        {game.status === 'lineup_ready' && (
          <Link
            href={`/games/${game.id}/print`}
            target="_blank" rel="noopener noreferrer"
            style={{
              fontSize: '13px', fontWeight: 600,
              border: '0.5px solid var(--border-md)',
              color: `rgba(var(--fg-rgb), 0.6)`,
              padding: '10px 16px', borderRadius: '8px',
              textDecoration: 'none', display: 'inline-block',
              background: 'transparent', flexShrink: 0,
            }}
          >
            🖨 Print
          </Link>
        )}
      </div>
    </div>
  )
}
