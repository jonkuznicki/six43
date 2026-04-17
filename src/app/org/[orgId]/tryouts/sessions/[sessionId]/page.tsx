'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../../../../lib/supabase'
import Link from 'next/link'

interface Session {
  id:           string
  label:        string
  age_group:    string
  session_date: string
  start_time:   string | null
  end_time:     string | null
  field:        string | null
  status:       'scheduled' | 'open' | 'closed'
  season_id:    string
}

interface OrgMember {
  id:      string
  name:    string | null
  email:   string
  role:    string
  user_id: string | null
}

interface Evaluator {
  id:         string
  member_id:  string
  name:       string | null
  email:      string
}

interface Score {
  id:             string
  player_id:      string
  evaluator_id:   string
  evaluator_name: string | null
  tryout_score:   number | null
  scores:         Record<string, number> | null
  comments:       string | null
  submitted_at:   string | null
  player_name?:   string
}

interface Player {
  id:         string
  first_name: string
  last_name:  string
  age_group:  string
}

const STATUS_STYLES = {
  scheduled: { label: 'Scheduled', color: `rgba(var(--fg-rgb),0.4)`,  bg: `rgba(var(--fg-rgb),0.06)` },
  open:      { label: 'Open',      color: '#6DB875',                  bg: 'rgba(45,106,53,0.12)' },
  closed:    { label: 'Closed',    color: `rgba(var(--fg-rgb),0.35)`, bg: `rgba(var(--fg-rgb),0.04)` },
}

