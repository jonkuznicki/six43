'use client'

import { useState, Suspense } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function LoginForm() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [signupDone, setSignupDone] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [sendingMagicLink, setSendingMagicLink] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false); return }
      // Auto-accept any pending email invites, then redirect.
      // Pass the access token explicitly — server cookies may not be
      // populated yet on the request immediately after signInWithPassword.
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        await fetch('/api/invite/auto-accept', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${session.access_token}` },
        })
      }
      const next = searchParams.get('next')
      if (next) { router.push(next); return }

      // Check if user has a tryout org membership — if so, redirect there
      const { data: tryoutMember } = await supabase
        .from('tryout_org_members')
        .select('org_id, role')
        .eq('is_active', true)
        .order('invited_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (tryoutMember) {
        const suffix =
          tryoutMember.role === 'head_coach' ? '/coach-evals' :
          tryoutMember.role === 'evaluator'  ? '/sessions'    : ''
        router.push(`/org/${tryoutMember.org_id}/tryouts${suffix}`)
        return
      }

      router.push('/dashboard')
    } else {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) { setError(error.message); setLoading(false) }
      else setSignupDone(true)
    }
  }

  async function sendMagicLink() {
    if (!email || !email.includes('@')) { setError('Enter your email address first.'); return }
    setSendingMagicLink(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) { setError(error.message); setSendingMagicLink(false); return }
    setMagicLinkSent(true)
    setSendingMagicLink(false)
  }

  function switchMode(m: 'signin' | 'signup') {
    setMode(m)
    setError('')
    setSignupDone(false)
    setMagicLinkSent(false)
  }

  return (
    <main style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'sans-serif',
      background: 'var(--bg)',
      padding: '1rem',
    }}>
      <div style={{
        background: 'var(--bg2)',
        border: '0.5px solid var(--border)',
        padding: '2rem',
        borderRadius: '14px',
        width: '100%',
        maxWidth: '380px',
      }}>
        {/* Logo */}
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '26px', fontWeight: 800, marginBottom: '4px' }}>
            Six<span style={{ color: 'var(--accent)' }}>43</span>
          </div>
          <p style={{ color: `rgba(var(--fg-rgb), 0.45)`, fontSize: '13px' }}>
            {mode === 'signin' ? 'Sign in to your account' : 'Create a free account'}
          </p>
        </div>

        {/* Mode toggle */}
        <div style={{
          display: 'flex', background: 'var(--bg-input)',
          borderRadius: '6px', padding: '2px', gap: '2px', marginBottom: '1.5rem',
        }}>
          {(['signin', 'signup'] as const).map(m => (
            <button key={m} onClick={() => switchMode(m)} style={{
              flex: 1, padding: '7px', borderRadius: '4px', border: 'none',
              background: mode === m ? 'var(--accent)' : 'transparent',
              color: mode === m ? 'var(--accent-text)' : `rgba(var(--fg-rgb), 0.5)`,
              fontSize: '13px', fontWeight: mode === m ? 700 : 400, cursor: 'pointer',
            }}>
              {m === 'signin' ? 'Sign in' : 'Sign up'}
            </button>
          ))}
        </div>

        {signupDone ? (
          <div style={{
            textAlign: 'center', padding: '1.5rem 0',
            color: `rgba(var(--fg-rgb), 0.7)`, fontSize: '14px', lineHeight: 1.6,
          }}>
            <div style={{ fontSize: '28px', marginBottom: '12px' }}>✓</div>
            <div style={{ fontWeight: 700, marginBottom: '6px', color: 'var(--fg)' }}>Check your email</div>
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account.
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px',
                color: `rgba(var(--fg-rgb), 0.4)`, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{
                  width: '100%', padding: '10px 12px',
                  border: '0.5px solid var(--border-md)',
                  borderRadius: '6px', fontSize: '14px',
                  background: 'var(--bg-input)', color: 'var(--fg)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: mode === 'signin' ? '0' : '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '11px', marginBottom: '4px',
                color: `rgba(var(--fg-rgb), 0.4)`, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                style={{
                  width: '100%', padding: '10px 12px',
                  border: '0.5px solid var(--border-md)',
                  borderRadius: '6px', fontSize: '14px',
                  background: 'var(--bg-input)', color: 'var(--fg)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {mode === 'signin' && (
              <div style={{ textAlign: 'right', margin: '6px 0 1.25rem' }}>
                <Link href="/forgot-password" style={{ fontSize: '12px', color: 'var(--accent)', textDecoration: 'none' }}>
                  Forgot password?
                </Link>
              </div>
            )}

            {error && (
              <div style={{ fontSize: '12px', color: '#E87060',
                background: 'rgba(192,57,43,0.1)', border: '0.5px solid rgba(192,57,43,0.25)',
                borderRadius: '6px', padding: '8px 12px', marginBottom: '12px' }}>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '12px',
                background: 'var(--accent)', color: 'var(--accent-text)',
                border: 'none', borderRadius: '6px',
                fontSize: '14px', fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? '…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>

            {mode === 'signin' && (
              magicLinkSent ? (
                <div style={{ marginTop: '12px', fontSize: '13px', color: '#6DB875', textAlign: 'center', padding: '10px', background: 'rgba(45,106,53,0.1)', borderRadius: '6px', border: '0.5px solid rgba(109,184,117,0.25)' }}>
                  ✓ Check your email for a sign-in link
                </div>
              ) : (
                <div style={{ marginTop: '12px', textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={sendMagicLink}
                    disabled={sendingMagicLink}
                    style={{ background: 'none', border: 'none', fontSize: '12px', color: `rgba(var(--fg-rgb), 0.45)`, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                  >
                    {sendingMagicLink ? '…' : 'Send me a sign-in link instead'}
                  </button>
                </div>
              )
            )}
          </form>
        )}
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
