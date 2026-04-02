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
      router.push('/games')
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

        {!ready ? (
          <p style={{ color: '#666', fontSize: '14px', marginTop: '1rem' }}>
            Verifying reset link…
          </p>
        ) : (
          <>
            <p style={{ color: '#666', marginBottom: '1.5rem', fontSize: '14px' }}>
              Choose a new password.
            </p>
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: '#444' }}>
                  New password
                </label>
                <input
                  type="password" value={password} onChange={e => setPassword(e.target.value)}
                  required autoFocus minLength={6}
                  style={{
                    width: '100%', padding: '10px', border: '1px solid #ddd',
                    borderRadius: '6px', fontSize: '14px', boxSizing: 'border-box',
                  }}
                />
              </div>
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px', color: '#444' }}>
                  Confirm password
                </label>
                <input
                  type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  required
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
                {loading ? 'Saving…' : 'Set new password'}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
