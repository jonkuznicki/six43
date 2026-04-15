'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '../../../../../../../lib/supabase'
import Link from 'next/link'

interface Player {
  id:            string
  first_name:    string
  last_name:     string
  age_group:     string
  jersey_number: string | null
}

interface ScoreField {
  key:      string
  label:    string
  optional: boolean
  sort_order: number
}

interface Session {
  id:        string
  label:     string
  age_group: string
  status:    string
}

// Grid state: playerId → fieldKey → value string (what's typed)
type GridValues = Record<string, Record<string, string>>

export default function BulkEnterPage({ params }: { params: { orgId: string; sessionId: string } }) {
  const supabase = createClient()

  const [session,       setSession]       = useState<Session | null>(null)
  const [players,       setPlayers]       = useState<Player[]>([])
  const [fields,        setFields]        = useState<ScoreField[]>([])
  const [grid,          setGrid]          = useState<GridValues>({})
  const [comments,      setComments]      = useState<Record<string, string>>({})
  const [evalName,      setEvalName]      = useState('')
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [savedAt,       setSavedAt]       = useState<Date | null>(null)
  const [dirtyRows,     setDirtyRows]     = useState<Set<string>>(new Set())

  // Ref grid for keyboard navigation: inputRefs[rowIndex][colIndex]
  const inputRefs = useRef<(HTMLInputElement | null)[][]>([])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: sessionData } = await supabase
      .from('tryout_sessions').select('id, label, age_group, status, season_id')
      .eq('id', params.sessionId).single()
    setSession(sessionData)

    if (!sessionData) { setLoading(false); return }

    const [
      { data: playerData },
      { data: fieldData },
      { data: existingScores },
    ] = await Promise.all([
      supabase.from('tryout_players')
        .select('id, first_name, last_name, age_group, jersey_number')
        .eq('org_id', params.orgId).eq('is_active', true)
        .eq('age_group', sessionData.age_group)
        .order('last_name').order('first_name'),
      supabase.from('tryout_scoring_config')
        .select('category, label, is_optional, sort_order')
        .eq('season_id', sessionData.season_id)
        .order('sort_order'),
      supabase.from('tryout_scores')
        .select('player_id, scores, comments, evaluator_name')
        .eq('session_id', params.sessionId),
    ])

    const parsedFields: ScoreField[] = (fieldData ?? []).map((f: any) => ({
      key: f.category, label: f.label, optional: f.is_optional, sort_order: f.sort_order,
    }))
    setFields(parsedFields)
    setPlayers(playerData ?? [])

    // Pre-fill grid with existing scores (from first evaluator found, or blank)
    const initialGrid: GridValues = {}
    const initialComments: Record<string, string> = {}
    for (const p of (playerData ?? [])) {
      initialGrid[p.id] = {}
      for (const f of parsedFields) initialGrid[p.id][f.key] = ''
    }

    // Group existing scores — if multiple evaluators, show the first one as default
    const grouped: Record<string, any> = {}
    for (const s of (existingScores ?? [])) {
      if (!grouped[s.player_id]) grouped[s.player_id] = s
    }

    let detectedName = ''
    for (const [playerId, score] of Object.entries(grouped)) {
      if (initialGrid[playerId] && score.scores) {
        for (const f of parsedFields) {
          const v = score.scores[f.key]
          if (v != null) initialGrid[playerId][f.key] = String(v)
        }
      }
      if (score.comments) initialComments[playerId] = score.comments
      if (score.evaluator_name && !detectedName) detectedName = score.evaluator_name
    }

    setGrid(initialGrid)
    setComments(initialComments)
    if (detectedName) setEvalName(detectedName)
    setLoading(false)
  }

  function setCellValue(playerId: string, fieldKey: string, value: string) {
    // Only allow 1–5 or empty
    if (value !== '' && !/^[1-5]$/.test(value)) return
    setGrid(prev => ({ ...prev, [playerId]: { ...prev[playerId], [fieldKey]: value } }))
    setDirtyRows(prev => new Set(Array.from(prev).concat(playerId)))
  }

  function setComment(playerId: string, value: string) {
    setComments(prev => ({ ...prev, [playerId]: value }))
    setDirtyRows(prev => new Set(Array.from(prev).concat(playerId)))
  }

  // Keyboard navigation: Enter moves down, Tab moves right (native)
  function handleKeyDown(
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number
  ) {
    if (e.key === 'Enter') {
      e.preventDefault()
      // Move to same column in next row
      const nextRow = inputRefs.current[rowIdx + 1]
      if (nextRow) {
        const target = nextRow[colIdx] ?? nextRow[0]
        target?.focus()
        target?.select()
      }
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      inputRefs.current[rowIdx + 1]?.[colIdx]?.focus()
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      inputRefs.current[rowIdx - 1]?.[colIdx]?.focus()
    }
    if (e.key === 'ArrowRight' && (e.currentTarget.value !== '' || e.currentTarget.selectionStart === 1)) {
      e.preventDefault()
      inputRefs.current[rowIdx]?.[colIdx + 1]?.focus()
    }
    if (e.key === 'ArrowLeft' && (e.currentTarget.value !== '' || e.currentTarget.selectionStart === 0)) {
      if (e.currentTarget.selectionStart === 0) {
        e.preventDefault()
        inputRefs.current[rowIdx]?.[colIdx - 1]?.focus()
      }
    }
  }

  async function saveAll() {
    if (!evalName.trim()) { alert('Enter your name first.'); return }
    const dirty = players.filter(p => dirtyRows.has(p.id))
    if (dirty.length === 0) return
    setSaving(true)

    const { data: { user } } = await supabase.auth.getUser()

    const upserts = dirty.map(player => {
      const playerGrid = grid[player.id] ?? {}
      const scores: Record<string, number> = {}
      for (const f of fields) {
        const v = playerGrid[f.key]
        if (v !== '' && v != null) scores[f.key] = Number(v)
      }

      // Weighted score
      let totalWeight = 0, weightedSum = 0
      for (const f of fields) {
        if (scores[f.key] != null) {
          totalWeight  += (f as any).weight ?? 1
          weightedSum  += scores[f.key] * ((f as any).weight ?? 1)
        }
      }
      const tryoutScore = totalWeight > 0 ? weightedSum / totalWeight : null

      return {
        player_id:      player.id,
        session_id:     params.sessionId,
        org_id:         params.orgId,
        evaluator_id:   user?.id ?? 'admin',
        evaluator_name: evalName.trim(),
        scores,
        tryout_score:   tryoutScore,
        comments:       comments[player.id]?.trim() || null,
        submitted_at:   new Date().toISOString(),
      }
    })

    await supabase.from('tryout_scores')
      .upsert(upserts, { onConflict: 'player_id,session_id,evaluator_id' })

    setDirtyRows(new Set())
    setSavedAt(new Date())
    setSaving(false)
  }

  // Compute row completion: how many required fields are filled
  function rowStatus(playerId: string): 'empty' | 'partial' | 'complete' {
    const row = grid[playerId] ?? {}
    const required = fields.filter(f => !f.optional)
    const filled   = required.filter(f => row[f.key] !== '' && row[f.key] != null)
    if (filled.length === 0) return 'empty'
    if (filled.length < required.length) return 'partial'
    return 'complete'
  }

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>
  )
  if (!session) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Session not found.</main>
  )

  const completeCount = players.filter(p => rowStatus(p.id) === 'complete').length
  const dirtyCount    = dirtyRows.size

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '0' }}>

      {/* Sticky top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        background: 'var(--bg)', borderBottom: '0.5px solid var(--border)',
        padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
      }}>
        <Link href={`/org/${params.orgId}/tryouts/sessions/${params.sessionId}`}
          style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', flexShrink: 0 }}>‹ Back</Link>

        <div style={{ flex: 1 }}>
          <span style={{ fontSize: '13px', fontWeight: 700 }}>{session.label} · {session.age_group}</span>
          <span style={{ fontSize: '12px', color: s.dim, marginLeft: '8px' }}>
            {completeCount}/{players.length} complete
            {dirtyCount > 0 ? ` · ${dirtyCount} unsaved` : ''}
          </span>
        </div>

        {/* Evaluator name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <label style={{ fontSize: '11px', color: s.dim, fontWeight: 600, whiteSpace: 'nowrap' }}>Evaluator:</label>
          <input
            type="text" value={evalName} onChange={e => setEvalName(e.target.value)}
            placeholder="Name"
            style={{ background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '5px', padding: '5px 8px', fontSize: '12px', color: 'var(--fg)', width: '120px' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {savedAt && dirtyCount === 0 && (
            <span style={{ fontSize: '11px', color: '#6DB875' }}>
              Saved {savedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
          <button
            onClick={saveAll}
            disabled={saving || dirtyCount === 0}
            style={{
              padding: '7px 18px', borderRadius: '6px', border: 'none',
              background: dirtyCount > 0 ? 'var(--accent)' : 'var(--bg-input)',
              color: dirtyCount > 0 ? 'var(--accent-text)' : s.dim,
              fontSize: '13px', fontWeight: 700, cursor: dirtyCount > 0 ? 'pointer' : 'default',
              opacity: saving ? 0.6 : 1,
            }}
          >{saving ? 'Saving…' : dirtyCount > 0 ? `Save (${dirtyCount})` : 'Saved'}</button>
        </div>
      </div>

      {/* Score grid */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: `${180 + fields.length * 68 + 160}px` }}>
          <thead>
            <tr style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: s.dim, textTransform: 'uppercase', letterSpacing: '0.05em', width: '180px', position: 'sticky', left: 0, background: 'var(--bg-card)', zIndex: 5 }}>
                Player
              </th>
              {fields.map(f => (
                <th key={f.key} style={{ padding: '8px 6px', textAlign: 'center', fontSize: '11px', fontWeight: 700, color: f.optional ? s.dim : 'var(--fg)', textTransform: 'uppercase', letterSpacing: '0.04em', width: '68px', whiteSpace: 'nowrap' }}>
                  {f.label}
                  {f.optional && <div style={{ fontSize: '9px', fontWeight: 400, color: s.dim, textTransform: 'none', letterSpacing: 0 }}>optional</div>}
                </th>
              ))}
              <th style={{ padding: '8px 10px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: s.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Notes
              </th>
            </tr>
          </thead>
          <tbody>
            {players.map((player, rowIdx) => {
              const status = rowStatus(player.id)
              const isDirty = dirtyRows.has(player.id)
              if (!inputRefs.current[rowIdx]) inputRefs.current[rowIdx] = []

              return (
                <tr
                  key={player.id}
                  style={{
                    borderBottom: '0.5px solid var(--border)',
                    background: isDirty
                      ? 'rgba(232,160,32,0.04)'
                      : rowIdx % 2 === 0 ? 'var(--bg)' : 'var(--bg-card)',
                  }}
                >
                  {/* Player name — sticky */}
                  <td style={{
                    padding: '6px 12px', fontSize: '13px', fontWeight: 600,
                    position: 'sticky', left: 0,
                    background: isDirty
                      ? 'rgba(232,160,32,0.06)'
                      : rowIdx % 2 === 0 ? 'var(--bg)' : 'var(--bg-card)',
                    zIndex: 4,
                    borderRight: '0.5px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      {/* Status dot */}
                      <div style={{
                        width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                        background: status === 'complete' ? '#6DB875' : status === 'partial' ? 'var(--accent)' : 'rgba(var(--fg-rgb),0.15)',
                      }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {player.last_name}, {player.first_name}
                      </span>
                      {player.jersey_number && (
                        <span style={{ fontSize: '10px', color: s.dim, flexShrink: 0 }}>#{player.jersey_number}</span>
                      )}
                    </div>
                  </td>

                  {/* Score cells */}
                  {fields.map((f, colIdx) => {
                    const val = grid[player.id]?.[f.key] ?? ''
                    return (
                      <td key={f.key} style={{ padding: '3px 4px', textAlign: 'center' }}>
                        <input
                          ref={el => { inputRefs.current[rowIdx][colIdx] = el }}
                          type="text"
                          inputMode="numeric"
                          value={val}
                          onChange={e => setCellValue(player.id, f.key, e.target.value)}
                          onKeyDown={e => handleKeyDown(e, rowIdx, colIdx)}
                          onFocus={e => e.target.select()}
                          maxLength={1}
                          style={{
                            width: '44px', textAlign: 'center',
                            background: val !== ''
                              ? Number(val) >= 4 ? 'rgba(109,184,117,0.15)'
                              : Number(val) <= 2 ? 'rgba(232,100,80,0.1)'
                              : 'rgba(232,160,32,0.1)'
                              : 'var(--bg-input)',
                            border: `1px solid ${val !== '' ? 'rgba(var(--fg-rgb),0.15)' : 'var(--border-md)'}`,
                            borderRadius: '5px', padding: '6px 0',
                            fontSize: '15px', fontWeight: 700,
                            color: val !== ''
                              ? Number(val) >= 4 ? '#6DB875'
                              : Number(val) <= 2 ? '#E87060'
                              : 'var(--accent)'
                              : s.dim,
                            outline: 'none',
                          }}
                        />
                      </td>
                    )
                  })}

                  {/* Notes */}
                  <td style={{ padding: '3px 6px' }}>
                    <input
                      ref={el => { inputRefs.current[rowIdx][fields.length] = el }}
                      type="text"
                      value={comments[player.id] ?? ''}
                      onChange={e => setComment(player.id, e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); inputRefs.current[rowIdx + 1]?.[0]?.focus() } }}
                      placeholder="Notes…"
                      style={{
                        width: '100%', minWidth: '140px',
                        background: 'var(--bg-input)', border: '1px solid var(--border-md)',
                        borderRadius: '5px', padding: '6px 8px', fontSize: '12px', color: 'var(--fg)',
                        outline: 'none',
                      }}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {players.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem', color: s.dim, fontSize: '14px' }}>
          No players registered for {session.age_group} yet.
        </div>
      )}

      {/* Bottom save bar */}
      {players.length > 0 && (
        <div style={{ padding: '16px', borderTop: '0.5px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: '10px', alignItems: 'center' }}>
          {savedAt && dirtyCount === 0 && (
            <span style={{ fontSize: '12px', color: '#6DB875' }}>
              ✓ All changes saved
            </span>
          )}
          <button
            onClick={saveAll}
            disabled={saving || dirtyCount === 0}
            style={{
              padding: '10px 28px', borderRadius: '7px', border: 'none',
              background: dirtyCount > 0 ? 'var(--accent)' : 'var(--bg-input)',
              color: dirtyCount > 0 ? 'var(--accent-text)' : s.dim,
              fontSize: '14px', fontWeight: 700,
              cursor: dirtyCount > 0 ? 'pointer' : 'default',
              opacity: saving ? 0.6 : 1,
            }}
          >{saving ? 'Saving…' : `Save ${dirtyCount > 0 ? `(${dirtyCount} rows)` : ''}`}</button>
        </div>
      )}
    </main>
  )
}
