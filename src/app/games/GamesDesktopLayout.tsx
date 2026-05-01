'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import GameCard from './GameCard'
import GamePreviewPanel from './GamePreviewPanel'
import ScrollToToday from './ScrollToToday'
import { formatTime } from '../../lib/formatTime'
import { parseScore, gameResult } from '../../lib/parseScore'

// ── Compact game row for the desktop left panel ────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  lineup_ready: '#80B0E8',
  in_progress:  '#4B9CD3',
  final:        '#6DB875',
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function GameListRow({
  game,
  selected,
  onSelect,
}: {
  game: any
  selected: boolean
  onSelect: (g: any) => void
}) {
  const isPlaceholder  = !!game.is_placeholder
  const today          = new Date().toISOString().split('T')[0]
  const isStale        = isPlaceholder && game.game_date < today
  const dotColor       = STATUS_DOT[game.status]
  const isPrintable    = game.status === 'lineup_ready'
  const isFinal        = game.status === 'final'
  const score          = isFinal ? parseScore(game.notes) : null
  const result         = score ? gameResult(score) : null
  const resultColor    = result === 'W' ? '#6DB875' : result === 'L' ? '#E87060' : `rgba(var(--fg-rgb), 0.45)`

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginBottom: '2px' }}>
      <button
        onClick={() => onSelect(game)}
        style={{
          flex: 1, minWidth: 0, textAlign: 'left', cursor: 'pointer',
          border: 'none', padding: '9px 10px', borderRadius: '8px',
          background: selected ? 'rgba(75,156,211,0.1)' : 'transparent',
          display: 'flex', alignItems: 'center', gap: '8px',
          transition: 'background 0.12s',
          opacity: isFinal ? 0.75 : 1,
        }}
      >
        {/* Status / result indicator */}
        {result ? (
          <span style={{
            fontSize: '10px', fontWeight: 800, color: resultColor,
            width: '12px', textAlign: 'center', flexShrink: 0,
          }}>
            {result}
          </span>
        ) : (
          <div style={{
            width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
            background: dotColor ?? (selected ? 'var(--accent)' : `rgba(var(--fg-rgb), 0.18)`),
          }} />
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: '13px', fontWeight: selected ? 600 : 400,
            color: selected ? 'var(--fg)' : `rgba(var(--fg-rgb), 0.75)`,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {isPlaceholder ? game.opponent : `vs ${game.opponent}`}
            {isStale && (
              <span style={{ marginLeft: '5px', fontSize: '10px', color: '#E87060' }}>⚠</span>
            )}
          </div>
          <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '1px' }}>
            {formatDate(game.game_date)}
            {game.game_time ? ` · ${formatTime(game.game_time)}` : ''}
          </div>
        </div>

        {/* Score for final games */}
        {score && (
          <span style={{
            fontSize: '12px', fontWeight: 700, flexShrink: 0,
            color: resultColor,
          }}>
            {score.us}–{score.them}
          </span>
        )}

        {selected && !score && (
          <span style={{ color: 'var(--accent)', fontSize: '14px', flexShrink: 0 }}>›</span>
        )}
      </button>

      {/* Print shortcut — only for lineup_ready games */}
      {isPrintable && (
        <Link
          href={`/games/${game.id}/print`}
          target="_blank"
          rel="noopener noreferrer"
          title="Print lineup"
          style={{
            flexShrink: 0, width: '28px', height: '28px', borderRadius: '6px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none', fontSize: '13px',
            color: `rgba(var(--fg-rgb), 0.35)`,
            background: 'transparent',
          }}
        >
          🖨
        </Link>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function GamesDesktopLayout({
  games,
  tournamentMap,
  teamName,
  inningsPerGame,
  firstUpcomingIdx,
}: {
  games: any[]
  tournamentMap: Record<string, any>
  teamName: string
  inningsPerGame: number
  firstUpcomingIdx: number
}) {
  const [selectedGame, setSelectedGame] = useState<any>(null)

  // On desktop mount, pre-select the first upcoming (or most recent) game
  // and scroll the list panel to the upcoming section
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 768 && games.length > 0) {
      const upcoming = firstUpcomingIdx >= 0 ? games[firstUpcomingIdx] : null
      setSelectedGame(upcoming ?? games[games.length - 1])

      if (firstUpcomingIdx > 0) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const panel  = document.querySelector('.games-list-panel')
          const anchor = document.getElementById('today-anchor-desktop')
          if (panel && anchor) {
            const panelRect  = panel.getBoundingClientRect()
            const anchorRect = anchor.getBoundingClientRect()
            panel.scrollTop += anchorRect.top - panelRect.top - 8
          }
        }))
      }
    }
  }, [])

  // Shared game-list renderer used by both mobile and desktop left panel
  function renderGameList(forDesktop: boolean) {
    const shownTournamentIds = new Set<string>()
    const tournamentLastIdx: Record<string, number> = {}
    games.forEach((g, i) => {
      if (g.tournament_id) tournamentLastIdx[g.tournament_id] = i
    })

    return games.map((g, idx) => {
      const showTournamentHeader = g.tournament_id && !shownTournamentIds.has(g.tournament_id)
      if (showTournamentHeader) shownTournamentIds.add(g.tournament_id)
      const tournament      = g.tournament_id ? tournamentMap[g.tournament_id] : null
      const isLastInTournament = g.tournament_id && tournamentLastIdx[g.tournament_id] === idx

      return (
        <div key={g.id}>
          {/* "Upcoming" section label */}
          {idx === firstUpcomingIdx && (
            <div
              id={forDesktop ? 'today-anchor-desktop' : 'today-anchor'}
              style={{
                fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.3)`,
                marginBottom: '4px',
                marginTop: idx > 0 ? '1rem' : 0,
                padding: forDesktop ? '0 10px' : '0',
              }}
            >
              Upcoming
            </div>
          )}

          {/* Tournament header */}
          {showTournamentHeader && tournament && (
            <Link href={`/tournaments/${g.tournament_id}`} style={{ textDecoration: 'none', display: 'block' }}>
              {forDesktop ? (
                <div style={{
                  fontSize: '10px', fontWeight: 700, color: 'var(--accent)',
                  textTransform: 'uppercase', letterSpacing: '0.07em',
                  padding: '6px 10px 2px',
                  marginTop: idx > 0 ? '0.5rem' : 0,
                }}>
                  🏆 {tournament.name}
                </div>
              ) : (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderRadius: '8px 8px 0 0',
                  marginTop: idx > 0 ? '0.5rem' : 0,
                  background: 'rgba(75,156,211,0.07)',
                  borderTop: '0.5px solid rgba(75,156,211,0.25)',
                  borderLeft: '0.5px solid rgba(75,156,211,0.25)',
                  borderRight: '0.5px solid rgba(75,156,211,0.25)',
                }}>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)',
                      textTransform: 'uppercase', letterSpacing: '0.07em', marginRight: '8px' }}>
                      Tournament
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)' }}>
                      {tournament.name}
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--accent)' }}>›</span>
                </div>
              )}
            </Link>
          )}

          {/* Game row */}
          {forDesktop ? (
            <div style={g.tournament_id ? { paddingLeft: '8px' } : {}}>
              <GameListRow
                game={g}
                selected={selectedGame?.id === g.id}
                onSelect={setSelectedGame}
              />
            </div>
          ) : (
            <div style={g.tournament_id ? {
              borderLeft: '0.5px solid rgba(75,156,211,0.25)',
              borderRight: '0.5px solid rgba(75,156,211,0.25)',
              padding: '0 4px',
            } : {}}>
              <GameCard game={g} teamName={teamName} />
            </div>
          )}

          {/* Tournament footer (mobile only) */}
          {!forDesktop && isLastInTournament && tournament && (
            <Link href={`/tournaments/${g.tournament_id}`} style={{ textDecoration: 'none', display: 'block' }}>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                padding: '6px 12px', borderRadius: '0 0 8px 8px',
                background: 'rgba(75,156,211,0.04)',
                borderBottom: '0.5px solid rgba(75,156,211,0.25)',
                borderLeft: '0.5px solid rgba(75,156,211,0.25)',
                borderRight: '0.5px solid rgba(75,156,211,0.25)',
                marginBottom: '0.5rem',
              }}>
                <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>
                  View tournament →
                </span>
              </div>
            </Link>
          )}
        </div>
      )
    })
  }

  return (
    <>
      {/* ── Mobile layout (hidden on desktop via CSS) ── */}
      <div className="games-mobile-list">
        <ScrollToToday hasPastGames={firstUpcomingIdx > 0} />
        {renderGameList(false)}
      </div>

      {/* ── Desktop two-panel layout (hidden on mobile via CSS) ── */}
      <div className="games-desktop-layout">
        {/* Left: compact game list */}
        <div className="games-list-panel">
          {renderGameList(true)}
        </div>

        {/* Right: preview panel */}
        <div className="games-preview-panel">
          {selectedGame ? (
            <GamePreviewPanel
              game={selectedGame}
              inningsPerGame={inningsPerGame}
              onDeleted={() => setSelectedGame(null)}
            />
          ) : (
            <div style={{
              padding: '3rem 0',
              textAlign: 'center',
              color: `rgba(var(--fg-rgb), 0.3)`,
              fontSize: '14px',
            }}>
              Select a game to preview.
            </div>
          )}
        </div>
      </div>
    </>
  )
}
