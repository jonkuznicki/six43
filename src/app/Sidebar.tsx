'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from './ThemeProvider'

const TABS = [
  { href: '/dashboard', label: 'Home',          icon: '⌂' },
  { href: '/games',     label: 'Games',         icon: '⚾' },
  { href: '/fairness',  label: 'Playing Time',  icon: '📊' },
  { href: '/settings',  label: 'Team Settings', icon: '⚙️' },
]

const HIDDEN_PATHS = ['/', '/login']

export default function Sidebar() {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()

  if (HIDDEN_PATHS.includes(pathname)) return null

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div style={{ padding: '1.5rem 1.25rem 1rem', flexShrink: 0 }}>
        <Link href="/dashboard" style={{ textDecoration: 'none', color: 'var(--fg)' }}>
          <span style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.01em' }}>
            Six<span style={{ color: 'var(--accent)' }}>43</span>
          </span>
        </Link>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0.25rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {TABS.map(tab => {
          const active = pathname === tab.href || (tab.href !== '/dashboard' && pathname.startsWith(tab.href))
          return (
            <Link key={tab.href} href={tab.href} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 12px', borderRadius: '8px',
              textDecoration: 'none',
              background: active ? 'rgba(232,160,32,0.12)' : 'transparent',
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

      {/* Bottom: theme toggle, help, back to site */}
      <div style={{ padding: '1rem 1.25rem', borderTop: '0.5px solid var(--border)', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <button onClick={toggle} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: `rgba(var(--fg-rgb), 0.45)`, fontSize: '13px', padding: '4px 0',
          width: '100%',
        }}>
          <span style={{ fontSize: '16px' }}>{theme === 'dark' ? '☀️' : '🌙'}</span>
          <span>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
        <Link href="/help" style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          color: `rgba(var(--fg-rgb), 0.35)`, fontSize: '13px', padding: '4px 0',
          textDecoration: 'none',
        }}>
          <span style={{ fontSize: '15px' }}>?</span>
          <span>Help &amp; FAQ</span>
        </Link>
      </div>
    </aside>
  )
}
