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
  is_walkup:  boolean
}

const s = {
  muted:  'rgba(var(--fg-rgb),0.50)',
  dim:    'rgba(var(--fg-rgb),0.32)',
} as const

function pct(n: number, total: number) {
  return total > 0 ? Math.round((n / total) * 100) : 0
}

function MiniBar({ value, total, color }: { value: number; total: number; color: string }) {
  const p = pct(value, total)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(var(--fg-rgb),0.07)', overflow: 'hidden' }}>
        <div style={{ width: `${Math.min(100, p)}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, color: s.muted, minWidth: 36, textAlign: 'right' }}>{p}%</span>
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e8eaed',
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
      ...style,
    }}>
      {children}
    </div>
  )
}

function SectionHead({ title, count }: { title: string; count?: number }) {
  return (
    <div style={{
      padding: '13px 18px',
      borderBottom: '1px solid #f0f1f3',
      display: 'flex', alignItems: 'center', gap: 10,
    }}>
      <span style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a' }}>{title}</span>
      {count !== undefined && (
        <span style={{ fontSize: 12, color: s.muted, background: 'rgba(var(--fg-rgb),0.06)', borderRadius: 10, padding: '1px 8px' }}>
          {count}
        </span>
      )}
    </div>
  )
}

type SortDir = 'asc' | 'desc'
type NewPlayerSortCol = 'name' | 'age' | 'org' | 'school' | 'date'

function SortTh({
  label, col, active, dir, onSort,
}: { label: string; col: NewPlayerSortCol; active: boolean; dir: SortDir; onSort: (col: NewPlayerSortCol) => void }) {
  return (
    <th
      onClick={() => onSort(col)}
      style={{ padding: '8px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: active ? '#1a1a1a' : s.dim, textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
    >
      {label}{active ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )
}

export default function RegistrationPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()

  const [season,  setSeason]  = useState<Season | null>(null)
  const [regs,    setRegs]    = useState<RegRow[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)

  const [ageFilter,  setAgeFilter]  = useState<string>('all')
  const [dateFilter, setDateFilter] = useState<string>('all')
  const [showMissing,    setShowMissing]    = useState(false)
  const [showIssues,     setShowIssues]     = useState(false)
  const [showNewPlayers, setShowNewPlayers] = useState(false)

  const [newSort, setNewSort] = useState<{ col: NewPlayerSortCol; dir: SortDir }>({ col: 'name', dir: 'asc' })
  const [copied,  setCopied]  = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: seasonData } = await supabase
      .from('tryout_seasons').select('id, label, age_groups, year')
      .eq('org_id', params.orgId).eq('is_active', true).maybeSingle()
    setSeason(seasonData)
    if (!seasonData) { setLoading(false); return }

    const [{ data: regData }, { data: playerData }] = await Promise.all([
      supabase
        .from('tryout_registration_staging')
        .select('player_id, player_first_name, player_last_name, age_group, preferred_tryout_date, prior_team, prior_org, dob, parent_email, parent_phone, school, registration_date, imported_at')
        .eq('season_id', seasonData.id),
      supabase
        .from('tryout_players')
        .select('id, first_name, last_name, age_group, prior_team, prior_org, is_active, is_walkup')
        .eq('org_id', params.orgId),
    ])

    setRegs(regData ?? [])
    setPlayers(playerData ?? [])
    setLoading(false)
  }

  function toggleNewSort(col: NewPlayerSortCol) {
    setNewSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })
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

  const activePlayers = useMemo(() => players.filter(p => p.is_active), [players])

  const isOther = (val: string | null) => val?.trim().toLowerCase() === 'other'
  const is14U   = (p: Player) => p.age_group === '14U' || /\b14[Uu]\b/.test(p.prior_team ?? '')

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

  // All eligible prior HBA players (used to show coverage: X of Y have registered)
  const eligibleHbaPlayers = useMemo(() =>
    activePlayers.filter(p => p.prior_team != null && !p.is_walkup && !is14U(p)),
  [activePlayers])

  const missingPlayers = useMemo(() => {
    return activePlayers
      .filter(p => p.prior_team != null && !p.is_walkup && !registeredIds.has(p.id) && !is14U(p))
      .filter(p => ageFilter === 'all' || p.age_group === ageFilter)
      .sort((a, b) => (a.prior_team ?? '').localeCompare(b.prior_team ?? '') || a.last_name.localeCompare(b.last_name))
  }, [activePlayers, registeredIds, ageFilter])

  const newPlayers = useMemo(() =>
    filtered.filter(r => {
      if (isOther(r.prior_team) || isOther(r.prior_org)) return true
      const p = players.find(pl => pl.id === r.player_id)
      return !p || p.prior_team == null
    }),
  [filtered, players])

  const orgLabel = (r: RegRow) => {
    if (isOther(r.prior_team)) return r.prior_org?.trim() || 'Other (not specified)'
    return r.prior_org?.trim() || r.prior_team?.trim() || 'Unknown / First year'
  }

  const normalizeOrg = (label: string) => {
    if (/kiwanis/i.test(label)) return 'Kiwanis'
    return label
  }

  const byOrg = useMemo(() => {
    const map = new Map<string, number>()
    newPlayers.forEach(r => {
      const key = normalizeOrg(orgLabel(r))
      map.set(key, (map.get(key) ?? 0) + 1)
    })
    return Array.from(map.entries())
      .map(([org, count]) => ({ org, count }))
      .sort((a, b) => b.count - a.count)
  }, [newPlayers])

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

  const total = filtered.length

  const sortedNewPlayers = useMemo(() => {
    const { col, dir } = newSort
    const sign = dir === 'asc' ? 1 : -1
    return [...newPlayers].sort((a, b) => {
      let va = '', vb = ''
      if (col === 'name')   { va = `${a.player_last_name ?? ''} ${a.player_first_name ?? ''}`; vb = `${b.player_last_name ?? ''} ${b.player_first_name ?? ''}` }
      if (col === 'age')    { va = a.age_group ?? ''; vb = b.age_group ?? '' }
      if (col === 'org')    { va = orgLabel(a); vb = orgLabel(b) }
      if (col === 'school') { va = a.school ?? ''; vb = b.school ?? '' }
      if (col === 'date')   { va = a.preferred_tryout_date ?? ''; vb = b.preferred_tryout_date ?? '' }
      return va.localeCompare(vb) * sign
    })
  }, [newPlayers, newSort])

  // ── Board update email text ────────────────────────────────────────────────

  const emailSummary = useMemo(() => {
    if (!season || regs.length === 0) return ''
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    // Always use all regs (not filtered) so the board update is complete
    const allReturning = regs.filter(r => {
      if (isOther(r.prior_team) || isOther(r.prior_org)) return false
      const p = players.find(pl => pl.id === r.player_id)
      return p && p.prior_team != null
    })
    const allNew = regs.filter(r => {
      if (isOther(r.prior_team) || isOther(r.prior_org)) return true
      const p = players.find(pl => pl.id === r.player_id)
      return !p || p.prior_team == null
    })
    const allMissing = activePlayers.filter(p =>
      p.prior_team != null && !p.is_walkup && !registeredIds.has(p.id) && !is14U(p)
    )

    const ageCounts = new Map<string, number>()
    regs.forEach(r => { const k = r.age_group ?? 'Unknown'; ageCounts.set(k, (ageCounts.get(k) ?? 0) + 1) })
    const ageLines = Array.from(ageCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([ag, n]) => `  • ${ag}: ${n}`)
      .join('\n')

    const dateCounts = new Map<string, number>()
    regs.forEach(r => { if (r.preferred_tryout_date) dateCounts.set(r.preferred_tryout_date, (dateCounts.get(r.preferred_tryout_date) ?? 0) + 1) })
    const dateLines = Array.from(dateCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, n]) => {
        const label = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        return `  • ${label}: ${n} player${n === 1 ? '' : 's'}`
      }).join('\n')

    const orgMap = new Map<string, number>()
    allNew.forEach(r => { const k = normalizeOrg(orgLabel(r)); orgMap.set(k, (orgMap.get(k) ?? 0) + 1) })
    const orgList = Array.from(orgMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([org, n]) => `${org} (${n})`).join(', ')

    const returningPct = pct(allReturning.length, eligibleHbaPlayers.length)

    const lines: string[] = [
      `HBA Tryout Registration Update — ${season.label}`,
      `As of ${today}`,
      '',
      `We currently have ${regs.length} player${regs.length === 1 ? '' : 's'} registered for ${season.label} tryouts.`,
      '',
      `Returning HBA players: ${allReturning.length} of ${eligibleHbaPlayers.length} eligible players have registered (${returningPct}%).`,
    ]

    if (allMissing.length > 0) {
      lines.push(`${allMissing.length} prior HBA player${allMissing.length === 1 ? '' : 's'} ${allMissing.length === 1 ? 'has' : 'have'} not yet signed up.`)
    } else if (eligibleHbaPlayers.length > 0) {
      lines.push('All prior HBA players have registered — great turnout!')
    }

    lines.push('')
    lines.push(`New / non-HBA players: ${allNew.length} (${pct(allNew.length, regs.length)}% of registrations).`)
    if (orgList) lines.push(`Sources: ${orgList}.`)

    if (ageLines) {
      lines.push('')
      lines.push('Registrations by age group:')
      lines.push(ageLines)
    }

    if (dateLines) {
      lines.push('')
      lines.push('Preferred tryout dates:')
      lines.push(dateLines)
    }

    const noteItems = [
      issues.length    > 0 && `${issues.length} registration${issues.length === 1 ? '' : 's'} with incomplete data`,
      duplicates.length > 0 && `${duplicates.length} duplicate registration${duplicates.length === 1 ? '' : 's'}`,
    ].filter(Boolean)
    if (noteItems.length > 0) {
      lines.push('')
      lines.push(`Note: ${noteItems.join('; ')}.`)
    }

    return lines.join('\n')
  }, [regs, players, activePlayers, registeredIds, eligibleHbaPlayers, issues, duplicates, season])

  function copyToClipboard() {
    navigator.clipboard.writeText(emailSummary).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

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

  return (
    <div className="page-wide" style={{ padding: '2rem 1.5rem 6rem', background: '#f5f6f8', minHeight: '100vh' }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: '#111' }}>Registration Dashboard</h1>
        <div style={{ fontSize: 13, color: s.muted, marginTop: 4 }}>{season.label}</div>
      </div>

      {/* ── Filters ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: s.dim, marginRight: 2 }}>Age:</span>
          {['all', ...ageGroups].map(ag => (
            <button key={ag} onClick={() => setAgeFilter(ag)} style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: '1px solid #dde0e5',
              background: ageFilter === ag ? 'rgba(232,160,32,0.12)' : 'white',
              color: ageFilter === ag ? '#b87a00' : '#666',
              cursor: 'pointer',
            }}>
              {ag === 'all' ? 'All' : ag}
            </button>
          ))}
        </div>

        {tryoutDates.length > 0 && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: s.dim, marginRight: 2 }}>Date:</span>
            {['all', ...tryoutDates].map(d => (
              <button key={d} onClick={() => setDateFilter(d)} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                border: '1px solid #dde0e5',
                background: dateFilter === d ? 'rgba(128,176,232,0.12)' : 'white',
                color: dateFilter === d ? '#4a7fb5' : '#666',
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
          { label: 'Total Registered',           value: total,                sub: 'this season',               color: '#111' },
          { label: 'Returning HBA',               value: returning.length,    sub: `of ${total} registered`,    color: '#3a9e4a' },
          { label: 'New Players',                 value: newPlayers.length,   sub: `${pct(newPlayers.length, total)}% of registrations`, color: '#4a7fb5' },
          { label: 'Not Yet Registered',          value: missingPlayers.length, sub: 'prior HBA players',       color: missingPlayers.length > 0 ? '#c47a00' : '#999' },
          { label: 'Data Issues',                 value: issues.length,       sub: 'missing required fields',   color: issues.length > 0 ? '#c93a3a' : '#999' },
          { label: 'Duplicates',                  value: duplicates.length,   sub: 'registered more than once', color: duplicates.length > 0 ? '#c93a3a' : '#999' },
        ].map(card => (
          <Card key={card.label}>
            <div style={{ padding: '14px 16px' }}>
              <div style={{ fontSize: 11, color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
                {card.label}
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: card.color, lineHeight: 1 }}>
                {card.value}
              </div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 5 }}>{card.sub}</div>
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
                <MiniBar value={count} total={total} color="var(--accent)" />
              </div>
            ))}
            <div style={{ fontSize: 11, color: '#bbb', marginTop: 8 }}>% of total registrations</div>
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
                  <MiniBar value={count} total={total} color="#80B0E8" />
                </div>
              )
            })}
            <div style={{ fontSize: 11, color: '#bbb', marginTop: 8 }}>% of total registrations</div>
          </div>
        </Card>
      </div>

      {/* ── Section 3: returning HBA players by prior team ── */}
      <Card style={{ marginBottom: 16 }}>
        <SectionHead title="Returning HBA Players" count={returning.length} />
        <div style={{ padding: '12px 18px' }}>
          <div style={{ display: 'flex', gap: 24, marginBottom: 14, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#3a9e4a' }}>{returning.length} <span style={{ fontSize: 13, fontWeight: 400, color: s.muted }}>of {total} registered</span></div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>share of this season's registrations</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#3a9e4a' }}>{returning.length} <span style={{ fontSize: 13, fontWeight: 400, color: s.muted }}>of {eligibleHbaPlayers.length} prior HBA</span></div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>prior HBA players who have registered</div>
            </div>
          </div>
          {returningByTeam.length === 0 ? (
            <div style={{ color: s.dim, fontSize: 13 }}>None matched</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {returningByTeam.map(({ team, rows }) => (
                <div key={team} style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: '#f4fbf5',
                  border: '1px solid #d0ecd4',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4, color: '#1a1a1a' }}>{team}</div>
                  <div style={{ fontSize: 11, color: '#777' }}>
                    {rows.map(r => `${r.player_first_name ?? ''} ${r.player_last_name ?? ''}`.trim()).join(', ')}
                  </div>
                  <div style={{ fontSize: 11, color: '#3a9e4a', marginTop: 4, fontWeight: 600 }}>
                    {rows.length} registered
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* ── Section 4: prior HBA players not yet registered ── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{
          padding: '13px 18px',
          borderBottom: showMissing && missingPlayers.length > 0 ? '1px solid #f0f1f3' : undefined,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a' }}>Returning Players Not Yet Registered</span>
            <span style={{ fontSize: 12, color: missingPlayers.length > 0 ? '#c47a00' : '#aaa', background: missingPlayers.length > 0 ? 'rgba(232,160,32,0.1)' : '#f4f4f4', borderRadius: 10, padding: '1px 8px' }}>
              {missingPlayers.length}
            </span>
          </div>
          {missingPlayers.length > 0 && (
            <button onClick={() => setShowMissing(x => !x)} style={{
              fontSize: 12, color: '#888', background: 'transparent', border: 'none', cursor: 'pointer',
            }}>
              {showMissing ? 'Hide' : 'Show'}
            </button>
          )}
        </div>
        <div style={{ padding: '10px 18px', fontSize: 13, color: s.dim }}>
          {missingPlayers.length === 0
            ? <span style={{ color: '#3a9e4a' }}>All returning HBA players have registered.</span>
            : `${missingPlayers.length} of ${eligibleHbaPlayers.length} prior HBA players haven't registered yet.`}
        </div>
        {showMissing && missingPlayers.length > 0 && (
          <div style={{ overflowX: 'auto', borderTop: '1px solid #f0f1f3' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f0f1f3' }}>
                  {['Name', 'Prior Team', 'Age Group'].map(h => (
                    <th key={h} style={{ padding: '8px 18px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: s.dim, textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {missingPlayers.map(p => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f7f8f9' }}>
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
          padding: '13px 18px',
          borderBottom: showNewPlayers && newPlayers.length > 0 ? '1px solid #f0f1f3' : undefined,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a' }}>New / Non-HBA Players</span>
            <span style={{ fontSize: 12, color: '#4a7fb5', background: 'rgba(128,176,232,0.1)', borderRadius: 10, padding: '1px 8px' }}>
              {newPlayers.length}
            </span>
          </div>
          {newPlayers.length > 0 && (
            <button onClick={() => setShowNewPlayers(x => !x)} style={{
              fontSize: 12, color: '#888', background: 'transparent', border: 'none', cursor: 'pointer',
            }}>
              {showNewPlayers ? 'Hide' : 'Show'}
            </button>
          )}
        </div>
        <div style={{ padding: '10px 18px', fontSize: 13, color: s.dim }}>
          <MiniBar value={newPlayers.length} total={total} color="#80B0E8" />
          <div style={{ marginTop: 4 }}>
            {newPlayers.length} player{newPlayers.length === 1 ? '' : 's'} with no prior HBA record ({pct(newPlayers.length, total)}% of registrations)
          </div>
        </div>
        {showNewPlayers && newPlayers.length > 0 && (
          <div style={{ overflowX: 'auto', borderTop: '1px solid #f0f1f3' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #f0f1f3' }}>
                  <SortTh label="Name"       col="name"   active={newSort.col === 'name'}   dir={newSort.dir} onSort={toggleNewSort} />
                  <SortTh label="Age Group"  col="age"    active={newSort.col === 'age'}    dir={newSort.dir} onSort={toggleNewSort} />
                  <SortTh label="Prior Org"  col="org"    active={newSort.col === 'org'}    dir={newSort.dir} onSort={toggleNewSort} />
                  <SortTh label="School"     col="school" active={newSort.col === 'school'} dir={newSort.dir} onSort={toggleNewSort} />
                  <SortTh label="Tryout Date" col="date"  active={newSort.col === 'date'}   dir={newSort.dir} onSort={toggleNewSort} />
                </tr>
              </thead>
              <tbody>
                {sortedNewPlayers.map((r, i) => (
                  <tr key={`${r.player_id}-${i}`} style={{ borderBottom: '1px solid #f7f8f9' }}>
                    <td style={{ padding: '8px 18px', fontWeight: 500 }}>{r.player_first_name} {r.player_last_name}</td>
                    <td style={{ padding: '8px 18px', color: s.muted }}>{r.age_group ?? '—'}</td>
                    <td style={{ padding: '8px 18px', color: s.muted }}>{isOther(r.prior_team) ? (r.prior_org?.trim() || '—') : (r.prior_org?.trim() || r.prior_team?.trim() || '—')}</td>
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
        <SectionHead title="Player Source / Prior Org" count={newPlayers.length} />
        <div style={{ padding: '12px 18px' }}>
          {byOrg.length === 0 ? (
            <div style={{ fontSize: 13, color: s.dim }}>No new/non-HBA players.</div>
          ) : byOrg.map(({ org, count }) => (
            <div key={org} style={{ marginBottom: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{org}</span>
                <span style={{ fontSize: 13, color: s.muted }}>{count}</span>
              </div>
              <MiniBar value={count} total={newPlayers.length} color="rgba(232,160,32,0.7)" />
            </div>
          ))}
          <div style={{ fontSize: 11, color: '#bbb', marginTop: 8 }}>% of new / non-HBA players</div>
        </div>
      </Card>

      {/* ── Board Update ── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{
          padding: '13px 18px', borderBottom: '1px solid #f0f1f3',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a' }}>Board Update</span>
            <span style={{ fontSize: 12, color: s.dim, marginLeft: 10 }}>ready to copy into an email</span>
          </div>
          <button
            onClick={copyToClipboard}
            style={{
              padding: '5px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
              border: `1px solid ${copied ? '#b2dfbb' : '#dde0e5'}`,
              background: copied ? '#f0fff4' : 'white',
              color: copied ? '#3a9e4a' : '#555',
              cursor: 'pointer', transition: 'all 0.15s',
            }}
          >
            {copied ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <div style={{ padding: '14px 18px' }}>
          <textarea
            readOnly
            value={emailSummary}
            style={{
              width: '100%', border: '1px solid #e8eaed', outline: 'none',
              background: '#f8f9fb', borderRadius: 8, padding: '12px 14px',
              fontSize: 13, fontFamily: 'ui-monospace, monospace', lineHeight: 1.7,
              color: '#333', resize: 'vertical', minHeight: 260,
              boxSizing: 'border-box',
            }}
          />
        </div>
      </Card>

      {/* ── Section 7: data quality ── */}
      <Card style={{ marginBottom: 16 }}>
        <div style={{
          padding: '13px 18px',
          borderBottom: showIssues && (issues.length > 0 || duplicates.length > 0) ? '1px solid #f0f1f3' : undefined,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a' }}>Data Quality</span>
            {issues.length > 0 && (
              <span style={{ fontSize: 12, color: '#c93a3a', background: 'rgba(224,82,82,0.08)', borderRadius: 10, padding: '1px 8px' }}>
                {issues.length} issue{issues.length === 1 ? '' : 's'}
              </span>
            )}
            {duplicates.length > 0 && (
              <span style={{ fontSize: 12, color: '#c93a3a', background: 'rgba(224,82,82,0.08)', borderRadius: 10, padding: '1px 8px' }}>
                {duplicates.length} duplicate{duplicates.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          {(issues.length > 0 || duplicates.length > 0) && (
            <button onClick={() => setShowIssues(x => !x)} style={{
              fontSize: 12, color: '#888', background: 'transparent', border: 'none', cursor: 'pointer',
            }}>
              {showIssues ? 'Hide' : 'Show'}
            </button>
          )}
        </div>

        <div style={{ padding: '10px 18px' }}>
          {issues.length === 0 && duplicates.length === 0 ? (
            <div style={{ fontSize: 13, color: '#3a9e4a' }}>No data issues found.</div>
          ) : !showIssues && (
            <div style={{ fontSize: 13, color: s.dim }}>
              {issues.length > 0 && <div style={{ marginBottom: 4 }}><MiniBar value={issues.length} total={total} color="#e05252" /></div>}
              <div style={{ marginTop: 4 }}>
                {[
                  issues.length > 0 && `${issues.length} registration${issues.length === 1 ? '' : 's'} missing required fields`,
                  duplicates.length > 0 && `${duplicates.length} player${duplicates.length === 1 ? '' : 's'} registered more than once`,
                ].filter(Boolean).join(' · ')}
              </div>
            </div>
          )}
        </div>

        {showIssues && (issues.length > 0 || duplicates.length > 0) && (
          <div style={{ padding: '0 18px 12px' }}>
            {issues.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 700, color: s.dim, textTransform: 'uppercase', marginBottom: 8 }}>Missing required fields</div>
                <div style={{ overflowX: 'auto', marginBottom: 16 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #f0f1f3' }}>
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
                          <tr key={`${r.player_id}-${i}`} style={{ borderBottom: '1px solid #f7f8f9' }}>
                            <td style={{ padding: '6px 12px', fontWeight: 500 }}>{r.player_first_name} {r.player_last_name}</td>
                            <td style={{ padding: '6px 12px', color: s.muted }}>{r.age_group ?? '—'}</td>
                            <td style={{ padding: '6px 12px', color: '#c93a3a', fontSize: 12 }}>{missing}</td>
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
                    background: 'rgba(224,82,82,0.04)', border: '1px solid rgba(224,82,82,0.15)',
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
