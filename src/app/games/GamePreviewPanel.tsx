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

function lastName(player: any) {
  return player?.last_name ?? player?.first_name ?? '—'
}

export default function GamePreviewPanel({
  game,
  inningsPerGame,
}: {
  game: any
  inningsPerGame: number
}) {
  const supabase   = createClient()
  const [slots,    setSlots]   = useState<any[]>([])
  const [loading,  setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    supabase
      .from('lineup_slots')
      .select('*, player:players(first_name, last_name, jersey_number)')
      .eq('game_id', game.id)
      .order('batting_order', { ascending: true, nullsFirst: false })
      .then(({ data }) => { setSlots(data ?? []); setLoading(false) })
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

  const activeSlots   = slots.filter(s => s.availability !== 'absent')
  const hasLineup     = activeSlots.some(s => (s.inning_positions ?? []).some(Boolean))
  const inningCount   = game.innings_played ?? inningsPerGame ?? 6
  const innings       = Array.from({ length: inningCount }, (_, i) => i)

  // P/C by inning — find who plays each role each inning
  const pcByInning = innings.map(ii => {
    const pitcher = activeSlots.find(s => (s.inning_positions ?? [])[ii] === 'P')
    const catcher = activeSlots.find(s => (s.inning_positions ?? [])[ii] === 'C')
    return {
      inning: ii + 1,
      pitcher: pitcher ? lastName(pitcher.player) : null,
      catcher: catcher ? lastName(catcher.player) : null,
    }
  })

  // Collapse consecutive same-pitcher runs into ranges for compact display
  // e.g. Smith pitches inn 1-3, Jones inn 4-6
  const pitcherRuns: { name: string; start: number; end: number }[] = []
  for (const { inning, pitcher } of pcByInning) {
    if (!pitcher) continue
    const last = pitcherRuns[pitcherRuns.length - 1]
    if (last && last.name === pitcher) { last.end = inning }
    else pitcherRuns.push({ name: pitcher, start: inning, end: inning })
  }

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '0.5px solid var(--border)',
      borderRadius: '12px',
      padding: '1.5rem',
    }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '1.25rem' }}>
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
              color: sc.color, border: `0.5px solid ${sc.color}55`, flexShrink: 0, marginTop: '3px',
            }}>{sc.label}</span>
          ) : null}
        </div>
        <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)` }}>
          {formatted}{metaParts.length > 0 && ` · ${metaParts.join(' · ')}`}
        </div>
      </div>

      {loading ? (
        <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.25)`, marginBottom: '1.25rem' }}>
          Loading…
        </div>
      ) : !hasLineup ? (
        <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '1.25rem' }}>
          No lineup yet
        </div>
      ) : (
        <>
          {/* ── Batting order ── */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={sectionLabel}>Batting order</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px 16px' }}>
              {activeSlots.map((slot, idx) => (
                <div key={slot.id} style={{
                  display: 'flex', alignItems: 'center', gap: '7px',
                  padding: '3px 0',
                  borderBottom: '0.5px solid var(--border-subtle)',
                }}>
                  <span style={{
                    fontSize: '10px', fontWeight: 700, color: `rgba(var(--fg-rgb), 0.3)`,
                    width: '14px', textAlign: 'right', flexShrink: 0,
                  }}>{idx + 1}</span>
                  {slot.player?.jersey_number != null && (
                    <span style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)`, flexShrink: 0 }}>
                      #{slot.player.jersey_number}
                    </span>
                  )}
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--fg)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {slot.player?.first_name} {slot.player?.last_name}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Pitcher summary ── */}
          {pitcherRuns.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={sectionLabel}>Pitchers</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {pitcherRuns.map((run, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, color: '#4B9CD3',
                      background: 'rgba(75,156,211,0.12)', padding: '2px 6px',
                      borderRadius: '3px', flexShrink: 0,
                    }}>
                      {run.start === run.end ? `Inn ${run.start}` : `Inn ${run.start}–${run.end}`}
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--fg)', fontWeight: 500 }}>
                      {run.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── C by inning (compact inline) ── */}
          {pcByInning.some(r => r.catcher) && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={sectionLabel}>Catchers</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                {(() => {
                  const catcherRuns: { name: string; start: number; end: number }[] = []
                  for (const { inning, catcher } of pcByInning) {
                    if (!catcher) continue
                    const last = catcherRuns[catcherRuns.length - 1]
                    if (last && last.name === catcher) { last.end = inning }
                    else catcherRuns.push({ name: catcher, start: inning, end: inning })
                  }
                  return catcherRuns.map((run, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{
                        fontSize: '10px', fontWeight: 700, color: '#E090B0',
                        background: 'rgba(192,80,120,0.12)', padding: '2px 6px',
                        borderRadius: '3px', flexShrink: 0,
                      }}>
                        {run.start === run.end ? `Inn ${run.start}` : `Inn ${run.start}–${run.end}`}
                      </span>
                      <span style={{ fontSize: '13px', color: 'var(--fg)', fontWeight: 500 }}>
                        {run.name}
                      </span>
                    </div>
                  ))
                })()}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
        <Link href={lineupHref} style={{
          fontSize: '14px', fontWeight: 700,
          background: 'var(--accent)', color: 'var(--accent-text)',
          padding: '10px 20px', borderRadius: '8px', textDecoration: 'none',
          display: 'inline-block', flexShrink: 0,
        }}>
          {hasLineup ? 'Edit Lineup →' : 'Build Lineup →'}
        </Link>
        {game.status === 'lineup_ready' && (
          <Link
            href={`/games/${game.id}/print`}
            target="_blank" rel="noopener noreferrer"
            style={{
              fontSize: '13px', fontWeight: 600,
              border: '0.5px solid var(--border-md)', color: `rgba(var(--fg-rgb), 0.6)`,
              padding: '10px 16px', borderRadius: '8px', textDecoration: 'none',
              display: 'inline-block', background: 'transparent', flexShrink: 0,
            }}
          >
            🖨 Print
          </Link>
        )}
      </div>
    </div>
  )
}

const sectionLabel: React.CSSProperties = {
  fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`,
  marginBottom: '6px',
}
