'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'

type UserRow = {
  id: string
  email: string
  created_at: string
  plan: 'free' | 'pro'
  plan_updated_at: string | null
  plan_notes: string | null
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

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    // Ask the server if this user is admin
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

  const filtered = users.filter(u =>
    u.email.toLowerCase().includes(search.toLowerCase())
  )

  if (!authorized || loading) return (
    <main style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--fg)',
      fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {loading ? 'Loading…' : 'Checking access…'}
    </main>
  )

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '720px', margin: '0 auto',
      padding: '2rem 1rem 6rem',
    }}>
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '4px' }}>
          Admin
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>User plans</h1>
        <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '4px' }}>
          {users.length} total · {users.filter(u => u.plan === 'pro').length} pro · {users.filter(u => u.plan === 'free').length} free
        </div>
      </div>

      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by email…"
        style={{
          width: '100%', padding: '10px 14px', borderRadius: '8px',
          border: '0.5px solid var(--border-md)',
          background: 'var(--bg-input)', color: 'var(--fg)',
          fontSize: '14px', boxSizing: 'border-box', marginBottom: '1.25rem',
        }}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filtered.map(user => (
          <div key={user.id} style={{
            background: 'var(--bg-card)',
            border: `0.5px solid ${user.plan === 'pro' ? 'rgba(232,160,32,0.3)' : 'var(--border)'}`,
            borderRadius: '10px',
            padding: '14px 16px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 500, wordBreak: 'break-all' }}>{user.email}</div>
                <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '3px' }}>
                  Joined {new Date(user.created_at).toLocaleDateString()}
                  {user.plan_updated_at && ` · plan set ${new Date(user.plan_updated_at).toLocaleDateString()}`}
                </div>
                {user.plan_notes && (
                  <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.45)`, marginTop: '4px', fontStyle: 'italic' }}>
                    {user.plan_notes}
                  </div>
                )}
              </div>
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

            {/* Notes prompt when upgrading */}
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
                      background: 'var(--bg-input)', color: 'var(--fg)',
                      fontSize: '13px',
                    }}
                  />
                  <button
                    onClick={() => setPlan(user.id, 'pro', notesDraft)}
                    style={{
                      padding: '8px 16px', borderRadius: '6px', border: 'none',
                      background: 'var(--accent)', color: 'var(--accent-text)',
                      fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => setNotesFor(null)}
                    style={{
                      padding: '8px 12px', borderRadius: '6px',
                      border: '0.5px solid var(--border)', background: 'transparent',
                      color: `rgba(var(--fg-rgb), 0.5)`, fontSize: '13px', cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', fontSize: '14px', color: `rgba(var(--fg-rgb), 0.4)`, padding: '3rem 0' }}>
            No users found
          </div>
        )}
      </div>
    </main>
  )
}
