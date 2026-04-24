'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function TryoutsDevPage({ params }: { params: { orgId: string } }) {
  const [seedResult,  setSeedResult]  = useState<string | null>(null)
  const [clearResult, setClearResult] = useState<string | null>(null)
  const [seedBusy,    setSeedBusy]    = useState(false)
  const [clearBusy,   setClearBusy]   = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const s = {
    muted: `rgba(var(--fg-rgb),0.55)` as const,
    dim:   `rgba(var(--fg-rgb),0.35)` as const,
  }

  async function seed() {
    setSeedBusy(true)
    setSeedResult(null)
    try {
      const res = await fetch('/api/tryouts/dev?action=seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: params.orgId }),
      })
      const data = await res.json()
      if (data.error) {
        setSeedResult(`Error: ${data.error}`)
      } else {
        const s = data.seeded
        setSeedResult(
          `Done — ${s.tryoutScores ?? 0} tryout scores, ${s.coachEvals ?? 0} coach evals, ${s.sessions ?? 0} test session${s.sessions !== 1 ? 's' : ''} created.`
        )
      }
    } catch (e) {
      setSeedResult('Network error')
    }
    setSeedBusy(false)
  }

  async function clear() {
    setClearBusy(true)
    setClearResult(null)
    setConfirmClear(false)
    try {
      const res = await fetch('/api/tryouts/dev?action=clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: params.orgId }),
      })
      const data = await res.json()
      if (data.error) {
        setClearResult(`Error: ${data.error}`)
      } else {
        setClearResult('Cleared — all test tryout scores, evals, and test sessions removed.')
        setSeedResult(null)
      }
    } catch (e) {
      setClearResult('Network error')
    }
    setClearBusy(false)
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem', maxWidth: '640px', margin: '0 auto' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>

      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '6px' }}>Admin</div>
      <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>Test Data</h1>
      <p style={{ fontSize: '13px', color: s.muted, marginBottom: '2.5rem', lineHeight: 1.6 }}>
        Generate realistic fake scores for all active players so you can explore the Team Making page without running real tryouts.
        All generated data is tagged <code style={{ fontSize: '12px' }}>__test__</code> and can be cleared without affecting any real data.
      </p>

      {/* Seed */}
      <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1.5rem', marginBottom: '1.25rem' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>Generate test data</div>
        <div style={{ fontSize: '12px', color: s.muted, marginBottom: '1rem', lineHeight: 1.6 }}>
          Creates a tryout score and a submitted coach eval for every active player.
          Scores follow a realistic bell curve centered around 3 with individual variance.
          Running this again overwrites the previous test data.
        </div>

        <div style={{ fontSize: '12px', color: s.dim, marginBottom: '1rem', lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--fg)' }}>What gets created:</strong>
          <ul style={{ margin: '4px 0 0 1.25rem', padding: 0 }}>
            <li>One test tryout session per age group</li>
            <li>Tryout scores (fielding, hitting, arm, running + overall)</li>
            <li>Coach evals (all configured eval fields, status = submitted)</li>
          </ul>
        </div>

        <button
          onClick={seed}
          disabled={seedBusy}
          style={{ padding: '10px 24px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '14px', fontWeight: 700, cursor: seedBusy ? 'default' : 'pointer', opacity: seedBusy ? 0.6 : 1 }}
        >
          {seedBusy ? 'Generating…' : 'Generate test data'}
        </button>

        {seedResult && (
          <div style={{ marginTop: '12px', fontSize: '13px', color: seedResult.startsWith('Error') ? '#E87060' : '#6DB875', fontWeight: 600 }}>
            {seedResult}
          </div>
        )}
      </div>

      {/* Clear */}
      <div style={{ background: 'var(--bg-card)', border: '0.5px solid rgba(232,112,96,0.2)', borderRadius: '12px', padding: '1.5rem' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>Clear test data</div>
        <div style={{ fontSize: '12px', color: s.muted, marginBottom: '1rem', lineHeight: 1.6 }}>
          Removes all data tagged <code style={{ fontSize: '12px' }}>__test__</code> — tryout scores, coach evals, and test sessions.
          Real imported data and real submitted evals are not affected.
        </div>

        {!confirmClear ? (
          <button
            onClick={() => setConfirmClear(true)}
            style={{ padding: '10px 24px', borderRadius: '8px', border: '0.5px solid rgba(232,112,96,0.4)', background: 'rgba(232,112,96,0.08)', color: '#E87060', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
          >
            Clear test data
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '13px', color: s.muted }}>Are you sure?</span>
            <button
              onClick={clear}
              disabled={clearBusy}
              style={{ padding: '8px 20px', borderRadius: '7px', border: 'none', background: '#E87060', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: clearBusy ? 'default' : 'pointer', opacity: clearBusy ? 0.6 : 1 }}
            >
              {clearBusy ? 'Clearing…' : 'Yes, clear it'}
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              style={{ padding: '8px 14px', borderRadius: '7px', border: '0.5px solid var(--border-md)', background: 'transparent', color: s.dim, fontSize: '13px', cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        )}

        {clearResult && (
          <div style={{ marginTop: '12px', fontSize: '13px', color: clearResult.startsWith('Error') ? '#E87060' : '#6DB875', fontWeight: 600 }}>
            {clearResult}
          </div>
        )}
      </div>

      <div style={{ marginTop: '2rem' }}>
        <Link href={`/org/${params.orgId}/tryouts/rankings`} style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
          → Go to Team Making
        </Link>
      </div>
    </main>
  )
}
