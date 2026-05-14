'use client'

import { useState } from 'react'
import Link from 'next/link'

const RESET_PHRASE = 'RESET SEASON DATA'

export default function TryoutsDevPage({ params }: { params: { orgId: string } }) {
  const [seedResult,  setSeedResult]  = useState<string | null>(null)
  const [clearResult, setClearResult] = useState<string | null>(null)
  const [seedBusy,    setSeedBusy]    = useState(false)
  const [clearBusy,   setClearBusy]   = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)

  const [resetPhrase,  setResetPhrase]  = useState('')
  const [resetBusy,    setResetBusy]    = useState(false)
  const [resetResult,  setResetResult]  = useState<string | null>(null)
  const [resetExpanded, setResetExpanded] = useState(false)

  const s = {
    muted: `rgba(var(--fg-rgb),0.55)` as const,
    dim:   `rgba(var(--fg-rgb),0.35)` as const,
  }

  async function resetSeason() {
    if (resetPhrase !== RESET_PHRASE) return
    setResetBusy(true)
    setResetResult(null)
    try {
      const res = await fetch('/api/tryouts/admin/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId: params.orgId, confirmation: RESET_PHRASE }),
      })
      const data = await res.json()
      if (data.error) {
        setResetResult(`Error: ${data.error}`)
      } else {
        const total = Object.values(data.deleted as Record<string, number>).reduce((a, b) => a + b, 0)
        const skippedNote = data.skipped?.length ? ` (${data.skipped.length} tables skipped)` : ''
        setResetResult(`Done — ${total} total rows deleted across ${Object.keys(data.deleted).length} tables.${skippedNote}`)
        setResetPhrase('')
        setSeedResult(null)
      }
    } catch {
      setResetResult('Network error')
    }
    setResetBusy(false)
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

      {/* ── Reset Season Data ─────────────────────────────────────────────────── */}
      <div style={{ marginTop: '3rem', borderTop: '0.5px solid var(--border)', paddingTop: '2rem' }}>
        <button
          onClick={() => setResetExpanded(e => !e)}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#E87060' }}>
            Danger Zone
          </span>
          <span style={{ fontSize: '12px', color: s.dim }}>{resetExpanded ? '▲' : '▼'}</span>
        </button>

        {resetExpanded && (
          <div style={{ marginTop: '1rem', background: 'var(--bg-card)', border: '0.5px solid rgba(232,112,96,0.35)', borderRadius: '12px', padding: '1.5rem' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>Reset Season Data</div>
            <div style={{ fontSize: '12px', color: s.muted, marginBottom: '1rem', lineHeight: 1.7 }}>
              Permanently deletes <strong style={{ color: 'var(--fg)' }}>all player data</strong> for this org:
              players, scores, coach evals, GC stats, check-ins, team assignments, import history, and eval drafts.
            </div>
            <div style={{ fontSize: '12px', color: s.muted, marginBottom: '1.25rem', lineHeight: 1.7 }}>
              <strong style={{ color: 'var(--fg)' }}>Preserved:</strong> org settings, seasons, scoring config,
              eval config, team definitions, eval share links, and admin accounts.
            </div>
            <div style={{
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              color: '#E87060', background: 'rgba(232,112,96,0.08)', border: '0.5px solid rgba(232,112,96,0.25)',
              borderRadius: '6px', padding: '10px 14px', marginBottom: '1.25rem',
            }}>
              This cannot be undone. Type <code style={{ fontFamily: 'monospace', letterSpacing: 0 }}>{RESET_PHRASE}</code> below to confirm.
            </div>

            <input
              type="text"
              value={resetPhrase}
              onChange={e => setResetPhrase(e.target.value)}
              placeholder={RESET_PHRASE}
              style={{
                display: 'block', width: '100%', boxSizing: 'border-box',
                padding: '10px 12px', borderRadius: '8px',
                border: `1.5px solid ${resetPhrase === RESET_PHRASE ? '#E87060' : 'var(--border-md)'}`,
                background: 'var(--bg)', color: 'var(--fg)',
                fontSize: '13px', fontFamily: 'monospace', marginBottom: '1rem',
                outline: 'none',
              }}
            />

            <button
              onClick={resetSeason}
              disabled={resetBusy || resetPhrase !== RESET_PHRASE}
              style={{
                padding: '10px 24px', borderRadius: '8px', border: 'none',
                background: resetPhrase === RESET_PHRASE ? '#E87060' : 'rgba(232,112,96,0.25)',
                color: '#fff', fontSize: '14px', fontWeight: 700,
                cursor: (resetBusy || resetPhrase !== RESET_PHRASE) ? 'default' : 'pointer',
                opacity: resetBusy ? 0.6 : 1,
              }}
            >
              {resetBusy ? 'Resetting…' : 'Reset all season data'}
            </button>

            {resetResult && (
              <div style={{ marginTop: '12px', fontSize: '13px', color: resetResult.startsWith('Error') ? '#E87060' : '#6DB875', fontWeight: 600 }}>
                {resetResult}
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  )
}
