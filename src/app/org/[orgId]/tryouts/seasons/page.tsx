'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'

interface Season {
  id:         string
  label:      string
  year:       number
  age_groups: string[]
  is_active:  boolean
}

interface SeasonCounts {
  teams:    number
  sessions: number
  checkins: number
}

const COMMON_AGE_GROUPS = ['6U','7U','8U','9U','10U','11U','12U','13U','14U','15U','16U','18U']

export default function SeasonsPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()

  const [seasons,       setSeasons]       = useState<Season[]>([])
  const [counts,        setCounts]        = useState<Record<string, SeasonCounts>>({})
  const [loading,       setLoading]       = useState(true)
  const [editId,        setEditId]        = useState<string | null>(null)
  const [showCreate,    setShowCreate]    = useState(false)
  const [saving,        setSaving]        = useState(false)
  const [deleteId,      setDeleteId]      = useState<string | null>(null)
  const [deleting,      setDeleting]      = useState(false)
  const [copyFromId,    setCopyFromId]    = useState<string>('')

  // Form state — shared for create and edit
  const [label,     setLabel]     = useState('')
  const [year,      setYear]      = useState(new Date().getFullYear())
  const [ageGroups, setAgeGroups] = useState<string[]>([])
  const [agInput,   setAgInput]   = useState('')
  const agInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data } = await supabase
      .from('tryout_seasons').select('id, label, year, age_groups, is_active')
      .eq('org_id', params.orgId)
      .order('year', { ascending: false })
    const rows = data ?? []
    setSeasons(rows)

    if (rows.length > 0) {
      const ids = rows.map(s => s.id)
      const [teamsRes, sessionsRes] = await Promise.all([
        supabase.from('tryout_teams').select('season_id').in('season_id', ids),
        supabase.from('tryout_sessions').select('id, season_id').in('season_id', ids),
      ])

      const sessionIds = (sessionsRes.data ?? []).map(s => s.id)
      const checkinsRes = sessionIds.length > 0
        ? await supabase.from('tryout_checkins').select('session_id').in('session_id', sessionIds)
        : { data: [] }

      // Group checkins by session → season
      const sessionToSeason = Object.fromEntries(
        (sessionsRes.data ?? []).map(s => [s.id, s.season_id])
      )

      const c: Record<string, SeasonCounts> = {}
      for (const s of rows) c[s.id] = { teams: 0, sessions: 0, checkins: 0 }
      for (const t of teamsRes.data ?? [])    c[t.season_id].teams++
      for (const s of sessionsRes.data ?? []) c[s.season_id].sessions++
      for (const ch of checkinsRes.data ?? []) {
        const sid = sessionToSeason[ch.session_id]
        if (sid && c[sid]) c[sid].checkins++
      }
      setCounts(c)
    }

    setLoading(false)
  }

  function openCreate() {
    setLabel(`${new Date().getFullYear()} Season`)
    setYear(new Date().getFullYear())
    setAgeGroups([])
    setAgInput('')
    setCopyFromId('')
    setEditId(null)
    setShowCreate(true)
  }

  function openEdit(season: Season) {
    setLabel(season.label)
    setYear(season.year)
    setAgeGroups([...season.age_groups])
    setAgInput('')
    setCopyFromId('')
    setEditId(season.id)
    setShowCreate(true)
  }

  function cancelForm() {
    setShowCreate(false)
    setEditId(null)
    setAgInput('')
  }

  function addAgeGroup(ag: string) {
    const val = ag.trim().toUpperCase()
    if (!val || ageGroups.includes(val)) return
    setAgeGroups(prev => [...prev, val])
    setAgInput('')
    agInputRef.current?.focus()
  }

  function removeAgeGroup(ag: string) {
    setAgeGroups(prev => prev.filter(a => a !== ag))
  }

  function handleAgKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addAgeGroup(agInput)
    }
    if (e.key === 'Backspace' && agInput === '' && ageGroups.length > 0) {
      setAgeGroups(prev => prev.slice(0, -1))
    }
  }

  async function save() {
    if (!label.trim() || ageGroups.length === 0) return
    setSaving(true)

    if (editId) {
      await supabase.from('tryout_seasons').update({
        label: label.trim(), year, age_groups: ageGroups,
      }).eq('id', editId)
      setSeasons(prev => prev.map(s =>
        s.id === editId ? { ...s, label: label.trim(), year, age_groups: ageGroups } : s
      ))
    } else {
      const { data: newSeason } = await supabase.from('tryout_seasons').insert({
        org_id:     params.orgId,
        label:      label.trim(),
        year,
        age_groups: ageGroups,
        is_active:  seasons.length === 0,
      }).select().single()

      if (newSeason) {
        setSeasons(prev => [newSeason, ...prev])
        setCounts(prev => ({ ...prev, [newSeason.id]: { teams: 0, sessions: 0, checkins: 0 } }))

        // Copy settings from another season if selected
        if (copyFromId) {
          const [scoring, evalCfg, gcCfg] = await Promise.all([
            supabase.from('tryout_scoring_config').select('*').eq('season_id', copyFromId).maybeSingle(),
            supabase.from('tryout_coach_eval_config').select('*').eq('season_id', copyFromId),
            supabase.from('tryout_gc_scoring_config').select('*').eq('season_id', copyFromId),
          ])

          const inserts: PromiseLike<unknown>[] = []

          if (scoring.data) {
            const { id: _id, season_id: _sid, ...rest } = scoring.data
            inserts.push(supabase.from('tryout_scoring_config').insert({ ...rest, season_id: newSeason.id }).then())
          }
          if (evalCfg.data?.length) {
            const rows = evalCfg.data.map(({ id: _id, season_id: _sid, ...rest }: any) => ({ ...rest, season_id: newSeason.id }))
            inserts.push(supabase.from('tryout_coach_eval_config').insert(rows).then())
          }
          if (gcCfg.data?.length) {
            const rows = gcCfg.data.map(({ id: _id, season_id: _sid, ...rest }: any) => ({ ...rest, season_id: newSeason.id }))
            inserts.push(supabase.from('tryout_gc_scoring_config').insert(rows).then())
          }

          await Promise.all(inserts as Promise<unknown>[])
        }
      }
    }

    setSaving(false)
    cancelForm()
  }

  async function setActive(id: string) {
    await supabase.from('tryout_seasons').update({ is_active: false }).eq('org_id', params.orgId)
    await supabase.from('tryout_seasons').update({ is_active: true }).eq('id', id)
    setSeasons(prev => prev.map(s => ({ ...s, is_active: s.id === id })))
  }

  async function confirmDelete() {
    if (!deleteId) return
    setDeleting(true)
    await supabase.from('tryout_seasons').delete().eq('id', deleteId)
    setSeasons(prev => prev.filter(s => s.id !== deleteId))
    setCounts(prev => { const c = { ...prev }; delete c[deleteId]; return c })
    setDeleteId(null)
    setDeleting(false)
  }

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  const deleteTarget = seasons.find(s => s.id === deleteId)
  const deleteCounts = deleteId ? counts[deleteId] : null
  const hasDeleteData = deleteCounts && (deleteCounts.teams > 0 || deleteCounts.sessions > 0 || deleteCounts.checkins > 0)

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>
  )

  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800 }}>Seasons</h1>
        {!showCreate && (
          <button onClick={openCreate} style={{
            padding: '8px 18px', borderRadius: '7px', border: 'none',
            background: 'var(--accent)', color: 'var(--accent-text)',
            fontSize: '13px', fontWeight: 700, cursor: 'pointer',
          }}>+ New season</button>
        )}
      </div>

      {/* Data model callout */}
      <div style={{
        background: 'rgba(var(--fg-rgb),0.04)', border: '0.5px solid var(--border)',
        borderRadius: '10px', padding: '12px 16px', marginBottom: '1.75rem',
        fontSize: '13px', color: s.muted, lineHeight: 1.6,
      }}>
        <span style={{ fontWeight: 700, color: 'var(--fg)' }}>Player data is shared across seasons.</span>{' '}
        Each season, upload a new registration file to set each player&apos;s current team, age group, and preferred tryout date for that season.
        Scoring setup, eval categories, and GC stat weights are season-specific.
      </div>

      {/* Create / Edit form */}
      {showCreate && (
        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '14px', padding: '1.5rem', marginBottom: '1.75rem' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '1.25rem' }}>
            {editId ? 'Edit season' : 'New season'}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Season label</label>
              <input
                type="text" value={label} onChange={e => setLabel(e.target.value)}
                placeholder="2026 Season"
                autoFocus
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '7px', padding: '9px 12px', fontSize: '14px', color: 'var(--fg)' }}
              />
            </div>
            <div>
              <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Year</label>
              <input
                type="number" value={year} onChange={e => setYear(Number(e.target.value))}
                style={{ background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '7px', padding: '9px 12px', fontSize: '14px', color: 'var(--fg)', width: '90px' }}
              />
            </div>
          </div>

          {/* Copy settings — only on create */}
          {!editId && seasons.length > 0 && (
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Copy settings from</label>
              <select
                value={copyFromId}
                onChange={e => setCopyFromId(e.target.value)}
                style={{ background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '7px', padding: '9px 12px', fontSize: '14px', color: 'var(--fg)', minWidth: '200px' }}
              >
                <option value="">— Start fresh —</option>
                {seasons.map(s => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </select>
              {copyFromId && (
                <div style={{ fontSize: '11px', color: s.dim, marginTop: '4px' }}>
                  Scoring weights, eval categories, and GC stat config will be copied.
                </div>
              )}
            </div>
          )}

          {/* Age groups */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Age groups</label>

            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '8px' }}>
              {COMMON_AGE_GROUPS.map(ag => {
                const added = ageGroups.includes(ag)
                return (
                  <button key={ag} onClick={() => added ? removeAgeGroup(ag) : addAgeGroup(ag)} style={{
                    padding: '4px 10px', borderRadius: '20px', border: '0.5px solid',
                    borderColor: added ? 'var(--accent)' : 'var(--border-md)',
                    background: added ? 'rgba(232,160,32,0.12)' : 'var(--bg-input)',
                    color: added ? 'var(--accent)' : s.dim,
                    fontSize: '12px', fontWeight: added ? 700 : 400, cursor: 'pointer',
                  }}>{ag}</button>
                )
              })}
            </div>

            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center',
              background: 'var(--bg-input)', border: '0.5px solid var(--border-md)',
              borderRadius: '7px', padding: '6px 10px', minHeight: '40px',
            }}
              onClick={() => agInputRef.current?.focus()}
            >
              {ageGroups.map(ag => (
                <span key={ag} style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  background: 'rgba(var(--fg-rgb),0.08)', borderRadius: '5px',
                  padding: '2px 8px', fontSize: '13px', fontWeight: 700,
                }}>
                  {ag}
                  <button onClick={e => { e.stopPropagation(); removeAgeGroup(ag) }} style={{
                    background: 'none', border: 'none', color: s.dim, cursor: 'pointer',
                    padding: '0', fontSize: '14px', lineHeight: 1, marginLeft: '1px',
                  }}>×</button>
                </span>
              ))}
              <input
                ref={agInputRef}
                type="text" value={agInput}
                onChange={e => setAgInput(e.target.value)}
                onKeyDown={handleAgKeyDown}
                onBlur={() => agInput && addAgeGroup(agInput)}
                placeholder={ageGroups.length === 0 ? 'Type age group, press Enter…' : ''}
                style={{
                  background: 'none', border: 'none', outline: 'none',
                  fontSize: '13px', color: 'var(--fg)', minWidth: '140px', flex: 1,
                  padding: '2px 0',
                }}
              />
            </div>
            {ageGroups.length === 0 && (
              <div style={{ fontSize: '11px', color: s.dim, marginTop: '4px' }}>
                Click the chips above or type a custom group (e.g. &quot;13U&quot;) and press Enter
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={save} disabled={saving || !label.trim() || ageGroups.length === 0} style={{
              padding: '10px 22px', borderRadius: '7px', border: 'none',
              background: 'var(--accent)', color: 'var(--accent-text)',
              fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              opacity: saving || !label.trim() || ageGroups.length === 0 ? 0.5 : 1,
            }}>{saving ? 'Saving…' : editId ? 'Save changes' : 'Create season'}</button>
            <button onClick={cancelForm} style={{
              padding: '10px 16px', borderRadius: '7px',
              border: '0.5px solid var(--border-md)', background: 'transparent',
              color: s.muted, fontSize: '14px', cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Season list */}
      {seasons.length === 0 && !showCreate ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: s.dim, fontSize: '14px' }}>
          No seasons yet. Create your first season to get started.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {seasons.map(season => {
            const c = counts[season.id]
            return (
              <div key={season.id} style={{
                background: 'var(--bg-card)', border: `0.5px solid ${season.is_active ? 'rgba(109,184,117,0.35)' : 'var(--border)'}`,
                borderRadius: '12px', padding: '1rem 1.25rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '10px', flexWrap: 'wrap' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                      <span style={{ fontWeight: 800, fontSize: '16px' }}>{season.label}</span>
                      {season.is_active && (
                        <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: 'rgba(109,184,117,0.12)', color: '#6DB875', fontWeight: 700, border: '0.5px solid rgba(109,184,117,0.3)' }}>
                          Active
                        </span>
                      )}
                    </div>
                    {/* Age group chips */}
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: c ? '6px' : 0 }}>
                      {season.age_groups.map(ag => (
                        <span key={ag} style={{
                          fontSize: '12px', padding: '2px 9px', borderRadius: '20px',
                          background: 'rgba(var(--fg-rgb),0.07)', color: s.muted, fontWeight: 600,
                        }}>{ag}</span>
                      ))}
                    </div>
                    {/* Data counts */}
                    {c && (
                      <div style={{ display: 'flex', gap: '12px', fontSize: '12px', color: s.dim }}>
                        <span>{c.teams} team{c.teams !== 1 ? 's' : ''}</span>
                        <span>{c.sessions} session{c.sessions !== 1 ? 's' : ''}</span>
                        <span>{c.checkins} check-in{c.checkins !== 1 ? 's' : ''}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                    {!season.is_active && (
                      <button onClick={() => setActive(season.id)} style={{
                        fontSize: '12px', padding: '5px 12px', borderRadius: '5px',
                        border: '0.5px solid rgba(109,184,117,0.4)',
                        background: 'rgba(109,184,117,0.08)', color: '#6DB875',
                        cursor: 'pointer', fontWeight: 600,
                      }}>Set active</button>
                    )}
                    <button onClick={() => openEdit(season)} style={{
                      fontSize: '12px', padding: '5px 12px', borderRadius: '5px',
                      border: '0.5px solid var(--border-md)', background: 'var(--bg-input)',
                      color: s.muted, cursor: 'pointer',
                    }}>Edit</button>
                    <button onClick={() => setDeleteId(season.id)} style={{
                      fontSize: '12px', padding: '5px 12px', borderRadius: '5px',
                      border: '0.5px solid rgba(220,60,60,0.35)',
                      background: 'rgba(220,60,60,0.06)', color: '#DC3C3C',
                      cursor: 'pointer',
                    }}>Delete</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteId && deleteTarget && (
        <>
          <div
            onClick={() => !deleting && setDeleteId(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%',
            transform: 'translate(-50%,-50%)',
            zIndex: 51, background: 'var(--bg)',
            border: '0.5px solid var(--border)', borderRadius: '14px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
            width: 'min(420px, 92vw)', padding: '1.5rem',
            fontFamily: 'sans-serif',
          }}>
            <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '8px' }}>Delete &ldquo;{deleteTarget.label}&rdquo;?</div>

            {hasDeleteData ? (
              <div style={{
                background: 'rgba(220,60,60,0.08)', border: '0.5px solid rgba(220,60,60,0.3)',
                borderRadius: '8px', padding: '10px 14px', marginBottom: '16px', fontSize: '13px', color: s.muted,
              }}>
                This season has data that will be permanently deleted:
                <ul style={{ margin: '6px 0 0', paddingLeft: '18px', lineHeight: 1.8 }}>
                  {deleteCounts!.teams > 0    && <li>{deleteCounts!.teams} team{deleteCounts!.teams !== 1 ? 's' : ''}</li>}
                  {deleteCounts!.sessions > 0 && <li>{deleteCounts!.sessions} session{deleteCounts!.sessions !== 1 ? 's' : ''}</li>}
                  {deleteCounts!.checkins > 0 && <li>{deleteCounts!.checkins} check-in{deleteCounts!.checkins !== 1 ? 's' : ''}</li>}
                </ul>
                <div style={{ marginTop: '6px', fontSize: '12px', color: s.dim }}>Player records are not affected — they are shared across seasons.</div>
              </div>
            ) : (
              <div style={{ fontSize: '13px', color: s.muted, marginBottom: '16px' }}>
                This season has no data. It will be permanently removed.
              </div>
            )}

            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setDeleteId(null)} disabled={deleting} style={{
                padding: '9px 16px', borderRadius: '7px',
                border: '0.5px solid var(--border-md)', background: 'transparent',
                color: s.muted, fontSize: '14px', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={confirmDelete} disabled={deleting} style={{
                padding: '9px 20px', borderRadius: '7px', border: 'none',
                background: '#DC3C3C', color: '#fff',
                fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                opacity: deleting ? 0.6 : 1,
              }}>{deleting ? 'Deleting…' : 'Delete season'}</button>
            </div>
          </div>
        </>
      )}
    </main>
  )
}
