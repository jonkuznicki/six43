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

const SCORE_LABELS = ['', '1 – Needs work', '2 – Below age', '3 – Age appropriate', '4 – Above age', '5 – Exceptional']

function teamSortKey(t: string): number {
  const m = t.match(/^(\d+)/)
  return m ? parseInt(m[1]) : 999
}

export default function PublicEvalPage({ params }: { params: { token: string } }) {
  const supabase = createClient()

  const [formData,    setFormData]    = useState<FormData | null>(null)
  const [loadError,   setLoadError]   = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)

  const [step,        setStep]        = useState<'identify' | 'score' | 'submitted'>('identify')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [coachName,   setCoachName]   = useState('')

  // scores[playerId][fieldKey] = 1-5 | null
  const [scores,      setScores]      = useState<Record<string, Record<string, number | null>>>({})
  // naFlags[playerId] = Set of optional section keys the coach marked N/A
  const [naFlags,     setNaFlags]     = useState<Record<string, Set<string>>>({})

  const [submitting,  setSubmitting]  = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

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
      key:        s,
      label:      SECTION_LABELS[s] ?? s,
      fields:     bySection[s].sort((a, b) => a.sort_order - b.sort_order),
      is_optional: bySection[s][0]?.is_optional ?? false,
    }))
  }, [formData])

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
        // Clear scores for this section
        setScores(ps => {
          const playerScores = { ...(ps[playerId] ?? {}) }
          for (const f of fields) delete playerScores[f.field_key]
          return { ...ps, [playerId]: playerScores }
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
      const playerScores = scores[p.id] ?? {}
      if (required.every(k => playerScores[k] != null)) filled++
    }
    return { filled, total: teamPlayers.length, pct: teamPlayers.length > 0 ? Math.round(filled / teamPlayers.length * 100) : 0 }
  }, [scores, teamPlayers, sections])

  async function handleSubmit() {
    if (!coachName.trim()) { setSubmitError('Please enter your name.'); return }
    if (teamPlayers.length === 0) { setSubmitError('No players found for this team.'); return }

    setSubmitting(true)
    setSubmitError(null)

    const playerScores: Record<string, Record<string, number>> = {}
    for (const p of teamPlayers) {
      const s = scores[p.id] ?? {}
      const filtered: Record<string, number> = {}
      for (const [k, v] of Object.entries(s)) {
        if (v != null) filtered[k] = v
      }
      if (Object.keys(filtered).length > 0) playerScores[p.id] = filtered
    }

    const { data, error } = await supabase.rpc('tryout_submit_eval_by_token', {
      p_token:         params.token,
      p_team_label:    selectedTeam,
      p_coach_name:    coachName.trim(),
      p_player_scores: playerScores,
    })

    if (error || data?.error) {
      setSubmitError(error?.message ?? data?.error ?? 'Submission failed.')
      setSubmitting(false)
      return
    }

    setStep('submitted')
    setSubmitting(false)
  }

  // ── XLS template download ─────────────────────────────────────────────────
  function downloadTemplate() {
    if (!formData || teamPlayers.length === 0) return
    const allFields = sections.flatMap(s => s.fields)
    const headers   = ['Player ID', 'First Name', 'Last Name', 'Age Group', ...allFields.map(f => f.label)]
    const dataRows  = teamPlayers.map(p => [p.id, p.first_name, p.last_name, p.age_group, ...allFields.map(() => '')])

    const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows])

    // Hide player ID column (width 0), widen name columns
    ws['!cols'] = [
      { hidden: true },
      { wch: 14 }, { wch: 16 }, { wch: 8 },
      ...allFields.map(() => ({ wch: 10 })),
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Evaluations')

    // Instructions sheet
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
      ['2. Leave a cell blank if you have no rating for that skill.'],
      ['3. Pitching and Catching are optional — leave blank if not applicable.'],
      ['4. Save the file and upload it back at the same link.'],
      ['5. Do NOT change player names, IDs, or column headers.'],
    ]
    const wsInstr = XLSX.utils.aoa_to_sheet(instrData)
    wsInstr['!cols'] = [{ wch: 60 }]
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

        const headers = (raw[0] ?? []).map((h: any) => String(h).trim())
        const idCol   = headers.findIndex(h => h.toLowerCase().includes('player id') || h.toLowerCase() === 'id')

        const allFields = sections.flatMap(s => s.fields)
        const fieldCols = allFields.map(f => headers.findIndex(h => h === f.label))

        const newScores: Record<string, Record<string, number | null>> = {}

        for (let i = 1; i < raw.length; i++) {
          const row      = raw[i]
          const playerId = idCol >= 0 ? String(row[idCol] ?? '').trim() : ''
          if (!playerId) continue

          const playerScores: Record<string, number | null> = {}
          allFields.forEach((f, idx) => {
            const colIdx = fieldCols[idx]
            if (colIdx < 0) return
            const val = row[colIdx]
            const num = val !== '' && val != null ? parseInt(String(val)) : null
            if (num != null && num >= 1 && num <= 5) playerScores[f.field_key] = num
          })
          if (Object.keys(playerScores).length > 0) newScores[playerId] = playerScores
        }

        setScores(prev => {
          const merged = { ...prev }
          for (const [pid, s] of Object.entries(newScores)) {
            merged[pid] = { ...(merged[pid] ?? {}), ...s }
          }
          return merged
        })
      } catch { /* ignore parse errors */ }
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  const s = { muted: `rgba(var(--fg-rgb),0.55)`, dim: `rgba(var(--fg-rgb),0.35)` }

  // Solid backgrounds for form controls so selects render correctly in dark
  // mode across all browsers (transparent rgba backgrounds can show white
  // native control backgrounds, making light text invisible).
  const inputStyle: React.CSSProperties = {
    background: 'var(--bg2)', color: 'var(--fg)',
    border: '0.5px solid var(--border-md)', borderRadius: '8px',
    padding: '10px 12px', fontSize: '15px',
    width: '100%', boxSizing: 'border-box',
    appearance: 'none', WebkitAppearance: 'none',
  }
  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
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
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ textAlign: 'center', maxWidth: '400px' }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>✅</div>
        <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px' }}>Evaluations submitted!</h1>
        <p style={{ fontSize: '14px', color: s.muted, lineHeight: 1.6 }}>
          Thank you, {coachName}. Your evaluations for <strong>{selectedTeam}</strong> have been received.
        </p>
        <p style={{ fontSize: '13px', color: s.dim, marginTop: '1rem' }}>You can close this window.</p>
      </div>
    </main>
  )

  // ── Step: identify ────────────────────────────────────────────────────────
  if (step === 'identify') return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', maxWidth: '480px', margin: '0 auto', padding: '3rem 1.5rem' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '6px' }}>
        Coach Evaluation
      </div>
      <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '4px' }}>{formData.season.label}</h1>
      <p style={{ fontSize: '13px', color: s.muted, marginBottom: '2.5rem' }}>
        Rate each player on your roster. Scores are 1–5 per skill.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '2rem' }}>
        <div>
          <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: s.dim, display: 'block', marginBottom: '6px' }}>Your team</label>
          <select
            value={selectedTeam}
            onChange={e => setSelectedTeam(e.target.value)}
            style={selectStyle}
          >
            <option value="">Select your team…</option>
            {sortedTeams.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {selectedTeam && (
            <div style={{ fontSize: '12px', color: s.muted, marginTop: '5px' }}>
              {teamPlayers.length} player{teamPlayers.length !== 1 ? 's' : ''} on this roster
            </div>
          )}
        </div>

        <div>
          <label style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: s.dim, display: 'block', marginBottom: '6px' }}>Your name</label>
          <input
            type="text"
            value={coachName}
            onChange={e => setCoachName(e.target.value)}
            placeholder="Coach Smith"
            style={inputStyle}
          />
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
        }}
      >
        Start evaluations →
      </button>

      {selectedTeam && teamPlayers.length === 0 && (
        <div style={{ marginTop: '12px', fontSize: '13px', color: '#E87060', textAlign: 'center' }}>
          No players found for this team. Contact your administrator.
        </div>
      )}
    </main>
  )

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
              onClick={handleSubmit}
              disabled={submitting}
              style={{ padding: '7px 18px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? 'Submitting…' : 'Submit →'}
            </button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '900px', margin: '0 auto', padding: '1.5rem 1.5rem 6rem' }}>
        {submitError && (
          <div style={{ padding: '10px 14px', background: 'rgba(232,112,96,0.1)', border: '0.5px solid rgba(232,112,96,0.3)', borderRadius: '8px', fontSize: '13px', color: '#E87060', marginBottom: '1rem' }}>
            {submitError}
          </div>
        )}

        {/* XLS tools */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          <button onClick={downloadTemplate} style={{ padding: '7px 14px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: s.muted, fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            ↓ Download template
          </button>
          <label style={{ padding: '7px 14px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: s.muted, fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
            ↑ Upload filled XLS
            <input type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleXlsUpload} />
          </label>
          <span style={{ fontSize: '12px', color: s.dim, alignSelf: 'center' }}>or fill in the form below</span>
        </div>

        <div style={{ fontSize: '11px', color: s.dim, marginBottom: '1.5rem' }}>
          Scale: 1 = Needs work · 2 = Below age · 3 = Age appropriate · 4 = Above age · 5 = Exceptional
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
                                      width: '100%', background: 'var(--bg2)',
                                      border: `0.5px solid ${val == null ? 'var(--border-md)' : val >= 4 ? 'rgba(109,184,117,0.5)' : val === 3 ? 'rgba(232,160,32,0.5)' : 'rgba(232,112,96,0.5)'}`,
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
                </div>
              </div>
            )
          })}
        </div>

        {/* Bottom submit */}
        <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>Ready to submit?</div>
          <div style={{ fontSize: '13px', color: s.muted, marginBottom: '1rem' }}>
            {progress.filled} of {progress.total} players fully rated.
            {progress.pct < 100 && ' You can still submit with partial scores.'}
          </div>
          {submitError && (
            <div style={{ fontSize: '13px', color: '#E87060', marginBottom: '10px' }}>{submitError}</div>
          )}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{ padding: '12px 28px', borderRadius: '8px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '14px', fontWeight: 700, cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}
            >
              {submitting ? 'Submitting…' : 'Submit evaluations'}
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
