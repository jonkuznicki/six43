'use client'

import { useState } from 'react'
import { createClient } from '../../lib/supabase'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSubmitted(true)
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
            {submitted ? 'Check your email' : 'Reset your password'}
          </p>
        </div>

        {submitted ? (
          <>
            <p style={{ color: `rgba(var(--fg-rgb), 0.65)`, fontSize: '14px', marginBottom: '1.5rem', lineHeight: 1.6 }}>
              We sent a password reset link to <strong style={{ color: 'var(--fg)' }}>{email}</strong>. Click the link in that email to choose a new password.
            </p>
            <Link href="/login" style={{
              display: 'block', textAlign: 'center', padding: '12px',
              background: 'var(--accent)', color: 'var(--accent-text)', borderRadius: '6px',
              fontWeight: 700, fontSize: '14px', textDecoration: 'none',
            }}>
              Back to sign in
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{
                display: 'block', fontSize: '11px', marginBottom: '4px',
                color: `rgba(var(--fg-rgb), 0.4)`, textTransform: 'uppercase', letterSpacing: '0.06em',
              }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
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
              {loading ? '…' : 'Send reset link'}
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
