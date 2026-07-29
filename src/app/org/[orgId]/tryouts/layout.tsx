'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '../../../../lib/supabase'
import { TRYOUT_NAV } from './navConfig'
import { NavIcons } from './navIcons'

// These pages are used on phones during tryouts — render without sidebar
const STANDALONE = ['/checkin', '/evalform', '/score', '/enter']

const COLLAPSE_KEY = 'tryouts:sidebar-collapsed'
const EXPANDED_WIDTH = 188
const COLLAPSED_WIDTH = 56

export default function TryoutsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { orgId: string }
}) {
  const pathname = usePathname()
  const [season, setSeason] = useState<string | null>(null)

  // Default to expanded on the server / first paint; read the real
  // preference after mount to avoid a hydration mismatch.
  const [collapsed, setCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1')
    } catch {
      // localStorage unavailable — fall back to expanded
    }
  }, [])

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch {}
      return next
    })
  }

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

  const base = `/org/${params.orgId}/tryouts`
  const isOverview = pathname === base
  const width = mounted && collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH

  const dim = 'rgba(var(--fg-rgb), 0.35)' as const
  const muted = 'rgba(var(--fg-rgb), 0.6)' as const

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif' }}>

      {/* ── Sidebar ── */}
      <nav className="tryout-sidebar" style={{
        width: `${width}px`, flexShrink: 0,
        position: 'fixed', top: 0, left: 0, bottom: 0,
        overflowY: 'auto', overflowX: 'hidden',
        background: 'var(--bg-card)',
        borderRight: '0.5px solid var(--border)',
        zIndex: 10,
        display: 'flex', flexDirection: 'column',
        transition: mounted ? 'width 0.15s ease' : undefined,
      }}>
        {/* Header */}
        <div style={{
          padding: collapsed ? '1rem 0 0.85rem' : '1rem 1rem 0.85rem',
          borderBottom: '0.5px solid var(--border)',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '4px',
        }}>
          <div style={{ minWidth: 0, flex: 1, paddingLeft: collapsed ? 0 : undefined, textAlign: collapsed ? 'center' : 'left' }}>
            <Link href={base} title="Tryouts overview" style={{
              fontSize: '15px', fontWeight: 800,
              color: isOverview ? 'var(--accent)' : 'var(--fg)',
              textDecoration: 'none', display: 'block', marginBottom: '2px',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {collapsed ? 'T' : 'Tryouts'}
            </Link>
            {!collapsed && (
              <div style={{ fontSize: '11px', color: dim, fontWeight: 500, minHeight: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {season ?? ''}
              </div>
            )}
          </div>
          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              style={{
                flexShrink: 0, width: '22px', height: '22px', marginTop: '1px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent', border: '0.5px solid var(--border-md)', borderRadius: '5px',
                color: muted, cursor: 'pointer', padding: 0,
              }}
            >
              <ChevronIcon direction="left" />
            </button>
          )}
        </div>

        {collapsed && (
          <button
            onClick={toggleCollapsed}
            title="Expand sidebar"
            aria-label="Expand sidebar"
            style={{
              margin: '8px auto 2px', width: '22px', height: '22px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: '0.5px solid var(--border-md)', borderRadius: '5px',
              color: muted, cursor: 'pointer', padding: 0,
            }}
          >
            <ChevronIcon direction="right" />
          </button>
        )}

        {/* Nav */}
        <div style={{ flex: 1, paddingTop: '6px', paddingBottom: '2rem' }}>
          {TRYOUT_NAV.map(group => (
            <div key={group.label} style={{ marginBottom: '2px' }}>
              {!collapsed && (
                <div style={{
                  padding: '10px 14px 3px',
                  fontSize: '9px', fontWeight: 800,
                  color: dim,
                  textTransform: 'uppercase', letterSpacing: '0.1em',
                }}>
                  {group.label}
                </div>
              )}
              {collapsed && <div style={{ height: '10px' }} />}
              {group.items.map(item => {
                const isActive = pathname === `${base}/${item.segment}` || pathname.startsWith(`${base}/${item.segment}/`)
                const IconCmp = NavIcons[item.segment]
                return (
                  <Link
                    key={item.segment}
                    href={`${base}/${item.segment}`}
                    title={collapsed ? item.label : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: collapsed ? '9px 0' : '6px 14px 6px 18px',
                      justifyContent: collapsed ? 'center' : 'flex-start',
                      fontSize: '13px',
                      fontWeight: isActive ? 600 : 400,
                      color: isActive ? 'var(--accent)' : muted,
                      textDecoration: 'none',
                      background: isActive ? 'rgba(var(--accent-rgb), 0.1)' : 'transparent',
                      borderLeft: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                    }}
                  >
                    {IconCmp && <IconCmp size={16} />}
                    {!collapsed && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          ))}
        </div>
      </nav>

      {/* ── Content ── */}
      <div className="tryout-content" style={{ marginLeft: `${width}px`, flex: 1, minWidth: 0, transition: mounted ? 'margin-left 0.15s ease' : undefined }}>
        {children}
      </div>
    </div>
  )
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      {direction === 'left' ? <path d="M12.5 5 7 10l5.5 5" /> : <path d="M7.5 5 13 10l-5.5 5" />}
    </svg>
  )
}
