'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'

interface Season { id: string; label: string; age_groups: string[]; year: number }
interface RegRow {
  player_id:            string
  player_first_name:    string | null
  player_last_name:     string | null
  age_group:            string | null
  preferred_tryout_date:string | null
  prior_team:           string | null
  prior_org:            string | null
  dob:                  string | null
  parent_email:         string | null
  parent_phone:         string | null
  school:               string | null
  registration_date:    string | null
  imported_at:          string
}
interface Player {
  id:         string
  first_name: string
  last_name:  string
  age_group:  string
  prior_team: string | null
  prior_org:  string | null
  is_active:  boolean
}

const s = {
  muted: 'rgba(var(--fg-rgb),0.55)',
  dim:   'rgba(var(--fg-rgb),0.35)',
} as const

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(var(--fg-rgb),0.08)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color: s.muted, minWidth: 32, textAlign: 'right' }}>{Math.round(pct)}%</span>
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '0.5px solid var(--border)',
      borderRadius: 12,
      overflow: 'hidden',
      ...style,
    }}>
      {children}
    </div>
  )
}

function SectionHead({ title, count }: { title: string; count?: number }) {
  return (
    <div style={{
      padding: '14px 18px',
      borderBottom: '0.5px solid var(--border)',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ fontWeight: 700, fontSize: 14 }}>{title}</span>
      {count !== undefined && (
        <span style={{ fontSize: 12, color: s.muted, background: 'rgba(var(--fg-rgb),0.07)', borderRadius: 10, padding: '1px 8px' }}>
          {count}
        </span>
      )}
    </div>
  )
}

