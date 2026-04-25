'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../../lib/supabase'

const NAV = [
  {
    label: 'Setup',
    items: [
      { href: 'seasons',  label: 'Seasons' },
      { href: 'members',  label: 'Members' },
      { href: 'scoring',  label: 'Scoring Setup' },
    ],
  },
  {
    label: 'Player Data',
    items: [
      { href: 'imports',   label: 'Imports' },
      { href: 'data-hub',  label: 'Data Hub' },
      { href: 'readiness', label: 'Readiness' },
    ],
  },
  {
    label: 'Tryouts',
    items: [
      { href: 'sessions',    label: 'Sessions' },
      { href: 'coach-evals', label: 'Evaluations' },
    ],
  },
  {
    label: 'Team Making',
    items: [
      { href: 'rankings', label: 'Rankings' },
      { href: 'teams',    label: 'Teams' },
    ],
  },
]

// These pages are used on phones during tryouts — render without sidebar
const STANDALONE = ['/checkin', '/evalform', '/score', '/enter']

export default function TryoutsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { orgId: string }
}) {
  const pathname   = usePathname()
  const [season, setSeason] = useState<string | null>(null)

  useEffect(() => {
    document.body.classList.add('tryout-fullscreen')
    return () => document.body.classList.remove('tryout-fullscreen')
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('tryout_seasons')
      .select('label')
      .eq('org_id', params.orgId)
      .eq('is_active', true)
      .maybeSingle()
      .then(({ data }) => setSeason(data?.label ?? null))
  }, [params.orgId])

  if (STANDALONE.some(p => pathname.includes(p))) return <>{children}</>

  const base       = `/org/${params.orgId}/tryouts`
  const isOverview = pathname === base

  const dim    = 'rgba(var(--fg-rgb), 0.35)' as const
  const muted  = 'rgba(var(--fg-rgb), 0.6)'  as const

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif' }}>

      {/* ── Sidebar ── */}
      <nav style={{
        width: '188px', flexShrink: 0,
        position: 'fixed', top: 0, left: 0, bottom: 0,
        overflowY: 'auto',
        background: 'var(--bg-card)',
        borderRight: '0.5px solid var(--border)',
        zIndex: 10,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ padding: '1rem 1rem 0.85rem', borderBottom: '0.5px solid var(--border)' }}>
          <Link href={base} style={{
            fontSize: '15px', fontWeight: 800,
            color: isOverview ? 'var(--accent)' : 'var(--fg)',
            textDecoration: 'none', display: 'block', marginBottom: '2px',
          }}>
            Tryouts
          </Link>
          <div style={{ fontSize: '11px', color: dim, fontWeight: 500, minHeight: '14px' }}>
            {season ?? ''}
          </div>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, paddingTop: '6px', paddingBottom: '2rem' }}>
          {NAV.map(section => (
            <div key={section.label} style={{ marginBottom: '2px' }}>
              <div style={{
                padding: '10px 14px 3px',
                fontSize: '9px', fontWeight: 800,
                color: dim,
                textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>
                {section.label}
              </div>
              {section.items.map(item => {
                const segment = item.href.split('?')[0]
                const isActive = pathname === `${base}/${segment}` || pathname.startsWith(`${base}/${segment}/`)
                return (
                  <Link key={item.href} href={`${base}/${item.href}`} style={{
                    display: 'block',
                    padding: '6px 14px 6px 18px',
                    fontSize: '13px',
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? 'var(--accent)' : muted,
                    textDecoration: 'none',
                    background: isActive ? 'rgba(232,160,32,0.08)' : 'transparent',
                    borderLeft: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                  }}>
                    {item.label}
                  </Link>
                )
              })}
            </div>
          ))}
        </div>
      </nav>

      {/* ── Content ── */}
      <div style={{ marginLeft: '188px', flex: 1, minWidth: 0 }}>
        {children}
      </div>
    </div>
  )
}
