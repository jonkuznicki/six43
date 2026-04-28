'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase'
import { parseScore, gameResult } from '../../../lib/parseScore'

// Print page renders without sidebar
const STANDALONE = ['/print']

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const STATUS_DOT: Record<string, string> = {
  lineup_ready: '#80B0E8',
  in_progress:  '#4B9CD3',
}

function GameNavItem({ game, currentId }: { game: any; currentId: string }) {
  const isActive   = game.id === currentId
  const isFinal    = game.status === 'final'
  const score      = isFinal ? parseScore(game.notes) : null
  const result     = score ? gameResult(score) : null
  const resultColor = result === 'W' ? '#6DB875' : result === 'L' ? '#E87060' : `rgba(var(--fg-rgb), 0.45)`
  const dotColor   = STATUS_DOT[game.status]

  return (
    <Link
      href={`/games/${game.id}/lineup/desktop`}
      style={{
        display: 'block',
        padding: '7px 14px 7px 16px',
        textDecoration: 'none',
        background: isActive ? 'rgba(75,156,211,0.08)' : 'transparent',
        borderLeft: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
      }}
    >
      {/* Opponent row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px',
      }}>
        {/* Status/result indicator */}
        {result ? (
          <span style={{
            fontSize: '9px', fontWeight: 800, color: resultColor,
            width: '10px', flexShrink: 0, textAlign: 'center',
          }}>
            {result}
          </span>
        ) : dotColor ? (
          <div style={{
            width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0,
            background: dotColor,
          }} />
        ) : (
          <div style={{
            width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0,
            background: isActive ? 'var(--accent)' : `rgba(var(--fg-rgb), 0.18)`,
          }} />
        )}
        <span style={{
          fontSize: '13px',
          fontWeight: isActive ? 600 : 400,
          color: isActive ? 'var(--accent)' : isFinal ? `rgba(var(--fg-rgb), 0.55)` : `rgba(var(--fg-rgb), 0.75)`,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          flex: 1,
        }}>
          {game.is_placeholder ? game.opponent : `vs ${game.opponent}`}
        </span>
        {/* Score */}
        {score && (
          <span style={{
            fontSize: '11px', fontWeight: 700, color: resultColor, flexShrink: 0,
          }}>
            {score.us}–{score.them}
          </span>
        )}
      </div>
      {/* Date row */}
      <div style={{
        fontSize: '11px', color: `rgba(var(--fg-rgb), 0.3)`,
        paddingLeft: '11px',
      }}>
        {formatDate(game.game_date)}
      </div>
    </Link>
  )
}

export default function GameLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { id: string }
}) {
  const pathname   = usePathname()
  const [games,       setGames]      = useState<any[]>([])
  const [seasonName,  setSeasonName] = useState<string | null>(null)
  const [teamName,    setTeamName]   = useState<string | null>(null)

  // Add body class to hide global sidebar and remove its margin
  useEffect(() => {
    document.body.classList.add('games-fullscreen')
    return () => document.body.classList.remove('games-fullscreen')
  }, [])

  // Fetch the current game's season, then all games in that season
  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('games')
      .select('season_id, season:seasons(name, team:teams(name))')
      .eq('id', params.id)
      .single()
      .then(async ({ data: g }) => {
        if (!g) return
        const season = g.season as any
        setSeasonName(season?.name ?? null)
        setTeamName(season?.team?.name ?? null)

        const { data: allGames } = await supabase
          .from('games')
          .select('id, opponent, game_date, game_time, status, notes, is_placeholder')
          .eq('season_id', g.season_id)
          .order('game_date', { ascending: true })
          .order('game_time', { ascending: true, nullsFirst: false })

        setGames(allGames ?? [])
      })
  }, [params.id])

  // Print page — render without sidebar chrome
  if (STANDALONE.some(p => pathname.includes(p))) return <>{children}</>

  const today    = new Date().toISOString().split('T')[0]
  const upcoming = games.filter(g => g.game_date >= today && g.status !== 'final')
  const past     = [...games.filter(g => g.game_date < today || g.status === 'final')].reverse()

  const dim   = 'rgba(var(--fg-rgb), 0.35)' as const
  const muted = 'rgba(var(--fg-rgb), 0.4)'  as const

  return (
    <div style={{
      display: 'flex', minHeight: '100vh',
      background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif',
    }}>

      {/* ── Left nav (desktop only, CSS-controlled) ── */}
      <nav className="games-left-nav" style={{
        width: '188px', flexShrink: 0,
        position: 'fixed', top: 0, left: 0, bottom: 0,
        background: 'var(--bg-card)',
        borderRight: '0.5px solid var(--border)',
        zIndex: 10,
        overflowY: 'auto',
      }}>

        {/* Header */}
        <div style={{ padding: '1rem 1rem 0.85rem', borderBottom: '0.5px solid var(--border)', flexShrink: 0 }}>
          <Link href="/games" style={{
            fontSize: '15px', fontWeight: 800,
            color: 'var(--fg)',
            textDecoration: 'none', display: 'block', marginBottom: '2px',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {teamName ?? 'Games'}
          </Link>
          <div style={{ fontSize: '11px', color: dim, fontWeight: 500, minHeight: '14px' }}>
            {seasonName ?? ''}
          </div>
        </div>

        {/* Game list */}
        <div style={{ flex: 1, paddingTop: '4px', paddingBottom: '1rem' }}>
          {upcoming.length > 0 && (
            <div style={{ marginBottom: '4px' }}>
              <div style={{
                padding: '8px 14px 3px',
                fontSize: '9px', fontWeight: 800,
                color: dim,
                textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>
                Upcoming
              </div>
              {upcoming.map(g => (
                <GameNavItem key={g.id} game={g} currentId={params.id} />
              ))}
            </div>
          )}
          {past.length > 0 && (
            <div>
              <div style={{
                padding: '8px 14px 3px',
                fontSize: '9px', fontWeight: 800,
                color: dim,
                textTransform: 'uppercase', letterSpacing: '0.1em',
                marginTop: upcoming.length > 0 ? '6px' : 0,
              }}>
                Past
              </div>
              {past.map(g => (
                <GameNavItem key={g.id} game={g} currentId={params.id} />
              ))}
            </div>
          )}

          {games.length === 0 && (
            <div style={{ padding: '1.5rem 14px', fontSize: '12px', color: muted }}>
              Loading…
            </div>
          )}
        </div>

        {/* Footer: quick nav links */}
        <div style={{ borderTop: '0.5px solid var(--border)', padding: '6px 0 10px', flexShrink: 0 }}>
          {[
            { href: '/pitching', label: 'Pitching',     icon: '🎯' },
            { href: '/fairness', label: 'Playing Time',  icon: '📊' },
            { href: '/roster',   label: 'Roster',        icon: '👥' },
          ].map(link => (
            <Link key={link.href} href={link.href} style={{
              display: 'flex', alignItems: 'center', gap: '7px',
              padding: '5px 14px',
              fontSize: '12px',
              color: muted,
              textDecoration: 'none',
            }}>
              <span style={{ fontSize: '11px' }}>{link.icon}</span>
              {link.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* ── Content area ── */}
      <div className="games-fullscreen-content" style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>

    </div>
  )
}
