'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../../../lib/supabase'
import * as XLSX from 'xlsx'

interface EvalPlayer {
  id: string; first_name: string; last_name: string
  age_group: string; prior_team: string
}

interface EvalField {
  field_key: string; label: string; section: string
  is_optional: boolean; sort_order: number
}

interface FormData {
  season:               { id: string; label: string; year: number }
  teams:                string[]
  players:              EvalPlayer[]
  eval_config:          EvalField[]
  submitted_player_ids: string[]
}

const SECTION_LABELS: Record<string, string> = {
  fielding_hitting:  'Fielding & Hitting',
  pitching_catching: 'Pitching & Catching (optional)',
  intangibles:       'Intangibles',
}

function teamSortKey(t: string): number {
  const m = t.match(/^(\d+)/)
  return m ? parseInt(m[1]) : 999
}

function scoreColor(v: number | null): string {
  if (v == null) return 'transparent'
  if (v === 5) return 'rgba(109,184,117,0.45)'
  if (v === 4) return 'rgba(109,184,117,0.2)'
  if (v === 3) return 'rgba(80,160,232,0.18)'
  if (v === 2) return 'rgba(232,140,40,0.2)'
  return 'rgba(232,80,80,0.22)'
}

export default function PublicEvalPage({ params }: { params: { token: string } }) {
  const supabase = createClient()

  const [formData,    setFormData]    = useState<FormData | null>(null)
  const [loadError,   setLoadError]   = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)

  const [step, setStep] = useState<'identify' | 'score' | 'review' | 'submitted'>('identify')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [coachName,   setCoachName]   = useState('')

  // scores[playerId][fieldKey] = 1-5 | null
  const [scores,          setScores]          = useState<Record<string, Record<string, number | null>>>({})
  // naFlags[playerId] = Set of optional section keys marked N/A
  const [naFlags,         setNaFlags]         = useState<Record<string, Set<string>>>({})
  // per-player comments
  const [playerComments,  setPlayerComments]  = useState<Record<string, string>>({})
  // overall season notes
  const [overallNotes,    setOverallNotes]    = useState('')

  const [submitting,   setSubmitting]   = useState(false)
  const [submitError,  setSubmitError]  = useState<string | null>(null)

  // post-submission email capture
  const [receiptEmail, setReceiptEmail] = useState('')
  const [emailSaving,  setEmailSaving]  = useState(false)
  const [emailSaved,   setEmailSaved]   = useState(false)

  useEffect(() => {
    supabase.rpc('tryout_eval_form_data_by_token', { p_token: params.token })
      .then(({ data, error }) => {
        if (error || !data) { setLoadError('Could not load form.'); setLoading(false); return }
        if (data.error)     { setLoadError(data.error);             setLoading(false); return }
        setFormData(data as FormData)
        setLoading(false)
      })
  }, [])

  const teamPlayers = useMemo(() =>
    (formData?.players ?? []).filter(p => p.prior_team === selectedTeam)
      .sort((a, b) => a.last_name.localeCompare(b.last_name) || a.first_name.localeCompare(b.first_name)),
    [formData, selectedTeam]
  )

  const sections = useMemo(() => {
    if (!formData) return []
    const order = ['fielding_hitting', 'pitching_catching', 'intangibles']
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

  function setScore(playerId: string, fieldKey: string, val: number | null) {
    setScores(prev => ({ ...prev, [playerId]: { ...(prev[playerId] ?? {}), [fieldKey]: val } }))
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

  // Progress: required fields filled for each player
  const progress = useMemo(() => {
    const required = sections.filter(s => !s.is_optional).flatMap(s => s.fields).map(f => f.field_key)
    let filled = 0
    for (const p of teamPlayers) {
      const ps = scores[p.id] ?? {}
      if (required.every(k => ps[k] != null)) filled++
    }
    return { filled, total: teamPlayers.length, pct: teamPlayers.length > 0 ? Math.round(filled / teamPlayers.length * 100) : 0 }
  }, [scores, teamPlayers, sections])

  async function handleSubmit() {
    if (!coachName.trim()) { setSubmitError('Please enter your name.'); return }
    if (teamPlayers.length === 0) { setSubmitError('No players found for this team.'); return }

    setSubmitting(true)
    setSubmitError(null)

    // Build scores map (only non-null values)
    const playerScores: Record<string, Record<string, number>> = {}
    for (const p of teamPlayers) {
      const ps = scores[p.id] ?? {}
      const filtered: Record<string, number> = {}
      for (const [k, v] of Object.entries(ps)) {
        if (v != null) filtered[k] = v
      }
      if (Object.keys(filtered).length > 0) playerScores[p.id] = filtered
    }

    // Build comments map (only non-empty)
    const commentMap: Record<string, string> = {}
    for (const [pid, c] of Object.entries(playerComments)) {
      if (c.trim()) commentMap[pid] = c.trim()
    }

    const { data, error } = await supabase.rpc('tryout_submit_eval_by_token', {
      p_token:           params.token,
      p_team_label:      selectedTeam,
      p_coach_name:      coachName.trim(),
      p_player_scores:   playerScores,
      p_player_comments: commentMap,
      p_overall_notes:   overallNotes.trim() || null,
      p_contact_email:   null,
    })

    if (error || data?.error) {
      setSubmitError(error?.message ?? data?.error ?? 'Submission failed.')
      setSubmitting(false)
      return
    }

    setStep('submitted')
    setSubmitting(false)
  }

  async function saveReceiptEmail() {
    if (!receiptEmail.trim()) return
    setEmailSaving(true)
    await supabase.rpc('tryout_eval_save_contact', {
      p_token:      params.token,
      p_team_label: selectedTeam,
      p_email:      receiptEmail.trim(),
    })
    setEmailSaved(true)
    setEmailSaving(false)
  }

  // ── XLS template download ─────────────────────────────────────────────────
  function downloadTemplate() {
    if (!formData || teamPlayers.length === 0) return
    const headers = ['Player ID', 'First Name', 'Last Name', 'Age Group', ...allFields.map(f => f.label), 'Comments']
    const dataRows = teamPlayers.map(p => [p.id, p.first_name, p.last_name, p.age_group, ...allFields.map(() => ''), ''])

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])
    ws['!cols'] = [
      { hidden: true },
      { wch: 14 }, { wch: 16 }, { wch: 8 },
      ...allFields.map(() => ({ wch: 10 })),
      { wch: 40 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Evaluations')

    const instrData = [
      ['How to use this template:'],
      [''],
      ['1. Enter scores in columns E onward using the scale:'],
      ['   1 = Needs work'],
      ['   2 = Below age appropriate'],
      ['   3 = Age appropriate'],
      ['   4 = Above age appropriate'],
      ['   5 = Exceptional'],
      [''],
      ['IMPORTANT: Scores are based on the overall age group, not just your team.'],
      ['For example, if a player has a strong arm for your team but is average for'],
      ['the overall age group, score them a 3 (Age appropriate) for throwing.'],
      [''],
      ['Most players will live in the 3s — that is completely expected and correct.'],
      ['Reserve a 5 only for truly exceptional, best-in-class skills.'],
      [''],
      ['2. Leave a cell blank if you have no rating for that skill.'],
      ['3. Pitching and Catching are optional — leave blank if not applicable.'],
      ['4. Use the Comments column for individual player notes.'],
      ['5. Save the file and upload it back at the same link.'],
      ['6. Do NOT change player names, IDs, or column headers.'],
    ]
    const wsInstr = XLSX.utils.aoa_to_sheet(instrData)
    wsInstr['!cols'] = [{ wch: 70 }]
    XLSX.utils.book_append_sheet(wb, wsInstr, 'Instructions')

    const teamSlug = selectedTeam.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
    XLSX.writeFile(wb, `coach_eval_${teamSlug}.xlsx`)
  }

  // ── XLS upload → pre-fill scores ─────────────────────────────────────────
  function handleXlsUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !formData) return

    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer
        const wb  = XLSX.read(buffer, { type: 'array' })
        const ws  = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: '' }) as any[][]

        if (raw.length < 2) return

        const headers  = (raw[0] ?? []).map((h: any) => String(h).trim())
        const idCol    = headers.findIndex(h => h.toLowerCase().includes('player id') || h.toLowerCase() === 'id')
        const commCol  = headers.findIndex(h => h.toLowerCase() === 'comments')
        const fieldCols = allFields.map(f => headers.findIndex(h => h === f.label))

        const newScores: Record<string, Record<string, number | null>> = {}
        const newComments: Record<string, string> = {}

        for (let i = 1; i < raw.length; i++) {
          const row      = raw[i]
          const playerId = idCol >= 0 ? String(row[idCol] ?? '').trim() : ''
          if (!playerId) continue

          const ps: Record<string, number | null> = {}
          allFields.forEach((f, idx) => {
            const colIdx = fieldCols[idx]
            if (colIdx < 0) return
            const val = row[colIdx]
            const num = val !== '' && val != null ? parseInt(String(val)) : null
            if (num != null && num >= 1 && num <= 5) ps[f.field_key] = num
          })
          if (Object.keys(ps).length > 0) newScores[playerId] = ps

          if (commCol >= 0) {
            const c = String(row[commCol] ?? '').trim()
            if (c) newComments[playerId] = c
          }
        }

        setScores(prev => {
          const merged = { ...prev }
          for (const [pid, ps] of Object.entries(newScores)) {
            merged[pid] = { ...(merged[pid] ?? {}), ...ps }
          }
          return merged
        })
        setPlayerComments(prev => ({ ...prev, ...newComments }))
      } catch { /* ignore parse errors */ }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  // ── Download results (post-submission) ───────────────────────────────────
  function downloadResults() {
    if (!formData) return
    const headers = ['Player', ...allFields.map(f => f.label), 'Comments']
    const rows = teamPlayers.map(p => [
      `${p.first_name} ${p.last_name}`,
      ...allFields.map(f => scores[p.id]?.[f.field_key] ?? ''),
      playerComments[p.id] ?? '',
    ])

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
    if (overallNotes.trim()) {
      XLSX.utils.sheet_add_aoa(ws, [[''], ['Overall season notes:'], [overallNotes.trim()]], { origin: rows.length + 2 })
    }
    ws['!cols'] = [{ wch: 22 }, ...allFields.map(() => ({ wch: 9 })), { wch: 50 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Evaluations')

    const slug = selectedTeam.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '')
    XLSX.writeFile(wb, `coach_eval_${slug}_submitted.xlsx`)
  }

  const s = { muted: `rgba(var(--fg-rgb),0.55)` as const, dim: `rgba(var(--fg-rgb),0.35)` as const }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg2)', color: 'var(--fg)',
    border: '0.5px solid var(--border-md)', borderRadius: '8px',
    padding: '10px 12px', fontSize: '15px',
    width: '100%', boxSizing: 'border-box',
    appearance: 'none', WebkitAppearance: 'none',
  }
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' }
  const textareaStyle: React.CSSProperties = {
    background: 'var(--bg2)', color: 'var(--fg)',
    border: '0.5px solid var(--border-md)', borderRadius: '8px',
    padding: '10px 12px', fontSize: '13px',
    width: '100%', boxSizing: 'border-box',
    resize: 'vertical', fontFamily: 'inherit',
    lineHeight: 1.5,
  }

  // ── Render ────────────────────────────────────────────────────────────────

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

  const sortedTeams = [...formData.teams].sort((a, b) => teamSortKey(a) - teamSortKey(b) || a.localeCompare(b))

  // ── Step: submitted ───────────────────────────────────────────────────────
  if (step === 'submitted') return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '3rem 1.5rem' }}>
      <div style={{ maxWidth: '520px', margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px' }}>Evaluations submitted!</h1>
          <p style={{ fontSize: '14px', color: s.muted, lineHeight: 1.6 }}>
            Thank you, {coachName}. Your evaluations for <strong>{selectedTeam}</strong> have been received.
          </p>
        </div>

        {/* Download results */}
        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1rem' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>Keep a copy for your records</div>
          <div style={{ fontSize: '13px', color: s.muted, marginBottom: '12px' }}>Download a spreadsheet with all scores and comments.</div>
          <button onClick={downloadResults} style={{
            padding: '9px 20px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
            background: 'var(--bg2)', color: 'var(--fg)',
            fontSize: '13px', fontWeight: 600, cursor: 'pointer',
          }}>
            ↓ Download my results
          </button>
        </div>

        {/* Email receipt */}
        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>Email a copy to yourself</div>
          <div style={{ fontSize: '13px', color: s.muted, marginBottom: '12px' }}>
            Leave your email and the board will have it on file for you.
          </div>
          {emailSaved ? (
            <div style={{ fontSize: '13px', color: '#6DB875', fontWeight: 600 }}>✓ Email saved — the board will be in touch.</div>
          ) : (
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="email"
                value={receiptEmail}
                onChange={e => setReceiptEmail(e.target.value)}
                placeholder="your@email.com"
                style={{ ...inputStyle, borderRadius: '6px', padding: '8px 12px', fontSize: '13px', flex: 1 }}
              />
              <button
                onClick={saveReceiptEmail}
                disabled={emailSaving || !receiptEmail.trim()}
                style={{
                  padding: '8px 16px', borderRadius: '6px', border: 'none',
                  background: 'var(--accent)', color: 'var(--accent-text)',
                  fontSize: '13px', fontWeight: 700, cursor: emailSaving || !receiptEmail.trim() ? 'default' : 'pointer',
                  opacity: emailSaving || !receiptEmail.trim() ? 0.5 : 1, flexShrink: 0,
                }}
              >
                {emailSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          )}
        </div>

        <div style={{ fontSize: '12px', color: s.dim, textAlign: 'center', lineHeight: 1.6 }}>
          Need to correct a score? Contact your administrator to unlock your submission.
        </div>
      </div>
    </main>
  )

  // ── Step: identify ────────────────────────────────────────────────────────
  if (step === 'identify') return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', maxWidth: '560px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '6px' }}>
        Coach Evaluation
      </div>
      <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '4px' }}>{formData.season.label}</h1>
      <p style={{ fontSize: '13px', color: s.muted, marginBottom: '2rem' }}>
        Rate each player on your roster. Scores are 1–5 per skill.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '2rem' }}>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: s.dim, display: 'block', marginBottom: '6px' }}>Your team</label>
          <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} style={selectStyle}>
            <option value="">Select your team…</option>
            {sortedTeams.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          {selectedTeam && (
            <div style={{ fontSize: '12px', color: s.muted, marginTop: '5px' }}>
              {teamPlayers.length} player{teamPlayers.length !== 1 ? 's' : ''} on this roster
            </div>
          )}
        </div>

        <div>
          <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: s.dim, display: 'block', marginBottom: '6px' }}>Your name</label>
          <input type="text" value={coachName} onChange={e => setCoachName(e.target.value)} placeholder="Coach Smith" style={inputStyle} />
        </div>
      </div>

      <button
        onClick={() => setStep('score')}
        disabled={!selectedTeam || !coachName.trim() || teamPlayers.length === 0}
        style={{
          width: '100%', padding: '14px', borderRadius: '8px', border: 'none',
          background: 'var(--accent)', color: 'var(--accent-text)',
          fontSize: '15px', fontWeight: 700, cursor: 'pointer',
          opacity: (!selectedTeam || !coachName.trim() || teamPlayers.length === 0) ? 0.5 : 1,
          marginBottom: '2rem',
        }}
      >
        Start evaluations →
      </button>

      {selectedTeam && teamPlayers.length === 0 && (
        <div style={{ marginBottom: '1.5rem', fontSize: '13px', color: '#E87060', textAlign: 'center' }}>
          No players found for this team. Contact your administrator.
        </div>
      )}

      {/* Instructions */}
      <div style={{
        background: 'rgba(232,160,32,0.07)', border: '0.5px solid rgba(232,160,32,0.25)',
        borderRadius: '10px', padding: '1.25rem',
      }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', marginBottom: '12px' }}>
          Before you start — please read
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: s.muted, lineHeight: 1.6 }}>
          <p style={{ margin: 0 }}>
            <strong style={{ color: 'var(--fg)' }}>Scores are based on your age group, not your specific team.</strong> For example, if a player has a strong arm on your team but is average across all players you faced in your age group this season, score them a <strong style={{ color: 'var(--fg)' }}>3 (Age appropriate)</strong> for throwing — not a 5.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: 'var(--fg)' }}>Most players will live in the 3s.</strong> That is completely expected — a 3 means "age appropriate" and is exactly where most players should be by end of season.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: 'var(--fg)' }}>Reserve a 5 for truly exceptional players</strong> — best-in-class out of everyone you've seen and played against in your age group this year.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: 'var(--fg)' }}>Be objective, thorough, and detailed in the comments.</strong> The board often finds your written commentary as valuable as the scores — please be thoughtful and intentional.
          </p>
        </div>
        <div style={{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap', fontSize: '12px' }}>
          {[
            { n: 1, label: 'Needs work' },
            { n: 2, label: 'Below age' },
            { n: 3, label: 'Age appropriate' },
            { n: 4, label: 'Above age' },
            { n: 5, label: 'Exceptional' },
          ].map(({ n, label }) => (
            <span key={n} style={{
              padding: '3px 10px', borderRadius: '20px', fontWeight: 600,
              background: scoreColor(n), color: 'var(--fg)',
              border: '0.5px solid rgba(var(--fg-rgb),0.1)',
            }}>
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
        {/* Header */}
        <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)', borderBottom: '0.5px solid var(--border)', padding: '12px 1.5rem' }}>
          <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700 }}>Review — {selectedTeam}</div>
              <div style={{ fontSize: '11px', color: s.dim }}>{coachName} · {formData.season.label}</div>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setStep('score')} style={{
                padding: '7px 16px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
                background: 'var(--bg2)', color: 'var(--fg)',
                fontSize: '13px', fontWeight: 600, cursor: 'pointer',
              }}>← Back to edit</button>
              <button onClick={handleSubmit} disabled={submitting} style={{
                padding: '7px 18px', borderRadius: '6px', border: 'none',
                background: 'var(--accent)', color: 'var(--accent-text)',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1,
              }}>
                {submitting ? 'Submitting…' : 'Submit →'}
              </button>
            </div>
          </div>
        </div>

        <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '1.5rem 1.5rem 6rem' }}>
          <div style={{ fontSize: '14px', color: s.muted, marginBottom: '1rem' }}>
            Review your scores below. Click <strong style={{ color: 'var(--fg)' }}>← Back to edit</strong> to make changes before submitting.
          </div>

          {submitError && (
            <div style={{ padding: '10px 14px', background: 'rgba(232,112,96,0.1)', border: '0.5px solid rgba(232,112,96,0.3)', borderRadius: '8px', fontSize: '13px', color: '#E87060', marginBottom: '1rem' }}>
              {submitError}
            </div>
          )}

          {/* Score review table */}
          <div style={{ overflowX: 'auto', marginBottom: '1.5rem' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, fontSize: '11px', color: s.dim, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: '150px', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 1 }}>
                    Player
                  </th>
                  {allFields.map(f => (
                    <th key={f.field_key} title={f.label} style={{
                      textAlign: 'center', padding: '6px 4px', fontWeight: 600, fontSize: '10px',
                      color: s.dim, textTransform: 'uppercase', letterSpacing: '0.04em',
                      minWidth: '52px', maxWidth: '64px',
                    }}>
                      {f.label.length > 9 ? f.label.slice(0, 8) + '…' : f.label}
                    </th>
                  ))}
                  <th style={{ textAlign: 'left', padding: '6px 10px', fontWeight: 600, fontSize: '11px', color: s.dim, textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: '160px' }}>
                    Comments
                  </th>
                </tr>
              </thead>
              <tbody>
                {teamPlayers.map((p, i) => {
                  const ps = scores[p.id] ?? {}
                  const complete = requiredFields.every(f => ps[f.field_key] != null)
                  return (
                    <tr key={p.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(var(--fg-rgb),0.02)', borderBottom: '0.5px solid rgba(var(--fg-rgb),0.05)' }}>
                      <td style={{ padding: '7px 10px', fontWeight: 600, position: 'sticky', left: 0, background: i % 2 === 0 ? 'var(--bg)' : 'var(--bg)', zIndex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          {p.last_name}, {p.first_name}
                          {!complete && <span title="Missing required scores" style={{ fontSize: '10px', color: '#E8A020' }}>⚠</span>}
                        </div>
                      </td>
                      {allFields.map(f => {
                        const v = ps[f.field_key] ?? null
                        const na = isNa(p.id, sections.find(sec => sec.fields.some(sf => sf.field_key === f.field_key))?.key ?? '')
                        return (
                          <td key={f.field_key} style={{ padding: '4px 2px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block', width: '30px', height: '26px', lineHeight: '26px',
                              borderRadius: '5px', fontWeight: 700, fontSize: '13px',
                              background: na ? 'rgba(var(--fg-rgb),0.04)' : scoreColor(v),
                              color: v != null && !na ? 'var(--fg)' : s.dim,
                            }}>
                              {na ? 'N/A' : (v ?? '—')}
                            </span>
                          </td>
                        )
                      })}
                      <td style={{ padding: '7px 10px', fontSize: '12px', color: s.muted, maxWidth: '200px' }}>
                        {playerComments[p.id]
                          ? <span>{playerComments[p.id].length > 60 ? playerComments[p.id].slice(0, 58) + '…' : playerComments[p.id]}</span>
                          : <span style={{ opacity: 0.35, fontStyle: 'italic' }}>—</span>
                        }
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Overall notes preview */}
          {overallNotes.trim() && (
            <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '1rem', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: s.dim, marginBottom: '6px' }}>
                Overall season notes
              </div>
              <div style={{ fontSize: '13px', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{overallNotes}</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={handleSubmit} disabled={submitting} style={{
              padding: '12px 28px', borderRadius: '8px', border: 'none',
              background: 'var(--accent)', color: 'var(--accent-text)',
              fontSize: '14px', fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1,
            }}>
              {submitting ? 'Submitting…' : 'Submit evaluations'}
            </button>
            <button onClick={() => setStep('score')} style={{
              padding: '12px 16px', borderRadius: '8px', border: '0.5px solid var(--border-md)',
              background: 'transparent', color: s.muted, fontSize: '13px', cursor: 'pointer',
            }}>
              ← Back to edit
            </button>
          </div>
        </div>
      </main>
    )
  }

  // ── Step: score ───────────────────────────────────────────────────────────
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif' }}>
      {/* Sticky header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg)', borderBottom: '0.5px solid var(--border)', padding: '12px 1.5rem' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '13px', fontWeight: 700 }}>{selectedTeam}</div>
            <div style={{ fontSize: '11px', color: s.dim }}>{coachName} · {formData.season.label}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ fontSize: '12px', color: progress.pct === 100 ? '#6DB875' : s.muted, fontWeight: 600 }}>
              {progress.filled}/{progress.total} complete
            </div>
            <div style={{ width: '80px', height: '4px', borderRadius: '2px', background: 'var(--border-md)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${progress.pct}%`, background: progress.pct === 100 ? '#6DB875' : 'var(--accent)', borderRadius: '2px', transition: 'width 0.3s' }} />
            </div>
            <button
              onClick={() => setStep('review')}
              style={{ padding: '7px 18px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}
            >
              Review →
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem 1.5rem 6rem' }}>
        {/* XLS tools */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <button onClick={downloadTemplate} style={{ padding: '7px 14px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'var(--bg2)', color: s.muted, fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            ↓ Download template
          </button>
          <label style={{ padding: '7px 14px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'var(--bg2)', color: s.muted, fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            ↑ Upload filled XLS
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleXlsUpload} />
          </label>
          <span style={{ fontSize: '12px', color: s.dim, alignSelf: 'center' }}>or fill in the form below</span>
        </div>

        {/* Scale reminder */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1.5rem', fontSize: '11px' }}>
          {[
            { n: 1, label: 'Needs work' },
            { n: 2, label: 'Below age' },
            { n: 3, label: 'Age appropriate' },
            { n: 4, label: 'Above age' },
            { n: 5, label: 'Exceptional' },
          ].map(({ n, label }) => (
            <span key={n} style={{
              padding: '3px 9px', borderRadius: '20px', fontWeight: 600,
              background: scoreColor(n), color: 'var(--fg)',
              border: '0.5px solid rgba(var(--fg-rgb),0.1)',
            }}>
              {n} — {label}
            </span>
          ))}
        </div>

        {/* Player cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {teamPlayers.map(player => {
            const playerScores = scores[player.id] ?? {}
            const requiredFields = sections.filter(s => !s.is_optional).flatMap(s => s.fields)
            const complete = requiredFields.every(f => playerScores[f.field_key] != null)

            return (
              <div key={player.id} style={{
                background: 'var(--bg-card)', border: `0.5px solid ${complete ? 'rgba(109,184,117,0.35)' : 'var(--border)'}`,
                borderRadius: '12px', overflow: 'hidden',
              }}>
                {/* Player header */}
                <div style={{ padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '0.5px solid var(--border)' }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: '14px' }}>{player.first_name} {player.last_name}</span>
                    <span style={{ fontSize: '11px', color: s.dim, marginLeft: '8px' }}>{player.age_group}</span>
                  </div>
                  {complete && <span style={{ fontSize: '11px', color: '#6DB875', fontWeight: 700 }}>✓ Complete</span>}
                </div>

                {/* Sections */}
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {sections.map(section => {
                    const na = isNa(player.id, section.key)
                    return (
                      <div key={section.key}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: s.muted }}>
                            {section.label}
                          </div>
                          {section.is_optional && (
                            <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: s.muted, cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={na}
                                onChange={() => toggleNa(player.id, section.key, section.fields)}
                              />
                              N/A
                            </label>
                          )}
                        </div>

                        {na ? (
                          <div style={{ fontSize: '12px', color: s.dim, fontStyle: 'italic' }}>Not applicable for this player</div>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                            {section.fields.map(field => {
                              const val = playerScores[field.field_key] ?? null
                              return (
                                <div key={field.field_key} style={{ minWidth: '140px', flex: '1 1 140px' }}>
                                  <div style={{ fontSize: '11px', color: s.dim, marginBottom: '3px' }}>{field.label}</div>
                                  <select
                                    value={val ?? ''}
                                    onChange={e => setScore(player.id, field.field_key, e.target.value ? parseInt(e.target.value) : null)}
                                    style={{
                                      width: '100%', background: val != null ? scoreColor(val) : 'var(--bg2)',
                                      border: `0.5px solid ${val == null ? 'var(--border-md)' : val >= 4 ? 'rgba(109,184,117,0.5)' : val === 3 ? 'rgba(80,160,232,0.4)' : 'rgba(232,112,96,0.5)'}`,
                                      borderRadius: '6px', padding: '6px 8px', fontSize: '13px',
                                      color: 'var(--fg)',
                                      appearance: 'none', WebkitAppearance: 'none',
                                      cursor: 'pointer',
                                    }}
                                  >
                                    <option value="">—</option>
                                    {[1, 2, 3, 4, 5].map(n => (
                                      <option key={n} value={n}>{n}</option>
                                    ))}
                                  </select>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}

                  {/* Per-player comments */}
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: s.muted, marginBottom: '6px' }}>
                      Comments
                    </div>
                    <textarea
                      value={playerComments[player.id] ?? ''}
                      onChange={e => setPlayerComments(prev => ({ ...prev, [player.id]: e.target.value }))}
                      placeholder="Add notes about this player's strengths, areas to develop, coachability, attitude, etc."
                      rows={3}
                      style={textareaStyle}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Overall season notes */}
        <div style={{ marginTop: '1.5rem', background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1.25rem' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>Overall season notes</div>
          <div style={{ fontSize: '12px', color: s.muted, marginBottom: '10px' }}>
            General observations about your team, season highlights, trends, or anything you'd like the board to know.
          </div>
          <textarea
            value={overallNotes}
            onChange={e => setOverallNotes(e.target.value)}
            placeholder="e.g. Great group overall — improved significantly in the second half of the season. Several players showed strong leadership. Pitching depth was a challenge but most kids adapted well..."
            rows={5}
            style={textareaStyle}
          />
        </div>

        {/* Bottom CTA */}
        <div style={{ marginTop: '1.5rem', padding: '1.25rem', background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>Ready to review?</div>
          <div style={{ fontSize: '13px', color: s.muted, marginBottom: '1rem' }}>
            {progress.filled} of {progress.total} players fully rated.
            {progress.pct < 100 && ' You can submit with partial scores.'}
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setStep('review')}
              style={{ padding: '12px 28px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
            >
              Review before submitting →
            </button>
            <button
              onClick={() => setStep('identify')}
              style={{ padding: '12px 16px', borderRadius: '8px', border: '0.5px solid var(--border-md)', background: 'transparent', color: s.muted, fontSize: '13px', cursor: 'pointer' }}
            >
              ← Change team
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
