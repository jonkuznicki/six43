'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { createClient } from '../../../../../../../lib/supabase'
import Link from 'next/link'

interface Player {
  id: string; first_name: string; last_name: string
  jersey_number: string | null; prior_team: string | null
}

interface EvalField {
  key: string; label: string; section: string; is_optional: boolean
}

interface Team { id: string; name: string; age_group: string }
interface Season { id: string; label: string; year: number }
interface OrgMember { id: string; name: string | null; email: string; role: string }

const SECTION_LABELS: Record<string, string> = {
  fielding_hitting:   'Fielding & Hitting',
  pitching_catching:  'Pitching & Catching',
  intangibles:        'Intangibles',
}

const SCALE = '5=Exceptional · 4=Above age · 3=Age appropriate · 2=Below age · 1=Needs work'

export default function CoachEvalPage({ params }: { params: { orgId: string; teamId: string } }) {
  const supabase = createClient()

  const [team,        setTeam]        = useState<Team | null>(null)
  const [season,      setSeason]      = useState<Season | null>(null)
  const [member,      setMember]      = useState<OrgMember | null>(null)
  const [players,     setPlayers]     = useState<Player[]>([])
  const [fields,      setFields]      = useState<EvalField[]>([])
  const [scores,      setScores]      = useState<Record<string, Record<string, number | null>>>({})
  const [naFlags,     setNaFlags]     = useState<Record<string, Set<string>>>({})
  const [comments,    setComments]    = useState<Record<string, string>>({})
  const [evalStatus,  setEvalStatus]  = useState<'not_started' | 'in_progress' | 'submitted'>('not_started')
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [savedAt,     setSavedAt]     = useState<Date | null>(null)
  const [view,        setView]        = useState<'table' | 'card'>('table')
  const [cardIdx,     setCardIdx]     = useState(0)
  const [submitting,  setSubmitting]  = useState(false)

  const autoSaveTimer = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => { loadData() }, [])

  useEffect(() => {
    autoSaveTimer.current = setInterval(saveDraft, 30000)
    return () => clearInterval(autoSaveTimer.current)
  }, [scores, comments, naFlags])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    const [{ data: teamData }, { data: seasonData }, memberResult] = await Promise.all([
      supabase.from('tryout_teams').select('id, name, age_group').eq('id', params.teamId).single(),
      supabase.from('tryout_seasons').select('id, label, year').eq('org_id', params.orgId).eq('is_active', true).maybeSingle(),
      user ? supabase.from('tryout_org_members').select('id, name, email, role').eq('org_id', params.orgId).eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
    ])
    setTeam(teamData)
    setSeason(seasonData)
    setMember(memberResult.data)

    if (!teamData || !seasonData) { setLoading(false); return }

    // Players on this team (by prior_team match)
    const [{ data: playerData }, { data: fieldData }, { data: evalData }] = await Promise.all([
      supabase.from('tryout_players').select('id, first_name, last_name, jersey_number, prior_team')
        .eq('org_id', params.orgId).eq('is_active', true)
        .eq('prior_team', teamData.name)
        .order('last_name').order('first_name'),
      supabase.from('tryout_coach_eval_config')
        .select('field_key, label, section, is_optional, sort_order')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id)
        .order('sort_order'),
      supabase.from('tryout_coach_evals').select('player_id, scores, comments, status, submitted_at')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id).eq('team_label', teamData.name),
    ])

    setPlayers(playerData ?? [])
    setFields((fieldData ?? []).map((f: any) => ({
      key: f.field_key, label: f.label, section: f.section, is_optional: f.is_optional,
    })))

    // Load existing eval data
    const scoreMap: typeof scores = {}
    const commentMap: typeof comments = {}
    let status: typeof evalStatus = 'not_started'
    let submAt: string | null = null

    for (const ev of (evalData ?? [])) {
      scoreMap[ev.player_id] = ev.scores ?? {}
      commentMap[ev.player_id] = ev.comments ?? ''
      if (ev.status === 'submitted') { status = 'submitted'; submAt = ev.submitted_at }
      else if (ev.status === 'draft' && status !== 'submitted') status = 'in_progress'
    }

    setScores(scoreMap)
    setComments(commentMap)
    setEvalStatus(status)
    setSubmittedAt(submAt)
    setLoading(false)
  }

  function setScore(playerId: string, fieldKey: string, val: number | null) {
    setScores(prev => ({ ...prev, [playerId]: { ...(prev[playerId] ?? {}), [fieldKey]: val } }))
  }

  function isNa(playerId: string, fieldKey: string) {
    return naFlags[playerId]?.has(fieldKey) ?? false
  }

  function toggleNa(playerId: string, fieldKey: string) {
    setNaFlags(prev => {
      const set = new Set(prev[playerId] ?? [])
      if (set.has(fieldKey)) set.delete(fieldKey)
      else {
        set.add(fieldKey)
        setScore(playerId, fieldKey, null)
      }
      return { ...prev, [playerId]: set }
    })
  }

  function playerComplete(playerId: string): boolean {
    const playerScores = scores[playerId] ?? {}
    return fields.every(f => {
      if (f.is_optional) return true
      if (isNa(playerId, f.key)) return true
      return playerScores[f.key] != null
    })
  }

  function playerStarted(playerId: string): boolean {
    const playerScores = scores[playerId] ?? {}
    return Object.values(playerScores).some(v => v != null)
  }

  async function saveDraft() {
    if (evalStatus === 'submitted') return
    const { data: { user } } = await supabase.auth.getUser()
    if (!season) return
    setSaving(true)

    for (const player of players) {
      const playerScores = scores[player.id]
      if (!playerScores || Object.keys(playerScores).length === 0) continue

      const avgScore = (() => {
        const vals = Object.values(playerScores).filter((v): v is number => v != null)
        return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
      })()

      await supabase.from('tryout_coach_evals').upsert({
        player_id:     player.id,
        org_id:        params.orgId,
        season_year:   String(season.year),
        season_id:     season.id,
        team_label:    team?.name ?? '',
        coach_user_id: user?.id,
        coach_name:    member?.name ?? member?.email ?? 'Coach',
        scores:        playerScores,
        overall_score: avgScore,
        comments:      comments[player.id] ?? null,
        status:        'draft',
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'player_id,season_id' })
    }

    setSaving(false)
    setSavedAt(new Date())
  }

  async function submitEvals() {
    if (!window.confirm('Submit evaluations? You won\'t be able to edit them after submission.')) return
    setSubmitting(true)
    await saveDraft()

    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('tryout_coach_evals')
      .update({ status: 'submitted', submitted_at: new Date().toISOString() })
      .eq('org_id', params.orgId).eq('season_id', season?.id).eq('team_label', team?.name ?? '')

    setEvalStatus('submitted')
    setSubmittedAt(new Date().toISOString())
    setSubmitting(false)
  }

  const completedCount = players.filter(p => playerComplete(p.id)).length
  const startedCount   = players.filter(p => playerStarted(p.id)).length
  const canSubmit      = startedCount === players.length && evalStatus !== 'submitted'

  const sections = useMemo(() => {
    const map = new Map<string, EvalField[]>()
    for (const f of fields) {
      const list = map.get(f.section) ?? []
      list.push(f)
      map.set(f.section, list)
    }
    return Array.from(map.entries())
  }, [fields])

  const s = { muted: `rgba(var(--fg-rgb),0.55)`, dim: `rgba(var(--fg-rgb),0.35)` }

  if (loading) return <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>

  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '2px' }}>Player Evaluations</h1>
          <div style={{ fontSize: '13px', color: s.muted }}>{team?.name} · {season?.label}</div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '12px', color: s.dim }}>
            {saving ? 'Saving…' : savedAt ? `Saved ${savedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
          </span>
          {/* View toggle */}
          {(['table', 'card'] as const).map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: '5px 12px', borderRadius: '5px', border: '0.5px solid',
              borderColor: view === v ? 'var(--accent)' : 'var(--border-md)',
              background: view === v ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
              color: view === v ? 'var(--accent)' : s.muted,
              fontSize: '12px', cursor: 'pointer', textTransform: 'capitalize',
            }}>{v}</button>
          ))}
        </div>
      </div>

      {/* Status banner */}
      <div style={{
        background: evalStatus === 'submitted' ? 'rgba(109,184,117,0.1)' : evalStatus === 'in_progress' ? 'rgba(232,160,32,0.08)' : 'var(--bg-card)',
        border: `0.5px solid ${evalStatus === 'submitted' ? 'rgba(109,184,117,0.3)' : evalStatus === 'in_progress' ? 'rgba(232,160,32,0.3)' : 'var(--border)'}`,
        borderRadius: '10px', padding: '12px 16px', marginBottom: '1.25rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px',
      }}>
        <div>
          <span style={{ fontSize: '13px', fontWeight: 700, color: evalStatus === 'submitted' ? '#6DB875' : evalStatus === 'in_progress' ? 'var(--accent)' : s.muted }}>
            {evalStatus === 'submitted' ? `✅ Submitted${submittedAt ? ` · ${new Date(submittedAt).toLocaleDateString()}` : ''}` :
             evalStatus === 'in_progress' ? `🟡 In progress — ${completedCount} of ${players.length} complete` :
             '⬜ Not started'}
          </span>
        </div>
        {evalStatus !== 'submitted' && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={saveDraft} disabled={saving} style={{
              padding: '7px 16px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
              background: 'var(--bg-input)', color: s.muted, fontSize: '12px', cursor: 'pointer',
            }}>Save draft</button>
            <button onClick={submitEvals} disabled={!canSubmit || submitting} style={{
              padding: '7px 16px', borderRadius: '6px', border: 'none',
              background: canSubmit ? 'var(--accent)' : 'var(--bg-input)',
              color: canSubmit ? 'var(--accent-text)' : s.dim,
              fontSize: '12px', fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}>Submit for Review</button>
          </div>
        )}
      </div>

      <div style={{ fontSize: '11px', color: s.dim, marginBottom: '1rem' }}>{SCALE}</div>

      {/* ── TABLE VIEW ─────────────────────────────────────────────────────── */}
      {view === 'table' && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', fontSize: '12px', minWidth: '100%' }}>
            <thead>
              <tr>
                <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '2px solid var(--border)', position: 'sticky', left: 0, background: 'var(--bg)', zIndex: 2, minWidth: '140px' }}>Player</th>
                {sections.map(([sec, secFields]) => (
                  secFields.map((f, fi) => (
                    <th key={f.key} style={{
                      padding: '4px 6px', textAlign: 'center', borderBottom: '2px solid var(--border)',
                      borderLeft: fi === 0 ? '0.5px solid var(--border-md)' : undefined,
                      fontSize: '10px', fontWeight: 600, minWidth: '50px',
                      color: s.muted, whiteSpace: 'nowrap', overflow: 'hidden',
                    }} title={f.label}>
                      {f.label.split(' ').map(w => w[0]).join('').slice(0, 4)}
                    </th>
                  ))
                ))}
                <th style={{ padding: '4px 8px', borderBottom: '2px solid var(--border)', borderLeft: '0.5px solid var(--border-md)', fontSize: '11px', color: s.dim, minWidth: '100px' }}>Comment</th>
                <th style={{ padding: '4px 8px', borderBottom: '2px solid var(--border)', borderLeft: '0.5px solid var(--border-md)', fontSize: '11px', color: s.dim, minWidth: '60px' }}>Done</th>
              </tr>
            </thead>
            <tbody>
              {players.map(player => {
                const complete = playerComplete(player.id)
                const started  = playerStarted(player.id)
                return (
                  <tr key={player.id} style={{ background: complete ? 'rgba(109,184,117,0.06)' : started ? 'rgba(232,160,32,0.05)' : 'transparent' }}>
                    <td style={{ padding: '5px 10px', borderBottom: '0.5px solid var(--border)', position: 'sticky', left: 0, background: complete ? 'rgba(109,184,117,0.06)' : started ? 'rgba(232,160,32,0.05)' : 'var(--bg)', zIndex: 1, fontWeight: 600 }}>
                      {player.first_name} {player.last_name}
                      {player.jersey_number && <span style={{ fontSize: '10px', color: s.dim, marginLeft: '4px' }}>#{player.jersey_number}</span>}
                    </td>
                    {sections.map(([sec, secFields]) => (
                      secFields.map((f, fi) => {
                        const na  = isNa(player.id, f.key)
                        const val = scores[player.id]?.[f.key] ?? null
                        return (
                          <td key={f.key} style={{
                            padding: '2px 3px', textAlign: 'center',
                            borderBottom: '0.5px solid var(--border)',
                            borderLeft: fi === 0 ? '0.5px solid var(--border-md)' : undefined,
                          }}>
                            {evalStatus === 'submitted' ? (
                              <span style={{ fontSize: '13px', fontWeight: 700, color: na ? s.dim : 'var(--fg)' }}>{na ? '—' : val ?? '—'}</span>
                            ) : (
                              <select
                                value={na ? 'na' : (val == null ? '' : String(val))}
                                onChange={e => {
                                  if (e.target.value === 'na') { toggleNa(player.id, f.key) }
                                  else if (e.target.value === '') { setScore(player.id, f.key, null) }
                                  else { if (naFlags[player.id]?.has(f.key)) toggleNa(player.id, f.key); setScore(player.id, f.key, Number(e.target.value)) }
                                }}
                                style={{ width: '48px', padding: '2px', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '4px', fontSize: '12px', color: 'var(--fg)', textAlign: 'center' }}
                              >
                                <option value="">—</option>
                                <option value="1">1</option>
                                <option value="2">2</option>
                                <option value="3">3</option>
                                <option value="4">4</option>
                                <option value="5">5</option>
                                {f.is_optional && <option value="na">N/A</option>}
                              </select>
                            )}
                          </td>
                        )
                      })
                    ))}
                    <td style={{ padding: '2px 6px', borderBottom: '0.5px solid var(--border)', borderLeft: '0.5px solid var(--border-md)' }}>
                      {evalStatus !== 'submitted' ? (
                        <input type="text" value={comments[player.id] ?? ''} placeholder="—"
                          onChange={e => setComments(prev => ({ ...prev, [player.id]: e.target.value }))}
                          style={{ width: '100%', background: 'transparent', border: 'none', fontSize: '11px', color: s.muted }}
                        />
                      ) : <span style={{ fontSize: '11px', color: s.muted }}>{comments[player.id] ?? '—'}</span>}
                    </td>
                    <td style={{ padding: '4px 8px', textAlign: 'center', borderBottom: '0.5px solid var(--border)', borderLeft: '0.5px solid var(--border-md)' }}>
                      {complete ? <span style={{ color: '#6DB875', fontSize: '14px' }}>✓</span> : started ? <span style={{ color: 'var(--accent)', fontSize: '12px' }}>…</span> : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── CARD VIEW ──────────────────────────────────────────────────────── */}
      {view === 'card' && players.length > 0 && (
        <div style={{ maxWidth: '480px' }}>
          {/* Player selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.25rem' }}>
            <button onClick={() => setCardIdx(Math.max(0, cardIdx - 1))} disabled={cardIdx === 0}
              style={{ padding: '8px 16px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: s.muted, cursor: cardIdx === 0 ? 'not-allowed' : 'pointer', opacity: cardIdx === 0 ? 0.4 : 1 }}>
              ← Prev
            </button>
            <div style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontWeight: 700 }}>{players[cardIdx].first_name} {players[cardIdx].last_name}</div>
              <div style={{ fontSize: '12px', color: s.dim }}>{cardIdx + 1} of {players.length}</div>
            </div>
            <button onClick={() => setCardIdx(Math.min(players.length - 1, cardIdx + 1))} disabled={cardIdx === players.length - 1}
              style={{ padding: '8px 16px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: s.muted, cursor: cardIdx === players.length - 1 ? 'not-allowed' : 'pointer', opacity: cardIdx === players.length - 1 ? 0.4 : 1 }}>
              Next →
            </button>
          </div>

          {/* Fields */}
          {sections.map(([sec, secFields]) => (
            <div key={sec} style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '11px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: s.dim, marginBottom: '10px' }}>
                {SECTION_LABELS[sec] ?? sec}
              </div>
              {secFields.map(f => {
                const playerId = players[cardIdx].id
                const na  = isNa(playerId, f.key)
                const val = scores[playerId]?.[f.key] ?? null
                return (
                  <div key={f.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <div style={{ minWidth: '120px', fontSize: '13px' }}>{f.label}</div>
                    <div style={{ display: 'flex', gap: '5px', flex: 1 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button key={n}
                          onClick={() => { if (na) toggleNa(playerId, f.key); setScore(playerId, f.key, val === n ? null : n) }}
                          disabled={evalStatus === 'submitted'}
                          style={{
                            flex: 1, minHeight: '40px', borderRadius: '6px', border: '0.5px solid',
                            borderColor: !na && val === n ? 'var(--accent)' : 'var(--border-md)',
                            background: !na && val === n ? 'var(--accent)' : 'var(--bg-input)',
                            color: !na && val === n ? 'var(--accent-text)' : 'var(--fg)',
                            fontSize: '14px', fontWeight: !na && val === n ? 800 : 400,
                            cursor: evalStatus === 'submitted' ? 'default' : 'pointer',
                            opacity: na ? 0.3 : 1,
                          }}>
                          {n}
                        </button>
                      ))}
                      {f.is_optional && (
                        <button onClick={() => toggleNa(playerId, f.key)} disabled={evalStatus === 'submitted'}
                          style={{
                            minHeight: '40px', padding: '0 10px', borderRadius: '6px', border: '0.5px solid',
                            borderColor: na ? 'var(--accent)' : 'var(--border-md)',
                            background: na ? 'rgba(232,160,32,0.12)' : 'var(--bg-input)',
                            color: na ? 'var(--accent)' : s.dim, fontSize: '12px',
                            cursor: evalStatus === 'submitted' ? 'default' : 'pointer',
                          }}>
                          N/A
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}

          {/* Comment */}
          <textarea value={comments[players[cardIdx].id] ?? ''} placeholder="Optional comment…"
            disabled={evalStatus === 'submitted'}
            onChange={e => setComments(prev => ({ ...prev, [players[cardIdx].id]: e.target.value }))}
            rows={3}
            style={{ width: '100%', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '7px', padding: '8px 10px', fontSize: '13px', color: 'var(--fg)', resize: 'none', boxSizing: 'border-box' }}
          />
        </div>
      )}
    </main>
  )
}
