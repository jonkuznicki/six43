'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/games',       label: 'Games',     icon: '⚾' },
  { href: '/pitching',    label: 'Pitching',  icon: '🎯' },
  { href: '/fairness',    label: 'Time',      icon: '📊' },
  { href: '/roster',      label: 'Roster',    icon: '👥' },
  { href: '/depth-chart', label: 'Positions', icon: '⬦' },
]

export default function BottomNav() {
  const pathname = usePathname()

  // Hide on login and root pages
  if (pathname === '/login' || pathname === '/') return null

  return (
    <nav className="bottom-nav" style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      background: 'var(--nav-bg)',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
      borderTop: '0.5px solid var(--border)',
      display: 'flex',
      alignItems: 'stretch',
      zIndex: 100,
    }}>
      {TABS.map(tab => {
        const active = pathname.startsWith(tab.href)
        return (
          <Link key={tab.href} href={tab.href} style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 4px 12px',
            textDecoration: 'none',
            color: active ? 'var(--accent)' : `rgba(var(--fg-rgb), 0.4)`,
            fontSize: '10px',
            gap: '3px',
            transition: 'color 0.15s',
          }}>
            <span style={{ fontSize: '22px', lineHeight: 1 }}>{tab.icon}</span>
            <span style={{ fontWeight: active ? 700 : 400 }}>{tab.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
