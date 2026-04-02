'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import Link from 'next/link'

const POSITIONS = ['P','C','1B','2B','SS','3B','LF','CF','RF']

const POSITION_COLORS: Record<string, { bg: string; color: string }> = {
  P:    { bg: 'rgba(232,160,32,0.2)',  color: '#E8C060' },
  C:    { bg: 'rgba(192,80,120,0.2)', color: '#E090B0' },
  '1B': { bg: 'rgba(59,109,177,0.2)', color: '#80B0E8' },
  '2B': { bg: 'rgba(59,109,177,0.2)', color: '#80B0E8' },
  SS:   { bg: 'rgba(59,109,177,0.2)', color: '#80B0E8' },
  '3B': { bg: 'rgba(59,109,177,0.2)', color: '#80B0E8' },
  LF:   { bg: 'rgba(45,106,53,0.2)',  color: '#6DB875' },
  CF:   { bg: 'rgba(45,106,53,0.2)',  color: '#6DB875' },
  RF:   { bg: 'rgba(45,106,53,0.2)',  color: '#6DB875' },
}

const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  active:   { color: '#6DB875', label: 'Active' },
  inactive: { color: `rgba(var(--fg-rgb), 0.35)`, label: 'Inactive' },
  injured:  { color: '#E8A020', label: 'Injured' },
}

function PosChip({ pos }: { pos: string | null }) {
  if (!pos) return null
  const c = POSITION_COLORS[pos]
  if (!c) return null
  return (
    <span style={{
      fontSize: '11px', fontWeight: 600, padding: '2px 7px', borderRadius: '3px',
      background: c.bg, color: c.color, display: 'inline-block',
    }}>{pos}</span>
  )
}

const BLANK = { first_name: '', last_name: '', jersey_number: '', primary_position: '', status: 'active', innings_target: '' }