export default function RegistrationPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()

  const [season,     setSeason]     = useState<Season | null>(null)
  const [regs,       setRegs]       = useState<RegRow[]>([])
  const [players,    setPlayers]    = useState<Player[]>([])
  const [walkupIds,  setWalkupIds]  = useState<Set<string>>(new Set())
  const [loading,    setLoading]    = useState(true)

  const [ageFilter,  setAgeFilter]  = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [showMissing,  setShowMissing]  = useState(false)
  const [showIssues,   setShowIssues]   = useState(false)
  const [showNewPlayers, setShowNewPlayers] = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: seasonData } = await supabase
      .from('tryout_seasons').select('id, label, age_groups, year')
      .eq('org_id', params.orgId).eq('is_active', true).maybeSingle()
    setSeason(seasonData)
    if (!seasonData) { setLoading(false); return }

    const [{ data: regData }, { data: playerData }, { data: walkupData }] = await Promise.all([
      supabase
        .from('tryout_registration_staging')
        .select('player_id, player_first_name, player_last_name, age_group, preferred_tryout_date, prior_team, prior_org, dob, parent_email, parent_phone, school, registration_date, imported_at')
        .eq('season_id', seasonData.id),
      supabase
        .from('tryout_players')
        .select('id, first_name, last_name, age_group, prior_team, prior_org, is_active')
        .eq('org_id', params.orgId),
      supabase
        .from('tryout_checkins')
        .select('player_id')
        .eq('season_id', seasonData.id)
        .eq('is_write_in', true)
        .not('player_id', 'is', null),
    ])

    setRegs(regData ?? [])
    setPlayers(playerData ?? [])
    setWalkupIds(new Set((walkupData ?? []).map((c: { player_id: string }) => c.player_id)))
    setLoading(false)
  }

  // ── Computed data ──────────────────────────────────────────────────────────

  const ageGroups = useMemo(() => {
    const groups = new Set<string>()
    regs.forEach(r => { if (r.age_group) groups.add(r.age_group) })
    return Array.from(groups).sort()
  }, [regs])

  const tryoutDates = useMemo(() => {
    const dates = new Set<string>()
    regs.forEach(r => { if (r.preferred_tryout_date) dates.add(r.preferred_tryout_date) })
    return Array.from(dates).sort()
  }, [regs])

  const filtered = useMemo(() => {
    return regs.filter(r => {
      if (ageFilter !== 'all' && r.age_group !== ageFilter) return false
      if (dateFilter !== 'all' && r.preferred_tryout_date !== dateFilter) return false
      return true
    })
  }, [regs, ageFilter, dateFilter])

  const registeredIds = useMemo(() => new Set(regs.map(r => r.player_id)), [regs])

  // Section 1: by age group
  const byAgeGroup = useMemo(() => {
    const map = new Map<string, number>()
    filtered.forEach(r => {
      const key = r.age_group ?? 'Unknown'
      map.set(key, (map.get(key) ?? 0) + 1)
    })
    return Array.from(map.entries())
      .map(([ag, count]) => ({ ag, count }))
      .sort((a, b) => a.ag.localeCompare(b.ag))
  }, [filtered])

  // Section 2: by preferred tryout date
  const byDate = useMemo(() => {
    const map = new Map<string, number>()
    filtered.forEach(r => {
      const key = r.preferred_tryout_date ?? 'No preference'
      map.set(key, (map.get(key) ?? 0) + 1)
    })
    return Array.from(map.entries())
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [filtered])

  // Section 3 & 4: returning vs missing HBA players
  const activePlayers = useMemo(() => players.filter(p => p.is_active), [players])

  // "Other" in the team/league field means they self-identified as non-HBA
  const isOther = (val: string | null) => val?.trim().toLowerCase() === 'other'

  const returning = useMemo(() =>
    filtered.filter(r => {
      if (isOther(r.prior_team) || isOther(r.prior_org)) return false
      const p = players.find(pl => pl.id === r.player_id)
      return p && p.prior_team != null
    }),
  [filtered, players])

  const returningByTeam = useMemo(() => {
    const map = new Map<string, RegRow[]>()
    returning.forEach(r => {
      const p = players.find(pl => pl.id === r.player_id)
      const team = p?.prior_team ?? 'Unknown'
      if (!map.has(team)) map.set(team, [])
      map.get(team)!.push(r)
    })
    return Array.from(map.entries())
      .map(([team, rows]) => ({ team, rows }))
      .sort((a, b) => b.rows.length - a.rows.length)
  }, [returning, players])

  // Players with prior_team (returning HBA) who haven't registered yet.
  // Exclude 14U — they age out with no 15U team to return to.
  const missingPlayers = useMemo(() => {
    return activePlayers
      .filter(p => p.prior_team != null && !registeredIds.has(p.id) && !walkupIds.has(p.id) && p.age_group !== '14U')
      .filter(p => ageFilter === 'all' || p.age_group === ageFilter)
      .sort((a, b) => (a.prior_team ?? '').localeCompare(b.prior_team ?? '') || a.last_name.localeCompare(b.last_name))
  }, [activePlayers, registeredIds, walkupIds, ageFilter])

  // Section 5: new / non-HBA players (includes those who selected "Other" for team)
  const newPlayers = useMemo(() =>
    filtered.filter(r => {
      if (isOther(r.prior_team) || isOther(r.prior_org)) return true
      const p = players.find(pl => pl.id === r.player_id)
      return !p || p.prior_team == null
    }),
  [filtered, players])

  // Section 6: by prior org
  // When prior_team is "Other", prior_org holds the custom team name from
  // "If 2026 Team is 'Other', please provide team name". Use that as the label.
  const orgLabel = (r: RegRow) => {
    if (isOther(r.prior_team)) return r.prior_org?.trim() || 'Other (not specified)'
    return r.prior_org?.trim() || r.prior_team?.trim() || 'Unknown / First year'
  }

  const byOrg = useMemo(() => {
    const map = new Map<string, number>()
    filtered.forEach(r => {
      const key = orgLabel(r)
      map.set(key, (map.get(key) ?? 0) + 1)
    })
    return Array.from(map.entries())
      .map(([org, count]) => ({ org, count }))
      .sort((a, b) => b.count - a.count)
  }, [filtered])

  // Section 7: data quality issues
  const issues = useMemo(() => {
    return filtered.filter(r =>
      !r.dob ||
      !r.age_group ||
      !r.parent_email ||
      !r.parent_phone ||
      !r.player_first_name ||
      !r.player_last_name
    )
  }, [filtered])

  // Duplicate registrations (same player_id more than once in full regs)
  const duplicates = useMemo(() => {
    const counts = new Map<string, RegRow[]>()
    regs.forEach(r => {
      if (!counts.has(r.player_id)) counts.set(r.player_id, [])
      counts.get(r.player_id)!.push(r)
    })
    return Array.from(counts.entries())
      .filter(([, rows]) => rows.length > 1)
      .map(([id, rows]) => ({ id, rows }))
  }, [regs])

  const total        = filtered.length
  const returningPct = total > 0 ? (returning.length / total) * 100 : 0
  const newPct       = total > 0 ? (newPlayers.length / total) * 100 : 0
  const issuesPct    = total > 0 ? (issues.length / total) * 100 : 0

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh', color: s.muted }}>
      Loading…
    </div>
  )

  if (!season) return (
    <div style={{ padding: '3rem', textAlign: 'center', color: s.muted }}>
      No active season.{' '}
      <Link href={`/org/${params.orgId}/tryouts/seasons`} style={{ color: 'var(--accent)' }}>Set one up</Link>
    </div>
  )

  if (regs.length === 0) return (
    <div style={{ padding: '3rem', textAlign: 'center', color: s.muted }}>
      No registration data for {season.label}.{' '}
      <Link href={`/org/${params.orgId}/tryouts/imports`} style={{ color: 'var(--accent)' }}>Import registrations</Link>
    </div>
  )

  const maxByAge  = Math.max(...byAgeGroup.map(x => x.count), 1)
  const maxByDate = Math.max(...byDate.map(x => x.count), 1)
  const maxByOrg  = Math.max(...byOrg.map(x => x.count), 1)

  return (
    <div className="page-wide" style={{ padding: '2rem 1.5rem 6rem' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>Registration Dashboard</h1>
        <div style={{ fontSize: 13, color: s.muted, marginTop: 4 }}>{season.label}</div>
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {/* Age group filter */}
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: s.dim, marginRight: 2 }}>Age:</span>
          {['all', ...ageGroups].map(ag => (
            <button key={ag} onClick={() => setAgeFilter(ag)} style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: '0.5px solid var(--border)',
              background: ageFilter === ag ? 'rgba(232,160,32,0.15)' : 'transparent',
              color: ageFilter === ag ? 'var(--accent)' : s.muted,
              cursor: 'pointer',
            }}>
              {ag === 'all' ? 'All' : ag}
            </button>
          ))}
        </div>

        {/* Date filter */}
        {tryoutDates.length > 0 && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: s.dim, marginRight: 2 }}>Date:</span>
            {['all', ...tryoutDates].map(d => (
              <button key={d} onClick={() => setDateFilter(d)} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: '0.5px solid var(--border)',
                background: dateFilter === d ? 'rgba(128,176,232,0.15)' : 'transparent',
                color: dateFilter === d ? '#80B0E8' : s.muted,
                cursor: 'pointer',
              }}>
                {d === 'all' ? 'All dates' : new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Summary cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: '1.5rem' }}>
        {[
          { label: 'Total Registered', value: total, color: 'var(--fg)' },
          { label: 'Returning HBA', value: returning.length, color: '#6DB875' },
          { label: 'New Players', value: newPlayers.length, color: '#80B0E8' },
          { label: 'Missing (not yet reg)', value: missingPlayers.length, color: '#E8A020' },
          { label: 'Data Issues', value: issues.length, color: issues.length > 0 ? '#e05252' : s.muted },
          { label: 'Duplicates', value: duplicates.length, color: duplicates.length > 0 ? '#e05252' : s.muted },
        ].map(card => (
          <Card key={card.label}>
            <div style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: s.dim, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                {card.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: card.color, lineHeight: 1 }}>
                {card.value}
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>

        {/* ── Section 1: by age group ── */}
        <Card>
          <SectionHead title="By Age Group" count={total} />
          <div style={{ padding: '12px 18px' }}>
            {byAgeGroup.length === 0 ? (
              <div style={{ color: s.dim, fontSize: 13 }}>No data</div>
            ) : byAgeGroup.map(({ ag, count }) => (
              <div key={ag} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{ag}</span>
                  <span style={{ fontSize: 13, color: s.muted }}>{count}</span>
                </div>
                <MiniBar pct={(count / maxByAge) * 100} color="var(--accent)" />
              </div>
            ))}
          </div>
        </Card>

        {/* ── Section 2: by preferred tryout date ── */}
        <Card>
          <SectionHead title="By Preferred Tryout Date" />
          <div style={{ padding: '12px 18px' }}>
            {byDate.length === 0 ? (
              <div style={{ color: s.dim, fontSize: 13 }}>No preference data</div>
            ) : byDate.map(({ date, count }) => {
              const label = date === 'No preference' ? date
                : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
              return (
                <div key={date} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: 13, color: s.muted }}>{count}</span>
                  </div>
                  <MiniBar pct={(count / maxByDate) * 100} color="#80B0E8" />
                </div>
              )
            })}
          </div>
        </Card>
      </div>

      {/* ── Section 3: returning HBA players by prior team ── */}
      <Card style={{ marginBottom: 16 }}>
        <SectionHead title="Returning HBA Players" count={returning.length} />
        <div style={{ padding: '12px 18px' }}>
          <div style={{ marginBottom: 10 }}>
            <MiniBar pct={returningPct} color="#6DB875" />
            <div style={{ fontSize: 11, color: s.dim, marginTop: 4 }}>
              {returning.length} of {total} registered players are returning HBA players
            </div>
          </div>
          {returningByTeam.length === 0 ? (
            <div style={{ color: s.dim, fontSize: 13 }}>None matched</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginTop: 12 }}>
              {returningByTeam.map(({ team, rows }) => (
                <div key={team} style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: 'rgba(109,184,117,0.07)',
                  border: '0.5px solid rgba(109,184,117,0.2)',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{team}</div>
                  <div style={{ fontSize: 11, color: s.muted }}>
                    {rows.map(r => `${r.player_first_name ?? ''} ${r.player_last_name ?? ''}`.trim()).join(', ')}
                  </div>
                  <div style={{ fontSize: 11, color: '#6DB875', marginTop: 4, fontWeight: 600 }}>
                    {rows.length} registered
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* ── Section 4: missing prior season players ── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{
          padding: '14px 18px',
          borderBottom: showMissing ? '0.5px solid var(--border)' : undefined,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Not Yet Registered</span>
            <span style={{ fontSize: 12, color: missingPlayers.length > 0 ? '#E8A020' : s.muted, background: 'rgba(232,160,32,0.1)', borderRadius: 10, padding: '1px 8px' }}>
              {missingPlayers.length}
            </span>
          </div>
          {missingPlayers.length > 0 && (
            <button onClick={() => setShowMissing(x => !x)} style={{
              fontSize: 12, color: s.muted, background: 'transparent', border: 'none', cursor: 'pointer',
            }}>
              {showMissing ? 'Hide' : 'Show'}
            </button>
          )}
        </div>
        {!showMissing && (
          <div style={{ padding: '10px 18px', fontSize: 13, color: s.dim }}>
            {missingPlayers.length === 0
              ? 'All returning HBA players have registered.'
              : `${missingPlayers.length} returning player${missingPlayers.length === 1 ? '' : 's'} haven't registered yet.`}
          </div>
        )}
        {showMissing && missingPlayers.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                  {['Name', 'Prior Team', 'Age Group'].map(h => (
                    <th key={h} style={{ padding: '8px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: s.dim, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {missingPlayers.map(p => (
                  <tr key={p.id} style={{ borderBottom: '0.5px solid rgba(var(--fg-rgb),0.06)' }}>
                    <td style={{ padding: '8px 18px', fontWeight: 500 }}>{p.first_name} {p.last_name}</td>
                    <td style={{ padding: '8px 18px', color: s.muted }}>{p.prior_team}</td>
                    <td style={{ padding: '8px 18px', color: s.muted }}>{p.age_group}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Section 5: new / non-HBA players ── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{
          padding: '14px 18px',
          borderBottom: showNewPlayers ? '0.5px solid var(--border)' : undefined,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>New / Non-HBA Players</span>
            <span style={{ fontSize: 12, color: '#80B0E8', background: 'rgba(128,176,232,0.1)', borderRadius: 10, padding: '1px 8px' }}>
              {newPlayers.length}
            </span>
          </div>
          {newPlayers.length > 0 && (
            <button onClick={() => setShowNewPlayers(x => !x)} style={{
              fontSize: 12, color: s.muted, background: 'transparent', border: 'none', cursor: 'pointer',
            }}>
              {showNewPlayers ? 'Hide' : 'Show'}
            </button>
          )}
        </div>
        {!showNewPlayers && (
          <div style={{ padding: '10px 18px', fontSize: 13, color: s.dim }}>
            <MiniBar pct={newPct} color="#80B0E8" />
            <div style={{ marginTop: 4 }}>
              {newPlayers.length} player{newPlayers.length === 1 ? '' : 's'} with no prior HBA record ({Math.round(newPct)}% of registrations)
            </div>
          </div>
        )}
        {showNewPlayers && newPlayers.length > 0 && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                  {['Name', 'Age Group', 'Prior Org', 'School', 'Tryout Date'].map(h => (
                    <th key={h} style={{ padding: '8px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: s.dim, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {newPlayers.map((r, i) => (
                  <tr key={`${r.player_id}-${i}`} style={{ borderBottom: '0.5px solid rgba(var(--fg-rgb),0.06)' }}>
                    <td style={{ padding: '8px 18px', fontWeight: 500 }}>{r.player_first_name} {r.player_last_name}</td>
                    <td style={{ padding: '8px 18px', color: s.muted }}>{r.age_group ?? '—'}</td>
                    <td style={{ padding: '8px 18px', color: s.muted }}>{r.prior_org ?? '—'}</td>
                    <td style={{ padding: '8px 18px', color: s.muted }}>{r.school ?? '—'}</td>
                    <td style={{ padding: '8px 18px', color: s.muted }}>
                      {r.preferred_tryout_date
                        ? new Date(r.preferred_tryout_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ── Section 6: by prior org ── */}
      <Card style={{ marginBottom: 16 }}>
        <SectionHead title="Player Source / Prior Org" />
        <div style={{ padding: '12px 18px' }}>
          {byOrg.map(({ org, count }) => (
            <div key={org} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{org}</span>
                <span style={{ fontSize: 13, color: s.muted }}>{count}</span>
              </div>
              <MiniBar pct={(count / maxByOrg) * 100} color="rgba(232,160,32,0.6)" />
            </div>
          ))}
        </div>
      </Card>

      {/* ── Section 7: data quality issues ── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{
          padding: '14px 18px',
          borderBottom: showIssues && issues.length > 0 ? '0.5px solid var(--border)' : undefined,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Data Quality</span>
            {issues.length > 0 && (
              <span style={{ fontSize: 12, color: '#e05252', background: 'rgba(224,82,82,0.1)', borderRadius: 10, padding: '1px 8px' }}>
                {issues.length} issue{issues.length === 1 ? '' : 's'}
              </span>
            )}
            {duplicates.length > 0 && (
              <span style={{ fontSize: 12, color: '#e05252', background: 'rgba(224,82,82,0.1)', borderRadius: 10, padding: '1px 8px' }}>
                {duplicates.length} duplicate{duplicates.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          {(issues.length > 0 || duplicates.length > 0) && (
            <button onClick={() => setShowIssues(x => !x)} style={{
              fontSize: 12, color: s.muted, background: 'transparent', border: 'none', cursor: 'pointer',
            }}>
              {showIssues ? 'Hide' : 'Show'}
            </button>
          )}
        </div>

        {!showIssues && (
          <div style={{ padding: '10px 18px' }}>
            {issues.length === 0 && duplicates.length === 0 ? (
              <div style={{ fontSize: 13, color: '#6DB875' }}>No data issues found.</div>
            ) : (
              <div style={{ fontSize: 13, color: s.dim }}>
                {issues.length > 0 && <div><MiniBar pct={issuesPct} color="#e05252" /></div>}
                <div style={{ marginTop: 4 }}>
                  {[
                    issues.length > 0 && `${issues.length} registration${issues.length === 1 ? '' : 's'} missing required fields`,
                    duplicates.length > 0 && `${duplicates.length} player${duplicates.length === 1 ? '' : 's'} registered more than once`,
                  ].filter(Boolean).join(' · ')}
                </div>
              </div>
            )}
          </div>
        )}

        {showIssues && (issues.length > 0 || duplicates.length > 0) && (
          <div style={{ padding: '12px 18px' }}>
            {issues.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: s.dim, textTransform: 'uppercase', marginBottom: 8 }}>Missing required fields</div>
                <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                        {['Name', 'Age Group', 'Missing'].map(h => (
                          <th key={h} style={{ padding: '6px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: s.dim, textTransform: 'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {issues.map((r, i) => {
                        const missing = [
                          !r.player_first_name && 'First name',
                          !r.player_last_name  && 'Last name',
                          !r.dob               && 'DOB',
                          !r.age_group         && 'Age group',
                          !r.parent_email      && 'Email',
                          !r.parent_phone      && 'Phone',
                        ].filter(Boolean).join(', ')
                        return (
                          <tr key={`${r.player_id}-${i}`} style={{ borderBottom: '0.5px solid rgba(var(--fg-rgb),0.06)' }}>
                            <td style={{ padding: '6px 12px', fontWeight: 500 }}>{r.player_first_name} {r.player_last_name}</td>
                            <td style={{ padding: '6px 12px', color: s.muted }}>{r.age_group ?? '—'}</td>
                            <td style={{ padding: '6px 12px', color: '#e05252', fontSize: 12 }}>{missing}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {duplicates.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: s.dim, textTransform: 'uppercase', marginBottom: 8 }}>Duplicate registrations</div>
                {duplicates.map(({ id, rows }) => (
                  <div key={id} style={{
                    padding: '8px 12px', marginBottom: 6, borderRadius: 6,
                    background: 'rgba(224,82,82,0.06)', border: '0.5px solid rgba(224,82,82,0.2)',
                    fontSize: 13,
                  }}>
                    <span style={{ fontWeight: 600 }}>{rows[0].player_first_name} {rows[0].player_last_name}</span>
                    <span style={{ color: s.muted, marginLeft: 8 }}>
                      {rows.length} registrations — imported {rows.map(r => r.imported_at.slice(0, 10)).join(', ')}
                    </span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </Card>

    </div>
  )
}
