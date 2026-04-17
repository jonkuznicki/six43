'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../../../../lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

// ── Types matching the match_report JSON shape ────────────────────────────────

interface Candidate {
  id:         string
  name:       string
  ageGroup:   string | null
  confidence: number
  reason:     string
}

interface ReportRow {
  rowIndex:         number
  rawName:          string
  normalized?:      string
  ageGroup?:        string
  teamLabel?:       string
  status:           'auto' | 'suggested' | 'unresolved' | 'new' | 'skipped'
  confidence:       number | null
  matchReason:      string | null
  resolvedPlayerId: string | null
  candidates:       Candidate[]
  // payloads differ by import type — we don't need them in UI
}

interface ImportJob {
  id:              string
  type:            'registration' | 'coach_eval' | 'tryout_scores' | 'gamechanger'
  filename:        string
  status:          string
  rows_total:      number
  rows_matched:    number
  rows_suggested:  number
  rows_unresolved: number
  match_report:    ReportRow[]
}

const STATUS_CONFIG = {
  auto:       { label: 'Matched',       bg: 'rgba(45,106,53,0.12)',   border: 'rgba(45,106,53,0.35)',   text: '#6DB875', dot: '#6DB875' },
  new:        { label: 'New player',    bg: 'rgba(59,109,177,0.12)',  border: 'rgba(59,109,177,0.35)',  text: '#80B0E8', dot: '#80B0E8' },
  suggested:  { label: 'Needs confirm', bg: 'rgba(232,160,32,0.1)',   border: 'rgba(232,160,32,0.35)', text: '#E8A020', dot: '#E8A020' },
  unresolved: { label: 'Unresolved',    bg: 'rgba(232,80,80,0.10)',   border: 'rgba(232,80,80,0.35)',  text: '#E87060', dot: '#E87060' },
  skipped:    { label: 'Skipped',       bg: 'rgba(var(--fg-rgb),0.04)', border: 'rgba(var(--fg-rgb),0.12)', text: 'rgba(var(--fg-rgb),0.35)', dot: 'rgba(var(--fg-rgb),0.25)' },
}

