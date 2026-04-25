'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'

interface Team {
  id:        string
  name:      string
  age_group: string
  color:     string | null
  is_active: boolean
  _playerCount?: number
}

interface Season {
  id:         string
  label:      string
  age_groups: string[]
}

const TEAM_COLORS = [
  '#E84040', '#E87020', '#E8A020', '#6DB875', '#40A0E8',
  '#7060E8', '#C060C0', '#60C0C0', '#808080',
]

const BLANK_FORM = { name: '', age_group: '', color: TEAM_COLORS[0] }
const FALLBACK_AGE_GROUPS = ['8U','9U','10U','11U','12U','13U','14U']

export default function TeamsPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()

  const [season,    setSeason]    = useState<Season | null>(null)
  const [teams,     setTeams]     = useState<Team[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showForm,  setShowForm]  = useState(false)
  const [form,      setForm]      = useState(BLANK_FORM)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [saving,    setSaving]    = useState(false)
  const [ageFilter, setAgeFilter] = useState('all')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: seasonData } = await supabase
      .from('tryout_seasons').select('id, label, age_groups')
      .eq('org_id', params.orgId).eq('is_active', true).maybeSingle()
    setSeason(seasonData)

    if (!seasonData) { setLoading(false); return }

    const [{ data: teamData }, { data: assignData }] = await Promise.all([
      supabase.from('tryout_teams').select('id, name, age_group, color, is_active')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id)
        .order('age_group').order('name'),
      supabase.from('tryout_team_assignments').select('team_id')
        .eq('season_id', seasonData.id),
    ])

    const counts: Record<string, number> = {}
    for (const a of (assignData ?? [])) {
      counts[a.team_id] = (counts[a.team_id] ?? 0) + 1
    }
    setTeams((teamData ?? []).map((t: any) => ({ ...t, _playerCount: counts[t.id] ?? 0 })))
    setLoading(false)
  }

  async function saveTeam() {
    if (!season || !form.name.trim() || !form.age_group) return
    setSaving(true)

    if (editId) {
      await supabase.from('tryout_teams').update({
        name: form.name.trim(), age_group: form.age_group, color: form.color,
      }).eq('id', editId)
      setTeams(prev => prev.map(t => t.id === editId ? { ...t, ...form, name: form.name.trim() } : t))
    } else {
      const { data } = await supabase.from('tryout_teams').insert({
        org_id: params.orgId, season_id: season.id,
        name: form.name.trim(), age_group: form.age_group, color: form.color,
        is_active: true,
      }).select('id, name, age_group, color, is_active').single()
      if (data) setTeams(prev => [...prev, { ...data, _playerCount: 0 }])
    }

    setForm(BLANK_FORM)
    setEditId(null)
    setShowForm(false)
    setSaving(false)
  }

  async function toggleActive(team: Team) {
    await supabase.from('tryout_teams').update({ is_active: !team.is_active }).eq('id', team.id)
    setTeams(prev => prev.map(t => t.id === team.id ? { ...t, is_active: !t.is_active } : t))
  }

  function startEdit(team: Team) {
    setForm({ name: team.name, age_group: team.age_group, color: team.color ?? TEAM_COLORS[0] })
    setEditId(team.id)
    setShowForm(true)
  }

  function cancelForm() {
    setForm(BLANK_FORM)
    setEditId(null)
    setShowForm(false)
  }

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>
  )

  const ageGroups   = (season?.age_groups?.length ? season.age_groups : FALLBACK_AGE_GROUPS)
  const filtered    = teams.filter(t => ageFilter === 'all' || t.age_group === ageFilter)
  const activeTeams = filtered.filter(t => t.is_active)

  // Group by age group for display
  const byAge = ageGroups.map(ag => ({
    ag,
    teams: filtered.filter(t => t.age_group === ag),
  })).filter(g => g.teams.length > 0 || ageFilter === 'all')

  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800 }}>Teams</h1>
          {season
            ? <div style={{ fontSize: '13px', color: s.muted, marginTop: '2px' }}>{season.label}</div>
            : <div style={{ fontSize: '13px', color: '#E87060', marginTop: '2px' }}>
                No active season — <Link href={`/org/${params.orgId}/tryouts/seasons`} style={{ color: '#E87060', fontWeight: 700 }}>set up a season first</Link>
              </div>
          }
        </div>
        <button onClick={() => { setShowForm(true); setEditId(null); setForm(BLANK_FORM) }} disabled={!season} style={{
          padding: '8px 18px', borderRadius: '7px', border: 'none',
          background: season ? 'var(--accent)' : 'var(--bg-input)',
          color: season ? 'var(--accent-text)' : s.dim,
          fontSize: '13px', fontWeight: 700, cursor: season ? 'pointer' : 'default',
          opacity: season ? 1 : 0.5,
        }}>+ New team</button>
      </div>

      {/* Age filter */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
        {['all', ...ageGroups].map(ag => (
          <button key={ag} onClick={() => setAgeFilter(ag)} style={{
            padding: '5px 12px', borderRadius: '20px', border: '0.5px solid',
            borderColor: ageFilter === ag ? 'var(--accent)' : 'var(--border-md)',
            background: ageFilter === ag ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
            color: ageFilter === ag ? 'var(--accent)' : s.muted,
            fontSize: '12px', fontWeight: ageFilter === ag ? 700 : 400, cursor: 'pointer',
          }}>{ag === 'all' ? 'All' : ag}</button>
        ))}
      </div>

      {/* Create / Edit form */}
      {showForm && (
        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '1rem' }}>{editId ? 'Edit team' : 'New team'}</div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: '160px' }}>
              <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Team name</label>
              <input type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Hudson Cubs"
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '7px 10px', fontSize: '13px', color: 'var(--fg)' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Age group</label>
              <select value={form.age_group} onChange={e => setForm(f => ({ ...f, age_group: e.target.value }))}
                style={{ background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '7px 10px', fontSize: '13px', color: 'var(--fg)' }}>
                <option value="">Select…</option>
                {ageGroups.map(ag => <option key={ag} value={ag}>{ag}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Color</label>
              <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                {TEAM_COLORS.map(c => (
                  <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} style={{
                    width: '24px', height: '24px', borderRadius: '50%', background: c, border: 'none',
                    cursor: 'pointer', outline: form.color === c ? `3px solid var(--fg)` : '3px solid transparent',
                    outlineOffset: '1px',
                  }} />
                ))}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={saveTeam} disabled={saving || !form.name.trim() || !form.age_group} style={{
              padding: '8px 18px', borderRadius: '6px', border: 'none',
              background: 'var(--accent)', color: 'var(--accent-text)',
              fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              opacity: saving || !form.name.trim() || !form.age_group ? 0.6 : 1,
            }}>{saving ? 'Saving…' : editId ? 'Save changes' : 'Create team'}</button>
            <button onClick={cancelForm} style={{
              padding: '8px 18px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
              background: 'transparent', color: s.muted, fontSize: '13px', cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Team list grouped by age */}
      {teams.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '4rem 2rem', color: s.dim }}>
          <div style={{ fontSize: '14px', marginBottom: '16px' }}>No teams yet for this season.</div>
          <button onClick={() => { setShowForm(true); setEditId(null); setForm(BLANK_FORM) }} disabled={!season} style={{
            padding: '10px 22px', borderRadius: '7px', border: 'none',
            background: 'var(--accent)', color: 'var(--accent-text)',
            fontSize: '14px', fontWeight: 700, cursor: 'pointer',
          }}>+ Create your first team</button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {ageGroups.filter(ag => ageFilter === 'all' || ag === ageFilter).map(ag => {
            const agTeams = teams.filter(t => t.age_group === ag)
            if (agTeams.length === 0) return null
            const totalAssigned = agTeams.reduce((sum, t) => sum + (t._playerCount ?? 0), 0)
            return (
              <div key={ag}>
                <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: s.muted, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {ag}
                  <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>· {agTeams.length} teams · {totalAssigned} assigned</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {agTeams.map(team => (
                    <div key={team.id} style={{
                      display: 'flex', alignItems: 'center', gap: '12px',
                      background: 'var(--bg-card)', border: '0.5px solid var(--border)',
                      borderRadius: '10px', padding: '12px 14px',
                      opacity: team.is_active ? 1 : 0.5,
                    }}>
                      {/* Color swatch */}
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: team.color ?? '#888', flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '14px' }}>{team.name}</div>
                        <div style={{ fontSize: '12px', color: s.dim, marginTop: '1px' }}>
                          {team._playerCount ?? 0} player{(team._playerCount ?? 0) !== 1 ? 's' : ''} assigned
                          {!team.is_active && <span style={{ marginLeft: '8px', color: s.dim }}>· Inactive</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <Link href={`/org/${params.orgId}/tryouts/teams/${team.id}`} style={{
                          fontSize: '12px', padding: '4px 10px', borderRadius: '5px',
                          border: '0.5px solid var(--border-md)', background: 'var(--bg-input)',
                          color: s.muted, textDecoration: 'none',
                        }}>Roster</Link>
                        <button onClick={() => startEdit(team)} style={{
                          fontSize: '12px', padding: '4px 10px', borderRadius: '5px',
                          border: '0.5px solid var(--border-md)', background: 'var(--bg-input)',
                          color: s.muted, cursor: 'pointer',
                        }}>Edit</button>
                        <button onClick={() => toggleActive(team)} style={{
                          fontSize: '12px', padding: '4px 10px', borderRadius: '5px',
                          border: '0.5px solid var(--border-md)', background: 'var(--bg-input)',
                          color: s.dim, cursor: 'pointer',
                        }}>{team.is_active ? 'Deactivate' : 'Activate'}</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
