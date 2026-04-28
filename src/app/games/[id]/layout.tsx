'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../lib/supabase'
import { parseScore, gameResult } from '../../../lib/parseScore'
import { useTheme } from '../../ThemeProvider'

// Print page renders without sidebar chrome
const STANDALONE = ['/print']

const TABS = [
  { href: '/games',       label: 'Games',        icon: '⚾' },
  { href: '/pitching',    label: 'Pitching',     icon: '🎯' },
  { href: '/fairness',    label: 'Playing Time', icon: '📊' },
  { href: '/roster',      label: 'Roster',       icon: '👥' },
  { href: '/depth-chart', label: 'Depth Chart',  icon: '⬦' },
]

const STATUS_DOT: Record<string, string> = {
  lineup_ready: '#80B0E8',
  in_progress:  '#4B9CD3',
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function GameNavItem({ game, currentId }: { game: any; currentId: string }) {
  const isActive    = game.id === currentId
  const isFinal     = game.status === 'final'
  const score       = isFinal ? parseScore(game.notes) : null
  const result      = score ? gameResult(score) : null
  const resultColor = result === 'W' ? '#6DB875' : result === 'L' ? '#E87060' : `rgba(var(--fg-rgb), 0.45)`
  const dotColor    = STATUS_DOT[game.status]

  return (
    <Link
      href={`/games/${game.id}/lineup/desktop`}
      style={{
        display: 'block',
        padding: '6px 12px 6px 14px',
        textDecoration: 'none',
        background: isActive ? 'rgba(75,156,211,0.1)' : 'transparent',
        borderLeft: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '7px', marginBottom: '1px' }}>
        {/* Status / result indicator */}
        {result ? (
          <span style={{
            fontSize: '9px', fontWeight: 800, color: resultColor,
            width: '10px', flexShrink: 0, textAlign: 'center',
          }}>
            {result}
          </span>
        ) : (
          <div style={{
            width: '5px', height: '5px', borderRadius: '50%', flexShrink: 0,
            background: dotColor ?? (isActive ? 'var(--accent)' : `rgba(var(--fg-rgb), 0.18)`),
          }} />
        )}
        <span style={{
          fontSize: '13px',
          fontWeight: isActive ? 600 : 400,
          color: isActive ? 'var(--accent)' : isFinal ? `rgba(var(--fg-rgb), 0.5)` : `rgba(var(--fg-rgb), 0.75)`,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          flex: 1, minWidth: 0,
        }}>
          {game.is_placeholder ? game.opponent : `vs ${game.opponent}`}
        </span>
        {score && (
          <span style={{ fontSize: '11px', fontWeight: 700, color: resultColor, flexShrink: 0 }}>
            {score.us}–{score.them}
          </span>
        )}
      </div>
      <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.28)`, paddingLeft: '12px' }}>
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
  const pathname              = usePathname()
  const { theme, toggle }     = useTheme()
  const [games,      setGames]      = useState<any[]>([])
  const [seasonName, setSeasonName] = useState<string | null>(null)
  const [teamName,   setTeamName]   = useState<string | null>(null)
  const scrollRef    = useRef<HTMLDivElement>(null)
  const upcomingRef  = useRef<HTMLDivElement>(null)
  const didScrollRef = useRef(false)

  // Hide the global sidebar and remove its margin offset
  useEffect(() => {
    document.body.classList.add('games-fullscreen')
    return () => document.body.classList.remove('games-fullscreen')
  }, [])

  // Fetch this game's season → then all games in that season
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

  // Scroll the list to the upcoming section once games load.
  // Double rAF ensures layout has settled before measuring offsetTop.
  useEffect(() => {
    if (games.length === 0 || didScrollRef.current) return
    didScrollRef.current = true
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (scrollRef.current && upcomingRef.current) {
        const containerTop = scrollRef.current.getBoundingClientRect().top
        const upcomingTop  = upcomingRef.current.getBoundingClientRect().top
        scrollRef.current.scrollTop += upcomingTop - containerTop - 8
      }
    }))
  }, [games])

  // Print page — render without sidebar chrome
  if (STANDALONE.some(p => pathname.includes(p))) return <>{children}</>

  const today    = new Date().toISOString().split('T')[0]
  const upcoming = games.filter(g => g.game_date >= today && g.status !== 'final')
  // Past in chronological order (oldest → newest, top → bottom) so upcoming lands below
  const past     = games.filter(g => g.game_date < today || g.status === 'final')

  const dim = 'rgba(var(--fg-rgb), 0.35)' as const

  return (
    <div style={{
      display: 'flex', minHeight: '100vh',
      background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif',
    }}>

      {/* ── Left sidebar (desktop only, controlled by CSS) ── */}
      <aside className="games-left-nav" style={{
        width: '220px', flexShrink: 0,
        position: 'fixed', top: 0, left: 0, bottom: 0,
        display: 'flex', flexDirection: 'column',
        background: 'var(--nav-bg)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        borderRight: '0.5px solid var(--border)',
        zIndex: 100,
      }}>

        {/* ── Logo ── */}
        <div style={{ padding: '1.5rem 1.25rem 1rem', flexShrink: 0 }}>
          <Link href="/games" style={{ textDecoration: 'none', color: 'var(--fg)' }}>
            <span style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.01em' }}>
              Six<span style={{ color: 'var(--accent)' }}>43</span>
            </span>
          </Link>
        </div>

        {/* ── Main nav tabs ── */}
        <nav style={{ padding: '0 0.75rem', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
          {TABS.map(tab => {
            const active = pathname.startsWith(tab.href)
            return (
              <Link key={tab.href} href={tab.href} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '9px 12px', borderRadius: '8px',
                textDecoration: 'none',
                background: active ? 'rgba(75,156,211,0.12)' : 'transparent',
                color: active ? 'var(--accent)' : `rgba(var(--fg-rgb), 0.6)`,
                fontSize: '14px', fontWeight: active ? 700 : 400,
                transition: 'background 0.15s, color 0.15s',
              }}>
                <span style={{ fontSize: '18px', lineHeight: 1, width: '22px', textAlign: 'center' }}>
                  {tab.icon}
                </span>
                {tab.label}
              </Link>
            )
          })}
        </nav>

        {/* ── Schedule section (scrollable) ── */}
        <div
          ref={scrollRef}
          style={{
            flex: 1, minHeight: 0, overflowY: 'auto',
            borderTop: '0.5px solid var(--border)',
            marginTop: '0.5rem',
          }}
        >
          <div style={{ padding: '6px 0 1.5rem' }}>

            {/* Section label */}
            <div style={{
              padding: '8px 14px 4px',
              fontSize: '9px', fontWeight: 800,
              color: dim,
              textTransform: 'uppercase', letterSpacing: '0.1em',
            }}>
              Schedule
            </div>

            {/* Past games — chronological, scroll up to see */}
            {past.length > 0 && (
              <div style={{ marginBottom: upcoming.length > 0 ? '6px' : 0 }}>
                <div style={{
                  padding: '6px 14px 2px',
                  fontSize: '9px', fontWeight: 700,
                  color: `rgba(var(--fg-rgb), 0.25)`,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>
                  Past
                </div>
                {past.map(g => (
                  <GameNavItem key={g.id} game={g} currentId={params.id} />
                ))}
              </div>
            )}

            {/* Upcoming games — page lands here on load */}
            {upcoming.length > 0 && (
              <div ref={upcomingRef}>
                <div style={{
                  padding: '6px 14px 2px',
                  fontSize: '9px', fontWeight: 700,
                  color: `rgba(var(--fg-rgb), 0.25)`,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                }}>
                  Upcoming
                </div>
                {upcoming.map(g => (
                  <GameNavItem key={g.id} game={g} currentId={params.id} />
                ))}
              </div>
            )}

            {games.length === 0 && (
              <div style={{ padding: '1rem 14px', fontSize: '12px', color: dim }}>
                Loading…
              </div>
            )}
          </div>
        </div>

        {/* ── Bottom: team/season + settings ── */}
        {(teamName || seasonName) && (
          <div style={{
            padding: '0.75rem 1.25rem',
            borderTop: '0.5px solid var(--border)',
            flexShrink: 0,
          }}>
            <div style={{ fontSize: '13px', fontWeight: 600, color: `rgba(var(--fg-rgb), 0.75)`, marginBottom: '3px' }}>
              {teamName}
            </div>
            {seasonName && (
              <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.38)` }}>
                {seasonName}
              </div>
            )}
          </div>
        )}

        <div style={{
          padding: '0.75rem 1.25rem 1rem',
          borderTop: '0.5px solid var(--border)',
          flexShrink: 0,
          display: 'flex', flexDirection: 'column', gap: '2px',
        }}>
          <Link href="/settings" style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            color: pathname.startsWith('/settings') ? 'var(--accent)' : `rgba(var(--fg-rgb), 0.45)`,
            fontSize: '13px', padding: '4px 2px',
            textDecoration: 'none',
            fontWeight: pathname.startsWith('/settings') ? 600 : 400,
          }}>
            <span style={{ fontSize: '15px', width: '18px', textAlign: 'center' }}>⚙️</span>
            <span>Team Settings</span>
          </Link>
          <button onClick={toggle} style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: `rgba(var(--fg-rgb), 0.45)`, fontSize: '13px', padding: '4px 2px',
            width: '100%',
          }}>
            <span style={{ fontSize: '15px', width: '18px', textAlign: 'center' }}>
              {theme === 'dark' ? '☀️' : '🌙'}
            </span>
            <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <Link href="/help" style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            color: `rgba(var(--fg-rgb), 0.35)`, fontSize: '13px', padding: '4px 2px',
            textDecoration: 'none',
          }}>
            <span style={{ fontSize: '14px', width: '18px', textAlign: 'center' }}>?</span>
            <span>Help &amp; FAQ</span>
          </Link>
          <Link href="/" style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            color: `rgba(var(--fg-rgb), 0.25)`, fontSize: '12px', padding: '4px 2px',
            textDecoration: 'none',
          }}>
            <span style={{ fontSize: '13px', width: '18px', textAlign: 'center' }}>←</span>
            <span>Back to six43.com</span>
          </Link>
        </div>

      </aside>

      {/* ── Content area ── */}
      <div className="games-fullscreen-content" style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>

    </div>
  )
}
