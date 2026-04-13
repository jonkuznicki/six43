'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

const FIELD_CONFIGS = [
  {
    label: 'Standard – 9 players (LF · CF · RF)',
    positions: ['P','C','1B','2B','SS','3B','LF','CF','RF','Bench'],
  },
  {
    label: 'Softball – 10 players (LF · LC · RC · RF)',
    positions: ['P','C','1B','2B','SS','3B','LF','LC','RC','RF','Bench'],
  },
]

const BLANK_TEAM = { name: '', age_group: '', positions: FIELD_CONFIGS[0].positions }
const BLANK_SEASON = { name: '', start_date: '', end_date: '', innings_per_game: '6' }

function suggestNextSeasonName(current: string): string {
  const fallMatch = current.match(/fall\s+(\d{4})/i)
  if (fallMatch) return `Spring ${parseInt(fallMatch[1]) + 1}`
  const springMatch = current.match(/spring\s+(\d{4})/i)
  if (springMatch) return `Fall ${springMatch[1]}`
  const summerMatch = current.match(/summer\s+(\d{4})/i)
  if (summerMatch) return `Fall ${summerMatch[1]}`
  return current + ' (next)'
}

export default function SettingsPage() {
  const supabase = createClient()
  const router = useRouter()
  const [teams, setTeams] = useState<any[]>([])
  const [userEmail, setUserEmail] = useState<string>('')
  const [userId, setUserId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const [teamForm, setTeamForm] = useState<any>(null)
  const [savingTeam, setSavingTeam] = useState(false)
  const [teamError, setTeamError] = useState('')

  const [seasonForm, setSeasonForm] = useState<any>(null)
  const [savingSeason, setSavingSeason] = useState(false)
  const [seasonError, setSeasonError] = useState('')

  const [rolloverSeason, setRolloverSeason] = useState<any>(null)
  const [rollingOver, setRollingOver] = useState(false)

  const [deleteTeam, setDeleteTeam] = useState<string | null>(null)
  const [deleteSeason, setDeleteSeason] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [displayName, setDisplayName] = useState('')
  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [savingName, setSavingName] = useState(false)

  const [showChangePassword, setShowChangePassword] = useState(false)
  const [pwForm, setPwForm] = useState({ newPassword: '', confirm: '' })
  const [pwError, setPwError] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwSuccess, setPwSuccess] = useState(false)

  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState('')
  const [plan, setPlan] = useState<'free' | 'pro'>('free')
  const [gameCount, setGameCount] = useState(0)

  // Invite / team members (owned teams)
  const [teamMembers, setTeamMembers] = useState<Record<string, any[]>>({})
  const [inviteFormTeamId, setInviteFormTeamId] = useState<string | null>(null)
  const [inviteEmailInput, setInviteEmailInput] = useState('')
  const [sendingInvite, setSendingInvite] = useState(false)
  const [inviteError, setInviteError] = useState('')

  // Teams the current user is a staff coach on (not owner)
  const [memberTeams, setMemberTeams] = useState<any[]>([])
  const [memberTeamStaff, setMemberTeamStaff] = useState<Record<string, any[]>>({})

  const [tab, setTab] = useState<string>('team')

  useEffect(() => { loadData() }, [])

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  async function saveDisplayName() {
    setSavingName(true)
    const { error } = await supabase.auth.updateUser({ data: { display_name: displayNameDraft.trim() } })
    if (!error) {
      setDisplayName(displayNameDraft.trim())
      setEditingName(false)
    }
    setSavingName(false)
  }

  async function deleteAccount() {
    setDeletingAccount(true)
    const res = await fetch('/api/account/delete', { method: 'POST' })
    if (res.ok) {
      await supabase.auth.signOut()
      router.push('/')
    } else {
      setDeletingAccount(false)
    }
  }

  async function changePassword() {
    if (!pwForm.newPassword) { setPwError('Password is required.'); return }
    if (pwForm.newPassword.length < 6) { setPwError('Password must be at least 6 characters.'); return }
    if (pwForm.newPassword !== pwForm.confirm) { setPwError('Passwords do not match.'); return }
    setPwSaving(true); setPwError('')
    const { error } = await supabase.auth.updateUser({ password: pwForm.newPassword })
    if (error) { setPwError(error.message); setPwSaving(false); return }
    setPwSaving(false)
    setPwSuccess(true)
    setPwForm({ newPassword: '', confirm: '' })
    setTimeout(() => { setShowChangePassword(false); setPwSuccess(false) }, 1500)
  }

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserEmail(user.email ?? '')
    setUserId(user.id)
    const name = user.user_metadata?.display_name ?? ''
    setDisplayName(name)
    setDisplayNameDraft(name)

    // Plan
    const { data: planRow } = await supabase.from('user_plans').select('plan').maybeSingle()
    const userPlan: 'free' | 'pro' = planRow?.plan ?? 'free'
    setPlan(userPlan)

    // Game count (for free limit display)
    const { data: teamIds } = await supabase.from('teams').select('id').eq('user_id', user.id)
    if (teamIds && userPlan === 'free') {
      const { data: seasonIds } = await supabase.from('seasons').select('id')
        .in('team_id', teamIds.map(t => t.id))
      if (seasonIds) {
        const { count } = await supabase.from('games').select('id', { count: 'exact', head: true })
          .in('season_id', seasonIds.map(s => s.id))
        setGameCount(count ?? 0)
      }
    }

    const { data: teamRows } = await supabase
      .from('teams').select('*').eq('user_id', user.id).order('created_at')

    const allTeams: any[] = []
    const membersMap: Record<string, any[]> = {}
    for (const team of teamRows ?? []) {
      const { data: seasons } = await supabase
        .from('seasons').select('*').eq('team_id', team.id).order('created_at', { ascending: false })
      const { data: members } = await supabase
        .from('team_members').select('*').eq('team_id', team.id).order('created_at')
      allTeams.push({ ...team, seasons: seasons ?? [] })
      membersMap[team.id] = members ?? []

      // Keep owner_email in sync on the team row
      if (team.owner_email !== user.email) {
        await supabase.from('teams').update({ owner_email: user.email }).eq('id', team.id)
      }
    }
    setTeams(allTeams)
    setTeamMembers(membersMap)

    // Load teams where this user is an accepted staff coach (not owner)
    const { data: myMemberships } = await supabase
      .from('team_members')
      .select('team_id')
      .eq('user_id', user.id)
      .not('accepted_at', 'is', null)

    if (myMemberships && myMemberships.length > 0) {
      const memberTeamIds = myMemberships.map((m: any) => m.team_id)
      const { data: mTeams } = await supabase
        .from('teams')
        .select('id, name, age_group, owner_email')
        .in('id', memberTeamIds)
      const staffMap: Record<string, any[]> = {}
      for (const mt of mTeams ?? []) {
        const { data: staff } = await supabase
          .from('team_members')
          .select('id, user_id, email, invite_email, accepted_at, read_only, role')
          .eq('team_id', mt.id)
          .not('accepted_at', 'is', null)
          .order('created_at')
        staffMap[mt.id] = staff ?? []
      }
      setMemberTeams(mTeams ?? [])
      setMemberTeamStaff(staffMap)
      // If user has no owned teams, default to the coaches tab
      if ((teamRows ?? []).length === 0 && (mTeams ?? []).length > 0) {
        setTab('coaches')
      }
    }

    setLoading(false)
  }

  async function saveTeam() {
    if (!teamForm.name?.trim()) { setTeamError('Team name is required.'); return }
    setSavingTeam(true); setTeamError('')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const payload = {
      name: teamForm.name.trim(),
      age_group: teamForm.age_group?.trim() || null,
      positions: teamForm.positions ?? FIELD_CONFIGS[0].positions,
    }

    if (teamForm.id) {
      await supabase.from('teams').update(payload).eq('id', teamForm.id)
      setTeams(prev => prev.map(t => t.id === teamForm.id ? { ...t, ...payload } : t))
    } else {
      const { data } = await supabase.from('teams').insert({ ...payload, user_id: user.id }).select().single()
      if (data) setTeams(prev => [...prev, { ...data, seasons: [] }])
    }
    setSavingTeam(false); setTeamForm(null)
  }

  async function confirmDeleteTeam() {
    setDeleting(true)
    await supabase.from('teams').delete().eq('id', deleteTeam)
    setTeams(prev => prev.filter(t => t.id !== deleteTeam))
    setDeleteTeam(null); setDeleting(false)
  }

  async function saveSeason() {
    if (!seasonForm.name?.trim()) { setSeasonError('Season name is required.'); return }
    const inn = parseInt(seasonForm.innings_per_game)
    if (isNaN(inn) || inn < 1 || inn > 9) { setSeasonError('Innings must be 1–9.'); return }
    setSavingSeason(true); setSeasonError('')

    const payload: any = {
      name: seasonForm.name.trim(),
      start_date: seasonForm.start_date || null,
      end_date: seasonForm.end_date || null,
      innings_per_game: inn,
    }
    if (seasonForm.id) {
      // Only update webcal fields when editing an existing season
      payload.webcal_url = seasonForm.webcal_url?.trim() || null
      if (seasonForm.timezone?.trim()) payload.timezone = seasonForm.timezone.trim()
    }

    if (seasonForm.id) {
      await supabase.from('seasons').update(payload).eq('id', seasonForm.id)
      setTeams(prev => prev.map(t => ({
        ...t,
        seasons: t.seasons.map((s: any) => s.id === seasonForm.id ? { ...s, ...payload } : s),
      })))
    } else {
      const team = teams.find(t => t.id === seasonForm.teamId)
      // Always activate the new season and deactivate any existing ones
      const newIsActive = true
      for (const s of team?.seasons ?? []) {
        await supabase.from('seasons').update({ is_active: false }).eq('id', s.id)
      }
      const { data } = await supabase.from('seasons')
        .insert({ ...payload, team_id: seasonForm.teamId, is_active: newIsActive }).select().single()
      if (data) {
        setTeams(prev => prev.map(t =>
          t.id === seasonForm.teamId ? {
            ...t,
            seasons: [data, ...t.seasons.map((s: any) => newIsActive ? { ...s, is_active: false } : s)],
          } : t
        ))
      }
    }
    setSavingSeason(false); setSeasonForm(null)
  }

  async function setActiveSeason(teamId: string, seasonId: string) {
    const team = teams.find(t => t.id === teamId)
    for (const s of team?.seasons ?? []) {
      await supabase.from('seasons').update({ is_active: false }).eq('id', s.id)
    }
    await supabase.from('seasons').update({ is_active: true }).eq('id', seasonId)
    setTeams(prev => prev.map(t =>
      t.id === teamId
        ? { ...t, seasons: t.seasons.map((s: any) => ({ ...s, is_active: s.id === seasonId })) }
        : t
    ))
  }

  async function deactivateSeason(teamId: string, seasonId: string) {
    await supabase.from('seasons').update({ is_active: false }).eq('id', seasonId)
    setTeams(prev => prev.map(t =>
      t.id === teamId
        ? { ...t, seasons: t.seasons.map((s: any) => s.id === seasonId ? { ...s, is_active: false } : s) }
        : t
    ))
  }

  async function doRollover() {
    if (!rolloverSeason) return
    setRollingOver(true)

    const newName = suggestNextSeasonName(rolloverSeason.name)
    const payload = {
      team_id: rolloverSeason.team_id,
      name: newName,
      innings_per_game: rolloverSeason.innings_per_game,
      is_active: true,
      start_date: null,
      end_date: null,
    }

    const team = teams.find(t => t.id === rolloverSeason.team_id)
    for (const s of team?.seasons ?? []) {
      await supabase.from('seasons').update({ is_active: false }).eq('id', s.id)
    }

    const { data: newSeason } = await supabase.from('seasons').insert(payload).select().single()

    // Copy all players from the old season into the new season
    if (newSeason) {
      const { data: oldPlayers } = await supabase
        .from('players')
        .select('first_name, last_name, jersey_number, primary_position, status, team_id, batting_pref_order, innings_target')
        .eq('season_id', rolloverSeason.id)

      if (oldPlayers && oldPlayers.length > 0) {
        await supabase.from('players').insert(
          oldPlayers.map(p => ({ ...p, season_id: newSeason.id }))
        )
      }
    }

    setTeams(prev => prev.map(t =>
      t.id === rolloverSeason.team_id
        ? {
            ...t,
            seasons: [
              newSeason,
              ...t.seasons.map((s: any) => ({ ...s, is_active: false })),
            ],
          }
        : t
    ))

    setRollingOver(false); setRolloverSeason(null)
  }

  async function sendInvite(teamId: string) {
    const email = inviteEmailInput.trim().toLowerCase()
    if (!email || !email.includes('@')) { setInviteError('Enter a valid email address.'); return }
    setSendingInvite(true); setInviteError('')

    const res = await fetch('/api/invite/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamId, email }),
    })
    const json = await res.json()

    if (!res.ok) {
      setInviteError(json.error ?? 'Failed to send invite. Try again.')
      setSendingInvite(false)
      return
    }

    if (json.member) {
      setTeamMembers(prev => ({ ...prev, [teamId]: [...(prev[teamId] ?? []), json.member] }))
    }
    setInviteEmailInput('')
    setInviteFormTeamId(null)
    setSendingInvite(false)
  }

  async function revokeInvite(teamId: string, memberId: string) {
    await supabase.from('team_members').delete().eq('id', memberId)
    setTeamMembers(prev => ({
      ...prev,
      [teamId]: (prev[teamId] ?? []).filter(m => m.id !== memberId),
    }))
  }

  async function toggleReadOnly(teamId: string, memberId: string, current: boolean) {
    await supabase.from('team_members').update({ read_only: !current }).eq('id', memberId)
    setTeamMembers(prev => ({
      ...prev,
      [teamId]: (prev[teamId] ?? []).map(m =>
        m.id === memberId ? { ...m, read_only: !current } : m
      ),
    }))
  }

  async function confirmDeleteSeason() {
    setDeleting(true)
    await supabase.from('seasons').delete().eq('id', deleteSeason)
    setTeams(prev => prev.map(t => ({
      ...t, seasons: t.seasons.filter((s: any) => s.id !== deleteSeason),
    })))
    setDeleteSeason(null); setDeleting(false)
  }

  async function toggleTeamActive(teamId: string, isActive: boolean) {
    await supabase.from('teams').update({ is_active: isActive }).eq('id', teamId)
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, is_active: isActive } : t))
  }

  if (loading) return (
    <main style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--fg)',
      fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading...
    </main>
  )

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '480px', margin: '0 auto',
      padding: '1.5rem 1rem 6rem',
    }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '1rem' }}>Settings</h1>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: '2px', marginBottom: '1.5rem',
        background: 'var(--bg-card)', border: '0.5px solid var(--border)',
        borderRadius: '10px', padding: '3px',
      }}>
        {([
          { id: 'team', label: 'Team' },
          { id: 'season', label: 'Season' },
          { id: 'coaches', label: 'Staff' },
          { id: 'account', label: 'Account' },
        ]).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: '7px 4px', borderRadius: '7px', border: 'none',
            background: tab === t.id ? 'var(--bg)' : 'transparent',
            color: tab === t.id ? 'var(--fg)' : `rgba(var(--fg-rgb), 0.45)`,
            fontSize: '13px', fontWeight: tab === t.id ? 700 : 500,
            cursor: 'pointer',
            boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── Roster & Lineup (Account tab only) ── */}
      {tab === 'account' && (
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '10px' }}>
          Roster & Lineup
        </div>
        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          <Link href="/roster" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', textDecoration: 'none', color: 'var(--fg)',
            borderBottom: '0.5px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>👥</span>
              <span style={{ fontSize: '14px' }}>Roster</span>
            </div>
            <span style={{ fontSize: '16px', color: `rgba(var(--fg-rgb), 0.25)` }}>›</span>
          </Link>
          <Link href="/depth-chart" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', textDecoration: 'none', color: 'var(--fg)',
            borderBottom: '0.5px solid var(--border-subtle)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>📐</span>
              <span style={{ fontSize: '14px' }}>Depth Chart</span>
            </div>
            <span style={{ fontSize: '16px', color: `rgba(var(--fg-rgb), 0.25)` }}>›</span>
          </Link>
          <Link href="/schedule" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', textDecoration: 'none', color: 'var(--fg)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>📅</span>
              <span style={{ fontSize: '14px' }}>Schedule Calendar</span>
            </div>
            <span style={{ fontSize: '16px', color: `rgba(var(--fg-rgb), 0.25)` }}>›</span>
          </Link>
        </div>
      </div>
      )}

      {/* Teams & Seasons section — hidden on account tab */}
      {tab !== 'account' && (
      <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)` }}>
          {tab === 'team' ? 'Teams' : tab === 'season' ? 'Seasons' : 'Coaching Staff'}

        </div>
        {tab === 'team' && (
        <button onClick={() => { setTeamForm(BLANK_TEAM); setTeamError('') }} style={{
          fontSize: '13px', fontWeight: 600, padding: '7px 14px', borderRadius: '6px',
          border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer',
        }}>+ Add team</button>
        )}
      </div>

      {teams.length === 0 && (
        <div style={{ textAlign: 'center', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '4rem', fontSize: '14px' }}>
          No teams yet. Add your first team to get started.
        </div>
      )}

      {/* Active teams */}
      {teams.filter(t => t.is_active !== false).map(team => (
        <div key={team.id} style={{
          background: 'var(--bg-card)',
          border: '0.5px solid var(--border)',
          borderRadius: '12px', marginBottom: '20px', overflow: 'hidden',
        }}>
          {/* Team header */}
          <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--border-subtle)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--fg)' }}>{team.name}</div>
              {team.age_group && (
                <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '2px' }}>
                  {team.age_group}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                onClick={() => toggleTeamActive(team.id, !team.is_active)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  fontSize: '11px', padding: '3px 8px', borderRadius: '20px', cursor: 'pointer',
                  border: team.is_active ? '0.5px solid rgba(45,106,53,0.4)' : '0.5px solid var(--border-md)',
                  background: team.is_active ? 'rgba(45,106,53,0.12)' : 'transparent',
                  color: team.is_active ? '#6DB875' : `rgba(var(--fg-rgb), 0.4)`,
                }}
              >
                <span style={{ fontSize: '7px' }}>{team.is_active ? '●' : '○'}</span>
                {team.is_active ? 'Active' : 'Inactive'}
              </button>
              <button onClick={() => { setTeamForm({ id: team.id, name: team.name, age_group: team.age_group ?? '', positions: team.positions ?? FIELD_CONFIGS[0].positions }); setTeamError('') }}
                style={smallBtn}>Edit</button>
              <button onClick={() => setDeleteTeam(team.id)} style={{ ...smallBtn, color: 'rgba(232,100,80,0.7)' }}>
                Delete
              </button>
            </div>
          </div>

          {/* Seasons — season tab only */}
          {tab === 'season' && (
          <div style={{ padding: '10px 16px 14px' }}>
            {team.seasons.length === 0 && (
              <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.3)`, marginBottom: '10px' }}>
                No seasons yet.
              </div>
            )}

            {team.seasons.length > 0 && !team.seasons.some((s: any) => s.is_active) && (
              <div style={{
                padding: '8px 10px', borderRadius: '6px', marginBottom: '8px',
                background: 'rgba(232,160,32,0.08)', border: '0.5px solid rgba(232,160,32,0.3)',
                fontSize: '12px', color: '#E8A020',
              }}>
                No active season — tap <strong>Activate →</strong> on a season below to start using it.
              </div>
            )}

            {team.seasons.map((season: any) => (
              <div key={season.id} style={{
                padding: '9px 10px', marginBottom: '4px',
                background: season.is_active ? 'rgba(45,106,53,0.12)' : 'var(--bg-card-alt)',
                border: season.is_active ? '0.5px solid rgba(45,106,53,0.3)' : '0.5px solid var(--border-subtle)',
                borderRadius: '6px',
              }}>
                {/* Season name + meta */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>
                      <Link href={`/games?teamId=${team.id}`} style={{ textDecoration: 'none', color: 'var(--fg)' }}>
                        {season.name}
                      </Link>
                    </div>
                    <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '2px' }}>
                      {season.innings_per_game} inn/game
                      {season.start_date ? `  ·  ${season.start_date}` : ''}
                      {season.end_date ? ` – ${season.end_date}` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                    {season.is_active ? (
                      <button
                        onClick={() => deactivateSeason(team.id, season.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          fontSize: '11px', padding: '3px 8px', borderRadius: '20px', cursor: 'pointer',
                          border: '0.5px solid rgba(45,106,53,0.4)',
                          background: 'rgba(45,106,53,0.12)', color: '#6DB875',
                        }}>
                        <span style={{ fontSize: '7px' }}>●</span> Active
                      </button>
                    ) : (
                      <button
                        onClick={() => setActiveSeason(team.id, season.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '4px',
                          fontSize: '11px', padding: '3px 10px', borderRadius: '20px', cursor: 'pointer',
                          border: '0.5px solid rgba(59,109,177,0.5)',
                          background: 'rgba(59,109,177,0.12)', color: '#80B0E8',
                          fontWeight: 600,
                        }}>
                        Activate →
                      </button>
                    )}
                    <button onClick={() => setRolloverSeason({ ...season, team_id: team.id })} style={smallBtn}>
                      Rollover
                    </button>
                    <button onClick={() => { setSeasonForm({ id: season.id, teamId: team.id, name: season.name,
                      start_date: season.start_date ?? '', end_date: season.end_date ?? '',
                      innings_per_game: String(season.innings_per_game),
                      webcal_url: season.webcal_url ?? '', timezone: season.timezone ?? '' }); setSeasonError('') }}
                      style={smallBtn}>Edit</button>
                    <button onClick={() => setDeleteSeason(season.id)}
                      style={{ ...smallBtn, color: 'rgba(232,100,80,0.6)' }}>✕</button>
                  </div>
                </div>
                {/* Season links */}
                <div style={{ display: 'flex', gap: '12px' }}>
                  <Link href={`/games?teamId=${team.id}`} style={{
                    fontSize: '12px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 500,
                  }}>
                    View games →
                  </Link>
                  <Link href={`/roster?seasonId=${season.id}`} style={{
                    fontSize: '12px', color: `rgba(var(--fg-rgb), 0.45)`, textDecoration: 'none',
                  }}>
                    Manage roster →
                  </Link>
                </div>
              </div>
            ))}

            <button onClick={() => { setSeasonForm({ teamId: team.id, ...BLANK_SEASON }); setSeasonError('') }}
              style={{ marginTop: '6px', fontSize: '12px', padding: '5px 12px', borderRadius: '4px',
                border: '0.5px dashed var(--border-strong)', background: 'transparent',
                color: `rgba(var(--fg-rgb), 0.45)`, cursor: 'pointer' }}>
              + Add season
            </button>
          </div>
          )}

          {/* ── STAFF / INVITES — coaches tab only ── */}
          {tab === 'coaches' && (
          <div style={{ padding: '10px 16px 14px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)`, textTransform: 'uppercase',
                  letterSpacing: '0.08em' }}>Staff</div>
                {inviteFormTeamId !== team.id && (
                  <button
                    onClick={() => { setInviteFormTeamId(team.id); setInviteEmailInput(''); setInviteError('') }}
                    style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '4px',
                      border: '0.5px solid var(--border-strong)', background: 'transparent',
                      color: `rgba(var(--fg-rgb), 0.5)`, cursor: 'pointer' }}>
                    + Invite coach
                  </button>
                )}
              </div>

              {/* Invite email form */}
              {inviteFormTeamId === team.id && (
                <div style={{ marginBottom: '10px', padding: '10px 12px', borderRadius: '8px',
                  background: 'var(--bg-input)', border: '0.5px solid var(--border-md)' }}>
                  <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '6px' }}>
                    Enter the coach's email address. They'll be added to the team when they sign in.
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="email"
                      value={inviteEmailInput}
                      onChange={e => { setInviteEmailInput(e.target.value); setInviteError('') }}
                      onKeyDown={e => { if (e.key === 'Enter') sendInvite(team.id) }}
                      placeholder="coach@example.com"
                      autoFocus
                      style={{ flex: 1, padding: '7px 10px', borderRadius: '5px', fontSize: '13px',
                        border: '0.5px solid var(--border-md)', background: 'var(--bg)',
                        color: 'var(--fg)', outline: 'none' }}
                    />
                    <button
                      onClick={() => sendInvite(team.id)}
                      disabled={sendingInvite}
                      style={{ fontSize: '12px', padding: '7px 12px', borderRadius: '5px', border: 'none',
                        background: 'var(--accent)', color: 'var(--accent-text)',
                        cursor: sendingInvite ? 'not-allowed' : 'pointer', fontWeight: 600,
                        opacity: sendingInvite ? 0.7 : 1, flexShrink: 0 }}>
                      {sendingInvite ? '…' : 'Add'}
                    </button>
                    <button
                      onClick={() => { setInviteFormTeamId(null); setInviteError('') }}
                      style={{ fontSize: '12px', padding: '7px 10px', borderRadius: '5px',
                        border: '0.5px solid var(--border-strong)', background: 'transparent',
                        color: `rgba(var(--fg-rgb), 0.5)`, cursor: 'pointer', flexShrink: 0 }}>
                      Cancel
                    </button>
                  </div>
                  {inviteError && (
                    <div style={{ fontSize: '11px', color: '#E87060', marginTop: '5px' }}>{inviteError}</div>
                  )}
                </div>
              )}

              {/* Owner row — always shown first */}
              <div style={{
                padding: '8px 10px', marginBottom: '4px',
                background: 'rgba(59,109,177,0.08)',
                border: '0.5px solid rgba(59,109,177,0.2)', borderRadius: '6px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '13px', color: 'var(--fg)', fontWeight: 500 }}>
                      {userEmail}
                    </span>
                    <span style={{ fontSize: '10px', color: '#80B0E8', marginLeft: '6px', fontWeight: 700 }}>
                      Admin
                    </span>
                    <span style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)`, marginLeft: '4px' }}>
                      · You
                    </span>
                  </div>
                </div>
                <div style={{ marginTop: '4px' }}>
                  <span style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)` }}>
                    Can edit lineups and roster
                  </span>
                </div>
              </div>

              {/* Active staff coaches */}
              {(() => {
                const all = teamMembers[team.id] ?? []
                const active = all.filter((m: any) => m.accepted_at)
                const pending = all.filter((m: any) => !m.accepted_at)
                return (
                  <>
                    {active.length > 0 && (
                      <>
                        <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.25)`,
                          textTransform: 'uppercase', letterSpacing: '0.07em',
                          marginTop: '10px', marginBottom: '4px' }}>
                          Active · {active.length}
                        </div>
                        {active.map((m: any) => (
                          <div key={m.id} style={{
                            padding: '8px 10px', marginBottom: '4px',
                            background: 'var(--bg-card-alt)',
                            border: '0.5px solid var(--border-subtle)', borderRadius: '6px',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: '13px', color: 'var(--fg)', fontWeight: 500 }}>
                                  {m.email ?? m.invite_email ?? `Coach ${m.user_id?.slice(0, 8)}…`}
                                </span>
                                <span style={{ fontSize: '10px', color: '#6DB875', marginLeft: '6px', fontWeight: 600 }}>
                                  Staff
                                </span>
                              </div>
                              <button
                                onClick={() => revokeInvite(team.id, m.id)}
                                style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px',
                                  border: '0.5px solid rgba(192,57,43,0.3)', background: 'transparent',
                                  color: 'rgba(232,100,80,0.7)', cursor: 'pointer', flexShrink: 0 }}>
                                Remove
                              </button>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                              <button
                                onClick={() => toggleReadOnly(team.id, m.id, m.read_only ?? false)}
                                style={{
                                  fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px',
                                  cursor: 'pointer', border: 'none',
                                  background: m.read_only ? 'rgba(232,160,32,0.15)' : 'rgba(45,106,53,0.15)',
                                  color: m.read_only ? '#E8A020' : '#6DB875',
                                }}>
                                {m.read_only ? 'View only' : 'Can edit'}
                              </button>
                              <span style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)` }}>
                                {m.read_only ? 'Can view lineups but not make changes' : 'Can edit lineups and roster'}
                              </span>
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    {pending.length > 0 && (
                      <>
                        <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.25)`,
                          textTransform: 'uppercase', letterSpacing: '0.07em',
                          marginTop: '10px', marginBottom: '4px' }}>
                          Pending · {pending.length}
                        </div>
                        {pending.map((m: any) => (
                          <div key={m.id} style={{
                            padding: '8px 10px', marginBottom: '4px',
                            background: 'var(--bg-card-alt)',
                            border: '0.5px solid var(--border-subtle)', borderRadius: '6px',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: '13px', color: 'var(--fg)', fontWeight: 500 }}>
                                  {m.invite_email ?? 'Invited coach'}
                                </span>
                                <span style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.35)`,
                                  marginLeft: '6px', fontStyle: 'italic' }}>
                                  hasn't signed in yet
                                </span>
                              </div>
                              <button
                                onClick={() => revokeInvite(team.id, m.id)}
                                style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px',
                                  border: '0.5px solid rgba(192,57,43,0.3)', background: 'transparent',
                                  color: 'rgba(232,100,80,0.7)', cursor: 'pointer', flexShrink: 0 }}>
                                Revoke
                              </button>
                            </div>
                          </div>
                        ))}
                      </>
                    )}

                    {all.length === 0 && (
                      <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.3)`,
                        fontStyle: 'italic', marginTop: '4px' }}>
                        No staff invited yet.
                      </div>
                    )}
                  </>
                )
              })()}
            </div>
          </div>
          )}
        </div>
      ))}

      {/* ── STAFF VIEW for coaches (teams where user is a staff member, not owner) ── */}
      {tab === 'coaches' && memberTeams.length > 0 && (
        <div style={{ marginTop: teams.length > 0 ? '2rem' : 0 }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`,
            marginBottom: '12px' }}>
            Teams you coach
          </div>
          {memberTeams.map((mt: any) => (
            <div key={mt.id} style={{
              background: 'var(--bg-card)', border: '0.5px solid var(--border)',
              borderRadius: '12px', marginBottom: '16px', overflow: 'hidden',
            }}>
              <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '16px', fontWeight: 700 }}>{mt.name}</div>
                {mt.age_group && (
                  <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '2px' }}>
                    {mt.age_group}
                  </div>
                )}
              </div>
              <div style={{ padding: '10px 16px 14px' }}>
                <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)`,
                  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                  Staff
                </div>

                {/* Team admin (owner) */}
                {mt.owner_email && (
                  <div style={{
                    padding: '8px 10px', marginBottom: '4px',
                    background: 'rgba(59,109,177,0.08)',
                    border: '0.5px solid rgba(59,109,177,0.2)', borderRadius: '6px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500 }}>{mt.owner_email}</span>
                      <span style={{ fontSize: '10px', color: '#80B0E8', fontWeight: 700 }}>Admin</span>
                    </div>
                    <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)`, marginTop: '3px' }}>
                      Can edit lineups and roster
                    </div>
                  </div>
                )}

                {/* Accepted staff coaches */}
                {(memberTeamStaff[mt.id] ?? []).map((m: any) => (
                  <div key={m.id} style={{
                    padding: '8px 10px', marginBottom: '4px',
                    background: 'var(--bg-card-alt)',
                    border: '0.5px solid var(--border-subtle)', borderRadius: '6px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500, flex: 1 }}>
                        {m.email ?? m.invite_email ?? `Coach ${m.user_id?.slice(0, 8)}…`}
                      </span>
                      <span style={{ fontSize: '10px', color: '#6DB875', fontWeight: 600 }}>Staff</span>
                      {m.user_id === userId && (
                        <span style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)` }}>· You</span>
                      )}
                    </div>
                    <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)`, marginTop: '3px' }}>
                      {m.read_only ? 'View only · Cannot edit lineups' : 'Can edit lineups and roster'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Inactive teams */}
      {teams.filter(t => t.is_active === false).length > 0 && (
        <>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.25)`,
            margin: '8px 0 12px', paddingTop: '4px',
            borderTop: '0.5px solid var(--border-subtle)' }}>
            Inactive teams
          </div>
          {teams.filter(t => t.is_active === false).map(team => (
            <div key={team.id} style={{
              background: 'var(--bg-card)',
              border: '0.5px solid var(--border)',
              borderRadius: '12px', marginBottom: '20px', overflow: 'hidden',
              opacity: 0.6,
            }}>
              {/* Team header */}
              <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--border-subtle)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--fg)' }}>{team.name}</div>
                  {team.age_group && (
                    <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '2px' }}>
                      {team.age_group}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <button
                    onClick={() => toggleTeamActive(team.id, !team.is_active)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '4px',
                      fontSize: '11px', padding: '3px 8px', borderRadius: '20px', cursor: 'pointer',
                      border: '0.5px solid var(--border-md)',
                      background: 'transparent',
                      color: `rgba(var(--fg-rgb), 0.4)`,
                    }}
                  >
                    <span style={{ fontSize: '7px' }}>○</span>
                    Inactive
                  </button>
                  <button onClick={() => { setTeamForm({ id: team.id, name: team.name, age_group: team.age_group ?? '', positions: team.positions ?? FIELD_CONFIGS[0].positions }); setTeamError('') }}
                    style={smallBtn}>Edit</button>
                  <button onClick={() => setDeleteTeam(team.id)} style={{ ...smallBtn, color: 'rgba(232,100,80,0.7)' }}>
                    Delete
                  </button>
                </div>
              </div>

              {/* Seasons — season tab only */}
              {tab === 'season' && (
              <div style={{ padding: '10px 16px 14px' }}>
                <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)`, textTransform: 'uppercase',
                  letterSpacing: '0.08em', marginBottom: '8px' }}>Seasons</div>

                {team.seasons.length === 0 && (
                  <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.3)`, marginBottom: '10px' }}>
                    No seasons yet.
                  </div>
                )}

                {team.seasons.map((season: any) => (
                  <div key={season.id} style={{
                    padding: '9px 10px', marginBottom: '4px',
                    background: season.is_active ? 'rgba(45,106,53,0.12)' : 'var(--bg-card-alt)',
                    border: season.is_active ? '0.5px solid rgba(45,106,53,0.3)' : '0.5px solid var(--border-subtle)',
                    borderRadius: '6px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '14px', fontWeight: 500 }}>
                          <Link href={`/games?teamId=${team.id}`} style={{ textDecoration: 'none', color: 'var(--fg)' }}>
                            {season.name}
                          </Link>
                        </div>
                        <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '2px' }}>
                          {season.innings_per_game} inn/game
                          {season.start_date ? `  ·  ${season.start_date}` : ''}
                          {season.end_date ? ` – ${season.end_date}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                        <button
                          onClick={() => season.is_active
                            ? deactivateSeason(team.id, season.id)
                            : setActiveSeason(team.id, season.id)
                          }
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            fontSize: '11px', padding: '3px 8px', borderRadius: '20px', cursor: 'pointer',
                            border: season.is_active ? '0.5px solid rgba(45,106,53,0.4)' : '0.5px solid var(--border-md)',
                            background: season.is_active ? 'rgba(45,106,53,0.12)' : 'transparent',
                            color: season.is_active ? '#6DB875' : `rgba(var(--fg-rgb), 0.4)`,
                          }}>
                          <span style={{ fontSize: '7px' }}>{season.is_active ? '●' : '○'}</span>
                          {season.is_active ? 'Active' : 'Inactive'}
                        </button>
                        <button onClick={() => setRolloverSeason({ ...season, team_id: team.id })} style={smallBtn}>
                          Rollover
                        </button>
                        <button onClick={() => { setSeasonForm({ id: season.id, teamId: team.id, name: season.name,
                          start_date: season.start_date ?? '', end_date: season.end_date ?? '',
                          innings_per_game: String(season.innings_per_game) }); setSeasonError('') }}
                          style={smallBtn}>Edit</button>
                        <button onClick={() => setDeleteSeason(season.id)}
                          style={{ ...smallBtn, color: 'rgba(232,100,80,0.6)' }}>✕</button>
                      </div>
                    </div>
                    <Link href={`/roster?seasonId=${season.id}`} style={{
                      display: 'inline-block', fontSize: '12px', color: 'var(--accent)',
                      textDecoration: 'none', fontWeight: 500,
                    }}>
                      Manage roster →
                    </Link>
                  </div>
                ))}

                <button onClick={() => { setSeasonForm({ teamId: team.id, ...BLANK_SEASON }); setSeasonError('') }}
                  style={{ marginTop: '6px', fontSize: '12px', padding: '5px 12px', borderRadius: '4px',
                    border: '0.5px dashed var(--border-strong)', background: 'transparent',
                    color: `rgba(var(--fg-rgb), 0.45)`, cursor: 'pointer' }}>
                  + Add season
                </button>
              </div>
              )}
            </div>
          ))}
        </>
      )}
      </>
      )}

      {/* ── TEAM FORM ── */}
      {teamForm !== null && (
        <BottomSheet onClose={() => setTeamForm(null)}>
          <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '1.25rem' }}>
            {teamForm.id ? 'Edit team' : 'Add team'}
          </div>
          {teamError && <ErrorMsg msg={teamError} />}
          <Field label="Team name">
            <input value={teamForm.name} onChange={e => setTeamForm((f: any) => ({ ...f, name: e.target.value }))}
              placeholder="Blue Jays" style={inputStyle} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px' }}>
            <Field label="Age group (optional)">
              <input value={teamForm.age_group} onChange={e => setTeamForm((f: any) => ({ ...f, age_group: e.target.value }))}
                placeholder="12U, Varsity…" style={inputStyle} />
            </Field>
            <Field label="Field layout">
              <select
                value={FIELD_CONFIGS.findIndex(c =>
                  JSON.stringify(c.positions) === JSON.stringify(teamForm.positions)
                )}
                onChange={e => setTeamForm((f: any) => ({
                  ...f, positions: FIELD_CONFIGS[parseInt(e.target.value)].positions,
                }))}
                style={inputStyle}
              >
                {FIELD_CONFIGS.map((c, i) => (
                  <option key={i} value={i}>{c.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            {teamForm.id && (
              <button onClick={() => { setTeamForm(null); setDeleteTeam(teamForm.id) }}
                style={{ padding: '11px 14px', borderRadius: '6px', border: '0.5px solid rgba(192,57,43,0.3)',
                  background: 'transparent', color: 'rgba(232,100,80,0.7)', fontSize: '13px', cursor: 'pointer' }}>
                Delete
              </button>
            )}
            <button onClick={() => setTeamForm(null)} style={cancelBtnStyle}>Cancel</button>
            <button onClick={saveTeam} disabled={savingTeam} style={primaryBtnStyle(savingTeam)}>
              {savingTeam ? 'Saving…' : (teamForm.id ? 'Save changes' : 'Add team')}
            </button>
          </div>
        </BottomSheet>
      )}

      {/* ── SEASON FORM ── */}
      {seasonForm !== null && (
        <BottomSheet onClose={() => setSeasonForm(null)}>
          <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '1.25rem' }}>
            {seasonForm.id ? 'Edit season' : 'Add season'}
          </div>
          {seasonError && <ErrorMsg msg={seasonError} />}
          <Field label="Season name">
            <input value={seasonForm.name} onChange={e => setSeasonForm((f: any) => ({ ...f, name: e.target.value }))}
              placeholder="Fall 2025" style={inputStyle} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginTop: '10px' }}>
            <Field label="Start date">
              <input type="date" value={seasonForm.start_date}
                onChange={e => setSeasonForm((f: any) => ({ ...f, start_date: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="End date">
              <input type="date" value={seasonForm.end_date}
                onChange={e => setSeasonForm((f: any) => ({ ...f, end_date: e.target.value }))} style={inputStyle} />
            </Field>
            <Field label="Inn/game">
              <input type="number" min={1} max={9} value={seasonForm.innings_per_game}
                onChange={e => setSeasonForm((f: any) => ({ ...f, innings_per_game: e.target.value }))} style={inputStyle} />
            </Field>
          </div>
          {/* GameChanger webcal — only show when editing an existing season */}
          {seasonForm.id && (
            <div style={{ marginTop: '10px' }}>
              <Field label="GameChanger webcal link">
                <input
                  value={seasonForm.webcal_url ?? ''}
                  onChange={e => setSeasonForm((f: any) => ({ ...f, webcal_url: e.target.value }))}
                  placeholder="webcal://… (set via Import / connect GameChanger)"
                  style={inputStyle}
                />
              </Field>
              {seasonForm.webcal_url?.trim() && (
                <div style={{ marginTop: '6px' }}>
                  <Field label="Timezone">
                    <select
                      value={seasonForm.timezone ?? ''}
                      onChange={e => setSeasonForm((f: any) => ({ ...f, timezone: e.target.value }))}
                      style={inputStyle}
                    >
                      <option value="">— not set —</option>
                      <optgroup label="United States">
                        <option value="America/New_York">Eastern (ET)</option>
                        <option value="America/Chicago">Central (CT)</option>
                        <option value="America/Denver">Mountain (MT)</option>
                        <option value="America/Phoenix">Arizona (no DST)</option>
                        <option value="America/Los_Angeles">Pacific (PT)</option>
                        <option value="America/Anchorage">Alaska (AKT)</option>
                        <option value="Pacific/Honolulu">Hawaii (HT)</option>
                      </optgroup>
                      <optgroup label="Canada">
                        <option value="America/Toronto">Toronto / Eastern</option>
                        <option value="America/Winnipeg">Winnipeg / Central</option>
                        <option value="America/Edmonton">Edmonton / Mountain</option>
                        <option value="America/Vancouver">Vancouver / Pacific</option>
                      </optgroup>
                    </select>
                  </Field>
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button onClick={() => setSeasonForm(null)} style={cancelBtnStyle}>Cancel</button>
            <button onClick={saveSeason} disabled={savingSeason} style={primaryBtnStyle(savingSeason)}>
              {savingSeason ? 'Saving…' : (seasonForm.id ? 'Save changes' : 'Add season')}
            </button>
          </div>
        </BottomSheet>
      )}

      {/* ── ROLLOVER CONFIRM ── */}
      {rolloverSeason && (
        <div onClick={() => setRolloverSeason(null)} style={overlayStyle}>
          <div onClick={e => e.stopPropagation()} style={dialogStyle}>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>
              Roll over to new season?
            </div>
            <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.55)`, marginBottom: '4px' }}>
              This will create a new season:
            </div>
            <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--accent)', marginBottom: '4px' }}>
              {suggestNextSeasonName(rolloverSeason.name)}
            </div>
            <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`, marginBottom: '1.5rem' }}>
              Your roster carries over automatically. All games stay in the current season.
              The new season will be set as active.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setRolloverSeason(null)} style={cancelBtnStyle}>Cancel</button>
              <button onClick={doRollover} disabled={rollingOver} style={primaryBtnStyle(rollingOver)}>
                {rollingOver ? 'Creating…' : 'Create new season'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE TEAM CONFIRM ── */}
      {deleteTeam && (
        <div onClick={() => setDeleteTeam(null)} style={overlayStyle}>
          <div onClick={e => e.stopPropagation()} style={{ ...dialogStyle, border: '0.5px solid rgba(192,57,43,0.3)' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Delete team?</div>
            <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.5)`, marginBottom: '1.5rem' }}>
              This will permanently delete the team, all its seasons, games, and player data. This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setDeleteTeam(null)} style={cancelBtnStyle}>Cancel</button>
              <button onClick={confirmDeleteTeam} disabled={deleting}
                style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none',
                  background: '#C0392B', color: 'white', fontSize: '13px', fontWeight: 600,
                  cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}>
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE SEASON CONFIRM ── */}
      {deleteSeason && (
        <div onClick={() => setDeleteSeason(null)} style={overlayStyle}>
          <div onClick={e => e.stopPropagation()} style={{ ...dialogStyle, border: '0.5px solid rgba(192,57,43,0.3)' }}>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Delete season?</div>
            <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.5)`, marginBottom: '1.5rem' }}>
              This will delete the season and all its games and lineup data. This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setDeleteSeason(null)} style={cancelBtnStyle}>Cancel</button>
              <button onClick={confirmDeleteSeason} disabled={deleting}
                style={{ flex: 1, padding: '10px', borderRadius: '6px', border: 'none',
                  background: '#C0392B', color: 'white', fontSize: '13px', fontWeight: 600,
                  cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1 }}>
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PLAN + ACCOUNT (account tab only) ── */}
      {tab === 'account' && (
      <>
      <div style={{ marginTop: '2rem', borderTop: '0.5px solid var(--border-subtle)', paddingTop: '1.5rem' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '12px' }}>
          Plan
        </div>
        <div style={{
          background: plan === 'pro' ? 'rgba(232,160,32,0.07)' : 'var(--bg-card)',
          border: `0.5px solid ${plan === 'pro' ? 'rgba(232,160,32,0.3)' : 'var(--border)'}`,
          borderRadius: '12px', padding: '16px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '15px', fontWeight: 700 }}>
                  {plan === 'pro' ? 'Six43 Pro' : 'Free plan'}
                </span>
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                  background: plan === 'pro' ? 'rgba(232,160,32,0.2)' : 'rgba(255,255,255,0.06)',
                  color: plan === 'pro' ? 'var(--accent)' : `rgba(var(--fg-rgb), 0.4)`,
                  border: `0.5px solid ${plan === 'pro' ? 'rgba(232,160,32,0.3)' : 'var(--border)'}`,
                }}>
                  {plan === 'pro' ? 'PRO' : 'FREE'}
                </span>
              </div>
              {plan === 'free' && (
                <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.5)` }}>
                  {gameCount} of 10 games used · <span style={{ color: gameCount >= 10 ? '#E87060' : 'inherit' }}>
                    {10 - gameCount} remaining
                  </span>
                </div>
              )}
              {plan === 'pro' && (
                <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.5)` }}>
                  Unlimited games · all features
                </div>
              )}
            </div>
            {plan === 'free' && (
              <div style={{
                fontSize: '12px', fontWeight: 700, padding: '7px 14px', borderRadius: '6px',
                background: 'rgba(232,160,32,0.12)', color: 'var(--accent)',
                border: '0.5px solid rgba(232,160,32,0.3)',
                opacity: 0.7,
              }}>
                Upgrade · coming soon
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── ACCOUNT ── */}
      <div style={{ marginTop: '2rem', borderTop: '0.5px solid var(--border-subtle)', paddingTop: '1.5rem' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '12px' }}>
          Account
        </div>
        <div style={{
          background: 'var(--bg-card)', border: '0.5px solid var(--border)',
          borderRadius: '12px', overflow: 'hidden',
        }}>
          {/* Display name row */}
          <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--border-subtle)' }}>
            <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '6px' }}>
              Display name
            </div>
            {editingName ? (
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  value={displayNameDraft}
                  onChange={e => setDisplayNameDraft(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') saveDisplayName(); if (e.key === 'Escape') setEditingName(false) }}
                  placeholder="Your name"
                  autoFocus
                  style={{ flex: 1, padding: '7px 10px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: 'var(--fg)', fontSize: '13px' }}
                />
                <button onClick={saveDisplayName} disabled={savingName} style={{ padding: '7px 14px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                  {savingName ? '…' : 'Save'}
                </button>
                <button onClick={() => { setEditingName(false); setDisplayNameDraft(displayName) }} style={{ padding: '7px 10px', borderRadius: '6px', border: '0.5px solid var(--border)', background: 'transparent', color: `rgba(var(--fg-rgb), 0.5)`, fontSize: '12px', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '14px', fontWeight: 500, color: displayName ? 'var(--fg)' : `rgba(var(--fg-rgb), 0.3)` }}>
                  {displayName || 'Not set'}
                </span>
                <button onClick={() => setEditingName(true)} style={{ fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '0' }}>
                  Edit
                </button>
              </div>
            )}
          </div>
          {/* Email row */}
          <div style={{ padding: '14px 16px', borderBottom: '0.5px solid var(--border-subtle)',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '3px' }}>
                Signed in as
              </div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--fg)' }}>
                {userEmail}
              </div>
            </div>
          </div>
          {/* Change password row */}
          <button onClick={() => { setShowChangePassword(true); setPwError(''); setPwSuccess(false) }}
            style={{ width: '100%', padding: '13px 16px', background: 'transparent', border: 'none',
              textAlign: 'left', fontSize: '13px', color: 'var(--fg)', cursor: 'pointer',
              borderBottom: '0.5px solid var(--border-subtle)' }}>
            Change password
          </button>
          {/* Feedback row */}
          <a href="mailto:support@six43.com?subject=Six43 feedback" style={{
            display: 'block', width: '100%', padding: '13px 16px', background: 'transparent',
            borderBottom: '0.5px solid var(--border-subtle)',
            textAlign: 'left', fontSize: '13px', color: `rgba(var(--fg-rgb), 0.6)`,
            textDecoration: 'none', boxSizing: 'border-box',
          }}>
            Send feedback or feature request
          </a>
          {/* Sign out row */}
          <button onClick={signOut} style={{ width: '100%', padding: '13px 16px', background: 'transparent',
            border: 'none', textAlign: 'left', fontSize: '13px',
            color: 'rgba(232,100,80,0.8)', cursor: 'pointer', fontWeight: 500,
            borderBottom: '0.5px solid var(--border-subtle)' }}>
            Sign out
          </button>
          {/* Delete account row */}
          <button onClick={() => { setShowDeleteAccount(true); setDeleteConfirmText('') }}
            style={{ width: '100%', padding: '13px 16px', background: 'transparent',
              border: 'none', textAlign: 'left', fontSize: '13px',
              color: `rgba(var(--fg-rgb), 0.3)`, cursor: 'pointer' }}>
            Delete account
          </button>
        </div>
      </div>
      </>
      )}

      {/* ── CHANGE PASSWORD ── */}
      {showChangePassword && (
        <BottomSheet onClose={() => setShowChangePassword(false)}>
          <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '1.25rem' }}>Change password</div>
          {pwSuccess ? (
            <div style={{ fontSize: '14px', color: '#6DB875', textAlign: 'center', padding: '1rem 0' }}>
              ✓ Password updated
            </div>
          ) : (
            <>
              {pwError && <ErrorMsg msg={pwError} />}
              <Field label="New password">
                <input type="password" value={pwForm.newPassword}
                  onChange={e => setPwForm(f => ({ ...f, newPassword: e.target.value }))}
                  placeholder="Min. 6 characters" style={inputStyle} />
              </Field>
              <div style={{ marginTop: '10px' }}>
                <Field label="Confirm password">
                  <input type="password" value={pwForm.confirm}
                    onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
                    placeholder="Repeat new password" style={inputStyle} />
                </Field>
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button onClick={() => setShowChangePassword(false)} style={cancelBtnStyle}>Cancel</button>
                <button onClick={changePassword} disabled={pwSaving} style={primaryBtnStyle(pwSaving)}>
                  {pwSaving ? 'Saving…' : 'Update password'}
                </button>
              </div>
            </>
          )}
        </BottomSheet>
      )}

      {/* ── DELETE ACCOUNT ── */}
      {showDeleteAccount && (
        <BottomSheet onClose={() => setShowDeleteAccount(false)}>
          <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '8px', color: '#E87060' }}>Delete account</div>
          <p style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.6)`, lineHeight: 1.6, marginBottom: '16px' }}>
            This permanently deletes your account, all teams, seasons, rosters, and lineups. This cannot be undone.
          </p>
          <p style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.5)`, marginBottom: '8px' }}>
            Type <strong style={{ color: 'var(--fg)' }}>DELETE</strong> to confirm.
          </p>
          <input
            value={deleteConfirmText}
            onChange={e => setDeleteConfirmText(e.target.value)}
            placeholder="DELETE"
            autoFocus
            style={{ ...inputStyle, marginBottom: '16px', width: '100%', boxSizing: 'border-box' as const }}
          />
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => setShowDeleteAccount(false)} style={cancelBtnStyle}>Cancel</button>
            <button
              onClick={deleteAccount}
              disabled={deletingAccount || deleteConfirmText !== 'DELETE'}
              style={{
                flex: 1, padding: '11px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: '13px',
                background: deleteConfirmText === 'DELETE' ? '#E87060' : `rgba(var(--fg-rgb), 0.1)`,
                color: deleteConfirmText === 'DELETE' ? '#fff' : `rgba(var(--fg-rgb), 0.3)`,
                opacity: deletingAccount ? 0.7 : 1,
              }}
            >
              {deletingAccount ? 'Deleting…' : 'Delete my account'}
            </button>
          </div>
        </BottomSheet>
      )}
    </main>
  )
}

