'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useTheme } from './ThemeProvider'
import { useState, useEffect } from 'react'
import { createClient } from '../lib/supabase'
import { getSelectedTeamId, setSelectedTeamId } from '../lib/selectedTeam'

const TABS = [
  { href: '/games',       label: 'Games',        icon: '⚾' },
  { href: '/pitching',    label: 'Pitching',     icon: '🎯' },
  { href: '/fairness',    label: 'Playing Time', icon: '📊' },
  { href: '/roster',      label: 'Roster',       icon: '👥' },
  { href: '/depth-chart', label: 'Depth Chart',  icon: '⬦' },
]

const HIDDEN_PATHS = ['/', '/login']

export default function Sidebar() {
  const pathname = usePathname()
  const router   = useRouter()
  const { theme, toggle } = useTheme()
  const supabase = createClient()

  const [teams,          setTeams]          = useState<any[]>([])
  const [season,         setSeason]         = useState<any>(null)
  const [selectedTeamId, setTeamIdState]    = useState<string | null>(null)
  const [loadedTeamId,   setLoadedTeamId]   = useState<string | null>(null)

  // Load teams + active season on mount
  useEffect(() => {
    async function load() {
      const { data: allTeams } = await supabase.from('teams').select('id, name, is_active').order('created_at')
      const active = (allTeams ?? []).filter((t: any) => t.is_active !== false)
      setTeams(active)

      const cookieId = getSelectedTeamId()
      const teamId = (cookieId && active.find((t: any) => t.id === cookieId))
        ? cookieId
        : active[0]?.id ?? null
      setTeamIdState(teamId)

      if (teamId) {
        await loadSeason(teamId)
        setLoadedTeamId(teamId)
      }
    }
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadSeason(teamId: string) {
    const { data: s } = await supabase
      .from('seasons')
      .select('id, name')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    setSeason(s)
  }

  async function handleTeamChange(teamId: string) {
    setTeamIdState(teamId)
    setSelectedTeamId(teamId)
    await loadSeason(teamId)
    // Navigate to games with new team so server components re-read the cookie
    router.push(`/games?teamId=${teamId}`)
  }

  if (HIDDEN_PATHS.includes(pathname)) return null

  const selectedTeam = teams.find((t: any) => t.id === selectedTeamId)

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div style={{ padding: '1.5rem 1.25rem 1rem', flexShrink: 0 }}>
        <Link href="/games" style={{ textDecoration: 'none', color: 'var(--fg)' }}>
          <span style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.01em' }}>
            Six<span style={{ color: 'var(--accent)' }}>43</span>
          </span>
        </Link>
      </div>

      {/* Main nav */}
      <nav style={{ flex: 1, padding: '0.25rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
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

      {/* Team / season context switcher */}
      {selectedTeam && (
        <div style={{
          padding: '0.75rem 1.25rem',
          borderTop: '0.5px solid var(--border)',
          flexShrink: 0,
        }}>
          {teams.length > 1 ? (
            <select
              value={selectedTeamId ?? ''}
              onChange={e => handleTeamChange(e.target.value)}
              style={{
                width: '100%', padding: '6px 8px', borderRadius: '6px',
                border: '0.5px solid var(--border-md)',
                background: 'var(--bg-card)', color: 'var(--fg)',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                marginBottom: season ? '4px' : 0,
              }}
            >
              {teams.map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          ) : (
            <div style={{
              fontSize: '13px', fontWeight: 600,
              color: `rgba(var(--fg-rgb), 0.75)`,
              marginBottom: season ? '3px' : 0,
              padding: '0 2px',
            }}>
              {selectedTeam.name}
            </div>
          )}
          {season && (
            <div style={{
              fontSize: '11px',
              color: `rgba(var(--fg-rgb), 0.38)`,
              padding: '0 2px',
            }}>
              {season.name}
            </div>
          )}
        </div>
      )}

      {/* Bottom: settings, theme, help, back to site */}
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
          <span style={{ fontSize: '15px', width: '18px', textAlign: 'center' }}>{theme === 'dark' ? '☀️' : '🌙'}</span>
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
  )
}