export default function SessionDetailPage({ params }: { params: { orgId: string; sessionId: string } }) {
  const supabase = createClient()

  const [session,    setSession]    = useState<Session | null>(null)
  const [members,    setMembers]    = useState<OrgMember[]>([])
  const [evaluators, setEvaluators] = useState<Evaluator[]>([])
  const [scores,     setScores]     = useState<Score[]>([])
  const [players,    setPlayers]    = useState<Player[]>([])
  const [loading,    setLoading]    = useState(true)
  const [addingEval, setAddingEval] = useState(false)
  const [selectedMember, setSelectedMember] = useState('')
  const [saving,     setSaving]     = useState(false)
  const [statusChanging, setStatusChanging] = useState(false)
  const [copied,     setCopied]     = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: sessionData } = await supabase
      .from('tryout_sessions').select('*')
      .eq('id', params.sessionId).single()
    setSession(sessionData)

    if (!sessionData) { setLoading(false); return }

    const [
      { data: memberData },
      { data: evalData },
      { data: scoreData },
      { data: playerData },
    ] = await Promise.all([
      supabase.from('tryout_org_members').select('id, name, email, role, user_id')
        .eq('org_id', params.orgId).eq('is_active', true),
      supabase.from('tryout_session_evaluators').select('id, member_id, name, email')
        .eq('session_id', params.sessionId),
      supabase.from('tryout_scores').select('id, player_id, evaluator_id, evaluator_name, tryout_score, scores, comments, submitted_at')
        .eq('session_id', params.sessionId),
      supabase.from('tryout_players').select('id, first_name, last_name, age_group')
        .eq('org_id', params.orgId).eq('is_active', true)
        .eq('age_group', sessionData.age_group),
    ])

    const playerMap = new Map((playerData ?? []).map((p: any) => [p.id, `${p.first_name} ${p.last_name}`]))
    const enrichedScores = (scoreData ?? []).map((s: any) => ({
      ...s,
      player_name: playerMap.get(s.player_id) ?? 'Unknown',
    }))

    setMembers(memberData ?? [])
    setEvaluators(evalData ?? [])
    setScores(enrichedScores)
    setPlayers(playerData ?? [])
    setLoading(false)
  }

  async function addEvaluator() {
    if (!selectedMember || !session) return
    const member = members.find(m => m.id === selectedMember)
    if (!member) return
    setSaving(true)
    const { data } = await supabase.from('tryout_session_evaluators').insert({
      session_id: session.id,
      org_id:     params.orgId,
      member_id:  member.id,
      name:       member.name,
      email:      member.email,
    }).select('id, member_id, name, email').single()
    if (data) setEvaluators(prev => [...prev, data])
    setSelectedMember('')
    setAddingEval(false)
    setSaving(false)
  }

  async function removeEvaluator(evalId: string) {
    await supabase.from('tryout_session_evaluators').delete().eq('id', evalId)
    setEvaluators(prev => prev.filter(e => e.id !== evalId))
  }

  async function setStatus(status: Session['status']) {
    if (!session) return
    setStatusChanging(true)
    await supabase.from('tryout_sessions').update({ status }).eq('id', session.id)
    setSession(prev => prev ? { ...prev, status } : prev)
    setStatusChanging(false)
  }

  function copyScoringLink() {
    const url = `${window.location.origin}/org/${params.orgId}/tryouts/sessions/${params.sessionId}/score`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading…
    </main>
  )

  if (!session) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Session not found.
    </main>
  )

  const st = STATUS_STYLES[session.status]

  // Evaluators who have submitted at least one score
  const evaluatorsWithScores = new Set(scores.map(s => s.evaluator_id))

  // Players scored vs total
  const scoredPlayerIds = new Set(scores.map(s => s.player_id))
  const progress = players.length > 0
    ? `${scoredPlayerIds.size} / ${players.length} players scored`
    : `${scores.length} scores`

  // Already-assigned member IDs
  const assignedMemberIds = new Set(evaluators.map(e => e.member_id))
  const availableMembers  = members.filter(m => !assignedMemberIds.has(m.id))

  // Group scores by evaluator
  const byEvaluator = new Map<string, Score[]>()
  for (const score of scores) {
    const key = score.evaluator_name ?? score.evaluator_id
    byEvaluator.set(key, [...(byEvaluator.get(key) ?? []), score])
  }

  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts/sessions`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Sessions</Link>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '2rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <h1 style={{ fontSize: '22px', fontWeight: 800 }}>{session.label}</h1>
            <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(var(--fg-rgb),0.07)', color: s.muted, fontWeight: 600 }}>{session.age_group}</span>
            <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: st.bg, color: st.color, fontWeight: 700 }}>{st.label}</span>
          </div>
          <div style={{ fontSize: '13px', color: s.dim }}>
            {new Date(session.session_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            {session.start_time ? ` · ${session.start_time}` : ''}
            {session.end_time ? `–${session.end_time}` : ''}
            {session.field ? ` · ${session.field}` : ''}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {session.status === 'scheduled' && (
            <button onClick={() => setStatus('open')} disabled={statusChanging} style={{
              padding: '8px 16px', borderRadius: '6px', border: 'none',
              background: 'rgba(45,106,53,0.15)', color: '#6DB875',
              fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            }}>Open for scoring</button>
          )}
          {session.status === 'open' && (
            <button onClick={() => setStatus('closed')} disabled={statusChanging} style={{
              padding: '8px 16px', borderRadius: '6px', border: 'none',
              background: 'rgba(var(--fg-rgb),0.07)', color: s.muted,
              fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            }}>Close session</button>
          )}
          {session.status === 'closed' && (
            <button onClick={() => setStatus('open')} disabled={statusChanging} style={{
              padding: '8px 16px', borderRadius: '6px', border: 'none',
              background: 'rgba(var(--fg-rgb),0.07)', color: s.muted,
              fontSize: '13px', fontWeight: 700, cursor: 'pointer',
            }}>Re-open</button>
          )}
          <Link href={`/org/${params.orgId}/tryouts/sessions/${params.sessionId}/checkin`} style={{
            padding: '8px 16px', borderRadius: '6px',
            border: '0.5px solid var(--border-md)',
            background: 'var(--bg-input)', color: s.muted,
            fontSize: '13px', fontWeight: 600, textDecoration: 'none',
            display: 'inline-block',
          }}>Check in players</Link>
          <Link href={`/org/${params.orgId}/tryouts/sessions/${params.sessionId}/roster`} style={{
            padding: '8px 16px', borderRadius: '6px',
            border: '0.5px solid var(--border-md)',
            background: 'var(--bg-input)', color: s.muted,
            fontSize: '13px', fontWeight: 600, textDecoration: 'none',
            display: 'inline-block',
          }}>Print roster</Link>
          <Link href={`/org/${params.orgId}/tryouts/sessions/${params.sessionId}/evalform`} style={{
            padding: '8px 16px', borderRadius: '6px',
            border: '0.5px solid var(--border-md)',
            background: 'var(--bg-input)', color: s.muted,
            fontSize: '13px', fontWeight: 600, textDecoration: 'none',
            display: 'inline-block',
          }}>Print eval forms</Link>
          <Link href={`/org/${params.orgId}/tryouts/sessions/${params.sessionId}/enter`} style={{
            padding: '8px 16px', borderRadius: '6px',
            border: '0.5px solid var(--border-md)',
            background: 'var(--bg-input)', color: s.muted,
            fontSize: '13px', fontWeight: 600, textDecoration: 'none',
            display: 'inline-block',
          }}>Enter scores (grid)</Link>
          <Link href={`/org/${params.orgId}/tryouts/sessions/${params.sessionId}/score`} style={{
            padding: '8px 16px', borderRadius: '6px', border: 'none',
            background: 'var(--accent)', color: 'var(--accent-text)',
            fontSize: '13px', fontWeight: 700, textDecoration: 'none',
            display: 'inline-block',
          }}>Score players (mobile) →</Link>
        </div>
      </div>

      {/* Progress + scoring link */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '14px 16px', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <div style={{ fontSize: '13px', fontWeight: 700 }}>{progress}</div>
          <div style={{ fontSize: '12px', color: s.dim, marginTop: '2px' }}>
            {evaluatorsWithScores.size} evaluator{evaluatorsWithScores.size !== 1 ? 's' : ''} submitted scores
          </div>
        </div>
        <button onClick={copyScoringLink} style={{
          padding: '7px 14px', borderRadius: '6px',
          border: '0.5px solid var(--border-md)',
          background: copied ? 'rgba(45,106,53,0.12)' : 'var(--bg-input)',
          color: copied ? '#6DB875' : s.muted,
          fontSize: '12px', fontWeight: 600, cursor: 'pointer',
        }}>
          {copied ? '✓ Copied!' : '⎘ Copy scoring link'}
        </button>
      </div>

      {/* Evaluators */}
      <div style={{ marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '14px', fontWeight: 700 }}>Evaluators</div>
          {!addingEval && availableMembers.length > 0 && (
            <button onClick={() => setAddingEval(true)} style={{
              fontSize: '12px', padding: '4px 12px', borderRadius: '5px',
              border: '0.5px solid var(--border-md)', background: 'var(--bg-input)',
              color: s.muted, cursor: 'pointer',
            }}>+ Add</button>
          )}
        </div>

        {evaluators.length === 0 && !addingEval && (
          <div style={{ fontSize: '13px', color: s.dim, padding: '1rem 0' }}>
            No evaluators assigned. Add org members who will score players at this session.
          </div>
        )}

        {evaluators.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: addingEval ? '10px' : '0' }}>
            {evaluators.map(ev => (
              <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{ev.name ?? ev.email}</div>
                  {ev.name && <div style={{ fontSize: '11px', color: s.dim }}>{ev.email}</div>}
                </div>
                {evaluatorsWithScores.has(ev.member_id) && (
                  <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: 'rgba(45,106,53,0.12)', color: '#6DB875', fontWeight: 700 }}>
                    {scores.filter(sc => sc.evaluator_id === ev.member_id).length} scores
                  </span>
                )}
                <button onClick={() => removeEvaluator(ev.id)} style={{
                  fontSize: '11px', padding: '3px 8px', borderRadius: '4px',
                  border: '0.5px solid var(--border-md)', background: 'transparent',
                  color: s.dim, cursor: 'pointer',
                }}>Remove</button>
              </div>
            ))}
          </div>
        )}

        {addingEval && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
            <select value={selectedMember} onChange={e => setSelectedMember(e.target.value)} style={{
              background: 'var(--bg-input)', border: '0.5px solid var(--border-md)',
              borderRadius: '6px', padding: '7px 12px', fontSize: '13px', color: 'var(--fg)',
            }}>
              <option value="">Select member…</option>
              {availableMembers.map(m => (
                <option key={m.id} value={m.id}>{m.name ?? m.email} ({m.role})</option>
              ))}
            </select>
            <button onClick={addEvaluator} disabled={!selectedMember || saving} style={{
              padding: '7px 16px', borderRadius: '6px', border: 'none',
              background: 'var(--accent)', color: 'var(--accent-text)',
              fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              opacity: !selectedMember || saving ? 0.6 : 1,
            }}>Add</button>
            <button onClick={() => { setAddingEval(false); setSelectedMember('') }} style={{
              padding: '7px 12px', borderRadius: '6px',
              border: '0.5px solid var(--border-md)', background: 'transparent',
              color: s.muted, fontSize: '13px', cursor: 'pointer',
            }}>Cancel</button>
          </div>
        )}
      </div>

      {/* Scores */}
      {scores.length > 0 && (
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '0.75rem' }}>
            Scores ({scores.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {scores.map(score => (
              <div key={score.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '8px', padding: '10px 14px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{score.player_name}</div>
                  <div style={{ fontSize: '11px', color: s.dim, marginTop: '1px' }}>
                    by {score.evaluator_name ?? 'Unknown evaluator'}
                    {score.submitted_at ? ` · ${new Date(score.submitted_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
                  </div>
                </div>
                {score.tryout_score != null && (
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent)' }}>
                    {score.tryout_score.toFixed(1)}
                  </div>
                )}
                {score.scores && Object.keys(score.scores).length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {Object.entries(score.scores).map(([k, v]) => (
                      <span key={k} style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(var(--fg-rgb),0.06)', color: s.muted }}>
                        {k.replace(/_/g, ' ')}: {v}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {scores.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '14px' }}>
          No scores yet.{' '}
          {session.status === 'scheduled'
            ? 'Open this session for scoring first.'
            : 'Share the scoring link with evaluators to get started.'}
        </div>
      )}
    </main>
  )
}