export default function ImportReviewPage({
  params,
}: {
  params: { orgId: string; jobId: string }
}) {
  const supabase = createClient()
  const router   = useRouter()

  const [job,      setJob]      = useState<ImportJob | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState<number | null>(null)  // rowIndex being saved
  const [filter,   setFilter]   = useState<'all' | 'needs_action' | 'done'>('needs_action')
  const [bulkConfirming, setBulkConfirming] = useState(false)
  // Track locally-resolved rows so UI updates without re-fetching
  const [localResolutions, setLocalResolutions] = useState<Map<number, { playerId: string | null; status: 'auto' | 'skipped' }>>(new Map())

  useEffect(() => { loadJob() }, [])

  async function loadJob() {
    const { data } = await supabase
      .from('tryout_import_jobs')
      .select('*')
      .eq('id', params.jobId)
      .single()
    setJob(data as ImportJob)
    setLoading(false)
  }

  function effectiveStatus(row: ReportRow): ReportRow['status'] {
    const local = localResolutions.get(row.rowIndex)
    return local ? local.status : row.status
  }

  async function confirmMatch(rowIndex: number, playerId: string) {
    setSaving(rowIndex)
    const res = await fetch(`/api/tryouts/imports/${params.jobId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm_match', rowIndex, playerId }),
    })
    if (res.ok) {
      setLocalResolutions(prev => new Map(prev).set(rowIndex, { playerId, status: 'auto' }))
    }
    setSaving(null)
  }

  async function skipRow(rowIndex: number) {
    setSaving(rowIndex)
    const res = await fetch(`/api/tryouts/imports/${params.jobId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'skip', rowIndex }),
    })
    if (res.ok) {
      setLocalResolutions(prev => new Map(prev).set(rowIndex, { playerId: null, status: 'skipped' }))
    }
    setSaving(null)
  }

  async function createNew(rowIndex: number) {
    setSaving(rowIndex)
    const res = await fetch(`/api/tryouts/imports/${params.jobId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create_new', rowIndex }),
    })
    if (res.ok) {
      const { playerId } = await res.json()
      setLocalResolutions(prev => new Map(prev).set(rowIndex, { playerId, status: 'auto' }))
    }
    setSaving(null)
  }

  async function bulkConfirmSuggested() {
    setBulkConfirming(true)
    const res = await fetch(`/api/tryouts/imports/${params.jobId}/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'confirm_all_suggested' }),
    })
    if (res.ok) {
      // Reload to get the updated report
      await loadJob()
      setLocalResolutions(new Map())
    }
    setBulkConfirming(false)
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading…
    </main>
  )

  if (!job) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Import job not found.
    </main>
  )

  const report: ReportRow[] = job.match_report ?? []

  const autoRows       = report.filter(r => effectiveStatus(r) === 'auto' || effectiveStatus(r) === 'new' || effectiveStatus(r) === 'skipped')
  const suggestedRows  = report.filter(r => effectiveStatus(r) === 'suggested')
  const unresolvedRows = report.filter(r => effectiveStatus(r) === 'unresolved')

  const allDone = suggestedRows.length === 0 && unresolvedRows.length === 0

  const filteredRows = filter === 'needs_action'
    ? [...suggestedRows, ...unresolvedRows]
    : filter === 'done'
    ? autoRows
    : report

  const typeLabel: Record<string, string> = {
    registration:  'Registration',
    coach_eval:    'Coach Evaluations',
    tryout_scores: 'Tryout Scores',
    gamechanger:   'GameChanger Stats',
  }

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  return (
    <main className="page-wide" style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif',
      padding: '2rem 1.5rem 6rem',
    }}>

      {/* ── Header ── */}
      <Link href={`/org/${params.orgId}/tryouts/imports`} style={{
        fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem',
      }}>‹ Imports</Link>

      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '6px' }}>
          {typeLabel[job.type] ?? job.type}
        </div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px' }}>
          Import review
        </h1>
        <div style={{ fontSize: '13px', color: s.muted }}>{job.filename}</div>
      </div>

      {/* ── Summary bar ── */}
      <div style={{
        display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '1.5rem',
      }}>
        {([
          { key: 'auto',      label: 'Matched',       count: autoRows.length,       color: STATUS_CONFIG.auto.dot },
          { key: 'suggested', label: 'Need confirm',  count: suggestedRows.length,  color: STATUS_CONFIG.suggested.dot },
          { key: 'unresolved',label: 'Unresolved',    count: unresolvedRows.length, color: STATUS_CONFIG.unresolved.dot },
        ] as const).map(({ key, label, count, color }) => (
          <div key={key} style={{
            padding: '8px 16px', borderRadius: '8px',
            background: 'var(--bg-card)', border: '0.5px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: '8px',
          }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ fontSize: '20px', fontWeight: 800 }}>{count}</span>
            <span style={{ fontSize: '12px', color: s.muted }}>{label}</span>
          </div>
        ))}
      </div>

      {/* ── Actions bar ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', gap: '12px', flexWrap: 'wrap' }}>
        {/* Filter tabs */}
        <div style={{ display: 'flex', background: 'var(--bg-input)', borderRadius: '6px', padding: '2px', gap: '2px' }}>
          {([
            { key: 'needs_action', label: `Needs action (${suggestedRows.length + unresolvedRows.length})` },
            { key: 'done',         label: `Done (${autoRows.length})` },
            { key: 'all',          label: `All (${report.length})` },
          ] as const).map(({ key, label }) => (
            <button key={key} onClick={() => setFilter(key)} style={{
              padding: '5px 12px', borderRadius: '4px', border: 'none', cursor: 'pointer',
              fontSize: '12px', fontWeight: filter === key ? 700 : 400,
              background: filter === key ? 'var(--accent)' : 'transparent',
              color: filter === key ? 'var(--accent-text)' : s.muted,
            }}>{label}</button>
          ))}
        </div>

        {/* Bulk confirm */}
        {suggestedRows.length > 0 && (
          <button onClick={bulkConfirmSuggested} disabled={bulkConfirming} style={{
            fontSize: '13px', fontWeight: 700, padding: '8px 18px', borderRadius: '6px',
            border: 'none', background: 'rgba(232,160,32,0.15)', color: '#E8A020',
            cursor: bulkConfirming ? 'default' : 'pointer', opacity: bulkConfirming ? 0.6 : 1,
          }}>
            {bulkConfirming ? 'Confirming…' : `Confirm all ${suggestedRows.length} suggested`}
          </button>
        )}

        {allDone && (
          <div style={{ fontSize: '13px', color: '#6DB875', fontWeight: 600 }}>
            ✓ All rows resolved — import complete
          </div>
        )}
      </div>

      {/* ── Row list ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {filteredRows.length === 0 && (
          <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '14px' }}>
            {filter === 'needs_action' ? 'Nothing left to review.' : 'No rows in this view.'}
          </div>
        )}

        {filteredRows.map(row => {
          const status = effectiveStatus(row)
          const cfg    = STATUS_CONFIG[status] ?? STATUS_CONFIG.auto
          const isSaving = saving === row.rowIndex

          return (
            <div key={row.rowIndex} style={{
              background: cfg.bg,
              border: `0.5px solid ${cfg.border}`,
              borderRadius: '10px', padding: '14px 16px',
            }}>
              {/* Row header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: status === 'auto' ? 0 : '10px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '15px' }}>{row.rawName}</span>
                    {row.ageGroup && (
                      <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', background: 'rgba(var(--fg-rgb),0.07)', color: s.muted, fontWeight: 600 }}>
                        {row.ageGroup}
                      </span>
                    )}
                    {row.teamLabel && (
                      <span style={{ fontSize: '11px', color: s.dim }}>
                        {row.teamLabel}
                      </span>
                    )}
                  </div>
                  {row.matchReason && (
                    <div style={{ fontSize: '12px', color: s.muted, marginTop: '2px' }}>
                      {row.matchReason}
                      {row.confidence != null && ` · ${Math.round(row.confidence * 100)}% confidence`}
                    </div>
                  )}
                </div>
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px',
                  background: cfg.bg, border: `0.5px solid ${cfg.border}`, color: cfg.text,
                  flexShrink: 0,
                }}>{cfg.label}</span>
              </div>

              {/* Actions for suggested rows */}
              {status === 'suggested' && row.candidates.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '11px', color: s.dim, marginBottom: '2px' }}>Confirm best match:</div>
                  {row.candidates.map(c => (
                    <div key={c.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                      padding: '8px 12px', borderRadius: '6px',
                      background: 'var(--bg-card)', border: '0.5px solid var(--border)',
                    }}>
                      <div>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{c.name}</span>
                        {c.ageGroup && <span style={{ fontSize: '11px', color: s.dim, marginLeft: '8px' }}>{c.ageGroup}</span>}
                        <span style={{ fontSize: '11px', color: s.dim, marginLeft: '8px' }}>
                          {Math.round(c.confidence * 100)}% — {c.reason}
                        </span>
                      </div>
                      <button onClick={() => confirmMatch(row.rowIndex, c.id)} disabled={isSaving} style={{
                        fontSize: '12px', fontWeight: 700, padding: '5px 14px', borderRadius: '5px',
                        border: 'none', background: 'var(--accent)', color: 'var(--accent-text)',
                        cursor: isSaving ? 'default' : 'pointer', opacity: isSaving ? 0.5 : 1,
                        flexShrink: 0,
                      }}>
                        {isSaving ? '…' : 'Confirm'}
                      </button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', paddingTop: '2px' }}>
                    <button onClick={() => createNew(row.rowIndex)} disabled={isSaving} style={{
                      fontSize: '12px', color: s.muted, background: 'none', border: 'none',
                      cursor: isSaving ? 'default' : 'pointer', padding: '4px 0', textAlign: 'left',
                      textDecoration: 'underline',
                    }}>
                      None of these — create as new player
                    </button>
                    <button onClick={() => skipRow(row.rowIndex)} disabled={isSaving} style={{
                      fontSize: '12px', color: s.dim, background: 'none', border: 'none',
                      cursor: isSaving ? 'default' : 'pointer', padding: '4px 0', textAlign: 'left',
                      textDecoration: 'underline',
                    }}>
                      Skip — not a player
                    </button>
                  </div>
                </div>
              )}

              {/* Actions for unresolved rows */}
              {status === 'unresolved' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ fontSize: '12px', color: STATUS_CONFIG.unresolved.text, marginBottom: '4px' }}>
                    Could not find a match. Review and assign manually, or create a new player.
                  </div>
                  {row.candidates.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '6px' }}>
                      <div style={{ fontSize: '11px', color: s.dim }}>Possible matches (low confidence):</div>
                      {row.candidates.map(c => (
                        <div key={c.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                          padding: '7px 12px', borderRadius: '6px',
                          background: 'var(--bg-card)', border: '0.5px solid var(--border)',
                        }}>
                          <div>
                            <span style={{ fontSize: '13px', fontWeight: 600 }}>{c.name}</span>
                            {c.ageGroup && <span style={{ fontSize: '11px', color: s.dim, marginLeft: '8px' }}>{c.ageGroup}</span>}
                            <span style={{ fontSize: '11px', color: s.dim, marginLeft: '8px' }}>
                              {Math.round(c.confidence * 100)}%
                            </span>
                          </div>
                          <button onClick={() => confirmMatch(row.rowIndex, c.id)} disabled={isSaving} style={{
                            fontSize: '12px', fontWeight: 700, padding: '5px 14px', borderRadius: '5px',
                            border: '0.5px solid var(--border-md)', background: 'var(--bg-card)',
                            color: `rgba(var(--fg-rgb),0.7)`,
                            cursor: isSaving ? 'default' : 'pointer',
                            flexShrink: 0,
                          }}>
                            {isSaving ? '…' : 'Assign'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => createNew(row.rowIndex)} disabled={isSaving} style={{
                      fontSize: '13px', fontWeight: 700, padding: '8px 16px', borderRadius: '6px',
                      border: '0.5px solid var(--border-md)', background: 'var(--bg-card)',
                      color: `rgba(var(--fg-rgb),0.7)`, cursor: isSaving ? 'default' : 'pointer',
                    }}>
                      {isSaving ? 'Creating…' : '+ Create as new player'}
                    </button>
                    <button onClick={() => skipRow(row.rowIndex)} disabled={isSaving} style={{
                      fontSize: '12px', color: s.dim, background: 'none', border: 'none',
                      cursor: isSaving ? 'default' : 'pointer', padding: '4px 0',
                      textDecoration: 'underline',
                    }}>
                      Skip — not a player
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

    </main>
  )
}
