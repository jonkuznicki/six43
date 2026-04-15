'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'

interface Member {
  id:         string
  email:      string
  name:       string | null
  role:       string
  is_active:  boolean
  invited_at: string | null
  user_id:    string | null
  invite_token: string | null
}

const ROLE_OPTIONS = [
  { value: 'head_coach', label: 'Head Coach',  desc: 'Enter player evals, view rankings' },
  { value: 'evaluator',  label: 'Evaluator',   desc: 'Score players at tryout sessions' },
  { value: 'org_admin',  label: 'Org Admin',   desc: 'Full access' },
]

const ROLE_LABELS: Record<string, string> = {
  org_admin:  'Admin',
  head_coach: 'Head Coach',
  evaluator:  'Evaluator',
}

export default function MembersPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()

  const [members,  setMembers]  = useState<Member[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [email,    setEmail]    = useState('')
  const [name,     setName]     = useState('')
  const [role,     setRole]     = useState('head_coach')
  const [sending,  setSending]  = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data } = await supabase
      .from('tryout_org_members')
      .select('id, email, name, role, is_active, invited_at, user_id, invite_token')
      .eq('org_id', params.orgId)
      .order('invited_at', { ascending: false })
    setMembers(data ?? [])
    setLoading(false)
  }

  async function sendInvite() {
    if (!email.trim()) return
    setSending(true)
    setSendError(null)
    const res = await fetch('/api/tryouts/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: params.orgId, email: email.trim(), name: name.trim() || undefined, role }),
    })
    const data = await res.json()
    if (!res.ok) { setSendError(data.error ?? 'Failed to send invite'); setSending(false); return }

    setEmail('')
    setName('')
    setRole('head_coach')
    setShowForm(false)
    setSending(false)
    await loadData()
  }

  async function removeMember(id: string) {
    await supabase.from('tryout_org_members').update({ is_active: false }).eq('id', id)
    setMembers(prev => prev.map(m => m.id === id ? { ...m, is_active: false } : m))
  }

  async function reactivate(id: string) {
    await supabase.from('tryout_org_members').update({ is_active: true }).eq('id', id)
    setMembers(prev => prev.map(m => m.id === id ? { ...m, is_active: true } : m))
  }

  function copyJoinLink(token: string, id: string) {
    const url = `${window.location.origin}/tryouts/join?token=${token}`
    navigator.clipboard.writeText(url)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>
  )

  const active   = members.filter(m => m.is_active)
  const pending  = members.filter(m => !m.is_active && !m.user_id)
  const inactive = members.filter(m => !m.is_active && m.user_id)

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', maxWidth: '820px', margin: '0 auto', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '10px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800 }}>Members</h1>
        <button onClick={() => setShowForm(v => !v)} style={{
          padding: '8px 18px', borderRadius: '7px', border: 'none',
          background: 'var(--accent)', color: 'var(--accent-text)',
          fontSize: '13px', fontWeight: 700, cursor: 'pointer',
        }}>+ Invite member</button>
      </div>

      {/* Invite form */}
      {showForm && (
        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.75rem' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '1rem' }}>Invite someone</div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '12px' }}>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="coach@example.com"
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '7px 10px', fontSize: '13px', color: 'var(--fg)' }}
              />
            </div>
            <div style={{ flex: 1, minWidth: '140px' }}>
              <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Name (optional)</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Coach Smith"
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '7px 10px', fontSize: '13px', color: 'var(--fg)' }}
              />
            </div>
          </div>
          {/* Role selector */}
          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Role</label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {ROLE_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setRole(opt.value)} style={{
                  padding: '8px 14px', borderRadius: '8px', border: '0.5px solid',
                  borderColor: role === opt.value ? 'var(--accent)' : 'var(--border-md)',
                  background: role === opt.value ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
                  color: role === opt.value ? 'var(--accent)' : s.muted,
                  fontSize: '13px', fontWeight: role === opt.value ? 700 : 400,
                  cursor: 'pointer', textAlign: 'left',
                }}>
                  <div>{opt.label}</div>
                  <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '1px' }}>{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
          {sendError && (
            <div style={{ fontSize: '13px', color: '#E87060', marginBottom: '10px' }}>{sendError}</div>
          )}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={sendInvite} disabled={sending || !email.trim()} style={{
              padding: '8px 20px', borderRadius: '6px', border: 'none',
              background: 'var(--accent)', color: 'var(--accent-text)',
              fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              opacity: sending || !email.trim() ? 0.6 : 1,
            }}>{sending ? 'Sending…' : 'Send invite'}</button>
            <button onClick={() => { setShowForm(false); setSendError(null) }} style={{
              padding: '8px 16px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
              background: 'transparent', color: s.muted, fontSize: '13px', cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Active members */}
      {active.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: s.muted, marginBottom: '8px' }}>
            Active ({active.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {active.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '13px' }}>{m.name ?? m.email}</span>
                    <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '4px', background: 'rgba(var(--fg-rgb),0.07)', color: s.muted, fontWeight: 600 }}>
                      {ROLE_LABELS[m.role] ?? m.role}
                    </span>
                  </div>
                  {m.name && <div style={{ fontSize: '11px', color: s.dim }}>{m.email}</div>}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                  {m.invite_token && (
                    <button onClick={() => copyJoinLink(m.invite_token!, m.id)} style={{
                      fontSize: '11px', padding: '4px 10px', borderRadius: '5px',
                      border: '0.5px solid var(--border-md)', background: copiedId === m.id ? 'rgba(109,184,117,0.12)' : 'var(--bg-input)',
                      color: copiedId === m.id ? '#6DB875' : s.dim, cursor: 'pointer',
                    }}>{copiedId === m.id ? '✓ Copied' : '⎘ Link'}</button>
                  )}
                  <button onClick={() => removeMember(m.id)} style={{
                    fontSize: '11px', padding: '4px 10px', borderRadius: '5px',
                    border: '0.5px solid var(--border-md)', background: 'var(--bg-input)',
                    color: s.dim, cursor: 'pointer',
                  }}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending invites */}
      {pending.length > 0 && (
        <div style={{ marginBottom: '2rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: s.muted, marginBottom: '8px' }}>
            Pending invite ({pending.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {pending.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px', opacity: 0.8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '13px', color: s.muted }}>{m.name ?? m.email}</span>
                    <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '4px', background: 'rgba(var(--fg-rgb),0.07)', color: s.dim, fontWeight: 600 }}>
                      {ROLE_LABELS[m.role] ?? m.role}
                    </span>
                    <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '20px', background: 'rgba(232,160,32,0.1)', color: 'var(--accent)', fontWeight: 700 }}>
                      Pending
                    </span>
                  </div>
                  {m.name && <div style={{ fontSize: '11px', color: s.dim }}>{m.email}</div>}
                </div>
                {m.invite_token && (
                  <button onClick={() => copyJoinLink(m.invite_token!, m.id)} style={{
                    fontSize: '11px', padding: '4px 10px', borderRadius: '5px',
                    border: '0.5px solid var(--border-md)',
                    background: copiedId === m.id ? 'rgba(109,184,117,0.12)' : 'var(--bg-input)',
                    color: copiedId === m.id ? '#6DB875' : s.dim, cursor: 'pointer',
                    flexShrink: 0,
                  }}>{copiedId === m.id ? '✓ Copied' : '⎘ Copy link'}</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {members.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem', color: s.dim, fontSize: '14px' }}>
          No members yet. Invite coaches and evaluators to get started.
        </div>
      )}
    </main>
  )
}
