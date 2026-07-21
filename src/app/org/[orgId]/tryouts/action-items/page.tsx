'use client'

import React, { useState, useEffect, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ActionItem {
  id:               string
  age_group:        string
  team_id:          string | null
  player_id:        string | null
  title:            string
  details:          string | null
  status:           string
  priority:         string | null
  due_date:         string | null
  owner_name:       string | null
  resolution_notes: string | null
  parent_id:        string | null
  created_by_name:  string | null
  created_at:       string
  updated_at:        string
  completed_at:     string | null
}

interface Team   { id: string; name: string; age_group: string; color: string | null }
interface Player { id: string; first_name: string; last_name: string; age_group: string | null; tryout_age_group: string | null }
interface Assignment { player_id: string; team_id: string; is_accepted: boolean }
interface OrgMember { id: string; name: string | null; email: string; user_id: string | null; is_active: boolean }
interface Season { id: string; label: string; year: number; age_groups: string[] }

const STATUS_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  open:        { label: 'Open',        color: '#E8A020',                 bg: 'rgba(232,160,32,0.12)' },
  waiting:     { label: 'Waiting',     color: '#40A0E8',                 bg: 'rgba(64,144,224,0.12)' },
  in_progress: { label: 'In Progress', color: '#6DB875',                 bg: 'rgba(109,184,117,0.12)' },
  blocked:     { label: 'Blocked',     color: '#E87060',                 bg: 'rgba(232,112,96,0.12)' },
  completed:   { label: 'Completed',   color: `rgba(var(--fg-rgb),0.5)`, bg: `rgba(var(--fg-rgb),0.06)` },
  cancelled:   { label: 'Cancelled',   color: `rgba(var(--fg-rgb),0.35)`, bg: `rgba(var(--fg-rgb),0.04)` },
}
const ACTIVE_STATUSES = ['open', 'waiting', 'in_progress', 'blocked']
const CLOSED_STATUSES = ['completed', 'cancelled']
const STATUS_OPTIONS  = ['open', 'waiting', 'in_progress', 'blocked', 'completed', 'cancelled']

const PRIORITY_STYLES: Record<string, { label: string; color: string }> = {
  low:    { label: 'Low',    color: `rgba(var(--fg-rgb),0.4)` },
  normal: { label: 'Normal', color: '#80B0E8' },
  high:   { label: 'High',   color: '#E87060' },
}

const FALLBACK_AGE_GROUPS = ['8U', '9U', '10U', '11U', '12U', '13U', '14U']

const BLANK_FORM = {
  age_group:        '',
  team_id:          '',
  player_id:        '',
  title:            '',
  details:          '',
  status:           'open',
  priority:         '',
  due_date:         '',
  owner_name:       '',
  resolution_notes: '',
}

// ── Component ──────────────────────────────────────────────────────────────────

