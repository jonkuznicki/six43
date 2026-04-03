'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

type UserRow = {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  plan: 'free' | 'pro'
  plan_updated_at: string | null
  plan_notes: string | null
  game_count: number
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
  const [notesFor, setNotesFor] = useState<string | null>(null)
  const [notesDraft, setNotesDraft] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'at-limit' | 'pro' | 'inactive'>('all')

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
    await fetch('/api/admin/set-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, plan, notes }),
    })
    setUsers(prev => prev.map(u =>
      u.id === userId
        ? { ...u, plan, plan_notes: notes ?? u.plan_notes, plan_updated_at: new Date().toISOString() }
        : u
    ))
    setSaving(null)
    setNotesFor(null)
    setNotesDraft('')
  }

  // Summary stats
  const weekAgo = Date.now() - 7 * 86400000
  const newThisWeek = users.filter(u => new Date(u.created_at).getTime() > weekAgo).length
  const atLimit = users.filter(u => u.plan === 'free' && u.game_count >= 3)
  const proCount = users.filter(u => u.plan === 'pro').length
  const neverLoggedIn = users.filter(u => !u.last_sign_in_at || u.last_sign_in_at === u.created_at)
  const inactive30 = users.filter(u => {
    if (!u.last_sign_in_at) return true
    return Date.now() - new Date(u.last_sign_in_at).getTime() > 30 * 86400000
  })

  // Filter + search
  const visible = users.filter(u => {
    const matchSearch = u.email.toLowerCase().includes(search.toLowerCase())
    if (!matchSearch) return false
    if (filter === 'at-limit') return u.plan === 'free' && u.game_count >= 3
    if (filter === 'pro') return u.plan === 'pro'
    if (filter === 'inactive') return Date.now() - new Date(u.last_sign_in_at ?? u.created_at).getTime() > 30 * 86400000
    return true
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
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Users</h1>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <StatCard label="Total users" value={users.length} sub={`+${newThisWeek} this week`} />
        <StatCard label="Pro" value={proCount} sub={users.length ? `${Math.round(proCount / users.length * 100)}% of users` : undefined} />
        <StatCard label="At limit" value={atLimit.length} sub="free · 3 games used" accent={atLimit.length > 0} />
        <StatCard label="Inactive 30d" value={inactive30.length} sub="no recent login" />
      </div>

      {/* Search + filter */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
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

      {/* User list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {visible.map(user => {
          const isAtLimit = user.plan === 'free' && user.game_count >= 3
          return (
            <div key={user.id} style={{
              background: 'var(--bg-card)',
              border: `0.5px solid ${user.plan === 'pro' ? 'rgba(232,160,32,0.3)' : isAtLimit ? 'rgba(109,184,117,0.25)' : 'var(--border)'}`,
              borderRadius: '10px',
              padding: '14px 16px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  {/* Email + mailto */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                    <span style={{ fontSize: '14px', fontWeight: 500, wordBreak: 'break-all' }}>{user.email}</span>
                    <a href={`mailto:${user.email}`} title="Send email" style={{
                      fontSize: '14px', textDecoration: 'none', opacity: 0.4,
                      flexShrink: 0, lineHeight: 1,
                    }}>✉</a>
                  </div>

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
                      {isAtLimit ? ' · at limit' : user.plan === 'free' ? ` / 3 free` : ''}
                    </span>
                  </div>

                  {user.plan_notes && (
                    <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '5px', fontStyle: 'italic' }}>
                      {user.plan_notes}
                    </div>
                  )}
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
    </main>
  )
}