// ── Shared sub-components ──────────────────────────────────

function BottomSheet({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ ...overlayStyle, alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--bg2)', borderRadius: '16px 16px 0 0', padding: '1.5rem',
        width: '100%', maxWidth: '480px', border: '0.5px solid var(--border)',
        maxHeight: '90vh', overflowY: 'auto',
      }}>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '4px' }}>{label}</div>
      {children}
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return (
    <div style={{ fontSize: '12px', color: '#E87060', background: 'rgba(192,57,43,0.15)',
      border: '0.5px solid rgba(192,57,43,0.3)', borderRadius: '6px',
      padding: '8px 12px', marginBottom: '12px' }}>{msg}</div>
  )
}

// ── Shared styles ─────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
}

const dialogStyle: React.CSSProperties = {
  background: 'var(--bg2)', borderRadius: '12px', padding: '1.5rem',
  width: '300px', border: '0.5px solid var(--border)',
}

const smallBtn: React.CSSProperties = {
  fontSize: '11px', padding: '4px 9px', borderRadius: '4px',
  border: '0.5px solid var(--border-md)', background: 'transparent',
  color: `rgba(var(--fg-rgb), 0.5)`, cursor: 'pointer',
}

const cancelBtnStyle: React.CSSProperties = {
  flex: 1, padding: '11px', borderRadius: '6px',
  border: '0.5px solid var(--border-strong)', background: 'transparent',
  color: `rgba(var(--fg-rgb), 0.6)`, fontSize: '13px', cursor: 'pointer',
}

const primaryBtnStyle = (disabled: boolean): React.CSSProperties => ({
  flex: 2, padding: '11px', borderRadius: '6px', border: 'none',
  background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '13px', fontWeight: 700,
  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.7 : 1,
})

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 10px', borderRadius: '6px',
  border: '0.5px solid var(--border-md)',
  background: 'var(--bg-input)', color: 'var(--fg)',
  fontSize: '13px', boxSizing: 'border-box',
}