export default function RosterPage() {
  const supabase = createClient()
  const [players, setPlayers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [seasonId, setSeasonId] = useState<string | null>(null)
  const [teamName, setTeamName] = useState('')
  const [seasonName, setSeasonName] = useState('')
  const [form, setForm] = useState<typeof BLANK | (typeof BLANK & { id: string })>(BLANK)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => { loadRoster() }, [])

  async function loadRoster() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const params = new URLSearchParams(window.location.search)
    const seasonIdParam = params.get('seasonId')
    const teamIdParam = params.get('teamId')

    let resolvedSeasonId: string | null = null
    let resolvedTeamId: string | null = null
    let resolvedTeamName = ''
    let resolvedSeasonName = ''

    if (seasonIdParam) {
      // Load season + its team
      const { data: season } = await supabase
        .from('seasons')
        .select('id, name, team_id, teams(name)')
        .eq('id', seasonIdParam)
        .single()
      if (!season) { setLoading(false); return }
      resolvedSeasonId = season.id
      resolvedTeamId = season.team_id
      resolvedSeasonName = season.name
      resolvedTeamName = (season as any).teams?.name ?? ''
    } else {
      // Fall back: find the active season for the given team (or first team)
      const { data: team } = teamIdParam
        ? await supabase.from('teams').select('id, name').eq('id', teamIdParam).single()
        : await supabase.from('teams').select('id, name').order('created_at').limit(1).single()
      if (!team) { setLoading(false); return }
      resolvedTeamId = team.id
      resolvedTeamName = (team as any).name ?? ''

      const { data: season } = await supabase
        .from('seasons')
        .select('id, name')
        .eq('team_id', team.id)
        .eq('is_active', true)
        .maybeSingle()
      resolvedSeasonId = season?.id ?? null
      resolvedSeasonName = season?.name ?? ''
    }

    setTeamId(resolvedTeamId)
    setSeasonId(resolvedSeasonId)
    setTeamName(resolvedTeamName)
    setSeasonName(resolvedSeasonName)

    if (resolvedSeasonId) {
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('season_id', resolvedSeasonId)
        .order('jersey_number', { ascending: true })
      setPlayers(data ?? [])
    }
    setLoading(false)
  }

  function openAdd() {
    setForm(BLANK)
    setError('')
    setShowForm(true)
  }

  function openEdit(player: any) {
    setForm({
      id: player.id,
      first_name: player.first_name,
      last_name: player.last_name,
      jersey_number: String(player.jersey_number),
      primary_position: player.primary_position ?? '',
      status: player.status,
      innings_target: player.innings_target != null ? String(player.innings_target) : '',
    })
    setError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setError('')
  }

  async function savePlayer() {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First and last name are required.')
      return
    }
    const num = parseInt(form.jersey_number)
    if (isNaN(num) || num < 0 || num > 99) {
      setError('Jersey number must be 0–99.')
      return
    }

    setSaving(true)
    setError('')

    const targetNum = parseInt((form as any).innings_target)
    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      jersey_number: num,
      primary_position: form.primary_position || null,
      status: form.status,
      innings_target: (!isNaN(targetNum) && targetNum > 0) ? targetNum : null,
    }

    const isEdit = 'id' in form

    if (isEdit) {
      const { error: err } = await supabase
        .from('players').update(payload).eq('id', (form as any).id)
      if (err) { setError(err.message); setSaving(false); return }
      setPlayers(prev => prev.map(p =>
        p.id === (form as any).id ? { ...p, ...payload } : p
      ))
    } else {
      if (!teamId || !seasonId) return
      const { data, error: err } = await supabase
        .from('players').insert({ ...payload, team_id: teamId, season_id: seasonId }).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      setPlayers(prev => [...prev, data].sort((a, b) => a.jersey_number - b.jersey_number))
    }

    setSaving(false)
    closeForm()
  }

  async function deletePlayer(id: string) {
    setDeleting(true)
    await supabase.from('players').delete().eq('id', id)
    setPlayers(prev => prev.filter(p => p.id !== id))
    setDeleteConfirm(null)
    setDeleting(false)
  }

  const active = players.filter(p => p.status === 'active')
  const inactive = players.filter(p => p.status !== 'active')

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
      <Link href="/settings" style={{
        fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`,
        textDecoration: 'none', display: 'block', marginBottom: '1rem',
      }}>‹ Settings</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Roster</h1>
          {(teamName || seasonName) && (
            <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '2px' }}>
              {teamName}{seasonName ? ` · ${seasonName}` : ''}
            </div>
          )}
        </div>
        <button onClick={openAdd} disabled={!seasonId} style={{
          fontSize: '13px', fontWeight: 600, padding: '7px 14px', borderRadius: '6px',
          border: 'none', background: seasonId ? 'var(--accent)' : 'var(--bg-card)',
          color: seasonId ? 'var(--accent-text)' : `rgba(var(--fg-rgb), 0.3)`, cursor: seasonId ? 'pointer' : 'not-allowed',
        }}>+ Add player</button>
      </div>

      {!seasonId && (
        <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`, textAlign: 'center', marginTop: '3rem' }}>
          No active season for this team.{' '}
          <Link href="/settings" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Set one up in Settings →</Link>
        </div>
      )}

      {/* Active players */}
      {active.length > 0 && (
        <section style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)`, textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: '8px' }}>
            Active · {active.length}
          </div>
          {active.map(player => (
            <PlayerRow key={player.id} player={player} onEdit={openEdit} onDelete={setDeleteConfirm} />
          ))}
        </section>
      )}

      {/* Inactive / injured players */}
      {inactive.length > 0 && (
        <section>
          <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)`, textTransform: 'uppercase',
            letterSpacing: '0.08em', marginBottom: '8px' }}>
            Inactive / Injured · {inactive.length}
          </div>
          {inactive.map(player => (
            <PlayerRow key={player.id} player={player} onEdit={openEdit} onDelete={setDeleteConfirm} />
          ))}
        </section>
      )}

      {players.length === 0 && (
        <div style={{ textAlign: 'center', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '4rem', fontSize: '14px' }}>
          No players yet. Add your first player to get started.
        </div>
      )}

      {/* ── ADD / EDIT FORM ── */}
      {showForm && (
        <div onClick={closeForm} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg2)', borderRadius: '16px 16px 0 0', padding: '1.5rem',
            width: '100%', maxWidth: '480px', border: '0.5px solid var(--border)',
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '1.25rem' }}>
              {'id' in form ? 'Edit player' : 'Add player'}
            </div>

            {error && (
              <div style={{ fontSize: '12px', color: '#E87060', background: 'rgba(192,57,43,0.15)',
                border: '0.5px solid rgba(192,57,43,0.3)', borderRadius: '6px',
                padding: '8px 12px', marginBottom: '12px' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <Field label="First name">
                <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                  placeholder="First" style={inputStyle} />
              </Field>
              <Field label="Last name">
                <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                  placeholder="Last" style={inputStyle} />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <Field label="Jersey #">
                <input value={form.jersey_number} onChange={e => setForm(f => ({ ...f, jersey_number: e.target.value }))}
                  placeholder="0–99" type="number" min={0} max={99} style={inputStyle} />
              </Field>
              <Field label="Position">
                <select value={form.primary_position} onChange={e => setForm(f => ({ ...f, primary_position: e.target.value }))}
                  style={inputStyle}>
                  <option value="">—</option>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Min inn">
                <input value={(form as any).innings_target} onChange={e => setForm(f => ({ ...f, innings_target: e.target.value.replace(/\D/g, '') }))}
                  placeholder="—" type="text" inputMode="numeric" style={inputStyle} />
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  style={inputStyle}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="injured">Injured</option>
                </select>
              </Field>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              {'id' in form && (
                <button onClick={() => { closeForm(); setDeleteConfirm((form as any).id) }}
                  style={{ padding: '11px 16px', borderRadius: '6px', border: '0.5px solid rgba(192,57,43,0.3)',
                    background: 'transparent', color: 'rgba(232,100,80,0.7)', fontSize: '13px', cursor: 'pointer' }}>
                  Delete
                </button>
              )}
              <button onClick={closeForm} style={{
                flex: 1, padding: '11px', borderRadius: '6px',
                border: '0.5px solid var(--border-strong)', background: 'transparent',
                color: `rgba(var(--fg-rgb), 0.6)`, fontSize: '13px', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={savePlayer} disabled={saving} style={{
                flex: 2, padding: '11px', borderRadius: '6px', border: 'none',
                background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '13px', fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              }}>{saving ? 'Saving…' : ('id' in form ? 'Save changes' : 'Add player')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM ── */}
      {deleteConfirm && (
        <div onClick={() => setDeleteConfirm(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg2)', borderRadius: '12px', padding: '1.5rem',
            width: '300px', border: '0.5px solid rgba(192,57,43,0.3)',
          }}>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Remove player?</div>
            <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.5)`, marginBottom: '1.5rem' }}>
              This will permanently remove the player and all their lineup history. This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{
                flex: 1, padding: '10px', borderRadius: '6px',
                border: '0.5px solid var(--border-strong)', background: 'transparent',
                color: `rgba(var(--fg-rgb), 0.6)`, fontSize: '13px', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={() => deletePlayer(deleteConfirm)} disabled={deleting} style={{
                flex: 1, padding: '10px', borderRadius: '6px', border: 'none',
                background: '#C0392B', color: 'white', fontSize: '13px', fontWeight: 600,
                cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1,
              }}>{deleting ? 'Removing…' : 'Yes, remove'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function PlayerRow({ player, onEdit, onDelete }: {
  player: any
  onEdit: (p: any) => void
  onDelete: (id: string) => void
}) {
  const statusStyle = STATUS_STYLES[player.status] ?? STATUS_STYLES.inactive
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 12px',
      background: 'var(--bg-card)',
      border: '0.5px solid var(--border-subtle)',
      borderRadius: '8px', marginBottom: '4px',
      opacity: player.status === 'inactive' ? 0.6 : 1,
    }}>
      <span style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.3)`, width: '24px',
        textAlign: 'center', flexShrink: 0 }}>
        {player.jersey_number}
      </span>
      <span style={{ fontSize: '14px', fontWeight: 500, flex: 1 }}>
        {player.first_name} {player.last_name}
      </span>
      <PosChip pos={player.primary_position} />
      {player.innings_target != null && (
        <span style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.35)`, flexShrink: 0 }}>
          {player.innings_target} inn min
        </span>
      )}
      <span style={{ fontSize: '11px', color: statusStyle.color, flexShrink: 0 }}>
        {player.status !== 'active' ? statusStyle.label : ''}
      </span>
      <button onClick={() => onEdit(player)} style={{
        fontSize: '12px', padding: '4px 10px', borderRadius: '4px',
        border: '0.5px solid var(--border-md)', background: 'transparent',
        color: `rgba(var(--fg-rgb), 0.45)`, cursor: 'pointer', flexShrink: 0,
      }}>Edit</button>
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

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 10px', borderRadius: '6px',
  border: '0.5px solid var(--border-md)',
  background: 'var(--bg-input)', color: 'var(--fg)',
  fontSize: '13px', boxSizing: 'border-box',
}
