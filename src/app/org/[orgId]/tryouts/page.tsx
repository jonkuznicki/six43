'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../../lib/supabase'
import Link from 'next/link'

interface OrgData {
  name:  string
  sport: string
}
interface Season {
  id:         string
  label:      string
  year:       number
  age_groups: string[]
}
interface Stats {
  players:        number
  sessions:       number
  openSessions:   number
  evalsDraft:     number
  evalsSubmitted: number
}

// ── Workflow sections ──────────────────────────────────────────────────────────

const SECTIONS = [
  {
    step:  1,
    label: 'Setup',
    desc:  'Configure the season before anything else — set age groups, invite staff, and define how players will be scored.',
    color: 'rgba(var(--fg-rgb), 0.06)',
    items: [
      { href: 'seasons',  label: 'Seasons',       icon: '📅', desc: 'Set the active season and age groups' },
      { href: 'members',  label: 'Members',        icon: '🔑', desc: 'Invite coaches and evaluators' },
      { href: 'scoring',  label: 'Scoring Setup',  icon: '⚙',  desc: 'Tryout categories, weights, and eval rubric' },
    ],
  },
  {
    step:  2,
    label: 'Player Data',
    desc:  'Bring in all data sources, verify each player is mapped correctly, and set tryout age groups before sessions begin.',
    color: 'rgba(80,160,232,0.05)',
    items: [
      { href: 'imports',     label: 'Imports',     icon: '↑',  desc: 'Upload registration, rosters, and GameChanger stats' },
      { href: 'players',     label: 'Players',     icon: '👥', desc: 'Registered players and identity management' },
      { href: 'data-hub',    label: 'Data Hub',    icon: '⊞',  desc: 'Review all sources, resolve conflicts, set tryout age groups' },
      { href: 'coach-evals', label: 'Coach Evals', icon: '📝', desc: 'End-of-season evaluations submitted by coaches' },
    ],
  },
  {
    step:  3,
    label: 'Tryout Sessions',
    desc:  'Create sessions, assign or check in players as they arrive, and collect scores in real time.',
    color: 'rgba(232,160,32,0.05)',
    items: [
      { href: 'sessions', label: 'Sessions', icon: '📋', desc: 'Create sessions, assign evaluators, and score players' },
    ],
  },
  {
    step:  4,
    label: 'Rankings & Placement',
    desc:  'Review combined scores, verify all data is complete, rank players within each age group, and build rosters.',
    color: 'rgba(109,184,117,0.05)',
    items: [
      { href: 'rankings',  label: 'Rankings',        icon: '🏆', desc: 'Combined tryout + eval scores — order players by age group' },
      { href: 'readiness', label: 'Readiness',        icon: '✓',  desc: 'Pre-placement checklist — confirm all data sources are in' },
      { href: 'teams',     label: 'Teams & Rosters',  icon: '⚾', desc: 'Create teams and finalize player placements' },
    ],
  },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function TryoutsOverviewPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()
  const [org,     setOrg]     = useState<OrgData | null>(null)
  const [season,  setSeason]  = useState<Season | null>(null)
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [
      { data: orgData },
      { data: seasonData },
    ] = await Promise.all([
      supabase.from('tryout_orgs').select('name, sport').eq('id', params.orgId).single(),
      supabase.from('tryout_seasons').select('id, label, year, age_groups').eq('org_id', params.orgId).eq('is_active', true).maybeSingle(),
    ])
    setOrg(orgData)
    setSeason(seasonData)

    if (seasonData) {
      const [
        { count: players },
        { count: sessions },
        { count: openSessions },
        { count: evalsDraft },
        { count: evalsSubmitted },
      ] = await Promise.all([
        supabase.from('tryout_players').select('*', { count: 'exact', head: true }).eq('org_id', params.orgId).eq('is_active', true),
        supabase.from('tryout_sessions').select('*', { count: 'exact', head: true }).eq('season_id', seasonData.id),
        supabase.from('tryout_sessions').select('*', { count: 'exact', head: true }).eq('season_id', seasonData.id).eq('status', 'open'),
        supabase.from('tryout_coach_evals').select('*', { count: 'exact', head: true }).eq('org_id', params.orgId).eq('status', 'draft'),
        supabase.from('tryout_coach_evals').select('*', { count: 'exact', head: true }).eq('org_id', params.orgId).eq('status', 'submitted'),
      ])
      setStats({ players: players ?? 0, sessions: sessions ?? 0, openSessions: openSessions ?? 0, evalsDraft: evalsDraft ?? 0, evalsSubmitted: evalsSubmitted ?? 0 })
    }
    setLoading(false)
  }

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>
  )

  // Inline badges that surface relevant stats next to the right section
  function sectionBadges(step: number) {
    if (!stats) return null
    const badges: { label: string; accent?: boolean }[] = []
    if (step === 2) {
      if (stats.players > 0)        badges.push({ label: `${stats.players} players` })
      if (stats.evalsSubmitted > 0)  badges.push({ label: `${stats.evalsSubmitted} eval${stats.evalsSubmitted !== 1 ? 's' : ''} submitted` })
      if (stats.evalsDraft > 0)      badges.push({ label: `${stats.evalsDraft} eval draft${stats.evalsDraft !== 1 ? 's' : ''}` })
    }
    if (step === 3) {
      if (stats.sessions > 0)       badges.push({ label: `${stats.sessions} session${stats.sessions !== 1 ? 's' : ''}` })
      if (stats.openSessions > 0)   badges.push({ label: `${stats.openSessions} open now`, accent: true })
    }
    return badges
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', maxWidth: '860px', margin: '0 auto', padding: '2rem 1.5rem 6rem' }}>

      {/* Page header */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '6px' }}>
          {org?.name ?? 'Organization'}
        </div>
        <h1 style={{ fontSize: '26px', fontWeight: 800, marginBottom: '4px' }}>Tryouts</h1>
        {season ? (
          <Link href={`/org/${params.orgId}/tryouts/seasons`} style={{ fontSize: '13px', color: s.muted, textDecoration: 'none' }}>
            {season.label} · {season.age_groups.join(', ')}
          </Link>
        ) : (
          <Link href={`/org/${params.orgId}/tryouts/seasons`} style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
            ⚠ No active season — set one up →
          </Link>
        )}
      </div>

      {/* Workflow sections */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {SECTIONS.map(section => {
          const badges = sectionBadges(section.step)

          return (
            <div key={section.step}>
              {/* Section header */}
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: '14px',
                marginBottom: '12px',
              }}>
                {/* Step badge */}
                <div style={{
                  flexShrink: 0,
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: 'var(--bg-card)', border: '0.5px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '12px', fontWeight: 800, color: s.muted,
                  marginTop: '2px',
                }}>
                  {section.step}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '3px' }}>
                    <span style={{ fontSize: '16px', fontWeight: 800 }}>{section.label}</span>
                    {badges && badges.map(b => (
                      <span key={b.label} style={{
                        fontSize: '11px', fontWeight: 600, padding: '2px 8px',
                        borderRadius: '20px',
                        background: b.accent ? 'rgba(232,160,32,0.12)' : 'rgba(var(--fg-rgb),0.06)',
                        color: b.accent ? 'var(--accent)' : s.muted,
                        border: `0.5px solid ${b.accent ? 'rgba(232,160,32,0.3)' : 'transparent'}`,
                      }}>
                        {b.label}
                      </span>
                    ))}
                  </div>
                  <p style={{ fontSize: '12px', color: s.dim, margin: 0, lineHeight: 1.5 }}>{section.desc}</p>
                </div>
              </div>

              {/* Cards */}
              <div style={{
                marginLeft: '42px',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '8px',
              }}>
                {section.items.map(item => (
                  <Link
                    key={item.href}
                    href={`/org/${params.orgId}/tryouts/${item.href}`}
                    style={{
                      display: 'block', padding: '1rem 1.1rem',
                      borderRadius: '10px',
                      background: section.color,
                      border: '0.5px solid var(--border)',
                      textDecoration: 'none', color: 'var(--fg)',
                    }}
                  >
                    <div style={{ fontSize: '20px', marginBottom: '6px' }}>{item.icon}</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '3px' }}>{item.label}</div>
                    <div style={{ fontSize: '11px', color: s.muted, lineHeight: 1.5 }}>{item.desc}</div>
                  </Link>
                ))}
              </div>

              {/* Divider (not after last) */}
              {section.step < SECTIONS.length && (
                <div style={{ marginTop: '2rem', marginLeft: '42px', height: '0.5px', background: 'var(--border)' }} />
              )}
            </div>
          )
        })}
      </div>

    </main>
  )
}
