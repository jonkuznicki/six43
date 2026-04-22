'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'

interface Session {
  id: string; age_group: string; session_date: string
  start_time: string | null; end_time: string | null
  field: string | null; label: string
  status: 'scheduled' | 'open' | 'closed'
  season_id: string; _scoreCount?: number
  numbering_method?: string
}
interface Season { id: string; label: string; year: number; age_groups: string[] }

const STATUS_STYLES = {
  scheduled: { label: 'Scheduled', color: `rgba(var(--fg-rgb),0.4)`,  bg: `rgba(var(--fg-rgb),0.06)` },
  open:      { label: 'Open',      color: '#6DB875',                  bg: 'rgba(45,106,53,0.12)' },
  closed:    { label: 'Closed',    color: `rgba(var(--fg-rgb),0.35)`, bg: `rgba(var(--fg-rgb),0.04)` },
}

type RowData = { session_date: string; label: string; age_group: string; start_time: string; end_time: string; field: string }
type DraftRow = RowData & { _id: string }

function blankDraft(copyFrom?: DraftRow): DraftRow {
  return {
    _id: crypto.randomUUID(),
    session_date: copyFrom?.session_date ?? '',
    label:        '',
    age_group:    '',
    start_time:   copyFrom?.start_time ?? '',
    end_time:     copyFrom?.end_time   ?? '',
    field:        copyFrom?.field      ?? '',
  }
}

const cellInput: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: 'var(--bg-input)', border: '0.5px solid var(--border-md)',
  borderRadius: '5px', padding: '5px 7px', fontSize: '12px', color: 'var(--fg)',
}

