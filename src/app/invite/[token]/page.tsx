'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'

export default function InvitePage({ params }: { params: { token: string } }) {
  const supabase = createClient()
  const router = useRouter()

  const [invite, setInvite] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [accepting, setAccepting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { user: u } } = await supabase.auth.getUser()
      setUser(u)

      // Fetch invite via RPC-safe anon read — we use a function to bypass RLS
      // The invite_token lookup is done server-side in an API route
      const res = await fetch(`/api/invite/${params.token}`)
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setInvite(data)
      setLoading(false)
    }
    load()
  }, [])

  async function accept() {
    if (!user) {
      // Redirect to login with return URL
      router.push(`/login?next=/invite/${params.token}`)
      return
    }
    setAccepting(true)
    setError('')

    const res = await fetch(`/api/invite/${params.token}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Failed to accept invite.')
      setAccepting(false)
      return
    }

    setDone(true)
    setAccepting(false)
    setTimeout(() => router.push('/dashboard'), 1500)
  }

  if (loading) return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <p style={{ color: `rgba(0,0,0,0.4)`, textAlign: 'center' }}>Loading…</p>
      </div>
    </main>
  )

  if (!invite) return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <div style={logoStyle}>Six<span style={{ color: '#E8A020' }}>43</span></div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px' }}>Invalid invite</h1>
        <p style={{ fontSize: '14px', color: `rgba(0,0,0,0.45)`, marginBottom: '1.5rem' }}>
          This invite link is not valid or has already been used.
        </p>
      </div>
    </main>
  )

  if (done) return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <div style={logoStyle}>Six<span style={{ color: '#E8A020' }}>43</span></div>
        <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '8px', color: '#1a6025' }}>
          You're in!
        </h1>
        <p style={{ fontSize: '14px', color: `rgba(0,0,0,0.45)` }}>
          Joined <strong>{invite.team_name}</strong>. Redirecting to dashboard…
        </p>
      </div>
    </main>
  )

  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <div style={logoStyle}>Six<span style={{ color: '#E8A020' }}>43</span></div>

        <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em',
          textTransform: 'uppercase', color: '#9ca3af', marginBottom: '6px' }}>
          Coach invite
        </div>

        <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px', letterSpacing: '-0.5px' }}>
          {invite.team_name}
        </h1>
        <p style={{ fontSize: '14px', color: `rgba(0,0,0,0.45)`, marginBottom: '1.75rem' }}>
          You've been invited to manage this team as an assistant coach on Six43.
        </p>

        {error && (
          <div style={{ fontSize: '13px', color: '#C0392B', background: 'rgba(192,57,43,0.1)',
            border: '0.5px solid rgba(192,57,43,0.3)', borderRadius: '6px',
            padding: '8px 12px', marginBottom: '12px' }}>
            {error}
          </div>
        )}

        {!user && (
          <p style={{ fontSize: '13px', color: `rgba(0,0,0,0.5)`, marginBottom: '12px' }}>
            You'll need to log in or create an account to accept this invite.
          </p>
        )}

        <button onClick={accept} disabled={accepting} style={{
          width: '100%', padding: '13px', borderRadius: '8px', border: 'none',
          background: '#0B1F3A', color: '#fff',
          fontSize: '15px', fontWeight: 700,
          cursor: accepting ? 'not-allowed' : 'pointer', opacity: accepting ? 0.7 : 1,
        }}>
          {accepting ? 'Joining…' : user ? 'Accept invite' : 'Log in to accept'}
        </button>
      </div>
    </main>
  )
}

const pageStyle: React.CSSProperties = {
  minHeight: '100vh', background: '#f9fafb',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '2rem 1rem', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const cardStyle: React.CSSProperties = {
  background: '#fff', border: '1px solid #e5e7eb', borderRadius: '16px',
  padding: '2rem', width: '100%', maxWidth: '380px',
}

const logoStyle: React.CSSProperties = {
  fontSize: '28px', fontWeight: 900, letterSpacing: '-1px', color: '#0B1F3A',
  marginBottom: '1.5rem',
}
