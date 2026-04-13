'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function GamesError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[games] error:', error)
  }, [error])

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', display: 'flex', alignItems: 'center',
      justifyContent: 'center', padding: '2rem',
    }}>
      <div style={{ textAlign: 'center', maxWidth: '360px' }}>
        <div style={{ fontSize: '28px', marginBottom: '12px' }}>⚠</div>
        <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
          Something went wrong
        </div>
        <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.5)`, marginBottom: '1.5rem', lineHeight: 1.6 }}>
          The games page failed to load. This is usually a temporary issue.
        </div>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
          <button
            onClick={reset}
            style={{
              padding: '10px 20px', borderRadius: '8px', border: 'none',
              background: 'var(--accent)', color: 'var(--accent-text)',
              fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            }}
          >
            Try again
          </button>
          <Link href="/dashboard" style={{
            padding: '10px 20px', borderRadius: '8px',
            border: '0.5px solid var(--border-md)',
            background: 'var(--bg-card)', color: 'var(--fg)',
            fontSize: '13px', fontWeight: 600, textDecoration: 'none',
            display: 'inline-block',
          }}>
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  )
}
