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
  playersWithDob: number
  playersScored:  number
  sessions:       number
  openSessions:   number
  evalsDraft:     number
  evalsSubmitted: number
  evalTeams:      number
  regCount:       number
}

// ── Workflow sections ──────────────────────────────────────────────────────────

const SECTIONS = [
  {
    step:  1,
    label: 'Setup',
    desc:  'Configure before anything else — set the season and age groups, invite staff, and define how players will be scored.',
    color: 'rgba(var(--fg-rgb), 0.06)',
    items: [
      { href: 'seasons', label: 'Seasons',      icon: '📅', desc: 'Set the active season and age groups' },
      { href: 'members', label: 'Members',       icon: '🔑', desc: 'Invite coaches and evaluators' },
      { href: 'scoring', label: 'Scoring Setup', icon: '⚙',  desc: 'Define tryout categories, weights, and the eval rubric' },
    ],
  },
  {
    step:  2,
    label: 'Player Data',
    desc:  'Import all data sources, verify players are mapped correctly, and confirm everything is complete before tryouts begin.',
    color: 'rgba(80,160,232,0.05)',
    items: [
      { href: 'imports?type=registration', label: 'Import Registrations', icon: '📋', desc: 'Upload your tryout registration spreadsheet' },
      { href: 'imports?type=rosters',      label: 'Import Rosters',       icon: '📁', desc: 'Upload current season rosters to assign players to teams' },
      { href: 'imports?type=gc_stats',     label: 'Import Season Stats',  icon: '📊', desc: 'Upload end-of-season GameChanger stats per team' },
      { href: 'data-hub',  label: 'Data Hub',      icon: '⊞', desc: 'Review all sources, resolve conflicts, and set tryout age groups' },
      { href: 'readiness', label: 'Readiness Check', icon: '✓', desc: 'Confirm all data sources are complete before tryouts begin' },
    ],
  },
  {
    step:  3,
    label: 'Tryouts',
    desc:  'Create sessions, check in players as they arrive, collect evaluator scores, and gather season evaluations from coaches.',
    color: 'rgba(232,160,32,0.05)',
    items: [
      { href: 'sessions',    label: 'Sessions',                          icon: '🗓', desc: 'Set up sessions, assign evaluators, check in players, and enter scores' },
      { href: 'coach-evals', label: 'Season Evaluations & Tryout Scores', icon: '📝', desc: 'Send eval forms to coaches and review submitted evaluations' },
    ],
  },
  {
    step:  4,
    label: 'Team Making',
    desc:  'Review combined scores and coach evaluations, then assign players to teams.',
    color: 'rgba(109,184,117,0.05)',
    items: [
      { href: 'rankings', label: 'Team Making', icon: '🏆', desc: 'Assign players to teams using scores, evals, and coach comments' },
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
        { count: playersWithDob },
        { count: sessions },
        { count: openSessions },
        { count: evalsDraft },
        { count: evalsSubmitted },
        { count: regCount },
        { data: scoredData },
        { data: evalTeamData },
      ] = await Promise.all([
        supabase.from('tryout_players').select('*', { count: 'exact', head: true }).eq('org_id', params.orgId).eq('is_active', true),
        supabase.from('tryout_players').select('*', { count: 'exact', head: true }).eq('org_id', params.orgId).eq('is_active', true).not('dob', 'is', null),
        supabase.from('tryout_sessions').select('*', { count: 'exact', head: true }).eq('season_id', seasonData.id),
        supabase.from('tryout_sessions').select('*', { count: 'exact', head: true }).eq('season_id', seasonData.id).eq('status', 'open'),
        supabase.from('tryout_coach_evals').select('*', { count: 'exact', head: true }).eq('org_id', params.orgId).eq('status', 'draft'),
        supabase.from('tryout_coach_evals').select('*', { count: 'exact', head: true }).eq('org_id', params.orgId).eq('status', 'submitted'),
        supabase.from('tryout_registration_staging').select('*', { count: 'exact', head: true }).eq('org_id', params.orgId).eq('season_id', seasonData.id),
        supabase.from('tryout_scores').select('player_id').eq('org_id', params.orgId),
        supabase.from('tryout_coach_evals').select('team_label').eq('org_id', params.orgId).eq('status', 'submitted'),
      ])
      const uniqueScored = new Set((scoredData ?? []).map((r: any) => r.player_id)).size
      const uniqueTeams  = new Set((evalTeamData ?? []).map((r: any) => r.team_label).filter(Boolean)).size
      setStats({
        players: players ?? 0, playersWithDob: playersWithDob ?? 0,
        playersScored: uniqueScored,
        sessions: sessions ?? 0, openSessions: openSessions ?? 0,
        evalsDraft: evalsDraft ?? 0, evalsSubmitted: evalsSubmitted ?? 0,
        evalTeams: uniqueTeams, regCount: regCount ?? 0,
      })
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
      if (stats.players > 0)   badges.push({ label: `${stats.players} player${stats.players !== 1 ? 's' : ''}` })
      if (stats.regCount > 0)  badges.push({ label: `${stats.regCount} registered` })
    }
    if (step === 3) {
      if (stats.sessions > 0)       badges.push({ label: `${stats.sessions} session${stats.sessions !== 1 ? 's' : ''}` })
      if (stats.openSessions > 0)   badges.push({ label: `${stats.openSessions} open now`, accent: true })
      if (stats.evalsSubmitted > 0) badges.push({ label: `${stats.evalsSubmitted} eval${stats.evalsSubmitted !== 1 ? 's' : ''}` })
    }
    if (step === 4) {
      if (stats.playersScored > 0)   badges.push({ label: `${stats.playersScored} scored` })
    }
    return badges
  }

  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>

      {/* Page header */}
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '6px' }}>
          {org?.name ?? 'Organization'}
        </div>
        <h1 style={{ fontSize: '26px', fontWeight: 800, marginBottom: '4px' }}>Tryouts</h1>
        {season ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <Link href={`/org/${params.orgId}/tryouts/seasons`} style={{ fontSize: '13px', color: s.muted, textDecoration: 'none' }}>
              {season.label} · {season.age_groups.join(', ')}
            </Link>
            {stats && stats.players > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '11px', color: s.dim, padding: '1px 7px', borderRadius: '20px', background: 'rgba(var(--fg-rgb),0.05)', border: '0.5px solid var(--border)' }}>
                  {stats.players} players
                </span>
                {stats.regCount > 0 && (
                  <span style={{ fontSize: '11px', color: stats.regCount < stats.players ? '#E8A020' : s.dim, padding: '1px 7px', borderRadius: '20px', background: 'rgba(var(--fg-rgb),0.05)', border: '0.5px solid var(--border)' }}>
                    {stats.regCount} registered
                  </span>
                )}
                {stats.evalsSubmitted > 0 && (
                  <span style={{ fontSize: '11px', color: s.dim, padding: '1px 7px', borderRadius: '20px', background: 'rgba(var(--fg-rgb),0.05)', border: '0.5px solid var(--border)' }}>
                    {stats.evalsSubmitted} eval{stats.evalsSubmitted !== 1 ? 's' : ''}
                  </span>
                )}
                {stats.sessions > 0 && (
                  <span style={{ fontSize: '11px', color: s.dim, padding: '1px 7px', borderRadius: '20px', background: 'rgba(var(--fg-rgb),0.05)', border: '0.5px solid var(--border)' }}>
                    {stats.sessions} session{stats.sessions !== 1 ? 's' : ''}
                    {stats.openSessions > 0 && <span style={{ color: 'var(--accent)', fontWeight: 600 }}> · {stats.openSessions} open</span>}
                  </span>
                )}
                {stats.playersScored > 0 && (
                  <span style={{ fontSize: '11px', color: s.dim, padding: '1px 7px', borderRadius: '20px', background: 'rgba(var(--fg-rgb),0.05)', border: '0.5px solid var(--border)' }}>
                    {stats.playersScored} scored
                  </span>
                )}
              </div>
            )}
          </div>
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
                    key={item.label}
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

              {/* Divider with next-step hint */}
              {section.step < SECTIONS.length && (
                <div style={{ marginTop: '2rem', marginLeft: '42px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ flex: 1, height: '0.5px', background: 'var(--border)' }} />
                  <div style={{ fontSize: '10px', fontWeight: 600, color: s.dim, textTransform: 'uppercase', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>
                    then Step {section.step + 1}
                  </div>
                  <div style={{ flex: 1, height: '0.5px', background: 'var(--border)' }} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Dev tools link — unobtrusive footer */}
      <div style={{ marginTop: '3rem', paddingTop: '1rem', borderTop: '0.5px solid var(--border)', textAlign: 'right' }}>
        <Link href={`/org/${params.orgId}/tryouts/dev`} style={{ fontSize: '11px', color: s.dim, textDecoration: 'none' }}>
          Test data →
        </Link>
      </div>

    </main>
  )
}
