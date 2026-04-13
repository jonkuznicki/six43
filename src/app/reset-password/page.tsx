'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ResetPasswordPage() {
  const supabase = createClient()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [ready, setReady] = useState(false)

  // Supabase delivers the recovery token via URL hash — we need to
  // let the client SDK pick it up before rendering the form.
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }

    setLoading(true)
    setError('')

    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
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
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '26px', fontWeight: 800, marginBottom: '4px' }}>
            Six<span style={{ color: 'var(--accent)' }}>43</span>
          </div>
          <p style={{ color: `rgba(var(--fg-rgb), 0.45)`, fontSize: '13px', margin: 0 }}>
            Choose a new password
          </p>
        </div>

        {!ready ? (
          <p style={{ color: `rgba(var(--fg-rgb), 0.45)`, fontSize: '14px' }}>
            Verifying reset link…
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{
                display: 'block', fontSize: '11px', marginBottom: '4px',
                color: `rgba(var(--fg-rgb), 0.4)`, textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                New password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoFocus
                autoComplete="new-password"
                minLength={6}
                style={{
                  width: '100%', padding: '10px 12px',
                  border: '0.5px solid var(--border-md)',
                  borderRadius: '6px', fontSize: '14px',
                  background: 'var(--bg-input)', color: 'var(--fg)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{
                display: 'block', fontSize: '11px', marginBottom: '4px',
                color: `rgba(var(--fg-rgb), 0.4)`, textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                Confirm password
              </label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                required
                autoComplete="new-password"
                style={{
                  width: '100%', padding: '10px 12px',
                  border: '0.5px solid var(--border-md)',
                  borderRadius: '6px', fontSize: '14px',
                  background: 'var(--bg-input)', color: 'var(--fg)',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {error && (
              <div style={{
                fontSize: '12px', color: '#E87060',
                background: 'rgba(192,57,43,0.1)', border: '0.5px solid rgba(192,57,43,0.25)',
                borderRadius: '6px', padding: '8px 12px', marginBottom: '12px',
              }}>
                {error}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '12px',
              background: 'var(--accent)', color: 'var(--accent-text)',
              border: 'none', borderRadius: '6px',
              fontSize: '14px', fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}>
              {loading ? '…' : 'Set new password'}
            </button>

            <div style={{ textAlign: 'center', marginTop: '1rem' }}>
              <Link href="/login" style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`, textDecoration: 'none' }}>
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}
