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
  players:     number
  sessions:    number
  openSessions: number
  evalsDraft:  number
  evalsSubmitted: number
}

const NAV_ITEMS = [
  { href: 'players',    label: 'Players',         icon: '👥', desc: 'Registered players and identity management' },
  { href: 'sessions',   label: 'Tryout Sessions', icon: '📋', desc: 'Create sessions, assign evaluators, score' },
  { href: 'coach-evals',label: 'Coach Evals',     icon: '📝', desc: 'End-of-season evaluations from coaches' },
  { href: 'rankings',   label: 'Rankings',        icon: '🏆', desc: 'Combined scores, order players, assign to teams' },
  { href: 'teams',      label: 'Teams & Rosters', icon: '⚾', desc: 'Create teams and view final rosters' },
  { href: 'members',    label: 'Members',         icon: '🔑', desc: 'Invite coaches and evaluators' },
  { href: 'imports',    label: 'Imports',         icon: '↑',  desc: 'Registration and GameChanger stats' },
]

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

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', maxWidth: '820px', margin: '0 auto', padding: '2rem 1.5rem 6rem' }}>

      <div style={{ marginBottom: '2rem' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '6px' }}>
          {org?.name ?? 'Organization'}
        </div>
        <h1 style={{ fontSize: '26px', fontWeight: 800, marginBottom: '4px' }}>Tryouts</h1>
        {season && (
          <div style={{ fontSize: '13px', color: s.muted }}>
            {season.label} · {season.age_groups.join(', ')}
          </div>
        )}
      </div>

      {/* Stats row */}
      {stats && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '2.5rem' }}>
          {[
            { label: 'Players',    value: stats.players },
            { label: 'Sessions',   value: stats.sessions },
            ...(stats.openSessions > 0 ? [{ label: 'Open now',  value: stats.openSessions, accent: true }] : []),
            ...(stats.evalsSubmitted > 0 ? [{ label: 'Evals submitted', value: stats.evalsSubmitted }] : []),
            ...(stats.evalsDraft > 0    ? [{ label: 'Evals in draft',   value: stats.evalsDraft }] : []),
          ].map(({ label, value, accent }) => (
            <div key={label} style={{
              padding: '10px 18px', borderRadius: '8px',
              background: accent ? 'rgba(232,160,32,0.1)' : 'var(--bg-card)',
              border: `0.5px solid ${accent ? 'rgba(232,160,32,0.3)' : 'var(--border)'}`,
            }}>
              <div style={{ fontSize: '22px', fontWeight: 800, color: accent ? 'var(--accent)' : 'var(--fg)' }}>{value}</div>
              <div style={{ fontSize: '11px', color: s.muted }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Nav grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '10px' }}>
        {NAV_ITEMS.map(item => (
          <Link key={item.href} href={`/org/${params.orgId}/tryouts/${item.href}`} style={{
            display: 'block', padding: '1.25rem', borderRadius: '12px',
            background: 'var(--bg-card)', border: '0.5px solid var(--border)',
            textDecoration: 'none', color: 'var(--fg)',
          }}>
            <div style={{ fontSize: '22px', marginBottom: '8px' }}>{item.icon}</div>
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>{item.label}</div>
            <div style={{ fontSize: '12px', color: s.muted, lineHeight: 1.5 }}>{item.desc}</div>
          </Link>
        ))}
      </div>

    </main>
  )
}
