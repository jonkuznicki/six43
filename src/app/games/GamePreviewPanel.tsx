'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../lib/supabase'
import { formatTime } from '../../lib/formatTime'
import { parseScore, gameResult } from '../../lib/parseScore'
import GameEditButton from './[id]/GameEditButton'

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
  onDeleted,
}: {
  game: any
  inningsPerGame: number
  onDeleted?: () => void
}) {
  const supabase  = createClient()
  const router    = useRouter()
  const [slots,          setSlots]          = useState<any[]>([])
  const [loading,        setLoading]        = useState(true)
  const [confirmDelete,  setConfirmDelete]  = useState(false)
  const [deleting,       setDeleting]       = useState(false)

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

  const activeSlots  = slots.filter(s => s.availability !== 'absent')
  const absentSlots  = slots.filter(s => s.availability === 'absent')
  const hasLineup    = activeSlots.some(s => (s.inning_positions ?? []).some(Boolean))
  const inningCount  = game.innings_played ?? inningsPerGame ?? 6
  const innings      = Array.from({ length: inningCount }, (_, i) => i)

  // An inning is "filled" only when every active player has a position assigned
  const inningsFilled = innings.filter(ii =>
    activeSlots.length > 0 && activeSlots.every(s => (s.inning_positions ?? [])[ii] != null)
  ).length

  // P/C runs — collapse consecutive same-name innings into ranges
  function buildRuns(position: string) {
    const runs: { name: string; start: number; end: number }[] = []
    for (const ii of innings) {
      const match = activeSlots.find(s => (s.inning_positions ?? [])[ii] === position)
      const name  = match ? lastName(match.player) : null
      if (!name) continue
      const last = runs[runs.length - 1]
      if (last && last.name === name) last.end = ii + 1
      else runs.push({ name, start: ii + 1, end: ii + 1 })
    }
    return runs
  }

  const pitcherRuns = buildRuns('P')
  const catcherRuns = buildRuns('C')

  async function deleteGame() {
    setDeleting(true)
    const { error } = await supabase.from('games').delete().eq('id', game.id)
    if (error) { setDeleting(false); return }
    onDeleted?.()
    router.refresh()
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
        <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.25)`, marginBottom: '1.25rem' }}>Loading…</div>
      ) : !hasLineup ? (
        <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '1.25rem' }}>No lineup yet</div>
      ) : (
        <>
          {/* ── Innings filled ── */}
          <div style={{ marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', gap: '3px' }}>
              {innings.map(ii => {
                const filled = activeSlots.length > 0 && activeSlots.every(s => (s.inning_positions ?? [])[ii] != null)
                return (
                  <div key={ii} style={{
                    width: '18px', height: '6px', borderRadius: '2px',
                    background: filled ? 'var(--accent)' : 'var(--border-md)',
                  }} />
                )
              })}
            </div>
            <span style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.45)` }}>
              {inningsFilled}/{inningCount} innings filled
            </span>
          </div>

          {/* ── Pitchers & Catchers — 2 columns ── */}
          {(pitcherRuns.length > 0 || catcherRuns.length > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16px', marginBottom: '1rem' }}>
              {pitcherRuns.length > 0 && (
                <div>
                  <div style={sectionLabel}>Pitchers</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {pitcherRuns.map((run, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontSize: '10px', fontWeight: 700, color: '#4B9CD3',
                          background: 'rgba(75,156,211,0.12)', padding: '2px 5px', borderRadius: '3px', flexShrink: 0,
                        }}>
                          {run.start === run.end ? `${run.start}` : `${run.start}–${run.end}`}
                        </span>
                        <span style={{ fontSize: '13px', color: 'var(--fg)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {catcherRuns.length > 0 && (
                <div>
                  <div style={sectionLabel}>Catchers</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {catcherRuns.map((run, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          fontSize: '10px', fontWeight: 700, color: '#E090B0',
                          background: 'rgba(192,80,120,0.12)', padding: '2px 5px', borderRadius: '3px', flexShrink: 0,
                        }}>
                          {run.start === run.end ? `${run.start}` : `${run.start}–${run.end}`}
                        </span>
                        <span style={{ fontSize: '13px', color: 'var(--fg)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{run.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Absent players ── */}
          {absentSlots.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={sectionLabel}>Absent</div>
              <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.5)` }}>
                {absentSlots.map(s => `${s.player?.first_name} ${s.player?.last_name}`).join(', ')}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Actions ── */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginTop: '1.25rem' }}>
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
        <GameEditButton game={game} />
        <div style={{ flex: 1 }} />
        {confirmDelete ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.45)` }}>Delete this game?</span>
            <button onClick={deleteGame} disabled={deleting} style={{
              fontSize: '12px', fontWeight: 700, padding: '6px 12px', borderRadius: '6px',
              border: 'none', background: '#C0392B', color: 'white',
              cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1,
            }}>{deleting ? 'Deleting…' : 'Yes, delete'}</button>
            <button onClick={() => setConfirmDelete(false)} style={{
              fontSize: '12px', padding: '6px 10px', borderRadius: '6px',
              border: '0.5px solid var(--border-md)', background: 'transparent',
              color: `rgba(var(--fg-rgb), 0.5)`, cursor: 'pointer',
            }}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDelete(true)} style={{
            fontSize: '12px', padding: '6px 10px', borderRadius: '6px',
            border: '0.5px solid var(--border-subtle)', background: 'transparent',
            color: `rgba(var(--fg-rgb), 0.28)`, cursor: 'pointer',
          }}>Delete game</button>
        )}
      </div>
    </div>
  )
}

const sectionLabel: React.CSSProperties = {
  fontSize: '10px', fontWeight: 700, letterSpacing: '0.09em',
  textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.3)`,
  marginBottom: '7px',
}
