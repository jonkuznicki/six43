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
      redirectTo: `${window.location.origin}/reset-password`,
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
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'sans-serif', background: '#0B1F3A',
    }}>
      <div style={{
        background: 'white', padding: '2rem', borderRadius: '12px',
        width: '100%', maxWidth: '380px',
      }}>
        <h1 style={{ marginBottom: '0.25rem', fontSize: '28px' }}>
          Six<span style={{ color: '#E8A020' }}>43</span>
        </h1>

        {submitted ? (
          <>
            <p style={{ color: '#444', fontSize: '14px', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              Check your email — we sent a password reset link to <strong>{email}</strong>.
            </p>
            <Link href="/login" style={{
              display: 'block', textAlign: 'center', padding: '11px',
              background: '#E8A020', color: '#0B1F3A', borderRadius: '6px',
              fontWeight: 700, fontSize: '14px', textDecoration: 'none',
            }}>
              Back to sign in
            </Link>
          </>
        ) : (
          <>
            <p style={{ color: '#666', marginBottom: '1.5rem', fontSize: '14px' }}>
              Enter your email and we'll send you a reset link.
            </p>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: '#444' }}>
                  Email
                </label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  required autoFocus
                  style={{
                    width: '100%', padding: '10px', border: '1px solid #ddd',
                    borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box',
                  }}
                />
              </div>

              {error && (
                <p style={{ color: 'red', fontSize: '13px', marginBottom: '1rem' }}>{error}</p>
              )}

              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '12px', background: '#E8A020',
                color: '#0B1F3A', border: 'none', borderRadius: '6px',
                fontSize: '15px', fontWeight: 'bold',
                cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
              }}>
                {loading ? 'Sending…' : 'Send reset link'}
              </button>

              <div style={{ textAlign: 'center', marginTop: '1rem' }}>
                <Link href="/login" style={{ fontSize: '13px', color: '#666', textDecoration: 'none' }}>
                  Back to sign in
                </Link>
              </div>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
