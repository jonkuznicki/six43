'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { createClient } from '../../../../../lib/supabase'

interface EvalPlayer {
  id: string; first_name: string; last_name: string
  age_group: string; prior_team: string
}

interface EvalField {
  field_key: string; label: string; section: string
  is_optional: boolean; sort_order: number; weight: number
}

interface FormData {
  org_name:             string
  selected_team:        string
  season:               { id: string; label: string; year: number }
  players:              EvalPlayer[]
  eval_config:          EvalField[]
  submitted_player_ids: string[]
}

const SECTION_LABELS: Record<string, string> = {
  fielding_hitting:  'Fielding & Hitting',
  pitching_catching: 'Pitching & Catching (optional)',
  intangibles:       'Intangibles',
  athleticism:       'Athleticism',
}

function scoreColor(v: number | null): string {
  if (v == null) return 'transparent'
  if (v === 5) return 'rgba(109,184,117,0.45)'
  if (v === 4) return 'rgba(109,184,117,0.2)'
  if (v === 3) return 'rgba(80,160,232,0.18)'
  if (v === 2) return 'rgba(232,140,40,0.2)'
  return 'rgba(232,80,80,0.22)'
}

export default function TeamEvalPage({ params }: { params: { teamToken: string } }) {
  const supabase = createClient()

  const [formData,  setFormData]  = useState<FormData | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading,   setLoading]   = useState(true)

  const [step,     setStep]     = useState<'identify' | 'score' | 'review' | 'submitted'>('identify')
  const [coachName, setCoachName] = useState('')

  const [scores,         setScores]         = useState<Record<string, Record<string, number | null>>>({})
  const [naFlags,        setNaFlags]        = useState<Record<string, Set<string>>>({})
  const [playerComments, setPlayerComments] = useState<Record<string, string>>({})
  const [overallNotes,   setOverallNotes]   = useState('')

  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const [savingDraft, setSavingDraft] = useState(false)
  const [lastSaved,   setLastSaved]   = useState<Date | null>(null)
  const [hasDraft,    setHasDraft]    = useState(false)

  const [selected,        setSelected]        = useState<{ rowIdx: number; colIdx: number } | null>(null)
  const [colFillKey,      setColFillKey]      = useState<string | null>(null)
  const [expandedComment, setExpandedComment] = useState<string | null>(null)

  const gridRef    = useRef<HTMLDivElement>(null)
  const historyRef = useRef<Array<Record<string, Record<string, number | null>>>>([{}])
  const histIdxRef = useRef(0)

  // Hide Six43 chrome — standalone org-branded page
  useEffect(() => {
    document.body.classList.add('eval-standalone')
    return () => document.body.classList.remove('eval-standalone')
  }, [])

  useEffect(() => {
    supabase.rpc('tryout_eval_form_data_by_team_token', { p_token: params.teamToken })
      .then(({ data, error }) => {
        if (error || !data) { setLoadError('Could not load form.'); setLoading(false); return }
        if (data.error)     { setLoadError(data.error);             setLoading(false); return }
        setFormData(data as FormData)
        setLoading(false)
      })
  }, [])

  // Check for draft in localStorage when form loads
  useEffect(() => {
    if (!formData) return
    try {
      const raw = localStorage.getItem(`eval_team_draft_${params.teamToken}`)
      if (raw) {
        setHasDraft(true)
        const saved = JSON.parse(raw)
        if (saved.coachName) setCoachName(saved.coachName)
      }
    } catch { /* ignore */ }
  }, [formData])

  // Auto-save to localStorage during scoring
  useEffect(() => {
    if (step !== 'score') return
    try {
      localStorage.setItem(`eval_team_draft_${params.teamToken}`, JSON.stringify({
        coachName, scores, playerComments, overallNotes, savedAt: new Date().toISOString(),
      }))
    } catch { /* ignore */ }
  }, [scores, playerComments, overallNotes, step])

  function resumeDraft() {
    try {
      const raw = localStorage.getItem(`eval_team_draft_${params.teamToken}`)
      if (!raw) return
      const draft = JSON.parse(raw)
      if (draft.coachName)      setCoachName(draft.coachName)
      if (draft.scores)         setScores(draft.scores)
      if (draft.playerComments) setPlayerComments(draft.playerComments)
      if (draft.overallNotes)   setOverallNotes(draft.overallNotes)
      if (draft.savedAt)        setLastSaved(new Date(draft.savedAt))
    } catch { /* ignore */ }
    setStep('score')
  }

  async function saveDraft() {
    if (!coachName.trim()) return
    setSavingDraft(true)
    const playerScores: Record<string, Record<string, number>> = {}
    const commentMap:   Record<string, string> = {}
    for (const p of (formData?.players ?? [])) {
      const ps = scores[p.id] ?? {}
      const filtered: Record<string, number> = {}
      for (const [k, v] of Object.entries(ps)) { if (v != null) filtered[k] = v }
      if (Object.keys(filtered).length > 0) playerScores[p.id] = filtered
      if (playerComments[p.id]?.trim()) commentMap[p.id] = playerComments[p.id].trim()
    }
    try {
      await supabase.rpc('tryout_save_eval_draft_by_team_token', {
        p_token:           params.teamToken,
        p_coach_name:      coachName.trim(),
        p_player_scores:   playerScores,
        p_player_comments: commentMap,
      })
    } catch { /* ignore — localStorage is the backup */ }
    setLastSaved(new Date())
    setSavingDraft(false)
  }

  const sections = useMemo(() => {
    if (!formData) return []
    const order = ['fielding_hitting', 'pitching_catching', 'intangibles', 'athleticism']
    const bySection: Record<string, EvalField[]> = {}
    for (const f of formData.eval_config) {
      if (!bySection[f.section]) bySection[f.section] = []
      bySection[f.section].push(f)
    }
    return order.filter(s => bySection[s]).map(s => ({
      key:         s,
      label:       SECTION_LABELS[s] ?? s,
      fields:      bySection[s].sort((a, b) => a.sort_order - b.sort_order),
      is_optional: bySection[s][0]?.is_optional ?? false,
    }))
  }, [formData])

  const allFields = useMemo(() => sections.flatMap(s => s.fields), [sections])

  const players = formData?.players ?? []

  const progress = useMemo(() => {
    const required = sections.filter(s => !s.is_optional).flatMap(s => s.fields).map(f => f.field_key)
    let filled = 0
    for (const p of players) {
      const ps = scores[p.id] ?? {}
      if (required.every(k => ps[k] != null)) filled++
    }
    return { filled, total: players.length, pct: players.length > 0 ? Math.round(filled / players.length * 100) : 0 }
  }, [scores, players, sections])

  function commitScore(playerId: string, fieldKey: string, val: number | null) {
    setScores(prev => {
      const next = { ...prev, [playerId]: { ...(prev[playerId] ?? {}), [fieldKey]: val } }
      historyRef.current = historyRef.current.slice(0, histIdxRef.current + 1)
      historyRef.current.push(next)
      histIdxRef.current = historyRef.current.length - 1
      return next
    })
  }

  function undoScore() {
    if (histIdxRef.current <= 0) return
    histIdxRef.current--
    setScores(historyRef.current[histIdxRef.current])
  }

  function redoScore() {
    if (histIdxRef.current >= historyRef.current.length - 1) return
    histIdxRef.current++
    setScores(historyRef.current[histIdxRef.current])
  }

  function moveSelected(dRow: number, dCol: number, numRows: number, numCols: number) {
    setSelected(prev => {
      if (!prev) return prev
      let { rowIdx, colIdx } = prev
      colIdx += dCol; rowIdx += dRow
      if (colIdx >= numCols) { colIdx = 0; rowIdx++ }
      if (colIdx < 0)        { colIdx = numCols - 1; rowIdx-- }
      rowIdx = Math.max(0, Math.min(numRows - 1, rowIdx))
      colIdx = Math.max(0, Math.min(numCols - 1, colIdx))
      return { rowIdx, colIdx }
    })
  }

  function handleGridKeyDown(e: React.KeyboardEvent, numRows: number, numCols: number) {
    if (!selected) return
    const player = players[selected.rowIdx]
    const field  = allFields[selected.colIdx]
    if (!player || !field) return

    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undoScore(); return }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redoScore(); return }

    const sectionKey = sections.find(sec => sec.fields.some(f => f.field_key === field.field_key))?.key ?? ''
    const cellNa = naFlags[player.id]?.has(sectionKey) ?? false

    if (!cellNa && e.key >= '1' && e.key <= '5') {
      e.preventDefault()
      commitScore(player.id, field.field_key, parseInt(e.key))
      moveSelected(0, 1, numRows, numCols)
      return
    }
    if (!cellNa && (e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault(); commitScore(player.id, field.field_key, null); return
    }
    if (e.key === 'Tab')        { e.preventDefault(); moveSelected(0, e.shiftKey ? -1 : 1, numRows, numCols); return }
    if (e.key === 'Enter')      { e.preventDefault(); moveSelected(1, 0, numRows, numCols); return }
    if (e.key === 'ArrowRight') { e.preventDefault(); moveSelected(0, 1, numRows, numCols); return }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); moveSelected(0, -1, numRows, numCols); return }
    if (e.key === 'ArrowDown')  { e.preventDefault(); moveSelected(1, 0, numRows, numCols); return }
    if (e.key === 'ArrowUp')    { e.preventDefault(); moveSelected(-1, 0, numRows, numCols); return }
    if (e.key === 'Escape')     { setSelected(null); return }
  }

  function toggleNa(playerId: string, sectionKey: string, fields: EvalField[]) {
    setNaFlags(prev => {
      const cur = new Set(prev[playerId] ?? [])
      if (cur.has(sectionKey)) {
        cur.delete(sectionKey)
      } else {
        cur.add(sectionKey)
        setScores(ps => {
          const ps2 = { ...(ps[playerId] ?? {}) }
          for (const f of fields) delete ps2[f.field_key]
          return { ...ps, [playerId]: ps2 }
        })
      }
      return { ...prev, [playerId]: cur }
    })
  }

  function isNa(playerId: string, sectionKey: string) {
    return naFlags[playerId]?.has(sectionKey) ?? false
  }

  async function handleSubmit() {
    if (!coachName.trim()) { setSubmitError('Please enter your name.'); return }
    setSubmitting(true); setSubmitError(null)

    const playerScores: Record<string, Record<string, number>> = {}
    const commentMap:   Record<string, string> = {}
    for (const p of players) {
      const ps = scores[p.id] ?? {}
      const filtered: Record<string, number> = {}
      for (const [k, v] of Object.entries(ps)) { if (v != null) filtered[k] = v }
      if (Object.keys(filtered).length > 0) playerScores[p.id] = filtered
      if (playerComments[p.id]?.trim()) commentMap[p.id] = playerComments[p.id].trim()
    }

    const { data, error } = await supabase.rpc('tryout_submit_eval_by_team_token', {
      p_token:           params.teamToken,
      p_coach_name:      coachName.trim(),
      p_player_scores:   playerScores,
      p_player_comments: commentMap,
      p_overall_notes:   overallNotes.trim() || null,
    })

    if (error || data?.error) {
      setSubmitError(error?.message ?? data?.error ?? 'Submission failed.')
      setSubmitting(false)
      return
    }

    try { localStorage.removeItem(`eval_team_draft_${params.teamToken}`) } catch { /* ignore */ }
    setStep('submitted')
    setSubmitting(false)
  }

  const s = { muted: `rgba(var(--fg-rgb),0.55)` as const, dim: `rgba(var(--fg-rgb),0.35)` as const }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg2)', color: 'var(--fg)',
    border: '0.5px solid var(--border-md)', borderRadius: '8px',
    padding: '10px 12px', fontSize: '15px',
    width: '100%', boxSizing: 'border-box',
  }
  const textareaStyle: React.CSSProperties = {
    background: 'var(--bg2)', color: 'var(--fg)',
    border: '0.5px solid var(--border-md)', borderRadius: '8px',
    padding: '10px 12px', fontSize: '13px',
    width: '100%', boxSizing: 'border-box',
    resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5,
  }

  // ── Loading / error states ────────────────────────────────────────────────

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading…
    </main>
  )

  if (loadError) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '28px', marginBottom: '12px' }}>⚠</div>
        <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>Link not found</div>
        <div style={{ fontSize: '13px', color: s.muted }}>{loadError}</div>
      </div>
    </main>
  )

  if (!formData) return null

  // ── Step: submitted ───────────────────────────────────────────────────────
  if (step === 'submitted') return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '3rem 1.5rem' }}>
      <div style={{ maxWidth: '520px', margin: '0 auto', textAlign: 'center' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px' }}>Evaluations submitted!</h1>
        <p style={{ fontSize: '14px', color: s.muted, lineHeight: 1.6 }}>
          Thank you, {coachName}. Your evaluations for <strong>{formData.selected_team}</strong> have been received.
        </p>
      </div>
    </main>
  )

  // ── Step: identify ────────────────────────────────────────────────────────
  if (step === 'identify') return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', maxWidth: '560px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '6px' }}>
        {formData.org_name ?? 'Coach Evaluation'}
      </div>
      <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '4px' }}>{formData.season.label} — Player Evaluations</h1>
      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--fg)', marginBottom: '2px' }}>{formData.selected_team}</div>
      <p style={{ fontSize: '13px', color: s.muted, marginBottom: '2rem' }}>
        {players.length} player{players.length !== 1 ? 's' : ''} on this roster. Rate each player on a 1–5 scale.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '2rem' }}>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: s.dim, display: 'block', marginBottom: '6px' }}>Your name</label>
          <input type="text" value={coachName} onChange={e => setCoachName(e.target.value)} placeholder="Coach Smith" style={inputStyle}
            onKeyDown={e => { if (e.key === 'Enter' && coachName.trim()) { hasDraft ? resumeDraft() : setStep('score') } }}
          />
        </div>
      </div>

      {/* Resume draft banner */}
      {hasDraft && (
        <div style={{ padding: '12px 16px', background: 'rgba(80,160,232,0.1)', border: '0.5px solid rgba(80,160,232,0.3)', borderRadius: '10px', marginBottom: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>In-progress evaluation found</div>
            <div style={{ fontSize: '12px', color: s.muted, marginTop: '2px' }}>You have unsaved scores in this browser.</div>
          </div>
          <button onClick={resumeDraft} style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: 'rgba(80,160,232,0.8)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            Resume →
          </button>
        </div>
      )}

      <button
        onClick={() => setStep('score')}
        disabled={!coachName.trim()}
        style={{
          width: '100%', padding: '14px', borderRadius: '8px', border: 'none',
          background: 'var(--accent)', color: 'var(--accent-text)',
          fontSize: '15px', fontWeight: 700, cursor: 'pointer',
          opacity: !coachName.trim() ? 0.5 : 1,
          marginBottom: '2rem',
        }}
      >
        Start evaluations →
      </button>

      {/* Instructions */}
      <div style={{ background: 'rgba(232,160,32,0.07)', border: '0.5px solid rgba(232,160,32,0.25)', borderRadius: '10px', padding: '1.25rem' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', marginBottom: '12px' }}>Before you start — please read</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: s.muted, lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}><strong style={{ color: 'var(--fg)' }}>Scores are based on your age group, not your specific team.</strong> A player with a strong arm on your team but average across the age group should be scored a <strong style={{ color: 'var(--fg)' }}>3</strong>.</p>
          <p style={{ margin: 0 }}><strong style={{ color: 'var(--fg)' }}>Most players will live in the 3s.</strong> A 3 means "age appropriate" and is exactly where most players should be.</p>
          <p style={{ margin: 0 }}><strong style={{ color: 'var(--fg)' }}>Reserve a 5 for truly exceptional players</strong> — best-in-class out of everyone in your age group this year.</p>
          <p style={{ margin: 0 }}><strong style={{ color: 'var(--fg)' }}>Be objective and thorough in comments.</strong> Written commentary is often as valuable as the scores.</p>
        </div>
        <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '12px' }}>
          {[
            { n: 1, label: 'Needs work' }, { n: 2, label: 'Below age' },
            { n: 3, label: 'Age appropriate' }, { n: 4, label: 'Above age' },
            { n: 5, label: 'Exceptional' },
          ].map(({ n, label }) => (
            <span key={n} style={{ padding: '3px 10px', borderRadius: '20px', fontWeight: 600, background: scoreColor(n), color: 'var(--fg)', border: '0.5px solid rgba(var(--fg-rgb),0.1)' }}>
              {n} — {label}
            </span>
          ))}
        </div>
      </div>
    </main>
  )

  // ── Step: review ──────────────────────────────────────────────────────────
  if (step === 'review') {
    const requiredFields = sections.filter(s => !s.is_optional).flatMap(s => s.fields)
    return (
      <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)', borderBottom: '0.5px solid var(--border)', padding: '12px 1.5rem' }}>
          <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700 }}>Review — {formData.selected_team}</div>
              <div style={{ fontSize: '11px', color: s.dim }}>{coachName} · {formData.season.label}</div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setStep('score')} style={{ padding: '7px 16px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'var(--bg2)', color: 'var(--fg)', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>← Back to edit</button>
              <button onClick={handleSubmit} disabled={submitting} style={{ padding: '7px 18px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
                {submitting ? 'Submitting…' : 'Submit →'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem 1.5rem 6rem' }}>
          {submitError && (
            <div style={{ padding: '10px 14px', background: 'rgba(232,112,96,0.1)', border: '0.5px solid rgba(232,112,96,0.3)', borderRadius: '8px', fontSize: '13px', color: '#E87060', marginBottom: '1rem' }}>{submitError}</div>
          )}
          <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, fontSize: '11px', color: s.dim, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: '150px', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1 }}>Player</th>
                  {allFields.map(f => (
                    <th key={f.field_key} title={f.label} style={{ textAlign: 'center', padding: '6px 4px', fontWeight: 600, fontSize: '10px', color: s.dim, textTransform: 'uppercase', minWidth: '52px', maxWidth: '64px' }}>
                      {f.label.length > 9 ? f.label.slice(0, 8) + '…' : f.label}
                    </th>
                  ))}
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, fontSize: '11px', color: s.dim, textTransform: 'uppercase', minWidth: '160px' }}>Comments</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p, i) => {
                  const ps = scores[p.id] ?? {}
                  const complete = requiredFields.every(f => ps[f.field_key] != null)
                  return (
                    <tr key={p.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(var(--fg-rgb),0.02)', borderBottom: '0.5px solid rgba(var(--fg-rgb),0.05)' }}>
                      <td style={{ padding: '7px 10px', fontWeight: 600, position: 'sticky', left: 0, background: i % 2 === 0 ? 'var(--bg)' : 'var(--bg)', zIndex: 1 }}>
                        {p.last_name}, {p.first_name}
                        {!complete && <span title="Missing required scores" style={{ fontSize: '10px', color: '#E8A020', marginLeft: '4px' }}>⚠</span>}
                      </td>
                      {allFields.map(f => {
                        const v = ps[f.field_key] ?? null
                        const na = isNa(p.id, sections.find(sec => sec.fields.some(sf => sf.field_key === f.field_key))?.key ?? '')
                        return (
                          <td key={f.field_key} style={{ padding: '4px 2px', textAlign: 'center' }}>
                            <span style={{ display: 'inline-block', width: '30px', height: '26px', lineHeight: '26px', borderRadius: '5px', fontWeight: 700, fontSize: '13px', background: na ? 'rgba(var(--fg-rgb),0.04)' : scoreColor(v), color: v != null && !na ? 'var(--fg)' : s.dim }}>
                              {na ? 'N/A' : (v ?? '—')}
                            </span>
                          </td>
                        )
                      })}
                      <td style={{ padding: '7px 10px', fontSize: '12px', color: s.muted, maxWidth: '200px' }}>
                        {playerComments[p.id] ? <span>{playerComments[p.id].length > 60 ? playerComments[p.id].slice(0, 58) + '…' : playerComments[p.id]}</span> : <span style={{ opacity: 0.35, fontStyle: 'italic' }}>—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {overallNotes.trim() && (
            <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: s.dim, marginBottom: '6px' }}>Overall season notes</div>
              <div style={{ fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{overallNotes}</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={handleSubmit} disabled={submitting} style={{ padding: '12px 28px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '14px', fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
              {submitting ? 'Submitting…' : 'Submit evaluations'}
            </button>
            <button onClick={() => setStep('score')} style={{ padding: '12px 16px', borderRadius: '8px', border: '0.5px solid var(--border-md)', background: 'transparent', color: s.muted, fontSize: '13px', cursor: 'pointer' }}>
              ← Back to edit
            </button>
          </div>
        </div>
      </main>
    )
  }

  // ── Step: score (grid) ───────────────────────────────────────────────────
  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif' }}>
      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)', borderBottom: '0.5px solid var(--border)', padding: '10px 1.5rem' }}>
        <div style={{ maxWidth: '1300px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>{formData.selected_team}</div>
            <div style={{ fontSize: '11px', color: s.dim }}>{coachName} · {formData.season.label}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '12px', color: progress.pct === 100 ? '#6DB875' : s.muted, fontWeight: 600 }}>
              {progress.filled}/{progress.total} complete
            </div>
            <div style={{ width: '70px', height: '4px', borderRadius: '2px', background: 'var(--border-md)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress.pct}%`, background: progress.pct === 100 ? '#6DB875' : 'var(--accent)', borderRadius: '2px', transition: 'width 0.3s' }} />
            </div>
            {lastSaved && <span style={{ fontSize: '11px', color: s.dim }}>Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
            <button onClick={saveDraft} disabled={savingDraft || !coachName.trim()} style={{ padding: '6px 14px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'var(--bg2)', color: s.muted, fontSize: '12px', fontWeight: 600, cursor: savingDraft ? 'default' : 'pointer', opacity: savingDraft ? 0.6 : 1 }}>
              {savingDraft ? 'Saving…' : '💾 Save progress'}
            </button>
            <button onClick={() => setStep('review')} style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
              Review →
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1300px', margin: '0 auto', padding: `1.5rem 1.5rem ${selected !== null ? '130px' : '6rem'}` }}>
        {/* Scale legend */}
        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', fontSize: '11px', marginBottom: '1rem' }}>
          {[
            { n: 1, label: 'Needs work' }, { n: 2, label: 'Below age' },
            { n: 3, label: 'Age appropriate' }, { n: 4, label: 'Above age' },
            { n: 5, label: 'Exceptional' },
          ].map(({ n, label }) => (
            <span key={n} style={{ padding: '2px 8px', borderRadius: '20px', fontWeight: 600, background: scoreColor(n), border: '0.5px solid rgba(var(--fg-rgb),0.1)' }}>
              {n} — {label}
            </span>
          ))}
        </div>

        {/* ── Score grid ── */}
        <div
          ref={gridRef}
          tabIndex={0}
          onKeyDown={e => handleGridKeyDown(e, players.length, allFields.length)}
          style={{ outline: 'none', overflow: 'auto', maxHeight: 'calc(100vh - 130px)', borderRadius: '10px', border: '0.5px solid var(--border)', marginBottom: '1.5rem' }}
        >
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', fontSize: '12px' }}>
            <thead>
              {/* Section header row */}
              <tr>
                <th style={{ position: 'sticky', top: 0, left: 0, zIndex: 4, background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', width: '160px', minWidth: '160px', padding: 0 }} />
                {sections.map(sec => (
                  <th key={sec.key} colSpan={sec.fields.length} style={{ position: 'sticky', top: 0, zIndex: 2, padding: '5px 6px', textAlign: 'center', background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', borderLeft: '1px solid var(--border)', fontSize: '10px', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--accent)', whiteSpace: 'normal', lineHeight: 1.3 }}>
                    {sec.label}
                  </th>
                ))}
                <th colSpan={2} style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', borderLeft: '1px solid var(--border)', padding: 0 }} />
              </tr>
              {/* Column label row */}
              <tr>
                <th style={{ position: 'sticky', top: '29px', left: 0, zIndex: 4, padding: '5px 10px', textAlign: 'left', background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', fontSize: '11px', fontWeight: 700, color: s.muted, whiteSpace: 'nowrap', boxShadow: '2px 0 4px rgba(0,0,0,0.06)', width: '160px', minWidth: '160px' }}>Player</th>
                {allFields.map((field, fi) => {
                  const isFirstSec = fi === 0 || allFields[fi - 1].section !== field.section
                  return (
                    <th key={field.field_key} style={{ position: 'sticky', top: '29px', zIndex: 2, padding: '3px 2px 5px', textAlign: 'center', verticalAlign: 'bottom', background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', borderLeft: isFirstSec ? '1px solid var(--border)' : '0.5px solid rgba(var(--fg-rgb),0.06)', width: '52px', minWidth: '52px', maxWidth: '52px' }}>
                      <div style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: '64px', overflow: 'hidden', fontSize: '10px', fontWeight: 700, color: 'var(--fg)', textAlign: 'left', paddingBottom: '2px', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                        {field.label}
                      </div>
                      {colFillKey === field.field_key ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', marginTop: '3px' }}>
                          {[1,2,3,4,5].map(v => (
                            <button key={v} onClick={() => {
                              setScores(prev => {
                                const next = { ...prev }
                                for (const p of players) {
                                  if ((next[p.id]?.[field.field_key] ?? null) == null)
                                    next[p.id] = { ...(next[p.id] ?? {}), [field.field_key]: v }
                                }
                                historyRef.current = historyRef.current.slice(0, histIdxRef.current + 1)
                                historyRef.current.push(next)
                                histIdxRef.current = historyRef.current.length - 1
                                return next
                              })
                              setColFillKey(null)
                            }} style={{ width: '26px', height: '18px', borderRadius: '3px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}>{v}</button>
                          ))}
                          <button onClick={() => setColFillKey(null)} style={{ width: '26px', height: '14px', borderRadius: '3px', border: '0.5px solid var(--border-md)', background: 'transparent', color: s.dim, fontSize: '10px', cursor: 'pointer', padding: 0 }}>×</button>
                        </div>
                      ) : (
                        <button onClick={() => { setColFillKey(field.field_key); setSelected(null) }} style={{ marginTop: '2px', fontSize: '9px', padding: '1px 3px', borderRadius: '3px', border: '0.5px solid var(--border-md)', background: 'transparent', color: s.dim, cursor: 'pointer' }} title={`Fill empty "${field.label}" cells`}>fill ↓</button>
                      )}
                    </th>
                  )
                })}
                <th style={{ position: 'sticky', top: '29px', zIndex: 2, padding: '5px 6px', textAlign: 'center', background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', borderLeft: '1px solid var(--border)', fontSize: '11px', color: s.dim, whiteSpace: 'nowrap', width: '60px' }}>Notes</th>
                <th style={{ position: 'sticky', top: '29px', zIndex: 2, padding: '5px 4px', background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', width: '50px' }} />
              </tr>
            </thead>
            <tbody>
              {players.map((player, pi) => {
                const ps = scores[player.id] ?? {}
                const required = sections.filter(sec => !sec.is_optional).flatMap(sec => sec.fields)
                const complete = required.every(f => ps[f.field_key] != null || isNa(player.id, sections.find(sec => sec.fields.some(sf => sf.field_key === f.field_key))?.key ?? ''))
                const rowBg = pi % 2 === 0 ? 'var(--bg)' : 'rgba(var(--fg-rgb),0.02)'
                const hasComment = !!(playerComments[player.id]?.trim())
                const commentOpen = expandedComment === player.id

                return (
                  <>
                    <tr key={player.id}>
                      <td style={{ padding: '3px 10px', fontWeight: 700, fontSize: '12px', whiteSpace: 'nowrap', position: 'sticky', left: 0, zIndex: 1, background: rowBg, borderBottom: commentOpen ? 'none' : '0.5px solid var(--border)', borderLeft: complete ? '3px solid #2f855a' : '3px solid transparent', boxShadow: '2px 0 6px rgba(0,0,0,0.08)', width: '160px', minWidth: '160px' }}>
                        {player.first_name} {player.last_name}
                        {complete && <span style={{ fontSize: '9px', color: '#2f855a', marginLeft: '4px' }}>✓</span>}
                      </td>

                      {allFields.map((field, fi) => {
                        const val = ps[field.field_key] ?? null
                        const sectionKey = sections.find(sec => sec.fields.some(sf => sf.field_key === field.field_key))?.key ?? ''
                        const na = isNa(player.id, sectionKey)
                        const isFirstSec = fi === 0 || allFields[fi - 1].section !== field.section
                        const isSelected = selected?.rowIdx === pi && selected?.colIdx === fi

                        return (
                          <td key={field.field_key}
                            onClick={() => { if (na) return; setSelected({ rowIdx: pi, colIdx: fi }); setColFillKey(null); gridRef.current?.focus() }}
                            style={{ padding: '3px 2px', borderBottom: commentOpen ? 'none' : '0.5px solid var(--border)', borderLeft: isFirstSec ? '1px solid var(--border)' : '0.5px solid rgba(var(--fg-rgb),0.06)', textAlign: 'center', cursor: na ? 'default' : 'pointer', background: isSelected ? 'rgba(26,54,93,0.12)' : na ? 'rgba(var(--fg-rgb),0.04)' : scoreColor(val), outline: isSelected ? '2px solid rgba(26,54,93,0.7)' : 'none', outlineOffset: '-2px', position: 'relative', userSelect: 'none', width: '52px', minWidth: '52px' }}
                          >
                            <span style={{ fontSize: '13px', fontWeight: val != null ? 700 : 400, color: na ? s.dim : val != null ? 'var(--fg)' : 'rgba(var(--fg-rgb),0.2)' }}>
                              {na ? 'N/A' : val ?? '·'}
                            </span>
                          </td>
                        )
                      })}

                      <td style={{ padding: '3px 5px', borderBottom: commentOpen ? 'none' : '0.5px solid var(--border)', borderLeft: '1px solid var(--border)', textAlign: 'center', width: '60px' }}>
                        <button onClick={() => setExpandedComment(commentOpen ? null : player.id)} style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer', border: `0.5px solid ${commentOpen || hasComment ? 'var(--accent)' : 'var(--border-md)'}`, background: commentOpen ? 'rgba(26,54,93,0.08)' : 'transparent', color: commentOpen || hasComment ? 'var(--accent)' : s.dim, fontWeight: hasComment ? 700 : 400, whiteSpace: 'nowrap' }}>
                          {hasComment ? '✎' : '+'}
                        </button>
                      </td>

                      <td style={{ padding: '3px 4px', borderBottom: commentOpen ? 'none' : '0.5px solid var(--border)', whiteSpace: 'nowrap', fontSize: '10px', color: s.dim, width: '50px' }}>
                        {sections.filter(sec => sec.is_optional).map(sec => (
                          <label key={sec.key} style={{ display: 'flex', alignItems: 'center', gap: '3px', cursor: 'pointer' }}>
                            <input type="checkbox" checked={isNa(player.id, sec.key)} onChange={() => toggleNa(player.id, sec.key, sec.fields)} style={{ width: '11px', height: '11px' }} />
                            <span style={{ fontSize: '9px' }}>N/A</span>
                          </label>
                        ))}
                      </td>
                    </tr>

                    {commentOpen && (
                      <tr key={`${player.id}_comment`}>
                        <td colSpan={1 + allFields.length + 2} style={{ padding: '6px 12px 10px 12px', borderBottom: '0.5px solid var(--border)', background: rowBg }}>
                          <textarea
                            autoFocus
                            value={playerComments[player.id] ?? ''}
                            onChange={e => setPlayerComments(prev => ({ ...prev, [player.id]: e.target.value }))}
                            placeholder="Strengths, areas to develop, coachability, attitude, improvement this season…"
                            rows={3}
                            style={{ ...textareaStyle, fontSize: '12px', borderRadius: '6px' }}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Overall season notes */}
        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>Overall season notes</div>
          <div style={{ fontSize: '12px', color: s.muted, marginBottom: '10px' }}>
            General observations, season highlights, team trends, or anything you'd like the board to know.
          </div>
          <textarea value={overallNotes} onChange={e => setOverallNotes(e.target.value)}
            placeholder="e.g. Great group overall — improved significantly in the second half…"
            rows={4} style={textareaStyle}
          />
        </div>

        {/* Bottom CTA */}
        <div style={{ padding: '1.25rem', background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>Ready to submit?</div>
          <div style={{ fontSize: '13px', color: s.muted, marginBottom: '1rem' }}>
            {progress.filled} of {progress.total} players fully rated.
            {progress.pct < 100 && ' You can submit with partial scores.'}
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={() => setStep('review')} style={{ padding: '12px 28px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
              Review before submitting →
            </button>
            <button onClick={saveDraft} disabled={savingDraft || !coachName.trim()} style={{ padding: '12px 18px', borderRadius: '8px', border: '0.5px solid var(--border-md)', background: 'var(--bg2)', color: s.muted, fontSize: '13px', fontWeight: 600, cursor: 'pointer', opacity: savingDraft ? 0.6 : 1 }}>
              {savingDraft ? 'Saving…' : '💾 Save & come back later'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile score bar ── */}
      {selected !== null && (() => {
        const player = players[selected.rowIdx]
        const field  = allFields[selected.colIdx]
        if (!player || !field) return null
        const val = scores[player.id]?.[field.field_key] ?? null
        const na  = isNa(player.id, sections.find(sec => sec.fields.some(f => f.field_key === field.field_key))?.key ?? '')
        return (
          <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200, background: '#1a365d', borderTop: '2px solid #2a4a7d', padding: '10px 16px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.75)', fontWeight: 600 }}>
                {player.first_name} {player.last_name} &middot; <em style={{ fontStyle: 'normal', color: 'rgba(255,255,255,0.55)' }}>{field.label}</em>
              </span>
              <button onClick={() => setSelected(null)} style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '5px', border: '0.5px solid rgba(255,255,255,0.3)', background: 'transparent', color: 'rgba(255,255,255,0.6)', cursor: 'pointer' }}>Done</button>
            </div>
            {na ? (
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '6px 0' }}>N/A for this player</div>
            ) : (
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                {[1, 2, 3, 4, 5].map(v => (
                  <button key={v} onClick={() => {
                    if (val === v) { commitScore(player.id, field.field_key, null) }
                    else { commitScore(player.id, field.field_key, v); moveSelected(0, 1, players.length, allFields.length) }
                  }} style={{ flex: 1, height: '48px', borderRadius: '8px', border: 'none', background: val === v ? '#ffffff' : 'rgba(255,255,255,0.15)', color: val === v ? '#1a365d' : '#ffffff', fontSize: '20px', fontWeight: 800, cursor: 'pointer' }}>{v}</button>
                ))}
                {val != null && (
                  <button onClick={() => commitScore(player.id, field.field_key, null)} style={{ width: '44px', height: '48px', borderRadius: '8px', border: '0.5px solid rgba(255,255,255,0.3)', background: 'transparent', color: 'rgba(255,255,255,0.6)', fontSize: '18px', cursor: 'pointer', flexShrink: 0 }}>×</button>
                )}
              </div>
            )}
          </div>
        )
      })()}
    </main>
  )
}
