'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '../../../../../../../lib/supabase'
import { computeTryoutScore, ScoringCategory } from '../../../../../../../lib/tryouts/computeScore'

interface Checkin {
  id: string; tryout_number: number; player_id: string | null
  is_write_in: boolean; write_in_name: string | null
  player?: { first_name: string; last_name: string; prior_team: string | null }
}

interface Session {
  id: string; label: string; age_group: string; season_id: string; status: string
}

const SCALE_LABEL = '5 = Exceptional · 4 = Above age · 3 = Age appropriate · 2 = Below age · 1 = Needs work'

export default function EvaluatorScorePage({ params }: { params: { orgId: string; sessionId: string } }) {
  const supabase = createClient()

  const [session,       setSession]       = useState<Session | null>(null)
  const [categories,    setCategories]    = useState<ScoringCategory[]>([])
  const [checkins,      setCheckins]      = useState<Checkin[]>([])
  const [currentIdx,    setCurrentIdx]    = useState(0)
  const [scores,        setScores]        = useState<Record<string, Record<string, number | null>>>({})
  const [naFlags,       setNaFlags]       = useState<Record<string, Set<string>>>({}) // checkinId → Set of optional category keys
  const [comments,      setComments]      = useState<Record<string, string>>({})
  const [evaluatorName, setEvaluatorName] = useState('')
  const [evaluatorId,   setEvaluatorId]   = useState<string | null>(null)
  const [namePrompt,    setNamePrompt]    = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [saving,        setSaving]        = useState(false)
  const [savedAt,       setSavedAt]       = useState<Date | null>(null)
  const [offline,       setOffline]       = useState(false)
  const [jumpInput,     setJumpInput]     = useState('')
  const [showComment,   setShowComment]   = useState<Record<string, boolean>>({})
  const [done,          setDone]          = useState(false)

  // Write-in modal
  const [showWriteIn,   setShowWriteIn]   = useState(false)
  const [wiName,        setWiName]        = useState('')
  const [wiAge,         setWiAge]         = useState('')

  const offlineQueue = useRef<any[]>([])

  useEffect(() => {
    window.addEventListener('online', () => { setOffline(false); flushQueue() })
    window.addEventListener('offline', () => setOffline(true))
    return () => {
      window.removeEventListener('online', () => setOffline(false))
      window.removeEventListener('offline', () => setOffline(true))
    }
  }, [])

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) setEvaluatorId(user.id)

    const { data: sess } = await supabase
      .from('tryout_sessions').select('id, label, age_group, season_id, status')
      .eq('id', params.sessionId).single()
    setSession(sess)
    if (!sess) { setLoading(false); return }

    const [{ data: catData }, { data: checkinData }, memberResult] = await Promise.all([
      supabase.from('tryout_scoring_config')
        .select('category, label, weight, is_optional, subcategories, sort_order')
        .eq('season_id', sess.season_id).order('sort_order'),
      supabase.from('tryout_checkins')
        .select('id, tryout_number, player_id, is_write_in, write_in_name, tryout_players(first_name, last_name, prior_team)')
        .eq('session_id', params.sessionId).order('tryout_number'),
      user ? supabase.from('tryout_org_members').select('name, email').eq('org_id', params.orgId).eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
    ])

    setCategories((catData ?? []).map((c: any) => ({
      category: c.category, label: c.label, weight: c.weight,
      is_optional: c.is_optional, is_tiebreaker: c.is_tiebreaker ?? false, subcategories: c.subcategories ?? [],
    })))

    const enrichedCheckins = (checkinData ?? []).map((c: any) => ({
      id: c.id, tryout_number: c.tryout_number, player_id: c.player_id,
      is_write_in: c.is_write_in, write_in_name: c.write_in_name,
      player: c.tryout_players ?? null,
    }))
    setCheckins(enrichedCheckins)

    // Load existing scores for this evaluator
    if (user) {
      const { data: existingScores } = await supabase
        .from('tryout_scores').select('player_id, scores, comments')
        .eq('session_id', params.sessionId).eq('evaluator_id', user.id)

      const scoreMap: typeof scores = {}
      const commentMap: typeof comments = {}
      for (const sc of (existingScores ?? [])) {
        scoreMap[sc.player_id] = sc.scores ?? {}
        commentMap[sc.player_id] = sc.comments ?? ''
      }
      setScores(scoreMap)
      setComments(commentMap)
    }

    // Evaluator name
    const member = memberResult.data
    const saved  = localStorage.getItem(`tryout_eval_name_${params.orgId}`)
    if (member?.name) setEvaluatorName(member.name)
    else if (member?.email) setEvaluatorName(member.email)
    else if (saved) setEvaluatorName(saved)
    else setNamePrompt(true)

    setLoading(false)
  }

  const current = checkins[currentIdx]

  function playerName(c: Checkin) {
    if (c.is_write_in) return c.write_in_name ?? 'Write-in'
    return c.player ? `${c.player.first_name} ${c.player.last_name}` : 'Unknown'
  }

  function isNa(checkinId: string, catKey: string): boolean {
    return naFlags[checkinId]?.has(catKey) ?? false
  }

  function toggleNa(checkinId: string, catKey: string) {
    setNaFlags(prev => {
      const set = new Set(prev[checkinId] ?? [])
      if (set.has(catKey)) set.delete(catKey)
      else { set.add(catKey); clearCategoryScores(checkinId, catKey) }
      return { ...prev, [checkinId]: set }
    })
  }

  function clearCategoryScores(checkinId: string, catKey: string) {
    const cat = categories.find(c => c.category === catKey)
    if (!cat || !current?.player_id) return
    const pid = current.player_id
    setScores(prev => {
      const playerScores = { ...(prev[pid] ?? {}) }
      for (const sub of cat.subcategories) { playerScores[sub.key] = null }
      return { ...prev, [pid]: playerScores }
    })
  }

  function setScore(playerId: string, subKey: string, val: number) {
    setScores(prev => ({
      ...prev,
      [playerId]: { ...(prev[playerId] ?? {}), [subKey]: val },
    }))
  }

  async function saveCurrentAndAdvance() {
    if (!current || !evaluatorId) return
    setSaving(true)
    const playerId = current.player_id
    if (playerId) {
      const playerScores = scores[playerId] ?? {}
      const tryoutScore  = computeTryoutScore(playerScores, categories)
      const record = {
        player_id:      playerId,
        session_id:     params.sessionId,
        org_id:         params.orgId,
        evaluator_id:   evaluatorId,
        evaluator_name: evaluatorName,
        scores:         playerScores,
        tryout_score:   tryoutScore,
        comments:       comments[playerId] ?? null,
        submitted_at:   new Date().toISOString(),
      }

      if (!offline) {
        await supabase.from('tryout_scores').upsert(record, { onConflict: 'player_id,session_id,evaluator_id' })
        setSavedAt(new Date())
      } else {
        offlineQueue.current.push(record)
        localStorage.setItem(`tryout_queue_${params.sessionId}`, JSON.stringify(offlineQueue.current))
        setSavedAt(new Date())
      }
    }
    setSaving(false)

    // Find next unsaved player
    const nextUnsaved = checkins.findIndex((c, i) =>
      i > currentIdx && c.player_id && !scores[c.player_id]
    )
    if (nextUnsaved >= 0) {
      setCurrentIdx(nextUnsaved)
    } else if (currentIdx < checkins.length - 1) {
      setCurrentIdx(currentIdx + 1)
    } else {
      setDone(true)
    }
  }

  async function flushQueue() {
    for (const record of offlineQueue.current) {
      await supabase.from('tryout_scores').upsert(record, { onConflict: 'player_id,session_id,evaluator_id' })
    }
    offlineQueue.current = []
    localStorage.removeItem(`tryout_queue_${params.sessionId}`)
  }

  function jumpTo(numStr: string) {
    const num = parseInt(numStr)
    if (isNaN(num)) return
    const idx = checkins.findIndex(c => c.tryout_number === num)
    if (idx >= 0) { setCurrentIdx(idx); setJumpInput('') }
  }

  async function addWriteIn() {
    if (!wiName.trim()) return
    const maxNum = checkins.length > 0 ? Math.max(...checkins.map(c => c.tryout_number)) : 0
    const { data } = await supabase.from('tryout_checkins').insert({
      session_id: params.sessionId, tryout_number: maxNum + 1,
      is_write_in: true, write_in_name: wiName.trim(),
      write_in_age_group: wiAge.trim() || session?.age_group,
    }).select('id, tryout_number, player_id, is_write_in, write_in_name').single()
    if (data) setCheckins(prev => [...prev, { ...data, player: undefined }])
    setWiName(''); setWiAge(''); setShowWriteIn(false)
  }

  const scoredCount = checkins.filter(c => c.player_id && scores[c.player_id] && Object.values(scores[c.player_id]).some(v => v != null)).length

  const s = { muted: `rgba(var(--fg-rgb),0.55)`, dim: `rgba(var(--fg-rgb),0.35)` }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>
  )

  if (!session) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Session not found.</main>
  )

  // Name prompt
  if (namePrompt) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ maxWidth: '320px', width: '100%' }}>
        <div style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px' }}>Who are you?</div>
        <div style={{ fontSize: '13px', color: s.muted, marginBottom: '16px' }}>Enter your name so your scores are attributed correctly.</div>
        <input autoFocus value={evaluatorName} onChange={e => setEvaluatorName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && evaluatorName.trim()) { localStorage.setItem(`tryout_eval_name_${params.orgId}`, evaluatorName.trim()); setNamePrompt(false) } }}
          placeholder="Your name"
          style={{ width: '100%', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '7px', padding: '10px 12px', fontSize: '15px', color: 'var(--fg)', boxSizing: 'border-box', marginBottom: '12px' }}
        />
        <button onClick={() => { localStorage.setItem(`tryout_eval_name_${params.orgId}`, evaluatorName.trim()); setNamePrompt(false) }} disabled={!evaluatorName.trim()} style={{
          width: '100%', padding: '11px', borderRadius: '7px', border: 'none',
          background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '15px', fontWeight: 700, cursor: 'pointer',
        }}>Start Scoring</button>
      </div>
    </main>
  )

  // No checkins
  if (checkins.length === 0) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '12px', padding: '2rem', textAlign: 'center' }}>
      <div style={{ fontSize: '32px' }}>📋</div>
      <div style={{ fontSize: '18px', fontWeight: 700 }}>No players checked in</div>
      <div style={{ fontSize: '14px', color: s.muted }}>The admin needs to check in players before scoring can begin.</div>
    </main>
  )

  // Done screen
  if (done) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '16px', padding: '2rem', textAlign: 'center' }}>
      <div style={{ fontSize: '48px' }}>✓</div>
      <div style={{ fontSize: '22px', fontWeight: 800 }}>All done!</div>
      <div style={{ fontSize: '14px', color: s.muted }}>{scoredCount} of {checkins.length} players scored.</div>
      <button onClick={() => { setDone(false); setCurrentIdx(0) }} style={{
        padding: '10px 24px', borderRadius: '7px', border: '0.5px solid var(--border-md)',
        background: 'var(--bg-input)', color: s.muted, fontSize: '14px', cursor: 'pointer',
      }}>Review scores</button>
    </main>
  )

  if (!current) return null

  const playerId    = current.player_id
  const playerScore = playerId ? (scores[playerId] ?? {}) : {}

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', maxWidth: '480px', margin: '0 auto', paddingBottom: '120px' }}>

      {/* Offline banner */}
      {offline && (
        <div style={{ background: '#E8A020', color: 'white', textAlign: 'center', padding: '8px', fontSize: '13px', fontWeight: 600 }}>
          Offline — scores will sync when reconnected
        </div>
      )}

      {/* Session header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '12px', color: s.muted, fontWeight: 600 }}>{session.age_group} · {session.label}</div>
            <div style={{ fontSize: '13px', color: s.dim }}>Evaluator: {evaluatorName}</div>
          </div>
          <div style={{ fontSize: '13px', color: s.dim, fontWeight: 700 }}>
            {scoredCount}/{checkins.length}
          </div>
        </div>
        {/* Progress bar */}
        <div style={{ marginTop: '8px', height: '3px', background: 'var(--border)', borderRadius: '2px', overflow: 'hidden' }}>
          <div style={{ width: `${checkins.length > 0 ? (scoredCount / checkins.length) * 100 : 0}%`, height: '100%', background: 'var(--accent)', transition: 'width 0.3s' }} />
        </div>
      </div>

      {/* Player header */}
      <div style={{ padding: '14px 16px 12px', background: 'rgba(var(--fg-rgb),0.03)', borderBottom: '0.5px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ fontSize: '28px', fontWeight: 800, color: 'var(--accent)' }}>#{current.tryout_number}</span>
          <span style={{ fontSize: '18px', fontWeight: 700 }}>{playerName(current)}</span>
        </div>
        {current.player?.prior_team && (
          <div style={{ fontSize: '12px', color: '#40A0E8', marginTop: '2px' }}>↩ {current.player.prior_team}</div>
        )}
        {current.is_write_in && (
          <div style={{ fontSize: '12px', color: 'var(--accent)' }}>Write-in player</div>
        )}
      </div>

      {/* Rating scale reminder */}
      <div style={{ padding: '8px 16px', background: 'rgba(var(--fg-rgb),0.02)', borderBottom: '0.5px solid var(--border)', fontSize: '11px', color: s.dim }}>
        {SCALE_LABEL}
      </div>

      {/* Scoring */}
      <div style={{ padding: '16px' }}>
        {categories.map(cat => {
          const na = playerId ? isNa(current.id, cat.category) : false
          return (
            <div key={cat.category} style={{ marginBottom: '20px' }}>
              {/* Category header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ fontSize: '12px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: s.muted }}>
                  {cat.label}
                </div>
                {cat.is_optional && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '12px', color: na ? 'var(--accent)' : s.dim, cursor: 'pointer' }}>
                    <input type="checkbox" checked={na}
                      onChange={() => playerId && toggleNa(current.id, cat.category)}
                    />
                    N/A
                  </label>
                )}
              </div>

              {!na && cat.subcategories.map(sub => {
                const val = playerId ? (playerScore[sub.key] ?? null) : null
                return (
                  <div key={sub.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <div style={{ fontSize: '14px', minWidth: '90px', color: 'var(--fg)' }}>{sub.label}</div>
                    <div style={{ display: 'flex', gap: '6px', flex: 1 }}>
                      {[1, 2, 3, 4, 5].map(n => (
                        <button key={n} onClick={() => playerId && setScore(playerId, sub.key, n)}
                          disabled={!playerId}
                          style={{
                            flex: 1, minHeight: '48px', borderRadius: '8px',
                            border: '0.5px solid',
                            borderColor: val === n ? 'var(--accent)' : 'var(--border-md)',
                            background: val === n ? 'var(--accent)' : 'var(--bg-input)',
                            color: val === n ? 'var(--accent-text)' : 'var(--fg)',
                            fontSize: '16px', fontWeight: val === n ? 800 : 400,
                            cursor: playerId ? 'pointer' : 'default',
                          }}>
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}

        {/* Comment */}
        {playerId && (
          <div style={{ marginTop: '8px' }}>
            {!showComment[current.id] ? (
              <button onClick={() => setShowComment(prev => ({ ...prev, [current.id]: true }))} style={{
                background: 'none', border: '0.5px dashed var(--border-md)',
                borderRadius: '6px', padding: '8px 16px', width: '100%',
                color: s.dim, fontSize: '13px', cursor: 'pointer',
              }}>+ Comment</button>
            ) : (
              <textarea
                value={comments[playerId] ?? ''}
                onChange={e => setComments(prev => ({ ...prev, [playerId]: e.target.value }))}
                placeholder="Optional comment about this player…"
                rows={3}
                style={{ width: '100%', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '7px', padding: '8px 10px', fontSize: '13px', color: 'var(--fg)', resize: 'none', boxSizing: 'border-box' }}
              />
            )}
          </div>
        )}
      </div>

      {/* Bottom navigation — sticky */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'var(--bg)', borderTop: '0.5px solid var(--border)', padding: '12px 16px', maxWidth: '480px', margin: '0 auto' }}>
        {/* Jump to number */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <span style={{ fontSize: '12px', color: s.dim, flexShrink: 0 }}>Jump to #</span>
          <input
            value={jumpInput} onChange={e => setJumpInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && jumpTo(jumpInput)}
            type="number" min={1} placeholder="—"
            style={{ width: '64px', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '5px', padding: '5px 8px', fontSize: '14px', color: 'var(--fg)', textAlign: 'center' }}
          />
          <button onClick={() => jumpTo(jumpInput)} style={{
            padding: '5px 12px', borderRadius: '5px', border: '0.5px solid var(--border-md)',
            background: 'var(--bg-input)', color: s.muted, fontSize: '12px', cursor: 'pointer',
          }}>Go</button>
          <span style={{ marginLeft: 'auto', fontSize: '12px', color: s.dim }}>
            {savedAt ? `Saved ${savedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : saving ? 'Saving…' : ''}
          </span>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => setCurrentIdx(Math.max(0, currentIdx - 1))} disabled={currentIdx === 0} style={{
            padding: '12px 20px', borderRadius: '8px', border: '0.5px solid var(--border-md)',
            background: 'var(--bg-input)', color: s.muted, fontSize: '14px', fontWeight: 600,
            cursor: currentIdx === 0 ? 'not-allowed' : 'pointer', opacity: currentIdx === 0 ? 0.4 : 1,
          }}>← Prev</button>
          <button onClick={saveCurrentAndAdvance} disabled={saving} style={{
            flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
            background: 'var(--accent)', color: 'var(--accent-text)',
            fontSize: '15px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer',
          }}>
            {saving ? 'Saving…' : currentIdx < checkins.length - 1 ? 'Save & Next →' : 'Save & Finish ✓'}
          </button>
        </div>

        {/* Add write-in */}
        <button onClick={() => setShowWriteIn(true)} style={{
          marginTop: '8px', width: '100%', padding: '7px', borderRadius: '6px',
          border: '0.5px dashed var(--border-md)', background: 'none',
          color: s.dim, fontSize: '12px', cursor: 'pointer',
        }}>+ Add Write-In Player</button>
      </div>

      {/* Write-in modal */}
      {showWriteIn && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: '16px' }}>
          <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1.5rem', width: '100%', maxWidth: '320px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Add Write-In</div>
            <input value={wiName} onChange={e => setWiName(e.target.value)} placeholder="Full name" autoFocus
              style={{ width: '100%', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '8px 10px', fontSize: '14px', color: 'var(--fg)', boxSizing: 'border-box', marginBottom: '8px' }}
            />
            <input value={wiAge} onChange={e => setWiAge(e.target.value)} placeholder={`Age group (${session.age_group})`}
              style={{ width: '100%', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '8px 10px', fontSize: '14px', color: 'var(--fg)', boxSizing: 'border-box', marginBottom: '14px' }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={addWriteIn} disabled={!wiName.trim()} style={{
                flex: 1, padding: '10px', borderRadius: '6px', border: 'none',
                background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              }}>Add</button>
              <button onClick={() => setShowWriteIn(false)} style={{
                padding: '10px 16px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
                background: 'transparent', color: s.muted, fontSize: '14px', cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
