'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTheme } from './ThemeProvider'

const HIDDEN_PATHS = ['/', '/login']

export default function AppHeader() {
  const pathname = usePathname()
  const { theme, toggle } = useTheme()

  if (HIDDEN_PATHS.includes(pathname)) return null

  return (
    <header className="app-header" style={{
      position: 'sticky', top: 0, zIndex: 50,
      background: 'var(--nav-bg)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      borderBottom: '0.5px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 1.25rem',
      height: '48px',
    }}>
      <Link href="/dashboard" style={{ textDecoration: 'none', color: 'var(--fg)' }}>
        <span style={{ fontSize: '20px', fontWeight: 800, letterSpacing: '-0.01em' }}>
          Six<span style={{ color: 'var(--accent)' }}>43</span>
        </span>
      </Link>

      <button
        onClick={toggle}
        title="Toggle theme"
        style={{
          background: 'transparent', border: 'none',
          cursor: 'pointer', fontSize: '18px',
          padding: '6px', borderRadius: '6px',
          color: `rgba(var(--fg-rgb), 0.5)`,
          lineHeight: 1,
        }}
      >
        {theme === 'dark' ? '☀️' : '🌙'}
      </button>
    </header>
  )
}
