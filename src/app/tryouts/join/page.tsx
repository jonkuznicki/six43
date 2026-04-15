'use client'

import { useState, useEffect, Suspense } from 'react'
import { createClient } from '../../../lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'

interface InviteInfo {
  orgName:  string
  role:     string
  inviterEmail: string | null
}

const ROLE_LABELS: Record<string, string> = {
  org_admin:  'Organization Admin',
  head_coach: 'Head Coach',
  evaluator:  'Evaluator',
}

const ROLE_DESCS: Record<string, string> = {
  org_admin:  'Full access to manage the tryout program.',
  head_coach: 'Enter player evaluations and view rankings for your age group.',
  evaluator:  'Score players at tryout sessions.',
}

const ROLE_REDIRECT: Record<string, string> = {
  org_admin:  '',          // → /org/[orgId]/tryouts
  head_coach: '/coach-evals',
  evaluator:  '/sessions',
}

function JoinForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const token = searchParams.get('token')

  const [invite,   setInvite]   = useState<InviteInfo | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [invalid,  setInvalid]  = useState(false)
  const [user,     setUser]     = useState<any>(null)
  const [accepting, setAccepting] = useState(false)
  const [error,    setError]    = useState('')

  // Auth form state
  const [mode,     setMode]     = useState<'signin' | 'signup'>('signin')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [magicSent,   setMagicSent]   = useState(false)

  useEffect(() => {
    if (!token) { setInvalid(true); setLoading(false); return }
    loadInvite()
    checkUser()
  }, [token])

  async function loadInvite() {
    const res = await fetch(`/api/tryouts/invite/info?token=${token}`)
    if (!res.ok) { setInvalid(true); setLoading(false); return }
    const data = await res.json()
    setInvite(data)
    setLoading(false)
  }

  async function checkUser() {
    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
  }

  async function acceptInvite() {
    if (!user || !token) return
    setAccepting(true)
    setError('')
    const res = await fetch('/api/tryouts/invite/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Failed to accept invite'); setAccepting(false); return }

    const suffix = ROLE_REDIRECT[data.role] ?? ''
    router.push(`/org/${data.orgId}/tryouts${suffix}`)
  }

  async function handleAuth(e: React.FormEvent) {
    e.preventDefault()
    setAuthLoading(true)
    setError('')

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setAuthLoading(false); return }
    } else {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/tryouts/join?token=${token}`)}` },
      })
      if (error) { setError(error.message); setAuthLoading(false); return }
      // For new signups, need email confirmation — but also try to accept right away
    }

    const { data: { user: signedInUser } } = await supabase.auth.getUser()
    setUser(signedInUser)
    setAuthLoading(false)
  }

  async function sendMagicLink() {
    if (!email.includes('@')) { setError('Enter your email address.'); return }
    setAuthLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/tryouts/join?token=${token}`)}` },
    })
    setAuthLoading(false)
    if (error) { setError(error.message); return }
    setMagicSent(true)
  }

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading…
    </main>
  )

  if (invalid || !invite) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', maxWidth: '320px' }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>✗</div>
        <div style={{ fontSize: '17px', fontWeight: 700, marginBottom: '8px' }}>Invalid invite link</div>
        <div style={{ fontSize: '14px', color: s.muted }}>This link may have expired or already been used. Ask your director to send a new invite.</div>
      </div>
    </main>
  )

  const roleLabel = ROLE_LABELS[invite.role] ?? invite.role
  const roleDesc  = ROLE_DESCS[invite.role] ?? ''

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem' }}>
      <div style={{ width: '100%', maxWidth: '420px' }}>

        {/* Logo */}
        <div style={{ fontSize: '24px', fontWeight: 800, marginBottom: '1.5rem', textAlign: 'center' }}>
          Six<span style={{ color: 'var(--accent)' }}>43</span>
        </div>

        {/* Invite card */}
        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '16px', padding: '1.75rem', marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '8px' }}>
            You're invited
          </div>
          <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '4px' }}>{invite.orgName}</div>
          <div style={{ fontSize: '14px', color: s.muted, marginBottom: '12px' }}>{roleLabel}</div>
          <div style={{ fontSize: '13px', color: s.dim, lineHeight: 1.6 }}>{roleDesc}</div>
        </div>

        {/* If already logged in — show accept button */}
        {user ? (
          <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>
            <div style={{ fontSize: '13px', color: s.muted, marginBottom: '1rem' }}>
              Signed in as <strong>{user.email}</strong>
            </div>
            {error && (
              <div style={{ fontSize: '13px', color: '#E87060', background: 'rgba(192,57,43,0.08)', borderRadius: '6px', padding: '8px 12px', marginBottom: '12px' }}>
                {error}
              </div>
            )}
            <button onClick={acceptInvite} disabled={accepting} style={{
              width: '100%', padding: '13px', borderRadius: '8px', border: 'none',
              background: 'var(--accent)', color: 'var(--accent-text)',
              fontSize: '15px', fontWeight: 700, cursor: 'pointer',
              opacity: accepting ? 0.6 : 1,
            }}>
              {accepting ? 'Joining…' : `Join ${invite.orgName}`}
            </button>
            <button onClick={() => supabase.auth.signOut().then(() => setUser(null))} style={{
              width: '100%', marginTop: '8px', padding: '10px', background: 'none', border: 'none',
              fontSize: '12px', color: s.dim, cursor: 'pointer',
            }}>
              Sign out and use a different account
            </button>
          </div>
        ) : (
          /* Not logged in — show auth form */
          <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '1rem' }}>
              Sign in to accept
            </div>

            {/* Mode toggle */}
            <div style={{ display: 'flex', background: 'var(--bg-input)', borderRadius: '6px', padding: '2px', gap: '2px', marginBottom: '1.25rem' }}>
              {(['signin', 'signup'] as const).map(m => (
                <button key={m} onClick={() => setMode(m)} style={{
                  flex: 1, padding: '7px', borderRadius: '4px', border: 'none',
                  background: mode === m ? 'var(--accent)' : 'transparent',
                  color: mode === m ? 'var(--accent-text)' : s.muted,
                  fontSize: '13px', fontWeight: mode === m ? 700 : 400, cursor: 'pointer',
                }}>
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            {magicSent ? (
              <div style={{ textAlign: 'center', padding: '1.5rem 0', fontSize: '14px', color: s.muted, lineHeight: 1.6 }}>
                <div style={{ fontSize: '24px', marginBottom: '10px' }}>✓</div>
                Check your email for a sign-in link.<br />It will bring you back here automatically.
              </div>
            ) : (
              <form onSubmit={handleAuth}>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email"
                    style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '10px 12px', fontSize: '14px', color: 'var(--fg)' }}
                  />
                </div>
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '10px 12px', fontSize: '14px', color: 'var(--fg)' }}
                  />
                </div>
                {error && (
                  <div style={{ fontSize: '13px', color: '#E87060', background: 'rgba(192,57,43,0.08)', borderRadius: '6px', padding: '8px 12px', marginBottom: '10px' }}>
                    {error}
                  </div>
                )}
                <button type="submit" disabled={authLoading} style={{
                  width: '100%', padding: '12px', borderRadius: '7px', border: 'none',
                  background: 'var(--accent)', color: 'var(--accent-text)',
                  fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                  opacity: authLoading ? 0.6 : 1,
                }}>
                  {authLoading ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
                </button>
                {mode === 'signin' && (
                  <div style={{ marginTop: '10px', textAlign: 'center' }}>
                    <button type="button" onClick={sendMagicLink} disabled={authLoading} style={{
                      background: 'none', border: 'none', fontSize: '12px',
                      color: s.dim, cursor: 'pointer', textDecoration: 'underline',
                    }}>
                      Send me a sign-in link instead
                    </button>
                  </div>
                )}
              </form>
            )}
          </div>
        )}
      </div>
    </main>
  )
}

export default function JoinPage() {
  return (
    <Suspense>
      <JoinForm />
    </Suspense>
  )
}