export default function SessionsPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()

  const [sessions,       setSessions]       = useState<Session[]>([])
  const [season,         setSeason]         = useState<Season | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [saving,         setSaving]         = useState(false)
  const [statusChanging, setStatusChanging] = useState<string | null>(null)
  const [editingId,      setEditingId]      = useState<string | null>(null)
  const [editRow,        setEditRow]        = useState<RowData>({ session_date: '', label: '', age_group: '', start_time: '', end_time: '', field: '' })
  const [editSaving,     setEditSaving]     = useState(false)
  const [deleteConfirm,  setDeleteConfirm]  = useState<string | null>(null)
  const [deletingId,     setDeletingId]     = useState<string | null>(null)
  const [drafts,         setDrafts]         = useState<DraftRow[]>([blankDraft()])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: seasonData } = await supabase
      .from('tryout_seasons').select('id, label, year, age_groups')
      .eq('org_id', params.orgId).eq('is_active', true).maybeSingle()
    setSeason(seasonData)
    if (!seasonData) { setLoading(false); return }

    const { data: sessionData } = await supabase
      .from('tryout_sessions').select('*')
      .eq('season_id', seasonData.id).order('session_date').order('age_group')

    const ids = (sessionData ?? []).map((s: any) => s.id)
    let scoreCounts: Record<string, number> = {}
    if (ids.length > 0) {
      const { data: scores } = await supabase
        .from('tryout_scores').select('session_id').in('session_id', ids)
      for (const s of scores ?? []) scoreCounts[s.session_id] = (scoreCounts[s.session_id] ?? 0) + 1
    }

    setSessions((sessionData ?? []).map((s: any) => ({ ...s, _scoreCount: scoreCounts[s.id] ?? 0 })))
    setLoading(false)
  }

  function updateDraft(id: string, key: keyof RowData, val: string) {
    setDrafts(prev => prev.map(d => d._id === id ? { ...d, [key]: val } : d))
  }

  function addDraftRow() {
    setDrafts(prev => [...prev, blankDraft(prev[prev.length - 1])])
  }

  function removeDraftRow(id: string) {
    setDrafts(prev => {
      const next = prev.filter(d => d._id !== id)
      return next.length ? next : [blankDraft()]
    })
  }

  const validDrafts = drafts.filter(d => d.session_date && d.age_group && d.label)

  async function saveDrafts() {
    if (!validDrafts.length || !season) return
    setSaving(true)
    const { data } = await supabase.from('tryout_sessions').insert(
      validDrafts.map(d => ({
        season_id:    season.id, org_id: params.orgId,
        age_group:    d.age_group,    session_date: d.session_date,
        start_time:   d.start_time || null, end_time: d.end_time || null,
        field:        d.field      || null, label:    d.label,
        status:       'scheduled',
      }))
    ).select()
    if (data) {
      setSessions(prev =>
        [...prev, ...data.map((s: any) => ({ ...s, _scoreCount: 0 }))]
          .sort((a, b) => a.session_date.localeCompare(b.session_date) || a.age_group.localeCompare(b.age_group))
      )
      setDrafts([blankDraft()])
    }
    setSaving(false)
  }

  function startEdit(s: Session) {
    setEditingId(s.id)
    setEditRow({ session_date: s.session_date, label: s.label, age_group: s.age_group, start_time: s.start_time ?? '', end_time: s.end_time ?? '', field: s.field ?? '' })
  }

  async function saveEdit() {
    if (!editingId) return
    setEditSaving(true)
    const { data } = await supabase.from('tryout_sessions').update({
      label: editRow.label, age_group: editRow.age_group, session_date: editRow.session_date,
      start_time: editRow.start_time || null, end_time: editRow.end_time || null, field: editRow.field || null,
    }).eq('id', editingId).select().single()
    if (data) setSessions(prev => prev.map(s => s.id === editingId ? { ...data, _scoreCount: s._scoreCount } : s))
    setEditingId(null)
    setEditSaving(false)
  }

  async function deleteSession(id: string) {
    setDeletingId(id)
    await supabase.from('tryout_sessions').delete().eq('id', id)
    setSessions(prev => prev.filter(s => s.id !== id))
    setDeletingId(null)
    setDeleteConfirm(null)
  }

  async function setStatus(id: string, status: Session['status']) {
    setStatusChanging(id)
    await supabase.from('tryout_sessions').update({ status }).eq('id', id)
    setSessions(prev => prev.map(s => s.id === id ? { ...s, status } : s))
    setStatusChanging(null)
  }

  const s = { muted: `rgba(var(--fg-rgb),0.55)` as const, dim: `rgba(var(--fg-rgb),0.35)` as const }

  const ageGroups = season?.age_groups ?? []

  const thStyle: React.CSSProperties = {
    padding: '6px 8px', textAlign: 'left', fontSize: '11px', fontWeight: 700,
    color: s.dim, textTransform: 'uppercase', letterSpacing: '0.05em',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap', background: 'var(--bg)',
  }
  const tdStyle: React.CSSProperties = {
    padding: '6px 8px', fontSize: '12px', borderBottom: '0.5px solid var(--border)', verticalAlign: 'middle',
  }

  if (loading) return <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>

  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>

      <div style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800 }}>Tryout Sessions</h1>
        {season && <div style={{ fontSize: '13px', color: s.muted, marginTop: '2px' }}>{season.label}</div>}
      </div>

      {!season ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: s.dim, fontSize: '14px' }}>
          No active season found. Set up a season first.
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '780px', fontSize: '12px' }}>
            <colgroup>
              <col style={{ width: '104px' }} /> {/* Date */}
              <col style={{ width: '150px' }} /> {/* Label */}
              <col style={{ width: '80px'  }} /> {/* Age */}
              <col style={{ width: '80px'  }} /> {/* Start */}
              <col style={{ width: '80px'  }} /> {/* End */}
              <col style={{ width: '120px' }} /> {/* Field */}
              <col />                             {/* Status + actions */}
            </colgroup>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Label</th>
                <th style={thStyle}>Age Group</th>
                <th style={thStyle}>Start</th>
                <th style={thStyle}>End</th>
                <th style={thStyle}>Field</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Status / Actions</th>
              </tr>
            </thead>
            <tbody>
              {/* ── Existing sessions ── */}
              {sessions.map(session => {
                const st   = STATUS_STYLES[session.status]
                const isEd = editingId === session.id

                if (isEd) {
                  return (
                    <tr key={session.id} style={{ background: 'rgba(var(--accent-rgb, 232,160,32),0.04)' }}>
                      <td style={tdStyle}><input type="date" value={editRow.session_date} onChange={e => setEditRow(r => ({ ...r, session_date: e.target.value }))} style={cellInput} /></td>
                      <td style={tdStyle}><input type="text" value={editRow.label} onChange={e => setEditRow(r => ({ ...r, label: e.target.value }))} style={cellInput} /></td>
                      <td style={tdStyle}>
                        <select value={editRow.age_group} onChange={e => setEditRow(r => ({ ...r, age_group: e.target.value }))} style={cellInput}>
                          <option value="">—</option>
                          {ageGroups.map(ag => <option key={ag} value={ag}>{ag}</option>)}
                        </select>
                      </td>
                      <td style={tdStyle}><input type="text" value={editRow.start_time} onChange={e => setEditRow(r => ({ ...r, start_time: e.target.value }))} placeholder="9:00 AM" style={cellInput} /></td>
                      <td style={tdStyle}><input type="text" value={editRow.end_time} onChange={e => setEditRow(r => ({ ...r, end_time: e.target.value }))} placeholder="12:00 PM" style={cellInput} /></td>
                      <td style={tdStyle}><input type="text" value={editRow.field} onChange={e => setEditRow(r => ({ ...r, field: e.target.value }))} placeholder="Field 1" style={cellInput} /></td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={saveEdit} disabled={editSaving || !editRow.label || !editRow.session_date} style={{ padding: '4px 12px', borderRadius: '5px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', marginRight: '6px' }}>
                          {editSaving ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => setEditingId(null)} style={{ padding: '4px 10px', borderRadius: '5px', border: '0.5px solid var(--border-md)', background: 'transparent', color: s.muted, fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                      </td>
                    </tr>
                  )
                }

                return (
                  <tr key={session.id} style={{ background: 'transparent' }}>
                    <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {new Date(session.session_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td style={tdStyle}>{session.label}</td>
                    <td style={tdStyle}>
                      <span style={{ padding: '2px 7px', borderRadius: '4px', background: 'rgba(var(--fg-rgb),0.07)', color: s.muted, fontWeight: 600, fontSize: '11px' }}>
                        {session.age_group}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: s.muted }}>{session.start_time || '—'}</td>
                    <td style={{ ...tdStyle, color: s.muted }}>{session.end_time || '—'}</td>
                    <td style={{ ...tdStyle, color: s.muted }}>{session.field || '—'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '20px', background: st.bg, color: st.color, fontWeight: 700 }}>{st.label}</span>
                        {session._scoreCount ? <span style={{ fontSize: '11px', color: s.dim }}>{session._scoreCount} scores</span> : null}
                        {session.status === 'scheduled' && <button onClick={() => setStatus(session.id, 'open')} disabled={statusChanging === session.id} style={{ padding: '3px 10px', borderRadius: '4px', border: 'none', background: 'rgba(45,106,53,0.15)', color: '#6DB875', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>Open</button>}
                        {session.status === 'open'      && <button onClick={() => setStatus(session.id, 'closed')} disabled={statusChanging === session.id} style={{ padding: '3px 10px', borderRadius: '4px', border: 'none', background: 'rgba(var(--fg-rgb),0.07)', color: s.muted, fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>Close</button>}
                        {session.status === 'closed'    && <button onClick={() => setStatus(session.id, 'open')} disabled={statusChanging === session.id} style={{ padding: '3px 10px', borderRadius: '4px', border: 'none', background: 'rgba(var(--fg-rgb),0.07)', color: s.muted, fontSize: '11px', cursor: 'pointer' }}>Re-open</button>}
                        <button onClick={() => startEdit(session)} style={{ padding: '3px 10px', borderRadius: '4px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: s.muted, fontSize: '11px', cursor: 'pointer' }}>Edit</button>
                        <Link href={`/org/${params.orgId}/tryouts/sessions/${session.id}`} style={{ padding: '3px 10px', borderRadius: '4px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: s.muted, fontSize: '11px', fontWeight: 600, textDecoration: 'none' }}>Manage →</Link>
                        {deleteConfirm === session.id ? (
                          <>
                            <span style={{ fontSize: '11px', color: '#E87060' }}>Delete?</span>
                            <button onClick={() => deleteSession(session.id)} disabled={deletingId === session.id} style={{ padding: '3px 9px', borderRadius: '4px', border: 'none', background: 'rgba(232,112,96,0.15)', color: '#E87060', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                              {deletingId === session.id ? '…' : 'Yes'}
                            </button>
                            <button onClick={() => setDeleteConfirm(null)} style={{ padding: '3px 9px', borderRadius: '4px', border: '0.5px solid var(--border-md)', background: 'transparent', color: s.dim, fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => setDeleteConfirm(session.id)} style={{ padding: '3px 7px', borderRadius: '4px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: s.dim, fontSize: '11px', cursor: 'pointer' }}>✕</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}

              {/* ── Divider before draft rows ── */}
              {sessions.length > 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: '6px 8px', borderBottom: '0.5px solid var(--border)' }}>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: s.dim, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Add sessions</span>
                  </td>
                </tr>
              )}

              {/* ── Draft rows ── */}
              {drafts.map((d, i) => (
                <tr key={d._id} style={{ background: 'rgba(var(--fg-rgb),0.015)' }}>
                  <td style={tdStyle}><input type="date" value={d.session_date} onChange={e => updateDraft(d._id, 'session_date', e.target.value)} style={cellInput} /></td>
                  <td style={tdStyle}><input type="text" value={d.label} onChange={e => updateDraft(d._id, 'label', e.target.value)} placeholder="Week 1 / Day 1" style={cellInput} /></td>
                  <td style={tdStyle}>
                    <select value={d.age_group} onChange={e => updateDraft(d._id, 'age_group', e.target.value)} style={cellInput}>
                      <option value="">Age…</option>
                      {ageGroups.map(ag => <option key={ag} value={ag}>{ag}</option>)}
                    </select>
                  </td>
                  <td style={tdStyle}><input type="text" value={d.start_time} onChange={e => updateDraft(d._id, 'start_time', e.target.value)} placeholder="9:00 AM" style={cellInput} /></td>
                  <td style={tdStyle}><input type="text" value={d.end_time} onChange={e => updateDraft(d._id, 'end_time', e.target.value)} placeholder="12:00 PM" style={cellInput} /></td>
                  <td style={tdStyle}><input type="text" value={d.field} onChange={e => updateDraft(d._id, 'field', e.target.value)} placeholder="Field 1" style={cellInput} /></td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    {drafts.length > 1 && (
                      <button onClick={() => removeDraftRow(d._id)} style={{ padding: '3px 8px', borderRadius: '4px', border: '0.5px solid var(--border-md)', background: 'transparent', color: s.dim, fontSize: '12px', cursor: 'pointer' }}>✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* ── Footer: add row + save ── */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap', gap: '8px' }}>
            <button onClick={addDraftRow} style={{ padding: '6px 14px', borderRadius: '6px', border: '0.5px dashed var(--border-md)', background: 'transparent', color: s.muted, fontSize: '12px', cursor: 'pointer' }}>
              + Add row
            </button>
            {validDrafts.length > 0 && (
              <button onClick={saveDrafts} disabled={saving} style={{ padding: '8px 20px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Saving…' : `Save ${validDrafts.length} session${validDrafts.length !== 1 ? 's' : ''}`}
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  )
}
