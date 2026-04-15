'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '../../../../../../../lib/supabase'
import Link from 'next/link'

interface Player {
  id:         string
  first_name: string
  last_name:  string
  age_group:  string
  jersey_number: string | null
}

interface ScoreField {
  key:      string
  label:    string
  weight:   number
  optional: boolean
}

interface Session {
  id:        string
  label:     string
  age_group: string
  status:    string
}

interface PendingScore {
  player_id:  string
  session_id: string
  org_id:     string
  scores:     Record<string, number>
  comments:   string
  savedAt:    number
}

const STORAGE_KEY_PREFIX = 'tryout_score_queue_'

function storageKey(sessionId: string) {
  return `${STORAGE_KEY_PREFIX}${sessionId}`
}

function loadQueue(sessionId: string): Record<string, PendingScore> {
  try {
    const raw = localStorage.getItem(storageKey(sessionId))
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

function saveQueue(sessionId: string, queue: Record<string, PendingScore>) {
  try {
    localStorage.setItem(storageKey(sessionId), JSON.stringify(queue))
  } catch {}
}

function clearPlayerFromQueue(sessionId: string, playerId: string) {
  const q = loadQueue(sessionId)
  delete q[playerId]
  saveQueue(sessionId, q)
}

// Default Hudson Baseball scoring fields — will be replaced by config from DB
const DEFAULT_FIELDS: ScoreField[] = [
  { key: 'speed',       label: 'Speed / Running',  weight: 0.11, optional: false },
  { key: 'ground_balls',label: 'Ground Balls',      weight: 0.11, optional: false },
  { key: 'fly_balls',   label: 'Fly Balls',         weight: 0.11, optional: false },
  { key: 'hitting',     label: 'Hitting',           weight: 0.17, optional: false },
  { key: 'pitching',    label: 'Pitching',          weight: 0.17, optional: true },
  { key: 'catching',    label: 'Catching',          weight: 0.33, optional: true },
]

function computeScore(scores: Record<string, number>, fields: ScoreField[]): number | null {
  const required = fields.filter(f => !f.optional)
  if (required.some(f => scores[f.key] == null)) return null

  let totalWeight = 0
  let weightedSum = 0
  for (const f of fields) {
    if (scores[f.key] != null) {
      totalWeight  += f.weight
      weightedSum  += scores[f.key] * f.weight
    }
  }
  if (totalWeight === 0) return null
  return weightedSum / totalWeight
}

export default function ScoringPage({ params }: { params: { orgId: string; sessionId: string } }) {
  const supabase = createClient()

  const [session,       setSession]       = useState<Session | null>(null)
  const [players,       setPlayers]       = useState<Player[]>([])
  const [fields,        setFields]        = useState<ScoreField[]>(DEFAULT_FIELDS)
  const [currentIndex,  setCurrentIndex]  = useState(0)
  const [scores,        setScores]        = useState<Record<string, number>>({})
  const [comments,      setComments]      = useState('')
  const [saving,        setSaving]        = useState(false)
  const [savedSet,      setSavedSet]      = useState<Set<string>>(new Set())
  const [offline,       setOffline]       = useState(false)
  const [flushingQueue, setFlushingQueue] = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [evaluatorName, setEvaluatorName] = useState<string>('')
  const [namePrompt,    setNamePrompt]    = useState(false)
  const [nameInput,     setNameInput]     = useState('')
  const [existingScores, setExistingScores] = useState<Set<string>>(new Set())

  useEffect(() => {
    loadData()
    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  function handleOnline()  { setOffline(false); flushOfflineQueue() }
  function handleOffline() { setOffline(true) }

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()

    const [
      { data: sessionData },
      { data: memberData },
    ] = await Promise.all([
      supabase.from('tryout_sessions').select('id, label, age_group, status').eq('id', params.sessionId).single(),
      user ? supabase.from('tryout_org_members').select('name, email').eq('org_id', params.orgId).eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
    ])

    setSession(sessionData)

    // Set evaluator name
    const savedName = localStorage.getItem(`tryout_eval_name_${params.orgId}`) ?? ''
    if (memberData?.name) {
      setEvaluatorName(memberData.name)
    } else if (memberData?.email) {
      setEvaluatorName(memberData.email)
    } else if (savedName) {
      setEvaluatorName(savedName)
    } else {
      setNamePrompt(true)
    }

    if (!sessionData) { setLoading(false); return }

    // Load scoring config
    const { data: configData } = await supabase
      .from('tryout_scoring_config')
      .select('category_key, label, weight, optional')
      .eq('org_id', params.orgId)
      .eq('is_active', true)
      .order('sort_order')

    if (configData && configData.length > 0) {
      setFields(configData.map((c: any) => ({
        key:      c.category_key,
        label:    c.label,
        weight:   c.weight,
        optional: c.optional,
      })))
    }

    // Load players for this age group
    const { data: playerData } = await supabase
      .from('tryout_players')
      .select('id, first_name, last_name, age_group, jersey_number')
      .eq('org_id', params.orgId)
      .eq('is_active', true)
      .eq('age_group', sessionData.age_group)
      .order('last_name').order('first_name')

    setPlayers(playerData ?? [])

    // Load already-submitted scores for this session (by this user/evaluator)
    if (user) {
      const { data: scoreData } = await supabase
        .from('tryout_scores')
        .select('player_id')
        .eq('session_id', params.sessionId)
        .eq('evaluator_id', user.id)
      setExistingScores(new Set((scoreData ?? []).map((s: any) => s.player_id)))
    }

    // Restore any offline queue
    const queue = loadQueue(params.sessionId)
    const queuedIds = new Set(Object.keys(queue))
    if (queuedIds.size > 0) setSavedSet(prev => new Set(Array.from(prev).concat(Array.from(queuedIds))))

    setLoading(false)
  }

  function setNameAndContinue() {
    const name = nameInput.trim()
    if (!name) return
    setEvaluatorName(name)
    localStorage.setItem(`tryout_eval_name_${params.orgId}`, name)
    setNamePrompt(false)
  }

  const currentPlayer = players[currentIndex] ?? null

  // Load saved scores for current player from queue
  useEffect(() => {
    if (!currentPlayer) return
    const queue = loadQueue(params.sessionId)
    const saved = queue[currentPlayer.id]
    if (saved) {
      setScores(saved.scores)
      setComments(saved.comments)
    } else {
      setScores({})
      setComments('')
    }
  }, [currentIndex, currentPlayer?.id])

  function setScore(key: string, value: number) {
    setScores(prev => ({ ...prev, [key]: value }))
  }

  function clearScore(key: string) {
    setScores(prev => { const next = { ...prev }; delete next[key]; return next })
  }

  const computed = computeScore(scores, fields)

  async function saveAndNext(goNext: boolean) {
    if (!currentPlayer || !session) return
    setSaving(true)

    const payload = {
      player_id:      currentPlayer.id,
      session_id:     params.sessionId,
      org_id:         params.orgId,
      scores,
      comments:       comments.trim(),
      savedAt:        Date.now(),
    }

    // Always save to local queue first (offline-safe)
    const queue = loadQueue(params.sessionId)
    queue[currentPlayer.id] = payload
    saveQueue(params.sessionId, queue)

    const online = navigator.onLine
    if (online) {
      const { data: { user } } = await supabase.auth.getUser()
      const tryoutScore = computed

      const { error } = await supabase.from('tryout_scores').upsert({
        player_id:      currentPlayer.id,
        session_id:     params.sessionId,
        org_id:         params.orgId,
        evaluator_id:   user?.id ?? 'anon',
        evaluator_name: evaluatorName || 'Evaluator',
        scores,
        tryout_score:   tryoutScore,
        comments:       comments.trim() || null,
        submitted_at:   new Date().toISOString(),
      }, { onConflict: 'player_id,session_id,evaluator_id' })

      if (!error) {
        clearPlayerFromQueue(params.sessionId, currentPlayer.id)
        setSavedSet(prev => new Set(Array.from(prev).concat(currentPlayer.id)))
        setExistingScores(prev => new Set(Array.from(prev).concat(currentPlayer.id)))
      }
    } else {
      // Saved to local queue
      setSavedSet(prev => new Set(Array.from(prev).concat(currentPlayer.id)))
    }

    setSaving(false)

    if (goNext && currentIndex < players.length - 1) {
      setCurrentIndex(i => i + 1)
    }
  }

  async function flushOfflineQueue() {
    const queue = loadQueue(params.sessionId)
    const entries = Object.entries(queue)
    if (entries.length === 0) return
    setFlushingQueue(true)

    const { data: { user } } = await supabase.auth.getUser()
    for (const [playerId, payload] of entries) {
      const allScores = payload.scores
      const tryoutScore = computeScore(allScores, fields)
      const { error } = await supabase.from('tryout_scores').upsert({
        player_id:      playerId,
        session_id:     params.sessionId,
        org_id:         params.orgId,
        evaluator_id:   user?.id ?? 'anon',
        evaluator_name: evaluatorName || 'Evaluator',
        scores:         allScores,
        tryout_score:   tryoutScore,
        comments:       payload.comments || null,
        submitted_at:   new Date().toISOString(),
      }, { onConflict: 'player_id,session_id,evaluator_id' })

      if (!error) {
        clearPlayerFromQueue(params.sessionId, playerId)
        setSavedSet(prev => new Set(Array.from(prev).concat(playerId)))
        setExistingScores(prev => new Set(Array.from(prev).concat(playerId)))
      }
    }
    setFlushingQueue(false)
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

  // Name prompt overlay
  if (namePrompt) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '16px', padding: '2rem', maxWidth: '360px', width: '100%' }}>
        <div style={{ fontSize: '18px', fontWeight: 800, marginBottom: '6px' }}>Who are you?</div>
        <div style={{ fontSize: '13px', color: s.muted, marginBottom: '1.5rem' }}>Your name will appear on each evaluation you submit.</div>
        <input
          type="text"
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && setNameAndContinue()}
          placeholder="Your name"
          autoFocus
          style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '8px', padding: '12px 14px', fontSize: '16px', color: 'var(--fg)', marginBottom: '12px' }}
        />
        <button onClick={setNameAndContinue} disabled={!nameInput.trim()} style={{
          width: '100%', padding: '12px', borderRadius: '8px', border: 'none',
          background: 'var(--accent)', color: 'var(--accent-text)',
          fontSize: '15px', fontWeight: 700, cursor: 'pointer',
          opacity: nameInput.trim() ? 1 : 0.5,
        }}>Start scoring</button>
      </div>
    </main>
  )

  if (!session) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Session not found.
    </main>
  )

  if (players.length === 0) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ fontSize: '16px', fontWeight: 700 }}>No players found</div>
      <div style={{ fontSize: '14px', color: s.muted, textAlign: 'center' }}>No players are registered for the {session.age_group} age group yet.</div>
      <Link href={`/org/${params.orgId}/tryouts/sessions/${params.sessionId}`} style={{ fontSize: '13px', color: s.dim }}>‹ Back to session</Link>
    </main>
  )

  // All players scored
  const allDone = players.every(p => savedSet.has(p.id) || existingScores.has(p.id))

  if (allDone && currentIndex >= players.length) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', flexDirection: 'column', gap: '1.5rem', textAlign: 'center' }}>
      <div style={{ fontSize: '40px' }}>✓</div>
      <div style={{ fontSize: '20px', fontWeight: 800 }}>All players scored!</div>
      <div style={{ fontSize: '14px', color: s.muted }}>{session.label} · {session.age_group}</div>
      {offline && (
        <div style={{ fontSize: '13px', padding: '10px 16px', borderRadius: '8px', background: 'rgba(232,160,32,0.1)', color: '#E8A020', border: '0.5px solid rgba(232,160,32,0.3)' }}>
          Scores saved locally. They will sync when you're back online.
        </div>
      )}
      <Link href={`/org/${params.orgId}/tryouts/sessions/${params.sessionId}`} style={{
        padding: '12px 28px', borderRadius: '8px', background: 'var(--accent)',
        color: 'var(--accent-text)', fontSize: '15px', fontWeight: 700, textDecoration: 'none',
      }}>Back to session</Link>
    </main>
  )

  const scoredCount = players.filter(p => savedSet.has(p.id) || existingScores.has(p.id)).length
  const isScored    = currentPlayer ? (savedSet.has(currentPlayer.id) || existingScores.has(currentPlayer.id)) : false
  const hasRequiredScores = fields.filter(f => !f.optional).every(f => scores[f.key] != null)

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', maxWidth: '480px', margin: '0 auto', padding: '0 0 6rem' }}>

      {/* Top bar */}
      <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 10 }}>
        <Link href={`/org/${params.orgId}/tryouts/sessions/${params.sessionId}`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', flexShrink: 0 }}>‹ Back</Link>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 700 }}>{session.label} · {session.age_group}</div>
          <div style={{ fontSize: '11px', color: s.dim }}>{scoredCount} / {players.length} scored</div>
        </div>
        <div style={{ fontSize: '11px', color: offline ? '#E8A020' : '#6DB875', fontWeight: 700, flexShrink: 0 }}>
          {offline ? 'Offline' : 'Online'}
        </div>
      </div>

      {/* Offline sync banner */}
      {!offline && flushingQueue && (
        <div style={{ padding: '8px 16px', background: 'rgba(109,184,117,0.12)', borderBottom: '0.5px solid rgba(109,184,117,0.3)', fontSize: '12px', color: '#6DB875', textAlign: 'center' }}>
          Syncing offline scores…
        </div>
      )}

      {/* Player navigator */}
      <div style={{ padding: '12px 16px', display: 'flex', gap: '6px', overflowX: 'auto', borderBottom: '0.5px solid var(--border)' }}>
        {players.map((p, i) => {
          const done = savedSet.has(p.id) || existingScores.has(p.id)
          const active = i === currentIndex
          return (
            <button key={p.id} onClick={() => setCurrentIndex(i)} style={{
              flexShrink: 0,
              width: '36px', height: '36px', borderRadius: '50%',
              border: active ? '2px solid var(--accent)' : done ? '2px solid #6DB875' : '1.5px solid var(--border-md)',
              background: active ? 'rgba(232,160,32,0.12)' : done ? 'rgba(109,184,117,0.12)' : 'var(--bg-input)',
              color: active ? 'var(--accent)' : done ? '#6DB875' : s.muted,
              fontSize: '11px', fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {p.jersey_number ?? (i + 1)}
            </button>
          )
        })}
      </div>

      {/* Current player */}
      {currentPlayer && (
        <div style={{ padding: '16px 16px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div>
              <div style={{ fontSize: '22px', fontWeight: 800 }}>{currentPlayer.first_name} {currentPlayer.last_name}</div>
              <div style={{ fontSize: '13px', color: s.muted }}>
                {currentPlayer.age_group}
                {currentPlayer.jersey_number ? ` · #${currentPlayer.jersey_number}` : ''}
              </div>
            </div>
            {isScored && (
              <span style={{ fontSize: '11px', padding: '3px 10px', borderRadius: '20px', background: 'rgba(109,184,117,0.12)', color: '#6DB875', fontWeight: 700 }}>
                Scored
              </span>
            )}
          </div>

          {/* Score fields */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
            {fields.map(field => (
              <div key={field.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 600 }}>
                    {field.label}
                    {field.optional && <span style={{ fontSize: '11px', color: s.dim, fontWeight: 400, marginLeft: '4px' }}>(optional)</span>}
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {scores[field.key] != null && (
                      <button onClick={() => clearScore(field.key)} style={{
                        fontSize: '11px', color: s.dim, background: 'none', border: 'none', cursor: 'pointer', padding: '0',
                      }}>clear</button>
                    )}
                    <span style={{ fontSize: '13px', fontWeight: 700, color: scores[field.key] != null ? 'var(--accent)' : s.dim, minWidth: '16px', textAlign: 'right' }}>
                      {scores[field.key] ?? '–'}
                    </span>
                  </div>
                </div>
                {/* 1–5 tap buttons */}
                <div style={{ display: 'flex', gap: '8px' }}>
                  {[1, 2, 3, 4, 5].map(v => (
                    <button key={v} onClick={() => setScore(field.key, v)} style={{
                      flex: 1, padding: '14px 0', borderRadius: '8px',
                      border: scores[field.key] === v
                        ? '2px solid var(--accent)'
                        : '1.5px solid var(--border-md)',
                      background: scores[field.key] === v
                        ? 'rgba(232,160,32,0.15)'
                        : 'var(--bg-input)',
                      color: scores[field.key] === v ? 'var(--accent)' : s.muted,
                      fontSize: '16px', fontWeight: 800, cursor: 'pointer',
                      WebkitTapHighlightColor: 'transparent',
                    }}>{v}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Computed score preview */}
          {computed != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: '10px', background: 'rgba(232,160,32,0.08)', border: '0.5px solid rgba(232,160,32,0.25)', marginBottom: '12px' }}>
              <span style={{ fontSize: '13px', color: s.muted }}>Tryout score</span>
              <span style={{ fontSize: '20px', fontWeight: 800, color: 'var(--accent)', marginLeft: 'auto' }}>{computed.toFixed(2)}</span>
            </div>
          )}

          {/* Comments */}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes (optional)</label>
            <textarea
              value={comments}
              onChange={e => setComments(e.target.value)}
              placeholder="Any observations about this player…"
              rows={2}
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: 'var(--fg)', resize: 'vertical', fontFamily: 'sans-serif' }}
            />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '8px', paddingBottom: '24px' }}>
            <button
              onClick={() => saveAndNext(false)}
              disabled={saving || !hasRequiredScores}
              style={{
                flex: 1, padding: '15px', borderRadius: '10px', border: 'none',
                background: hasRequiredScores ? 'rgba(109,184,117,0.15)' : 'var(--bg-input)',
                color: hasRequiredScores ? '#6DB875' : s.dim,
                fontSize: '15px', fontWeight: 700, cursor: saving || !hasRequiredScores ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.6 : 1,
              }}
            >{saving ? 'Saving…' : 'Save'}</button>

            {currentIndex < players.length - 1 && (
              <button
                onClick={() => saveAndNext(true)}
                disabled={saving || !hasRequiredScores}
                style={{
                  flex: 2, padding: '15px', borderRadius: '10px', border: 'none',
                  background: hasRequiredScores ? 'var(--accent)' : 'var(--bg-input)',
                  color: hasRequiredScores ? 'var(--accent-text)' : s.dim,
                  fontSize: '15px', fontWeight: 700, cursor: saving || !hasRequiredScores ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >{saving ? 'Saving…' : 'Save & Next →'}</button>
            )}

            {currentIndex === players.length - 1 && (
              <button
                onClick={() => saveAndNext(true)}
                disabled={saving || !hasRequiredScores}
                style={{
                  flex: 2, padding: '15px', borderRadius: '10px', border: 'none',
                  background: hasRequiredScores ? 'var(--accent)' : 'var(--bg-input)',
                  color: hasRequiredScores ? 'var(--accent-text)' : s.dim,
                  fontSize: '15px', fontWeight: 700, cursor: saving || !hasRequiredScores ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1,
                }}
              >{saving ? 'Saving…' : 'Save & Finish ✓'}</button>
            )}
          </div>

          {/* Skip without scoring */}
          {currentIndex < players.length - 1 && (
            <button onClick={() => setCurrentIndex(i => i + 1)} style={{
              width: '100%', padding: '10px', background: 'none', border: 'none',
              color: s.dim, fontSize: '13px', cursor: 'pointer', marginTop: '-8px', paddingBottom: '8px',
            }}>Skip →</button>
          )}
        </div>
      )}
    </main>
  )
}
