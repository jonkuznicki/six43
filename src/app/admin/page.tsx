'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

type UserRow = {
  id: string
  email: string
  display_name: string | null
  created_at: string
  last_sign_in_at: string | null
  plan: 'free' | 'pro'
  plan_updated_at: string | null
  plan_notes: string | null
  game_count: number
  beta_features: boolean
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'never'
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

function StatCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      background: accent ? 'rgba(232,160,32,0.08)' : 'var(--bg-card)',
      border: `0.5px solid ${accent ? 'rgba(232,160,32,0.25)' : 'var(--border)'}`,
      borderRadius: '10px', padding: '14px 16px', flex: 1, minWidth: 0,
    }}>
      <div style={{ fontSize: '22px', fontWeight: 800, color: accent ? 'var(--accent)' : 'var(--fg)' }}>{value}</div>
      <div style={{ fontSize: '12px', fontWeight: 600, color: `rgba(var(--fg-rgb), 0.55)`, marginTop: '2px' }}>{label}</div>
      {sub && <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '2px' }}>{sub}</div>}
    </div>
  )
}

export default function AdminPage() {
  const supabase = createClient()
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<UserRow[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [saveError, setSaveError] = useState('')
  const [notesFor, setNotesFor] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'at-limit' | 'pro' | 'inactive'>('all')
  const [sort, setSort] = useState<'last_active' | 'newest' | 'games'>('last_active')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [actionMsg, setActionMsg] = useState('')
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle')
  const [syncResult, setSyncResult] = useState<{ synced: number; failed: number; total: number } | null>(null)
  const [syncError, setSyncError] = useState('')

  // Broadcast compose
  const [composeOpen, setComposeOpen] = useState(false)
  const [compose, setCompose] = useState({
    subject:   '',
    preheader: '',
    headline:  '',
    intro:     '',
    ctaLabel:  'Open Six43',
    ctaUrl:    'https://six43.com/dashboard',
    signoff:   '— Jon at Six43',
  })
  const [features, setFeatures] = useState<{ id: string; icon: string; title: string; body: string }[]>([])
  const [previewHtml, setPreviewHtml] = useState('')
  const [previewing, setPreviewing] = useState(false)
  const [broadcastState, setBroadcastState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [broadcastResult, setBroadcastResult] = useState<{ sent: number; failed: number } | null>(null)
  const [broadcastError, setBroadcastError] = useState('')
  const [recipientMode, setRecipientMode] = useState<'all' | 'free' | 'pro' | 'at-limit' | 'inactive' | 'custom'>('all')
  const [customRecipients, setCustomRecipients] = useState<Set<string>>(new Set())

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const res = await fetch('/api/admin/users')
    if (!res.ok) { router.push('/games'); return }

    setAuthorized(true)
    const data = await res.json()
    setUsers(data.users ?? [])
    setLoading(false)
  }

  async function setPlan(userId: string, plan: 'free' | 'pro', notes?: string) {
    setSaving(userId)
    setSaveError('')
    const res = await fetch('/api/admin/set-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, plan, notes }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setSaveError(body.error ?? `Save failed (${res.status}) — check that the user_plans table exists in Supabase.`)
      setSaving(null)
      return
    }
    setUsers(prev => prev.map(u =>
      u.id === userId
        ? { ...u, plan, plan_notes: notes ?? u.plan_notes, plan_updated_at: new Date().toISOString() }
        : u
    ))
    setSaving(null)
    setNotesFor(null)
    setNotesDraft('')
  }

  async function resetPassword(userId: string, email: string) {
    setSaving(userId + '-reset')
    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, email }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setSaveError(body.error ?? 'Failed to send reset email'); setSaving(null); return }
    setActionMsg(`Reset email sent to ${email}`)
    setTimeout(() => setActionMsg(''), 3000)
    setSaving(null)
  }

  async function deleteUser(userId: string) {
    setSaving(userId + '-delete')
    const res = await fetch('/api/admin/delete-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) { setSaveError(body.error ?? 'Failed to delete user'); setSaving(null); return }
    setUsers(prev => prev.filter(u => u.id !== userId))
    setConfirmDelete(null)
    setSaving(null)
  }

  async function syncAudience() {
    setSyncState('syncing')
    setSyncError('')
    const res = await fetch('/api/admin/sync-audience', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setSyncError(data.error ?? 'Sync failed'); setSyncState('error'); return }
    setSyncResult(data)
    setSyncState('done')
  }

  function addFeature() {
    setFeatures(prev => [...prev, { id: crypto.randomUUID(), icon: '⚾', title: '', body: '' }])
  }
  function updateFeature(id: string, patch: Partial<{ icon: string; title: string; body: string }>) {
    setFeatures(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f))
  }
  function removeFeature(id: string) {
    setFeatures(prev => prev.filter(f => f.id !== id))
  }

  async function previewBroadcast() {
    setPreviewing(true)
    const res = await fetch('/api/admin/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...compose, features, dryRun: true }),
    })
    const data = await res.json().catch(() => ({}))
    setPreviewing(false)
    if (!res.ok) { setBroadcastError(data.error ?? 'Preview failed'); return }
    setPreviewHtml(data.html)
  }

  async function sendBroadcast() {
    setBroadcastState('sending')
    setBroadcastError('')
    const recipients = broadcastRecipients.map(u => u.email)
    const res = await fetch('/api/admin/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...compose, features, dryRun: false, recipients }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setBroadcastError(data.error ?? 'Send failed'); setBroadcastState('error'); return }
    setBroadcastResult(data)
    setBroadcastState('done')
  }

  async function setBeta(userId: string, betaFeatures: boolean) {
    setSaving(userId + '-beta')
    setSaveError('')
    const res = await fetch('/api/admin/set-beta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, betaFeatures }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setSaveError(body.error ?? `Save failed (${res.status}) — check that the profiles table exists in Supabase.`)
      setSaving(null)
      return
    }
    setUsers(prev => prev.map(u =>
      u.id === userId ? { ...u, beta_features: betaFeatures } : u
    ))
    setSaving(null)
  }

  // Summary stats
  const weekAgo = Date.now() - 7 * 86400000
  const newThisWeek = users.filter(u => new Date(u.created_at).getTime() > weekAgo).length
  const atLimit = users.filter(u => u.plan === 'free' && u.game_count >= 10)
  const proCount = users.filter(u => u.plan === 'pro').length
  const neverLoggedIn = users.filter(u => !u.last_sign_in_at || u.last_sign_in_at === u.created_at)
  const inactive30 = users.filter(u => {
    if (!u.last_sign_in_at) return true
    return Date.now() - new Date(u.last_sign_in_at).getTime() > 30 * 86400000
  })

  function isInactive(u: UserRow) {
    if (!u.last_sign_in_at) return true
    return Date.now() - new Date(u.last_sign_in_at).getTime() > 30 * 86400000
  }

  // Filter + search + sort
  const visible = users
    .filter(u => {
      const matchSearch = !search || u.email.toLowerCase().includes(search.toLowerCase())
      if (!matchSearch) return false
      if (filter === 'at-limit') return u.plan === 'free' && u.game_count >= 10
      if (filter === 'pro') return u.plan === 'pro'
      if (filter === 'inactive') return isInactive(u)
      return true
    })
    .sort((a, b) => {
      if (sort === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      if (sort === 'games') return b.game_count - a.game_count
      // last_active: sort by last_sign_in_at, nulls last
      const aTime = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0
      const bTime = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0
      return bTime - aTime
    })

  // Broadcast recipient list derived from recipientMode
  const broadcastRecipients = recipientMode === 'custom'
    ? users.filter(u => customRecipients.has(u.id))
    : users.filter(u => {
        if (recipientMode === 'free') return u.plan === 'free'
        if (recipientMode === 'pro') return u.plan === 'pro'
        if (recipientMode === 'at-limit') return u.plan === 'free' && u.game_count >= 10
        if (recipientMode === 'inactive') return isInactive(u)
        return true // 'all'
      })

  if (!authorized || loading) return (
    <main style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--fg)',
      fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading…
    </main>
  )

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '800px', margin: '0 auto',
      padding: '2rem 1rem 6rem',
    }}>

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '4px' }}>
          Admin
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0 }}>Users</h1>
          <a href="/tryouts" style={{
            fontSize: '13px', fontWeight: 600, padding: '6px 14px', borderRadius: '8px',
            background: 'var(--bg-card)', border: '0.5px solid var(--border)',
            color: `rgba(var(--fg-rgb), 0.6)`, textDecoration: 'none',
          }}>
            Tryouts →
          </a>
        </div>
      </div>

      {/* Success banner */}
      {actionMsg && (
        <div style={{
          fontSize: '13px', color: '#6DB875',
          background: 'rgba(45,106,53,0.12)', border: '0.5px solid rgba(109,184,117,0.3)',
          borderRadius: '8px', padding: '12px 14px', marginBottom: '1.25rem',
        }}>
          {actionMsg}
        </div>
      )}

      {/* Error banner */}
      {saveError && (
        <div style={{
          fontSize: '13px', color: '#E87060',
          background: 'rgba(192,57,43,0.12)', border: '0.5px solid rgba(192,57,43,0.3)',
          borderRadius: '8px', padding: '12px 14px', marginBottom: '1.25rem',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span>{saveError}</span>
          <button onClick={() => setSaveError('')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#E87060', fontSize: '16px', padding: '0 0 0 12px' }}>×</button>
        </div>
      )}

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <StatCard label="Total users" value={users.length} sub={`+${newThisWeek} this week`} />
        <StatCard label="Pro" value={proCount} sub={users.length ? `${Math.round(proCount / users.length * 100)}% of users` : undefined} />
        <StatCard label="At limit" value={atLimit.length} sub="free · 10 games used" accent={atLimit.length > 0} />
        <StatCard label="Inactive 30d" value={inactive30.length} sub="no recent login" />
      </div>

      {/* Search + filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by email…"
          style={{
            flex: 1, minWidth: '180px', padding: '9px 14px', borderRadius: '8px',
            border: '0.5px solid var(--border-md)',
            background: 'var(--bg-input)', color: 'var(--fg)', fontSize: '14px',
          }}
        />
        {(['all', 'at-limit', 'pro', 'inactive'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '9px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
            cursor: 'pointer', border: '0.5px solid',
            borderColor: filter === f ? 'rgba(232,160,32,0.4)' : 'var(--border)',
            background: filter === f ? 'rgba(232,160,32,0.1)' : 'var(--bg-card)',
            color: filter === f ? 'var(--accent)' : `rgba(var(--fg-rgb), 0.55)`,
          }}>
            {f === 'all' ? `All (${users.length})` :
             f === 'at-limit' ? `At limit (${atLimit.length})` :
             f === 'pro' ? `Pro (${proCount})` :
             `Inactive (${inactive30.length})`}
          </button>
        ))}
      </div>

      {/* Sort */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '1.25rem', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)`, fontWeight: 600, marginRight: '2px' }}>Sort:</span>
        {([
          { key: 'last_active', label: 'Last active' },
          { key: 'newest',      label: 'Newest' },
          { key: 'games',       label: 'Most games' },
        ] as const).map(({ key, label }) => (
          <button key={key} onClick={() => setSort(key)} style={{
            padding: '5px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
            cursor: 'pointer', border: '0.5px solid',
            borderColor: sort === key ? 'rgba(232,160,32,0.4)' : 'var(--border)',
            background: sort === key ? 'rgba(232,160,32,0.1)' : 'transparent',
            color: sort === key ? 'var(--accent)' : `rgba(var(--fg-rgb), 0.45)`,
          }}>{label}</button>
        ))}
      </div>

      {/* User list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {visible.map(user => {
          const isAtLimit = user.plan === 'free' && user.game_count >= 10
          return (
            <div key={user.id} style={{
              background: 'var(--bg-card)',
              border: `0.5px solid ${user.plan === 'pro' ? 'rgba(232,160,32,0.3)' : isAtLimit ? 'rgba(109,184,117,0.25)' : 'var(--border)'}`,
              borderRadius: '10px',
              padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  {/* Name + email + mailto */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 600, wordBreak: 'break-all' }}>
                      {user.display_name || user.email}
                    </span>
                    <a href={`mailto:${user.email}`} title="Send email" style={{
                      fontSize: '14px', textDecoration: 'none', opacity: 0.4,
                      flexShrink: 0, lineHeight: 1,
                    }}>✉</a>
                  </div>
                  {user.display_name && (
                    <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '4px' }}>
                      {user.email}
                    </div>
                  )}

                  {/* Stats row */}
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)` }}>
                      Joined {new Date(user.created_at).toLocaleDateString()}
                    </span>
                    <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)` }}>
                      Active {timeAgo(user.last_sign_in_at)}
                    </span>
                    <span style={{
                      fontSize: '11px', fontWeight: 600,
                      color: isAtLimit ? '#6DB875' : user.game_count > 0 ? `rgba(var(--fg-rgb), 0.5)` : `rgba(var(--fg-rgb), 0.25)`,
                    }}>
                      {user.game_count} game{user.game_count !== 1 ? 's' : ''}
                      {isAtLimit ? ' · at limit' : user.plan === 'free' ? ` / 10 free` : ''}
                    </span>
                  </div>

                  {user.plan_notes && (
                    <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '5px', fontStyle: 'italic' }}>
                      {user.plan_notes}
                    </div>
                  )}
                  <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => setBeta(user.id, !user.beta_features)}
                      disabled={saving === user.id + '-beta'}
                      style={{
                        fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px',
                        background: user.beta_features ? 'rgba(109,184,255,0.15)' : 'transparent',
                        color: user.beta_features ? '#6DB8FF' : `rgba(var(--fg-rgb), 0.35)`,
                        border: `0.5px solid ${user.beta_features ? 'rgba(109,184,255,0.35)' : 'var(--border)'}`,
                        cursor: 'pointer',
                      }}
                    >
                      {saving === user.id + '-beta' ? '…' : user.beta_features ? '🔬 Beta on' : 'Beta off'}
                    </button>
                    <button
                      onClick={() => resetPassword(user.id, user.email)}
                      disabled={saving === user.id + '-reset'}
                      style={{
                        fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px',
                        background: 'transparent', color: `rgba(var(--fg-rgb), 0.4)`,
                        border: '0.5px solid var(--border)', cursor: 'pointer',
                      }}
                    >
                      {saving === user.id + '-reset' ? '…' : '↺ Reset pw'}
                    </button>
                    {confirmDelete === user.id ? (
                      <>
                        <button
                          onClick={() => deleteUser(user.id)}
                          disabled={saving === user.id + '-delete'}
                          style={{
                            fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px',
                            background: 'rgba(232,100,80,0.15)', color: '#E87060',
                            border: '0.5px solid rgba(232,100,80,0.4)', cursor: 'pointer',
                          }}
                        >
                          {saving === user.id + '-delete' ? '…' : 'Confirm delete'}
                        </button>
                        <button onClick={() => setConfirmDelete(null)} style={{
                          fontSize: '11px', padding: '3px 10px', borderRadius: '20px',
                          background: 'transparent', color: `rgba(var(--fg-rgb), 0.35)`,
                          border: '0.5px solid var(--border)', cursor: 'pointer',
                        }}>Cancel</button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(user.id)}
                        style={{
                          fontSize: '11px', fontWeight: 600, padding: '3px 10px', borderRadius: '20px',
                          background: 'transparent', color: `rgba(var(--fg-rgb), 0.3)`,
                          border: '0.5px solid var(--border)', cursor: 'pointer',
                        }}
                      >
                        ✕ Delete
                      </button>
                    )}
                  </div>
                </div>

                {/* Plan badge + action */}
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
                  <span style={{
                    fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px',
                    background: user.plan === 'pro' ? 'rgba(232,160,32,0.15)' : 'rgba(255,255,255,0.05)',
                    color: user.plan === 'pro' ? 'var(--accent)' : `rgba(var(--fg-rgb), 0.4)`,
                    border: `0.5px solid ${user.plan === 'pro' ? 'rgba(232,160,32,0.3)' : 'var(--border)'}`,
                  }}>
                    {user.plan.toUpperCase()}
                  </span>
                  {user.plan === 'free' ? (
                    <button
                      onClick={() => { setNotesFor(user.id); setNotesDraft('') }}
                      disabled={saving === user.id}
                      style={{
                        fontSize: '12px', fontWeight: 600, padding: '5px 12px', borderRadius: '6px',
                        background: 'rgba(232,160,32,0.12)', color: 'var(--accent)',
                        border: '0.5px solid rgba(232,160,32,0.3)', cursor: 'pointer',
                      }}
                    >
                      {saving === user.id ? '…' : '↑ Pro'}
                    </button>
                  ) : (
                    <button
                      onClick={() => setPlan(user.id, 'free')}
                      disabled={saving === user.id}
                      style={{
                        fontSize: '12px', fontWeight: 600, padding: '5px 12px', borderRadius: '6px',
                        background: 'transparent', color: `rgba(var(--fg-rgb), 0.4)`,
                        border: '0.5px solid var(--border)', cursor: 'pointer',
                      }}
                    >
                      {saving === user.id ? '…' : '↓ Free'}
                    </button>
                  )}
                </div>
              </div>

              {/* Notes prompt */}
              {notesFor === user.id && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '0.5px solid var(--border-subtle)' }}>
                  <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.5)`, marginBottom: '6px' }}>
                    Note (optional — why are they getting Pro?)
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      value={notesDraft}
                      onChange={e => setNotesDraft(e.target.value)}
                      placeholder="e.g. beta tester, friend, sponsor"
                      autoFocus
                      onKeyDown={e => e.key === 'Enter' && setPlan(user.id, 'pro', notesDraft)}
                      style={{
                        flex: 1, padding: '8px 12px', borderRadius: '6px',
                        border: '0.5px solid var(--border-md)',
                        background: 'var(--bg-input)', color: 'var(--fg)', fontSize: '13px',
                      }}
                    />
                    <button onClick={() => setPlan(user.id, 'pro', notesDraft)} style={{
                      padding: '8px 16px', borderRadius: '6px', border: 'none',
                      background: 'var(--accent)', color: 'var(--accent-text)',
                      fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                    }}>
                      Confirm
                    </button>
                    <button onClick={() => setNotesFor(null)} style={{
                      padding: '8px 12px', borderRadius: '6px',
                      border: '0.5px solid var(--border)', background: 'transparent',
                      color: `rgba(var(--fg-rgb), 0.5)`, fontSize: '13px', cursor: 'pointer',
                    }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {visible.length === 0 && (
          <div style={{ textAlign: 'center', fontSize: '14px', color: `rgba(var(--fg-rgb), 0.4)`, padding: '3rem 0' }}>
            No users match
          </div>
        )}
      </div>

      {/* ── RESEND AUDIENCE SYNC ── */}
      <div style={{ marginTop: '2rem', background: 'var(--bg-card)', border: '0.5px solid var(--border-md)', borderRadius: '12px', padding: '20px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>Resend Audience sync</div>
        <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.45)`, marginBottom: '14px', lineHeight: 1.6 }}>
          Syncs all {users.length} users to your Resend Audience so you can send broadcasts from the{' '}
          <a href="https://resend.com/broadcasts" target="_blank" rel="noopener noreferrer"
            style={{ color: 'var(--accent)', textDecoration: 'none' }}>Resend dashboard</a>.
          New signups are added automatically — run this once to backfill existing users.
        </div>

        {syncError && (
          <div style={{ fontSize: '12px', color: '#E87060', marginBottom: '10px' }}>{syncError}</div>
        )}

        {syncState === 'done' && syncResult && (
          <div style={{ fontSize: '13px', color: '#6DB875', marginBottom: '10px', fontWeight: 600 }}>
            Synced {syncResult.synced} of {syncResult.total} users ✓
            {syncResult.failed > 0 && <span style={{ color: '#E87060', fontWeight: 400 }}> · {syncResult.failed} failed</span>}
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={syncAudience}
            disabled={syncState === 'syncing'}
            style={{
              padding: '9px 18px', borderRadius: '6px', fontSize: '12px', fontWeight: 700,
              border: 'none', background: 'var(--accent)', color: 'var(--accent-text)',
              cursor: syncState === 'syncing' ? 'not-allowed' : 'pointer',
              opacity: syncState === 'syncing' ? 0.7 : 1,
            }}
          >
            {syncState === 'syncing' ? 'Syncing…' : syncState === 'done' ? 'Sync again' : `Sync ${users.length} users to Resend`}
          </button>
        </div>
      </div>

      {/* ── EMAIL COMPOSE ── */}
      <div style={{ marginTop: '1rem', marginBottom: '3rem', background: 'var(--bg-card)', border: '0.5px solid var(--border-md)', borderRadius: '12px', overflow: 'hidden' }}>
        <button onClick={() => setComposeOpen(o => !o)} style={{
          width: '100%', padding: '16px 20px', background: 'transparent', border: 'none',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer',
        }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)' }}>Compose broadcast email</span>
          <span style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)` }}>{composeOpen ? '▲ collapse' : '▼ expand'}</span>
        </button>

        {composeOpen && (
          <div style={{ padding: '0 20px 24px', borderTop: '0.5px solid var(--border)' }}>

            <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { key: 'subject',   label: 'Subject line *',      placeholder: "What's new in Six43" },
                { key: 'preheader', label: 'Preview text',        placeholder: 'Short text shown in inbox before opening' },
                { key: 'headline',  label: 'Headline *',          placeholder: 'Your season, fully organized.' },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.45)`, marginBottom: '5px' }}>{label}</div>
                  <input
                    value={(compose as any)[key]}
                    onChange={e => setCompose(p => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: 'var(--fg)', fontSize: '13px', boxSizing: 'border-box' }}
                  />
                </div>
              ))}

              <div>
                <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.45)`, marginBottom: '5px' }}>Intro paragraph *</div>
                <textarea
                  value={compose.intro}
                  onChange={e => setCompose(p => ({ ...p, intro: e.target.value }))}
                  placeholder="Here's a quick look at what Six43 can do..."
                  rows={3}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: 'var(--fg)', fontSize: '13px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'sans-serif' }}
                />
              </div>

              <div>
                <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.45)`, marginBottom: '8px' }}>Feature highlights (optional)</div>
                {features.map(f => (
                  <div key={f.id} style={{ background: 'var(--bg)', border: '0.5px solid var(--border)', borderRadius: '8px', padding: '12px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                      <input
                        value={f.icon} onChange={e => updateFeature(f.id, { icon: e.target.value })}
                        placeholder="⚾"
                        style={{ width: '44px', padding: '7px 8px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: 'var(--fg)', fontSize: '16px', textAlign: 'center', boxSizing: 'border-box' }}
                      />
                      <input
                        value={f.title} onChange={e => updateFeature(f.id, { title: e.target.value })}
                        placeholder="Feature title"
                        style={{ flex: 1, padding: '7px 10px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: 'var(--fg)', fontSize: '13px', fontWeight: 600, boxSizing: 'border-box' }}
                      />
                      <button onClick={() => removeFeature(f.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: `rgba(var(--fg-rgb), 0.3)`, fontSize: '18px', padding: '0 2px', flexShrink: 0 }}>×</button>
                    </div>
                    <textarea
                      value={f.body} onChange={e => updateFeature(f.id, { body: e.target.value })}
                      placeholder="One sentence describing this feature..."
                      rows={2}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: 'var(--fg)', fontSize: '12px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'sans-serif' }}
                    />
                  </div>
                ))}
                <button onClick={addFeature} style={{
                  width: '100%', padding: '8px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                  border: '0.5px dashed var(--border-md)', background: 'transparent',
                  color: `rgba(var(--fg-rgb), 0.45)`, cursor: 'pointer',
                }}>+ Add feature row</button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.45)`, marginBottom: '5px' }}>Button label *</div>
                  <input value={compose.ctaLabel} onChange={e => setCompose(p => ({ ...p, ctaLabel: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: 'var(--fg)', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.45)`, marginBottom: '5px' }}>Button URL *</div>
                  <input value={compose.ctaUrl} onChange={e => setCompose(p => ({ ...p, ctaUrl: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: 'var(--fg)', fontSize: '13px', boxSizing: 'border-box' }} />
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.45)`, marginBottom: '5px' }}>Sign-off (optional)</div>
                <input value={compose.signoff} onChange={e => setCompose(p => ({ ...p, signoff: e.target.value }))}
                  placeholder="— Jon at Six43"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: 'var(--fg)', fontSize: '13px', boxSizing: 'border-box' }} />
              </div>
            </div>

            <div style={{ marginTop: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={previewBroadcast} disabled={previewing || !compose.subject || !compose.headline} style={{
                padding: '9px 16px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                border: '0.5px solid var(--border-md)', background: 'transparent',
                color: `rgba(var(--fg-rgb), 0.6)`, cursor: 'pointer',
                opacity: (!compose.subject || !compose.headline) ? 0.4 : 1,
              }}>
                {previewing ? 'Building preview…' : '👁 Preview email'}
              </button>
              {broadcastError && <span style={{ fontSize: '12px', color: '#E87060' }}>{broadcastError}</span>}
            </div>

            {previewHtml && (
              <div style={{ marginTop: '12px', border: '0.5px solid var(--border-md)', borderRadius: '8px', overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', background: 'var(--bg)', borderBottom: '0.5px solid var(--border)', fontSize: '11px', color: `rgba(var(--fg-rgb), 0.45)`, display: 'flex', justifyContent: 'space-between' }}>
                  <span>Email preview</span>
                  <span style={{ fontWeight: 600, color: 'var(--fg)' }}>Subject: {compose.subject}</span>
                </div>
                <iframe srcDoc={previewHtml} style={{ width: '100%', height: '600px', border: 'none', background: '#fff' }} title="Email preview" />
              </div>
            )}

            {/* Recipient targeting */}
            <div style={{ marginTop: '16px', padding: '14px', background: 'var(--bg)', border: '0.5px solid var(--border-md)', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.45)`, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>Recipients</div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {([
                  { key: 'all',      label: `All (${users.length})` },
                  { key: 'free',     label: `Free (${users.filter(u => u.plan === 'free').length})` },
                  { key: 'pro',      label: `Pro (${proCount})` },
                  { key: 'at-limit', label: `At limit (${atLimit.length})` },
                  { key: 'inactive', label: `Inactive (${inactive30.length})` },
                  { key: 'custom',   label: 'Custom…' },
                ] as const).map(({ key, label }) => (
                  <button key={key} onClick={() => setRecipientMode(key)} style={{
                    padding: '5px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 600,
                    cursor: 'pointer', border: '0.5px solid',
                    borderColor: recipientMode === key ? 'rgba(232,160,32,0.4)' : 'var(--border)',
                    background: recipientMode === key ? 'rgba(232,160,32,0.1)' : 'transparent',
                    color: recipientMode === key ? 'var(--accent)' : `rgba(var(--fg-rgb), 0.5)`,
                  }}>{label}</button>
                ))}
              </div>

              {recipientMode === 'custom' && (
                <div style={{ maxHeight: '180px', overflowY: 'auto', border: '0.5px solid var(--border)', borderRadius: '6px', marginBottom: '10px' }}>
                  {users.map(u => (
                    <label key={u.id} style={{
                      display: 'flex', alignItems: 'center', gap: '10px', padding: '7px 10px',
                      borderBottom: '0.5px solid var(--border)', cursor: 'pointer',
                      fontSize: '12px', color: 'var(--fg)',
                    }}>
                      <input
                        type="checkbox"
                        checked={customRecipients.has(u.id)}
                        onChange={e => {
                          setCustomRecipients(prev => {
                            const next = new Set(prev)
                            if (e.target.checked) next.add(u.id)
                            else next.delete(u.id)
                            return next
                          })
                        }}
                        style={{ accentColor: 'var(--accent)', flexShrink: 0 }}
                      />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {u.display_name ? `${u.display_name} — ` : ''}{u.email}
                      </span>
                      <span style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.35)`, flexShrink: 0 }}>
                        {u.plan.toUpperCase()} · {u.game_count}g
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.5)` }}>
                Sending to <strong style={{ color: 'var(--fg)' }}>{broadcastRecipients.length} recipient{broadcastRecipients.length !== 1 ? 's' : ''}</strong>
                {recipientMode === 'custom' && broadcastRecipients.length === 0 && (
                  <span style={{ color: '#E87060' }}> — select at least one recipient</span>
                )}
              </div>
            </div>

            {previewHtml && broadcastState !== 'done' && (
              <div style={{ marginTop: '12px', padding: '14px', background: 'rgba(232,112,96,0.06)', border: '0.5px solid rgba(232,112,96,0.25)', borderRadius: '8px' }}>
                <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.6)`, marginBottom: '10px' }}>
                  Double-check the preview above before sending.
                </div>
                <button
                  onClick={sendBroadcast}
                  disabled={broadcastState === 'sending' || broadcastRecipients.length === 0}
                  style={{
                    padding: '10px 20px', borderRadius: '6px', fontSize: '13px', fontWeight: 700,
                    border: 'none', background: '#E87060', color: '#fff',
                    cursor: (broadcastState === 'sending' || broadcastRecipients.length === 0) ? 'not-allowed' : 'pointer',
                    opacity: (broadcastState === 'sending' || broadcastRecipients.length === 0) ? 0.5 : 1,
                  }}
                >
                  {broadcastState === 'sending' ? 'Sending…' : `Send to ${broadcastRecipients.length} recipient${broadcastRecipients.length !== 1 ? 's' : ''}`}
                </button>
              </div>
            )}

            {broadcastState === 'done' && broadcastResult && (
              <div style={{ marginTop: '12px', fontSize: '13px', color: '#6DB875', fontWeight: 600 }}>
                Sent {broadcastResult.sent} emails ✓
                {broadcastResult.failed > 0 && <span style={{ color: '#E87060', fontWeight: 400 }}> · {broadcastResult.failed} failed</span>}
                <button onClick={() => { setBroadcastState('idle'); setBroadcastResult(null); setPreviewHtml('') }}
                  style={{ marginLeft: '12px', fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  Compose another
                </button>
              </div>
            )}

          </div>
        )}
      </div>
    </main>
  )
}