function ActionItemsInner({ params }: { params: { orgId: string } }) {
  const supabase     = createClient()
  const searchParams = useSearchParams()

  const [season,      setSeason]      = useState<Season | null>(null)
  const [teams,       setTeams]       = useState<Team[]>([])
  const [players,     setPlayers]     = useState<Player[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [members,     setMembers]     = useState<OrgMember[]>([])
  const [items,       setItems]       = useState<ActionItem[]>([])
  const [loading,     setLoading]     = useState(true)

  // Filters
  const [ageFilter,    setAgeFilter]    = useState('all')
  const [teamFilter,   setTeamFilter]   = useState('all')
  const [ownerFilter,  setOwnerFilter]  = useState('all')
  const [statusFilter, setStatusFilter] = useState('open')
  const [playerFilter, setPlayerFilter] = useState<string | null>(null)
  const [search,       setSearch]       = useState('')

  // Create/edit form
  const [showForm,         setShowForm]         = useState(false)
  const [editId,           setEditId]           = useState<string | null>(null)
  const [followUpParentId, setFollowUpParentId] = useState<string | null>(null)
  const [form,              setForm]            = useState(BLANK_FORM)
  const [saving,            setSaving]          = useState(false)
  const [saveError,         setSaveError]       = useState<string | null>(null)
  const [copied,            setCopied]          = useState(false)

  // Preset filters from an incoming deep link (Team Making → here)
  useEffect(() => {
    const team   = searchParams.get('team')
    const player = searchParams.get('player')
    const status = searchParams.get('status')
    if (team)   setTeamFilter(team)
    if (player) setPlayerFilter(player)
    if (status) setStatusFilter(status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: seasonData } = await supabase
      .from('tryout_seasons')
      .select('id, label, year, age_groups')
      .eq('org_id', params.orgId).eq('is_active', true).maybeSingle()

    setSeason(seasonData)
    if (!seasonData) { setLoading(false); return }

    const [
      { data: teamData },
      { data: playerData },
      { data: assignData },
      { data: memberData },
      { data: itemData },
    ] = await Promise.all([
      supabase.from('tryout_teams')
        .select('id, name, age_group, color')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id),

      supabase.from('tryout_players')
        .select('id, first_name, last_name, age_group, tryout_age_group')
        .eq('org_id', params.orgId).eq('is_active', true)
        .order('last_name').order('first_name'),

      supabase.from('tryout_team_assignments')
        .select('player_id, team_id, is_accepted')
        .eq('season_id', seasonData.id),

      supabase.from('tryout_org_members')
        .select('id, name, email, user_id, is_active')
        .eq('org_id', params.orgId),

      supabase.from('tryout_action_items')
        .select('*')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id)
        .order('created_at'),
    ])

    setTeams(teamData ?? [])
    setPlayers(playerData ?? [])
    setAssignments(assignData ?? [])
    setMembers(memberData ?? [])
    setItems(itemData ?? [])
    setLoading(false)
  }

  // ── Save (create / edit) ──────────────────────────────────────────────────────

  async function saveItem() {
    if (!season || !form.title.trim() || !form.age_group) return
    setSaving(true)
    setSaveError(null)

    const isClosing = CLOSED_STATUSES.includes(form.status)
    const existing   = editId ? items.find(i => i.id === editId) : null
    const completed_at = isClosing ? (existing?.completed_at ?? new Date().toISOString()) : null

    const payload: any = {
      org_id:           params.orgId,
      season_id:        season.id,
      age_group:        form.age_group,
      team_id:          form.team_id || null,
      player_id:        form.player_id || null,
      title:            form.title.trim(),
      details:          form.details.trim() || null,
      status:           form.status,
      priority:         form.priority || null,
      due_date:         form.due_date || null,
      owner_name:       form.owner_name.trim() || null,
      resolution_notes: form.resolution_notes.trim() || null,
      completed_at,
    }

    if (editId) {
      const { error } = await supabase.from('tryout_action_items').update(payload).eq('id', editId)
      if (error) { setSaveError(error.message); setSaving(false); return }
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      const member = user ? members.find(m => m.user_id === user.id) : null
      payload.parent_id       = followUpParentId
      payload.created_by      = user?.id ?? null
      payload.created_by_name = member?.name ?? member?.email ?? user?.email ?? null
      const { error } = await supabase.from('tryout_action_items').insert(payload)
      if (error) { setSaveError(error.message); setSaving(false); return }
    }

    await loadData()
    resetForm()
    setSaving(false)
  }

  async function quickSetStatus(item: ActionItem, status: string) {
    const isClosing    = CLOSED_STATUSES.includes(status)
    const completed_at = isClosing ? (item.completed_at ?? new Date().toISOString()) : null
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, status, completed_at } : i))
    const { error } = await supabase.from('tryout_action_items')
      .update({ status, completed_at }).eq('id', item.id)
    if (error) {
      console.error('quickSetStatus failed:', error.message)
      await loadData()
    }
  }

  function startCreate() {
    setForm(BLANK_FORM)
    setEditId(null)
    setFollowUpParentId(null)
    setSaveError(null)
    setShowForm(true)
  }

  function startEdit(item: ActionItem) {
    setForm({
      age_group:        item.age_group,
      team_id:          item.team_id ?? '',
      player_id:        item.player_id ?? '',
      title:            item.title,
      details:          item.details ?? '',
      status:           item.status,
      priority:         item.priority ?? '',
      due_date:         item.due_date ?? '',
      owner_name:       item.owner_name ?? '',
      resolution_notes: item.resolution_notes ?? '',
    })
    setEditId(item.id)
    setFollowUpParentId(null)
    setSaveError(null)
    setShowForm(true)
  }

  function startFollowUp(parent: ActionItem) {
    setForm({
      ...BLANK_FORM,
      age_group: parent.age_group,
      team_id:   parent.team_id ?? '',
      player_id: '',
    })
    setEditId(null)
    setFollowUpParentId(parent.id)
    setSaveError(null)
    setShowForm(true)
  }

  function resetForm() {
    setForm(BLANK_FORM)
    setEditId(null)
    setFollowUpParentId(null)
    setSaveError(null)
    setShowForm(false)
  }

  function logAcceptanceFollowUp(player: Player, team: Team) {
    setForm({
      ...BLANK_FORM,
      age_group: team.age_group,
      team_id:   team.id,
      player_id: player.id,
      title:     `Confirm ${player.first_name} ${player.last_name} accepts ${team.name} roster spot`,
    })
    setEditId(null)
    setFollowUpParentId(null)
    setSaveError(null)
    setShowForm(true)
  }

  // ── Derived data ───────────────────────────────────────────────────────────────

  const ageGroups = season?.age_groups?.length ? season.age_groups : FALLBACK_AGE_GROUPS

  const ownerOptions = useMemo(() => {
    const fromMembers = members.filter(m => m.is_active).map(m => m.name || m.email)
    const fromItems   = items.map(i => i.owner_name).filter((v): v is string => !!v)
    return Array.from(new Set([...fromMembers, ...fromItems])).sort()
  }, [members, items])

  const allItemsById = useMemo(() => new Map(items.map(i => [i.id, i])), [items])

  // Players assigned to a team but not yet marked "accepted" on Team Making —
  // a reminder to confirm everyone before the roster is posted.
  const pendingAcceptance = useMemo(() => {
    return assignments
      .filter(a => !a.is_accepted)
      .map(a => ({ player: players.find(p => p.id === a.player_id), team: teams.find(t => t.id === a.team_id) }))
      .filter((x): x is { player: Player; team: Team } => !!x.player && !!x.team)
      .filter(x => ageFilter  === 'all' || x.team.age_group === ageFilter)
      .filter(x => teamFilter === 'all' || x.team.id === teamFilter)
      .sort((a, b) => (a.team.name + a.player.last_name).localeCompare(b.team.name + b.player.last_name))
  }, [assignments, players, teams, ageFilter, teamFilter])

  const todayStr = new Date().toISOString().slice(0, 10)

  function matchesStatus(st: string) {
    if (statusFilter === 'all')       return true
    if (statusFilter === 'open')      return ACTIVE_STATUSES.includes(st)
    if (statusFilter === 'completed') return CLOSED_STATUSES.includes(st)
    return st === statusFilter
  }

  const filtered = useMemo(() => {
    let list = items.filter(i => {
      if (ageFilter !== 'all' && i.age_group !== ageFilter) return false
      if (teamFilter !== 'all' && i.team_id !== teamFilter) return false
      if (playerFilter && i.player_id !== playerFilter) return false
      if (ownerFilter !== 'all' && (i.owner_name ?? '') !== ownerFilter) return false
      if (!matchesStatus(i.status)) return false
      if (search) {
        const q      = search.toLowerCase()
        const player = players.find(p => p.id === i.player_id)
        const hay = `${i.title} ${i.details ?? ''} ${player ? `${player.first_name} ${player.last_name}` : ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })

    list = list.slice().sort((a, b) => {
      const aActive = !CLOSED_STATUSES.includes(a.status)
      const bActive = !CLOSED_STATUSES.includes(b.status)
      if (aActive !== bActive) return aActive ? -1 : 1
      if (aActive) {
        const aOverdue = a.due_date != null && a.due_date < todayStr
        const bOverdue = b.due_date != null && b.due_date < todayStr
        if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
        const aDue = a.due_date ?? '9999-99-99'
        const bDue = b.due_date ?? '9999-99-99'
        if (aDue !== bDue) return aDue < bDue ? -1 : 1
        return a.created_at < b.created_at ? -1 : 1
      }
      return (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at)
    })

    // Thread children directly beneath their parent when both are visible.
    const byId       = new Map(list.map(i => [i.id, i]))
    const childrenOf = new Map<string, ActionItem[]>()
    const roots: ActionItem[] = []
    for (const it of list) {
      if (it.parent_id && byId.has(it.parent_id)) {
        if (!childrenOf.has(it.parent_id)) childrenOf.set(it.parent_id, [])
        childrenOf.get(it.parent_id)!.push(it)
      } else {
        roots.push(it)
      }
    }
    const threaded: ActionItem[] = []
    for (const r of roots) {
      threaded.push(r)
      for (const c of (childrenOf.get(r.id) ?? [])) threaded.push(c)
    }
    return threaded
  }, [items, ageFilter, teamFilter, playerFilter, ownerFilter, statusFilter, search, players, todayStr])

  // Form pickers
  const formTeamOptions = teams.filter(t => !form.age_group || t.age_group === form.age_group)
  const assignedToFormTeam = form.team_id
    ? new Set(assignments.filter(a => a.team_id === form.team_id).map(a => a.player_id))
    : null
  const formPlayerOptions = players.filter(p => {
    const ag = (p.tryout_age_group ?? p.age_group ?? '').toUpperCase()
    if (form.age_group && ag !== form.age_group.toUpperCase()) return false
    if (assignedToFormTeam && assignedToFormTeam.size > 0) return assignedToFormTeam.has(p.id)
    return true
  })

  const playerFilterPlayer = playerFilter ? players.find(p => p.id === playerFilter) : null

  // ── Copy for email / CSV export (both operate on the currently filtered list) ──

  function groupedForExport() {
    const groups = new Map<string, ActionItem[]>()
    for (const item of filtered) {
      const team = teams.find(t => t.id === item.team_id)
      const key  = team ? `${team.name} (${team.age_group})` : `${item.age_group} — No team`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(item)
    }
    return groups
  }

  function buildEmailText(): string {
    const lines: string[] = []
    lines.push(`Team Selection Action Items — ${season?.label ?? ''}`)
    lines.push(`Generated ${new Date().toLocaleString()}`)
    lines.push('')
    for (const [groupName, groupItems] of Array.from(groupedForExport())) {
      lines.push(groupName)
      for (const item of groupItems) {
        const player = players.find(p => p.id === item.player_id)
        const indent = item.parent_id ? '    ' : '  '
        let line = `${indent}[${STATUS_STYLES[item.status]?.label ?? item.status}] ${item.title}`
        if (player)          line += ` — ${player.last_name}, ${player.first_name}`
        if (item.owner_name) line += ` — Owner: ${item.owner_name}`
        if (item.due_date)   line += ` — Due: ${item.due_date}`
        lines.push(line)
        if (item.details)          lines.push(`${indent}    Notes: ${item.details}`)
        if (item.resolution_notes) lines.push(`${indent}    Resolution: ${item.resolution_notes}`)
      }
      lines.push('')
    }
    return lines.join('\n')
  }

  async function copyForEmail() {
    try {
      await navigator.clipboard.writeText(buildEmailText())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('copyForEmail failed:', err)
    }
  }

  function exportCsv() {
    const rows = [
      ['Status', 'Title', 'Age Group', 'Team', 'Player', 'Owner', 'Priority', 'Due Date', 'Created', 'Updated', 'Details', 'Resolution'],
      ...filtered.map(item => {
        const team   = teams.find(t => t.id === item.team_id)
        const player = players.find(p => p.id === item.player_id)
        return [
          STATUS_STYLES[item.status]?.label ?? item.status,
          item.title,
          item.age_group,
          team?.name ?? '',
          player ? `${player.last_name}, ${player.first_name}` : '',
          item.owner_name ?? '',
          item.priority ? PRIORITY_STYLES[item.priority].label : '',
          item.due_date ?? '',
          new Date(item.created_at).toLocaleDateString(),
          new Date(item.updated_at).toLocaleDateString(),
          item.details ?? '',
          item.resolution_notes ?? '',
        ]
      }),
    ]
    const csv  = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url
    a.download = `action-items-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Styles ────────────────────────────────────────────────────────────────────

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  const pill = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px', borderRadius: '20px', border: '0.5px solid',
    borderColor: active ? 'var(--accent)' : 'var(--border-md)',
    background: active ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
    color: active ? 'var(--accent)' : s.muted,
    fontSize: '11px', fontWeight: active ? 700 : 400, cursor: 'pointer',
  })

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)',
    border: '0.5px solid var(--border-md)', borderRadius: '6px',
    padding: '7px 10px', fontSize: '13px', color: 'var(--fg)',
  }
  const labelStyle: React.CSSProperties = {
    fontSize: '11px', color: s.dim, display: 'block', marginBottom: '3px',
    fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading…
    </main>
  )

  if (!season) return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>
      <p style={{ color: s.muted }}>No active season found. Create a season first.</p>
    </main>
  )

  const openCount = items.filter(i => ACTIVE_STATUSES.includes(i.status)).length

  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800 }}>Team Selection Action Items</h1>
          <div style={{ fontSize: '13px', color: s.muted, marginTop: '2px' }}>
            {season.label} · {openCount} open
          </div>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={copyForEmail} style={{
            padding: '8px 14px', borderRadius: '7px', border: '0.5px solid var(--border-md)',
            background: 'var(--bg-input)', color: s.muted, fontSize: '13px', cursor: 'pointer',
          }}>{copied ? '✓ Copied!' : '⎋ Copy for email'}</button>
          <button onClick={exportCsv} style={{
            padding: '8px 14px', borderRadius: '7px', border: '0.5px solid var(--border-md)',
            background: 'var(--bg-input)', color: s.muted, fontSize: '13px', cursor: 'pointer',
          }}>↓ CSV</button>
          <button onClick={startCreate} style={{
            padding: '8px 18px', borderRadius: '7px', border: 'none',
            background: 'var(--accent)', color: 'var(--accent-text)',
            fontSize: '13px', fontWeight: 700, cursor: 'pointer',
          }}>+ New Action Item</button>
        </div>
      </div>

      {/* ── Pending roster acceptance reminder ── */}
      {pendingAcceptance.length > 0 && (
        <div style={{
          background: 'rgba(232,160,32,0.08)', border: '0.5px solid rgba(232,160,32,0.3)',
          borderRadius: '10px', padding: '12px 16px', marginBottom: '1.25rem',
        }}>
          <div style={{ fontSize: '12px', fontWeight: 800, color: 'var(--accent)', marginBottom: '4px' }}>
            ⚠ Pending Roster Acceptance ({pendingAcceptance.length})
          </div>
          <div style={{ fontSize: '11px', color: s.muted, marginBottom: '10px' }}>
            Assigned to a team but not yet marked accepted on Team Making — confirm everyone before posting the roster.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {pendingAcceptance.map(({ player, team }) => (
              <div key={player.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12px', flexWrap: 'wrap' }}>
                <Link href={`/org/${params.orgId}/tryouts/rankings?player=${player.id}`} style={{ fontWeight: 700, color: 'var(--fg)', textDecoration: 'none' }}>
                  {player.last_name}, {player.first_name}
                </Link>
                <span style={{ color: s.dim }}>·</span>
                <span style={{ color: s.muted }}>{team.name} ({team.age_group})</span>
                <button onClick={() => logAcceptanceFollowUp(player, team)} style={{
                  marginLeft: 'auto', fontSize: '11px', padding: '3px 9px', borderRadius: '5px',
                  border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: s.muted, cursor: 'pointer',
                }}>+ Log follow-up</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Player deep-link chip */}
      {playerFilterPlayer && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
          <span style={{ fontSize: '12px', color: s.muted }}>Filtered to player:</span>
          <span style={{ ...pill(true), cursor: 'default', display: 'flex', alignItems: 'center', gap: '6px' }}>
            {playerFilterPlayer.last_name}, {playerFilterPlayer.first_name}
            <span onClick={() => setPlayerFilter(null)} style={{ cursor: 'pointer', fontWeight: 800 }}>✕</span>
          </span>
        </div>
      )}

      {/* ── Filters ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1.25rem' }}>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {['all', ...ageGroups].map(ag => (
            <button key={ag} onClick={() => setAgeFilter(ag)} style={pill(ageFilter === ag)}>
              {ag === 'all' ? 'All ages' : ag}
            </button>
          ))}
          <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
            style={{ ...inputStyle, width: 'auto', padding: '5px 8px', fontSize: '12px' }}>
            <option value="all">All teams</option>
            {teams
              .filter(t => ageFilter === 'all' || t.age_group === ageFilter)
              .map(t => <option key={t.id} value={t.id}>{t.name} ({t.age_group})</option>)}
          </select>
          <select value={ownerFilter} onChange={e => setOwnerFilter(e.target.value)}
            style={{ ...inputStyle, width: 'auto', padding: '5px 8px', fontSize: '12px' }}>
            <option value="all">All owners</option>
            {ownerOptions.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            style={{ ...inputStyle, width: '150px', padding: '5px 8px', fontSize: '12px' }} />
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {([
            ['open', 'Open'], ['waiting', 'Waiting'], ['in_progress', 'In Progress'],
            ['blocked', 'Blocked'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['all', 'All'],
          ] as const).map(([val, label]) => (
            <button key={val} onClick={() => setStatusFilter(val)} style={pill(statusFilter === val)}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── Create / edit form ── */}
      {showForm && (
        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '1rem' }}>
            {editId ? 'Edit action item' : followUpParentId ? 'New follow-up action' : 'New action item'}
          </div>
          {followUpParentId && (
            <div style={{ fontSize: '12px', color: s.muted, marginBottom: '12px' }}>
              ↳ Follow-up to: {allItemsById.get(followUpParentId)?.title}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>Title</label>
              <input type="text" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Confirm Player X accepts 8U Blue" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Age group</label>
              <select value={form.age_group} onChange={e => setForm(f => ({ ...f, age_group: e.target.value, team_id: '', player_id: '' }))} style={inputStyle}>
                <option value="">Select…</option>
                {ageGroups.map(ag => <option key={ag} value={ag}>{ag}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Team</label>
              <select value={form.team_id} onChange={e => setForm(f => ({ ...f, team_id: e.target.value, player_id: '' }))} style={inputStyle}>
                <option value="">—</option>
                {formTeamOptions.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Related player</label>
              <select value={form.player_id} onChange={e => setForm(f => ({ ...f, player_id: e.target.value }))} style={inputStyle}>
                <option value="">—</option>
                {formPlayerOptions.map(p => <option key={p.id} value={p.id}>{p.last_name}, {p.first_name}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Owner</label>
              <input type="text" value={form.owner_name} onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))}
                placeholder="Name" list="owner-suggestions" style={inputStyle} />
              <datalist id="owner-suggestions">
                {ownerOptions.map(o => <option key={o} value={o} />)}
              </datalist>
            </div>
            <div>
              <label style={labelStyle}>Status</label>
              <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={inputStyle}>
                {STATUS_OPTIONS.map(st => <option key={st} value={st}>{STATUS_STYLES[st].label}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} style={inputStyle}>
                <option value="">—</option>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Due date</label>
              <input type="date" value={form.due_date} onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))} style={inputStyle} />
            </div>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Detailed notes</label>
            <textarea value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))}
              rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>Resolution / updated notes</label>
            <textarea value={form.resolution_notes} onChange={e => setForm(f => ({ ...f, resolution_notes: e.target.value }))}
              rows={2} style={{ ...inputStyle, resize: 'vertical', fontFamily: 'inherit' }} />
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button onClick={saveItem} disabled={saving || !form.title.trim() || !form.age_group} style={{
              padding: '8px 18px', borderRadius: '6px', border: 'none',
              background: 'var(--accent)', color: 'var(--accent-text)',
              fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              opacity: saving || !form.title.trim() || !form.age_group ? 0.6 : 1,
            }}>{saving ? 'Saving…' : editId ? 'Save changes' : 'Create'}</button>
            <button onClick={resetForm} style={{
              padding: '8px 18px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
              background: 'transparent', color: s.muted, fontSize: '13px', cursor: 'pointer',
            }}>Cancel</button>
            {saveError && <span style={{ fontSize: '12px', color: '#E87060' }}>Error: {saveError}</span>}
          </div>
        </div>
      )}

      {/* ── List ── */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem 2rem', color: s.dim, fontSize: '13px' }}>
          No action items match these filters.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(item => {
            const team    = teams.find(t => t.id === item.team_id)
            const player  = players.find(p => p.id === item.player_id)
            const parent  = item.parent_id ? allItemsById.get(item.parent_id) : null
            const overdue = item.due_date != null && item.due_date < todayStr && !CLOSED_STATUSES.includes(item.status)
            const st      = STATUS_STYLES[item.status] ?? STATUS_STYLES.open

            return (
              <div key={item.id} style={{ marginLeft: item.parent_id ? '28px' : 0 }}>
                {item.parent_id && (
                  <div style={{ fontSize: '10px', color: s.dim, marginBottom: '3px', fontWeight: 600 }}>
                    ↳ follow-up to: {parent ? parent.title : 'a resolved item'}
                  </div>
                )}
                <div style={{
                  background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '10px',
                  padding: '10px 14px', borderLeft: overdue ? '3px solid #E87060' : '3px solid transparent',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '20px', background: st.bg, color: st.color, fontWeight: 700, flexShrink: 0 }}>{st.label}</span>
                    {overdue && <span style={{ fontSize: '10px', fontWeight: 800, color: '#E87060' }}>OVERDUE</span>}
                    <div style={{ fontWeight: 700, fontSize: '13px', flex: 1, minWidth: '160px' }}>{item.title}</div>
                    {item.priority && (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: PRIORITY_STYLES[item.priority].color }}>{PRIORITY_STYLES[item.priority].label}</span>
                    )}
                    <select value={item.status} onChange={e => quickSetStatus(item, e.target.value)} style={{
                      background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '5px',
                      padding: '3px 6px', fontSize: '11px', color: 'var(--fg)', cursor: 'pointer',
                    }}>
                      {STATUS_OPTIONS.map(so => <option key={so} value={so}>{STATUS_STYLES[so].label}</option>)}
                    </select>
                    <button onClick={() => startEdit(item)} style={{
                      fontSize: '11px', padding: '3px 9px', borderRadius: '5px',
                      border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: s.muted, cursor: 'pointer',
                    }}>Edit</button>
                    <button onClick={() => startFollowUp(item)} style={{
                      fontSize: '11px', padding: '3px 9px', borderRadius: '5px',
                      border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: s.muted, cursor: 'pointer',
                    }}>+ Follow-up</button>
                  </div>

                  <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap', fontSize: '11px', color: s.muted, marginTop: '6px' }}>
                    <span>{item.age_group}</span>
                    {team && (
                      <Link href={`/org/${params.orgId}/tryouts/rankings?team=${team.id}`} style={{ color: '#40A0E8', textDecoration: 'none', fontWeight: 600 }}>
                        {team.name}
                      </Link>
                    )}
                    {player && (
                      <Link href={`/org/${params.orgId}/tryouts/rankings?player=${player.id}`} style={{ color: '#80B0E8', textDecoration: 'none', fontWeight: 600 }}>
                        {player.last_name}, {player.first_name}
                      </Link>
                    )}
                    {item.owner_name && <span>Owner: {item.owner_name}</span>}
                    {item.due_date && <span style={{ color: overdue ? '#E87060' : s.muted }}>Due: {item.due_date}</span>}
                    <span style={{ color: s.dim }}>Updated: {new Date(item.updated_at).toLocaleDateString()}</span>
                  </div>

                  {item.details && (
                    <div style={{ fontSize: '12px', color: 'var(--fg)', marginTop: '6px', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{item.details}</div>
                  )}
                  {item.resolution_notes && (
                    <div style={{ fontSize: '12px', color: s.muted, marginTop: '6px', whiteSpace: 'pre-wrap', lineHeight: 1.4, fontStyle: 'italic' }}>
                      Resolution: {item.resolution_notes}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}

export default function ActionItemsPage({ params }: { params: { orgId: string } }) {
  return (
    <Suspense fallback={
      <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading…
      </main>
    }>
      <ActionItemsInner params={params} />
    </Suspense>
  )
}
