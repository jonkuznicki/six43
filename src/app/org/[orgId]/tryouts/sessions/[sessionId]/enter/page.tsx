'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createClient } from '../../../../../../../lib/supabase'
import Link from 'next/link'
import { computeTryoutScore, ScoringCategory } from '../../../../../../../lib/tryouts/computeScore'

// Sub-keys that belong to tiebreaker categories (speed) — accept decimal seconds, not 1-5
const TIEBREAKER_KEYS = new Set<string>()

interface Checkin {
  id: string; tryout_number: number; player_id: string | null
  is_write_in: boolean; write_in_name: string | null
  player?: { first_name: string; last_name: string }
}

interface Evaluator {
  id: string; name: string | null; email: string; locked_at: string | null
}

interface Session {
  id: string; label: string; age_group: string; season_id: string
}

type GridValues = Record<string, Record<string, string>>   // playerId → subKey → raw input

export default function AdminEntryPage({ params }: { params: { orgId: string; sessionId: string } }) {
  const supabase = createClient()

  const [session,       setSession]       = useState<Session | null>(null)
  const [categories,    setCategories]    = useState<ScoringCategory[]>([])
  const [checkins,      setCheckins]      = useState<Checkin[]>([])
  const [evaluators,    setEvaluators]    = useState<Evaluator[]>([])
  const [selectedEval,  setSelectedEval]  = useState('')
  const [grid,          setGrid]          = useState<GridValues>({})
  const [naFlags,       setNaFlags]       = useState<Record<string, Set<string>>>({}) // playerId → Set<catKey>
  const [comments,      setComments]      = useState<Record<string, string>>({})
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState<string | null>(null)
  const [savedAt,       setSavedAt]       = useState<Date | null>(null)
  const [locking,       setLocking]       = useState(false)

  // New evaluator form
  const [addingEval,    setAddingEval]    = useState(false)
  const [newEvalName,   setNewEvalName]   = useState('')

  const saveTimer = useRef<ReturnType<typeof setTimeout>>()
  const inputRefs = useRef<(HTMLInputElement | null)[][]>([])

  useEffect(() => { loadSession() }, [])
  useEffect(() => { if (selectedEval) loadScores(selectedEval) }, [selectedEval])

  async function loadSession() {
    const { data: sess } = await supabase
      .from('tryout_sessions').select('id, label, age_group, season_id')
      .eq('id', params.sessionId).single()
    setSession(sess)
    if (!sess) { setLoading(false); return }

    const [{ data: catData }, { data: checkinData }, { data: evalData }] = await Promise.all([
      supabase.from('tryout_scoring_config')
        .select('category, label, weight, is_optional, is_tiebreaker, subcategories, sort_order')
        .eq('season_id', sess.season_id).order('sort_order'),
      supabase.from('tryout_checkins')
        .select('id, tryout_number, player_id, is_write_in, write_in_name, tryout_players(first_name, last_name)')
        .eq('session_id', params.sessionId).order('tryout_number'),
      supabase.from('tryout_session_evaluators')
        .select('id, name, email, locked_at')
        .eq('session_id', params.sessionId),
    ])

    const cats = (catData ?? []).map((c: any) => ({
      category: c.category, label: c.label, weight: c.weight,
      is_optional: c.is_optional, is_tiebreaker: c.is_tiebreaker ?? false,
      subcategories: c.subcategories ?? [],
    }))
    // Populate tiebreaker key set so inputs can behave differently
    TIEBREAKER_KEYS.clear()
    for (const cat of cats) {
      if (cat.is_tiebreaker) {
        for (const sub of cat.subcategories) TIEBREAKER_KEYS.add(sub.key)
      }
    }
    setCategories(cats)
    setCheckins((checkinData ?? []).map((c: any) => ({
      id: c.id, tryout_number: c.tryout_number, player_id: c.player_id,
      is_write_in: c.is_write_in, write_in_name: c.write_in_name,
      player: c.tryout_players ?? null,
    })))
    setEvaluators(evalData ?? [])
    if (evalData && evalData.length > 0) setSelectedEval(evalData[0].id)
    setLoading(false)
  }

  async function loadScores(evalId: string) {
    const evaluator = evaluators.find(e => e.id === evalId)
    if (!evaluator) return

    // Get the actual user_id for this evaluator via their member record
    const { data: memberData } = await supabase
      .from('tryout_org_members').select('user_id').eq('id', evaluator.id).maybeSingle()
    const userId = memberData?.user_id

    if (!userId) { setGrid({}); setComments({}); return }

    const { data: scoreData } = await supabase
      .from('tryout_scores').select('player_id, scores, comments')
      .eq('session_id', params.sessionId).eq('evaluator_id', userId)

    const newGrid: GridValues = {}
    const newComments: Record<string, string> = {}
    const newNa: Record<string, Set<string>> = {}

    for (const sc of (scoreData ?? [])) {
      newGrid[sc.player_id] = {}
      for (const [k, v] of Object.entries(sc.scores ?? {})) {
        newGrid[sc.player_id][k] = v == null ? '' : String(v)
      }
      newComments[sc.player_id] = sc.comments ?? ''
    }
    setGrid(newGrid)
    setComments(newComments)
    setNaFlags(newNa)
  }

  const allSubcategories = useMemo(() => {
    const subs: Array<{ catKey: string; catLabel: string; key: string; label: string; isOptional: boolean }> = []
    for (const cat of categories) {
      for (const sub of cat.subcategories) {
        subs.push({ catKey: cat.category, catLabel: cat.label, key: sub.key, label: sub.label, isOptional: cat.is_optional })
      }
    }
    return subs
  }, [categories])

  function isNa(playerId: string, catKey: string) {
    return naFlags[playerId]?.has(catKey) ?? false
  }

  function toggleNa(playerId: string, catKey: string) {
    setNaFlags(prev => {
      const set = new Set(prev[playerId] ?? [])
      if (set.has(catKey)) set.delete(catKey)
      else {
        set.add(catKey)
        // Clear scores for this category
        const cat = categories.find(c => c.category === catKey)
        if (cat) {
          setGrid(g => {
            const row = { ...(g[playerId] ?? {}) }
            for (const s of cat.subcategories) row[s.key] = ''
            return { ...g, [playerId]: row }
          })
        }
      }
      return { ...prev, [playerId]: set }
    })
  }

  function handleCellChange(playerId: string, subKey: string, val: string) {
    // Tiebreaker (speed): raw decimal seconds — no range clamping
    // Regular scores: integer 1–5
    const num = val === ''
      ? ''
      : TIEBREAKER_KEYS.has(subKey)
        ? val  // allow any decimal, e.g. "7.82"
        : String(Math.min(5, Math.max(1, parseInt(val) || 0)))
    setGrid(prev => ({ ...prev, [playerId]: { ...(prev[playerId] ?? {}), [subKey]: num } }))
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => autoSave(playerId), 1000)
  }

  const autoSave = useCallback(async (playerId: string) => {
    const evaluator = evaluators.find(e => e.id === selectedEval)
    if (!evaluator || evaluator.locked_at) return

    const { data: memberData } = await supabase
      .from('tryout_org_members').select('user_id').eq('id', evaluator.id).maybeSingle()
    const userId = memberData?.user_id
    if (!userId) return

    const row = grid[playerId] ?? {}
    const scores: Record<string, number | null> = {}
    for (const [k, v] of Object.entries(row)) {
      scores[k] = v === '' ? null : parseFloat(v)
    }
    const tryoutScore = computeTryoutScore(scores, categories)

    setSaving(playerId)
    await supabase.from('tryout_scores').upsert({
      player_id: playerId, session_id: params.sessionId, org_id: params.orgId,
      evaluator_id: userId, evaluator_name: evaluator.name ?? evaluator.email,
      scores, tryout_score: tryoutScore, comments: comments[playerId] ?? null,
      submitted_at: new Date().toISOString(),
    }, { onConflict: 'player_id,session_id,evaluator_id' })
    setSaving(null)
    setSavedAt(new Date())
  }, [grid, categories, evaluators, selectedEval, comments])

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, rowIdx: number, colIdx: number) {
    const refs = inputRefs.current
    if (e.key === 'ArrowRight' || e.key === 'Enter') {
      e.preventDefault()
      refs[rowIdx]?.[colIdx + 1]?.focus()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      refs[rowIdx]?.[colIdx - 1]?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      refs[rowIdx + 1]?.[colIdx]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      refs[rowIdx - 1]?.[colIdx]?.focus()
    }
  }

  async function lockEvaluator() {
    const evaluator = evaluators.find(e => e.id === selectedEval)
    if (!evaluator) return
    setLocking(true)
    await supabase.from('tryout_session_evaluators').update({ locked_at: new Date().toISOString() }).eq('id', selectedEval)
    setEvaluators(prev => prev.map(e => e.id === selectedEval ? { ...e, locked_at: new Date().toISOString() } : e))
    setLocking(false)
  }

  async function addEvaluator() {
    if (!newEvalName.trim()) return
    const { data } = await supabase.from('tryout_session_evaluators').insert({
      session_id: params.sessionId, org_id: params.orgId,
      name: newEvalName.trim(), email: '',
    }).select('id, name, email, locked_at').single()
    if (data) {
      setEvaluators(prev => [...prev, data])
      setSelectedEval(data.id)
    }
    setNewEvalName('')
    setAddingEval(false)
  }

  function rowCompleteness(playerId: string): 'empty' | 'partial' | 'complete' {
    const row = grid[playerId]
    if (!row) return 'empty'
    const vals = allSubcategories
      .filter(s => !isNa(playerId, s.catKey))
      .map(s => row[s.key])
      .filter(v => v !== undefined)
    if (vals.every(v => !v || v === '')) return 'empty'
    if (vals.every(v => v && v !== '')) return 'complete'
    return 'partial'
  }

  const currentEvaluator = evaluators.find(e => e.id === selectedEval)
  const isLocked         = !!currentEvaluator?.locked_at
  const completeCount    = checkins.filter(c => c.player_id && rowCompleteness(c.player_id) === 'complete').length

  const s = { muted: `rgba(var(--fg-rgb),0.55)`, dim: `rgba(var(--fg-rgb),0.35)` }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>
  )

  // Group subcategories by category header for the column headers
  const catGroups: Array<{ label: string; key: string; isOptional: boolean; isTiebreaker: boolean; subs: typeof allSubcategories }> = []
  for (const cat of categories) {
    catGroups.push({
      label: cat.label, key: cat.category, isOptional: cat.is_optional,
      isTiebreaker: cat.is_tiebreaker,
      subs: allSubcategories.filter(s => s.catKey === cat.category),
    })
  }

  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '1.5rem 1rem 4rem' }}>
      <Link href={`/org/${params.orgId}/tryouts/sessions/${params.sessionId}`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1rem' }}>‹ Session</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '2px' }}>Enter Scores</h1>
          <div style={{ fontSize: '13px', color: s.muted }}>{session?.label} · {session?.age_group}</div>
        </div>
        <div style={{ fontSize: '12px', color: s.dim }}>
          {savedAt && `Saved ${savedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`}
          {saving && 'Saving…'}
        </div>
      </div>

      {/* Evaluator selector */}
      <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <label style={{ fontSize: '12px', color: s.muted, fontWeight: 600 }}>Evaluator</label>
          <select value={selectedEval} onChange={e => setSelectedEval(e.target.value)} style={{
            background: 'var(--bg-input)', border: '0.5px solid var(--border-md)',
            borderRadius: '6px', padding: '6px 10px', fontSize: '13px', color: 'var(--fg)',
          }}>
            {evaluators.map(ev => (
              <option key={ev.id} value={ev.id}>
                {ev.name ?? ev.email}{ev.locked_at ? ' 🔒' : ''}
              </option>
            ))}
          </select>

          {!addingEval && (
            <button onClick={() => setAddingEval(true)} style={{
              padding: '5px 12px', borderRadius: '5px', border: '0.5px solid var(--border-md)',
              background: 'var(--bg-input)', color: s.muted, fontSize: '12px', cursor: 'pointer',
            }}>+ Evaluator</button>
          )}

          {addingEval && (
            <>
              <input value={newEvalName} onChange={e => setNewEvalName(e.target.value)}
                placeholder="Evaluator name" autoFocus
                style={{ background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '5px', padding: '5px 8px', fontSize: '13px', color: 'var(--fg)' }}
                onKeyDown={e => e.key === 'Enter' && addEvaluator()}
              />
              <button onClick={addEvaluator} style={{
                padding: '5px 12px', borderRadius: '5px', border: 'none',
                background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '12px', cursor: 'pointer',
              }}>Add</button>
              <button onClick={() => setAddingEval(false)} style={{
                padding: '5px 8px', borderRadius: '5px', border: '0.5px solid var(--border-md)',
                background: 'transparent', color: s.muted, fontSize: '12px', cursor: 'pointer',
              }}>Cancel</button>
            </>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: s.dim }}>{completeCount}/{checkins.length} complete</span>
            {!isLocked && currentEvaluator && (
              <button onClick={lockEvaluator} disabled={locking} style={{
                padding: '5px 14px', borderRadius: '5px', border: '0.5px solid rgba(109,184,117,0.5)',
                background: 'rgba(109,184,117,0.1)', color: '#6DB875', fontSize: '12px', cursor: 'pointer',
              }}>🔒 Lock scores</button>
            )}
            {isLocked && (
              <span style={{ fontSize: '12px', color: '#6DB875', fontWeight: 600 }}>
                🔒 Locked {currentEvaluator?.locked_at ? new Date(currentEvaluator.locked_at).toLocaleDateString() : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Score grid */}
      {checkins.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: s.dim }}>
          No players checked in. <Link href={`/org/${params.orgId}/tryouts/sessions/${params.sessionId}/checkin`} style={{ color: 'var(--accent)' }}>Check in players →</Link>
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: '100%', fontSize: '12px' }}>
            <thead>
              {/* Category header row */}
              <tr>
                <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '0.5px solid var(--border)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 2, minWidth: '160px', fontSize: '12px', color: s.dim }}>#  Player</th>
                {catGroups.map(grp => (
                  <th key={grp.key} colSpan={grp.subs.length} style={{
                    padding: '4px 6px', textAlign: 'center', borderBottom: '0.5px solid var(--border)',
                    borderLeft: '0.5px solid var(--border-md)',
                    fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                    color: grp.isTiebreaker ? s.dim : s.muted, background: 'var(--bg)',
                    whiteSpace: 'nowrap',
                  }}>
                    {grp.label}{grp.isOptional ? ' *' : ''}{grp.isTiebreaker ? ' (sec)' : ''}
                  </th>
                ))}
                <th style={{ padding: '4px 8px', borderBottom: '0.5px solid var(--border)', borderLeft: '0.5px solid var(--border-md)', fontSize: '11px', color: s.dim, minWidth: '80px' }}>Comment</th>
              </tr>
              {/* Subcategory header row */}
              <tr>
                <th style={{ padding: '4px 8px', borderBottom: '2px solid var(--border)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 2 }} />
                {allSubcategories.map((sub, i) => (
                  <th key={`${sub.catKey}-${sub.key}`} style={{
                    padding: '4px 6px', textAlign: 'center', borderBottom: '2px solid var(--border)',
                    borderLeft: i > 0 && allSubcategories[i - 1].catKey !== sub.catKey ? '0.5px solid var(--border-md)' : undefined,
                    fontSize: '11px', color: s.dim, fontWeight: 600, minWidth: '40px',
                    background: 'var(--bg)',
                  }}>{sub.label.slice(0, 5)}</th>
                ))}
                <th style={{ borderBottom: '2px solid var(--border)', borderLeft: '0.5px solid var(--border-md)', background: 'var(--bg)' }} />
              </tr>
            </thead>
            <tbody>
              {checkins.map((c, rowIdx) => {
                const playerId = c.player_id
                const name = c.is_write_in ? (c.write_in_name ?? 'Write-in') : c.player ? `${c.player.first_name} ${c.player.last_name}` : 'Unknown'
                const completeness = playerId ? rowCompleteness(playerId) : 'empty'
                const rowBg = completeness === 'complete' ? 'rgba(109,184,117,0.07)' : completeness === 'partial' ? 'rgba(232,160,32,0.07)' : 'transparent'

                inputRefs.current[rowIdx] = inputRefs.current[rowIdx] ?? []

                return (
                  <tr key={c.id} style={{ background: rowBg }}>
                    {/* Player name — sticky */}
                    <td style={{
                      padding: '5px 8px', borderBottom: '0.5px solid var(--border)',
                      position: 'sticky', left: 0, background: rowBg || 'var(--bg)', zIndex: 1,
                      fontWeight: 600, whiteSpace: 'nowrap',
                    }}>
                      <span style={{ color: 'var(--accent)', fontWeight: 700, marginRight: '6px', fontSize: '11px' }}>#{c.tryout_number}</span>
                      {name}
                    </td>

                    {/* Score cells */}
                    {allSubcategories.map((sub, colIdx) => {
                      const na = playerId ? isNa(playerId, sub.catKey) : false
                      const val = playerId ? (grid[playerId]?.[sub.key] ?? '') : ''

                      return (
                        <td key={`${sub.catKey}-${sub.key}`} style={{
                          padding: '2px 3px', borderBottom: '0.5px solid var(--border)',
                          borderLeft: colIdx > 0 && allSubcategories[colIdx - 1].catKey !== sub.catKey ? '0.5px solid var(--border-md)' : undefined,
                          textAlign: 'center',
                        }}>
                          {na ? (
                            <span style={{ fontSize: '10px', color: s.dim }}>N/A</span>
                          ) : TIEBREAKER_KEYS.has(sub.key) ? (
                            // Speed: raw decimal seconds — wider cell, no color coding
                            <input
                              ref={el => { inputRefs.current[rowIdx][colIdx] = el }}
                              type="number" min={0} step={0.01}
                              value={val}
                              disabled={!playerId || isLocked}
                              onChange={e => playerId && handleCellChange(playerId, sub.key, e.target.value)}
                              onKeyDown={e => handleKeyDown(e, rowIdx, colIdx)}
                              style={{
                                width: '54px', textAlign: 'center', padding: '3px 2px',
                                background: val ? 'rgba(var(--fg-rgb),0.06)' : 'var(--bg-input)',
                                border: `0.5px solid ${val ? 'transparent' : 'var(--border-md)'}`,
                                borderRadius: '4px', fontSize: '13px', fontWeight: val ? 700 : 400,
                                color: s.muted,
                              }}
                            />
                          ) : (
                            <input
                              ref={el => { inputRefs.current[rowIdx][colIdx] = el }}
                              type="number" min={1} max={5}
                              value={val}
                              disabled={!playerId || isLocked}
                              onChange={e => playerId && handleCellChange(playerId, sub.key, e.target.value)}
                              onKeyDown={e => handleKeyDown(e, rowIdx, colIdx)}
                              style={{
                                width: '36px', textAlign: 'center', padding: '3px 2px',
                                background: val ? (parseInt(val) >= 4 ? 'rgba(109,184,117,0.2)' : parseInt(val) <= 2 ? 'rgba(232,112,96,0.15)' : 'rgba(232,160,32,0.15)') : 'var(--bg-input)',
                                border: `0.5px solid ${val ? 'transparent' : 'var(--border-md)'}`,
                                borderRadius: '4px', fontSize: '13px', fontWeight: val ? 700 : 400,
                                color: 'var(--fg)',
                              }}
                            />
                          )}
                        </td>
                      )
                    })}

                    {/* N/A toggles per optional category — shown as a combined cell at end? No, inline */}
                    {/* Comment */}
                    <td style={{ padding: '2px 4px', borderBottom: '0.5px solid var(--border)', borderLeft: '0.5px solid var(--border-md)' }}>
                      {playerId && (
                        <input type="text"
                          value={comments[playerId] ?? ''}
                          disabled={isLocked}
                          onChange={e => { setComments(prev => ({ ...prev, [playerId]: e.target.value })); clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => autoSave(playerId), 1000) }}
                          style={{ width: '100%', minWidth: '70px', background: 'transparent', border: 'none', fontSize: '11px', color: s.muted, padding: '2px 4px' }}
                          placeholder="—"
                        />
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Optional N/A toggles below grid */}
          {categories.some(c => c.is_optional) && (
            <div style={{ marginTop: '12px', padding: '10px 12px', background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '8px', fontSize: '12px', color: s.dim }}>
              <div style={{ fontWeight: 600, marginBottom: '6px' }}>N/A per player (optional categories)</div>
              <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                {categories.filter(c => c.is_optional).map(cat => (
                  <div key={cat.category}>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>{cat.label}</div>
                    {checkins.map(c => c.player_id ? (
                      <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px', cursor: 'pointer' }}>
                        <input type="checkbox"
                          checked={isNa(c.player_id, cat.category)}
                          onChange={() => c.player_id && toggleNa(c.player_id, cat.category)}
                        />
                        <span style={{ fontSize: '11px' }}>
                          #{c.tryout_number} {c.player ? `${c.player.first_name} ${c.player.last_name}` : ''}
                        </span>
                      </label>
                    ) : null)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
