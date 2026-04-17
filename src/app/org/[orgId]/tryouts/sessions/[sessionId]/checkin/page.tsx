'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../../../../../../lib/supabase'
import Link from 'next/link'

interface Player {
  id: string; first_name: string; last_name: string
  age_group: string; jersey_number: string | null; prior_team: string | null
}

interface Checkin {
  id: string; player_id: string | null; tryout_number: number | null
  arrived: boolean
  is_write_in: boolean; write_in_name: string | null; write_in_age_group: string | null
  checked_in_at: string
}

interface Session {
  id: string; label: string; age_group: string; season_id: string; session_date: string
  numbering_method: 'checkin_order' | 'alphabetical'
}

export default function CheckinPage({ params }: { params: { orgId: string; sessionId: string } }) {
  const supabase = createClient()

  const [session,          setSession]          = useState<Session | null>(null)
  const [players,          setPlayers]          = useState<Player[]>([])
  const [checkins,         setCheckins]         = useState<Checkin[]>([])
  const [otherSessionsMax, setOtherSessionsMax] = useState(0)
  const [search,           setSearch]           = useState('')
  const [loading,          setLoading]          = useState(true)
  const [busy,             setBusy]             = useState<string | null>(null)
  const [checkinError,     setCheckinError]     = useState<string | null>(null)

  // Write-in modal
  const [showWriteIn,     setShowWriteIn]     = useState(false)
  const [writeInName,     setWriteInName]     = useState('')
  const [writeInAgeGroup, setWriteInAgeGroup] = useState('')
  const [writingIn,       setWritingIn]       = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: sess } = await supabase
      .from('tryout_sessions').select('id, label, age_group, season_id, session_date, numbering_method')
      .eq('id', params.sessionId).single()
    setSession(sess)
    if (!sess) { setLoading(false); return }

    const [{ data: pData }, { data: cData }, { data: otherData }] = await Promise.all([
      supabase.from('tryout_players').select('id, first_name, last_name, age_group, jersey_number, prior_team')
        .eq('org_id', params.orgId).eq('is_active', true).eq('age_group', sess.age_group)
        .order('last_name').order('first_name'),
      supabase.from('tryout_checkins').select('*')
        .eq('session_id', params.sessionId)
        .order('arrived', { ascending: false })   // arrived players first, then pre-assigned
        .order('tryout_number', { ascending: true, nullsFirst: false }),
      // Max tryout number across ALL sessions for this season+age_group (for global numbering)
      supabase.from('tryout_checkins').select('tryout_number')
        .eq('season_id', sess.season_id).eq('age_group', sess.age_group)
        .neq('session_id', params.sessionId)
        .not('tryout_number', 'is', null)
        .order('tryout_number', { ascending: false }).limit(1),
    ])
    setPlayers(pData ?? [])
    setCheckins(cData ?? [])
    setOtherSessionsMax(otherData?.[0]?.tryout_number ?? 0)
    setLoading(false)
  }

  // IDs of players already in this session (assigned or arrived)
  const assignedPlayerIds = useMemo(
    () => new Set(checkins.map(c => c.player_id).filter(Boolean)),
    [checkins]
  )

  // Players not yet in this session at all — shown as walk-ups
  const unassignedPlayers = useMemo(() => {
    const q = search.toLowerCase()
    return players.filter(p =>
      !assignedPlayerIds.has(p.id) &&
      (q === '' || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q))
    )
  }, [players, assignedPlayerIds, search])

  // Pre-assigned but not yet arrived — shown in the "tap to arrive" section
  const preAssigned = useMemo(
    () => checkins.filter(c => !c.arrived && !c.is_write_in),
    [checkins]
  )

  // Already arrived (or write-ins)
  const arrived = useMemo(
    () => checkins.filter(c => c.arrived || c.is_write_in),
    [checkins]
  )

  function nextNumber() {
    // Global: continuous within season+age_group across all sessions
    const arrivedNums = checkins.filter(c => c.tryout_number != null).map(c => c.tryout_number as number)
    const localMax    = arrivedNums.length > 0 ? Math.max(...arrivedNums) : 0
    return Math.max(localMax, otherSessionsMax) + 1
  }

  // Mark a pre-assigned player as arrived — assigns their tryout number
  async function markArrived(checkinId: string) {
    setBusy(checkinId)
    setCheckinError(null)
    const num = session?.numbering_method === 'alphabetical' ? null : nextNumber()

    const { data: updated, error } = await supabase
      .from('tryout_checkins')
      .update({ arrived: true, tryout_number: num ?? null, checked_in_at: new Date().toISOString() })
      .eq('id', checkinId)
      .select('*').single()

    if (error) { setCheckinError(error.message); setBusy(null); return }
    if (updated) {
      setCheckins(prev => prev.map(c => c.id === checkinId ? updated : c))
      if (session?.numbering_method === 'alphabetical') {
        const all = checkins.map(c => c.id === checkinId ? updated : c)
        await renumberAlphabetically(all.filter(c => c.arrived))
      }
    }
    setBusy(null)
  }

  // Walk-up or direct check-in (player not pre-assigned)
  async function checkIn(playerId: string) {
    setBusy(playerId)
    setCheckinError(null)
    const num = session?.numbering_method === 'alphabetical' ? null : nextNumber()

    const { data: newCheckin, error } = await supabase.from('tryout_checkins').insert({
      session_id:   params.sessionId,
      player_id:    playerId,
      tryout_number: num ?? null,
      season_id:    session!.season_id,
      age_group:    session!.age_group,
      arrived:      true,
      is_write_in:  false,
    }).select('*').single()

    if (error) { setCheckinError(error.message); setBusy(null); return }

    if (newCheckin) {
      if (session?.numbering_method === 'alphabetical') {
        const all = [...arrived, newCheckin]
        await renumberAlphabetically(all)
      } else {
        setCheckins(prev => [...prev, newCheckin])
      }
    }
    setBusy(null)
  }

  async function removeCheckin(checkinId: string) {
    setBusy(checkinId)
    await supabase.from('tryout_checkins').delete().eq('id', checkinId)
    const remaining = checkins.filter(c => c.id !== checkinId)
    if (session?.numbering_method === 'alphabetical') {
      await renumberAlphabetically(remaining.filter(c => c.arrived))
    } else {
      setCheckins(remaining)
    }
    setBusy(null)
  }

  async function renumberAlphabetically(list: Checkin[]) {
    const playerMap = new Map(players.map(p => [p.id, p]))
    const sorted = [...list].sort((a, b) => {
      if (a.is_write_in && !b.is_write_in) return 1
      if (!a.is_write_in && b.is_write_in) return -1
      const na = a.is_write_in ? (a.write_in_name ?? '') : (() => { const p = playerMap.get(a.player_id!); return p ? `${p.last_name} ${p.first_name}` : '' })()
      const nb = b.is_write_in ? (b.write_in_name ?? '') : (() => { const p = playerMap.get(b.player_id!); return p ? `${p.last_name} ${p.first_name}` : '' })()
      return na.localeCompare(nb)
    })
    const startFrom = otherSessionsMax + 1
    await Promise.all(sorted.map((c, i) =>
      supabase.from('tryout_checkins').update({ tryout_number: startFrom + i }).eq('id', c.id)
    ))
    setCheckins(prev => {
      const byId = new Map(sorted.map((c, i) => [c.id, { ...c, tryout_number: startFrom + i }]))
      return prev.map(c => byId.get(c.id) ?? c)
    })
  }

  async function toggleNumberingMethod(method: 'checkin_order' | 'alphabetical') {
    if (!session) return
    await supabase.from('tryout_sessions').update({ numbering_method: method }).eq('id', session.id)
    setSession(prev => prev ? { ...prev, numbering_method: method } : prev)
    if (method === 'alphabetical' && arrived.length > 0) {
      await renumberAlphabetically(arrived)
    }
  }

  async function addWriteIn() {
    if (!writeInName.trim()) return
    setWritingIn(true)
    const { data } = await supabase.from('tryout_checkins').insert({
      session_id:        params.sessionId,
      season_id:         session!.season_id,
      age_group:         session!.age_group,
      tryout_number:     nextNumber(),
      arrived:           true,
      is_write_in:       true,
      write_in_name:     writeInName.trim(),
      write_in_age_group: writeInAgeGroup.trim() || session?.age_group,
    }).select('*').single()
    if (data) setCheckins(prev => [...prev, data])
    setWriteInName('')
    setWriteInAgeGroup('')
    setShowWriteIn(false)
    setWritingIn(false)
  }

  const playerMap = useMemo(() => new Map(players.map(p => [p.id, p])), [players])

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>
  )

  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts/sessions/${params.sessionId}`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Session</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '2px' }}>Check-In</h1>
          <div style={{ fontSize: '13px', color: s.muted }}>
            {session?.label} · {session?.age_group}
            {preAssigned.length > 0 && (
              <span style={{ marginLeft: '10px', padding: '2px 8px', borderRadius: '20px', background: 'rgba(80,160,232,0.1)', color: '#40A0E8', fontSize: '11px', fontWeight: 600 }}>
                {preAssigned.length} pre-assigned
              </span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style={{ fontSize: '12px', color: s.dim }}>Numbering:</span>
          {(['checkin_order', 'alphabetical'] as const).map(m => (
            <button key={m} onClick={() => toggleNumberingMethod(m)} style={{
              padding: '5px 12px', borderRadius: '5px', border: '0.5px solid',
              borderColor: session?.numbering_method === m ? 'var(--accent)' : 'var(--border-md)',
              background: session?.numbering_method === m ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
              color: session?.numbering_method === m ? 'var(--accent)' : s.muted,
              fontSize: '12px', cursor: 'pointer',
            }}>{m === 'checkin_order' ? 'Arrival order' : 'Alphabetical'}</button>
          ))}
          <Link href={`/org/${params.orgId}/tryouts/sessions/${params.sessionId}/roster`} style={{
            padding: '5px 14px', borderRadius: '5px', border: '0.5px solid var(--border-md)',
            background: 'var(--bg-input)', color: s.muted, fontSize: '12px',
            textDecoration: 'none', display: 'inline-block',
          }}>⎙ Print roster</Link>
        </div>
      </div>

      {checkinError && (
        <div style={{ padding: '10px 14px', marginBottom: '1rem', background: 'rgba(232,112,96,0.1)', border: '0.5px solid rgba(232,112,96,0.4)', borderRadius: '8px', fontSize: '12px', color: '#E87060' }}>
          Check-in failed: {checkinError}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

        {/* ── Left column: arrived + pre-assigned ─────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

          {/* Arrived */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700 }}>
                Arrived <span style={{ fontSize: '13px', color: s.dim, fontWeight: 400 }}>({arrived.length})</span>
              </div>
              <button onClick={() => setShowWriteIn(true)} style={{
                padding: '4px 12px', borderRadius: '5px', border: '0.5px solid var(--border-md)',
                background: 'var(--bg-input)', color: s.muted, fontSize: '12px', cursor: 'pointer',
              }}>+ Walk-up</button>
            </div>

            {arrived.length === 0 ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', color: s.dim, fontSize: '13px', background: 'var(--bg-card)', borderRadius: '10px', border: '0.5px solid var(--border)' }}>
                {preAssigned.length > 0 ? 'Tap pre-assigned players on the left as they arrive.' : 'No one checked in yet.'}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {arrived.map(c => {
                  const player = c.player_id ? playerMap.get(c.player_id) : null
                  const name = c.is_write_in ? (c.write_in_name ?? 'Walk-up') : player ? `${player.first_name} ${player.last_name}` : 'Unknown'
                  return (
                    <div key={c.id} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      background: 'var(--bg-card)', border: '0.5px solid var(--border)',
                      borderRadius: '8px', padding: '8px 12px',
                    }}>
                      <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent)', minWidth: '32px', textAlign: 'center' }}>
                        {c.tryout_number != null ? `#${c.tryout_number}` : '—'}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{name}</div>
                        {player?.prior_team && <div style={{ fontSize: '11px', color: '#40A0E8' }}>↩ {player.prior_team}</div>}
                        {c.is_write_in && <div style={{ fontSize: '11px', color: s.muted }}>Walk-up · {c.write_in_age_group ?? '—'}</div>}
                      </div>
                      <button onClick={() => removeCheckin(c.id)} disabled={busy === c.id} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#E87060', fontSize: '16px', padding: '2px 6px',
                        opacity: busy === c.id ? 0.4 : 1,
                      }}>×</button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Pre-assigned (not yet arrived) */}
          {preAssigned.length > 0 && (
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px', color: '#40A0E8' }}>
                Pre-assigned — tap when player arrives ({preAssigned.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {preAssigned.map(c => {
                  const player = c.player_id ? playerMap.get(c.player_id) : null
                  const name = player ? `${player.first_name} ${player.last_name}` : 'Unknown'
                  return (
                    <div key={c.id} style={{
                      display: 'flex', alignItems: 'center', gap: '8px',
                      background: 'rgba(80,160,232,0.06)', border: '0.5px solid rgba(80,160,232,0.2)',
                      borderRadius: '8px', padding: '8px 12px', cursor: 'pointer',
                      opacity: busy === c.id ? 0.5 : 1,
                    }} onClick={() => busy == null && markArrived(c.id)}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>{name}</div>
                        {player?.prior_team && <div style={{ fontSize: '11px', color: s.dim }}>↩ {player.prior_team}</div>}
                      </div>
                      <span style={{ fontSize: '12px', color: '#40A0E8', fontWeight: 700 }}>✓ Arrived</span>
                      <button onClick={e => { e.stopPropagation(); removeCheckin(c.id) }} disabled={busy === c.id} style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: s.dim, fontSize: '14px', padding: '2px 4px',
                      }}>×</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Right column: unassigned / walk-up search ────────────────────── */}
        <div>
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>
              {preAssigned.length > 0 ? 'Walk-ups' : 'Registered Players'}
              <span style={{ fontSize: '13px', color: s.dim, fontWeight: 400 }}> ({unassignedPlayers.length} not assigned)</span>
            </div>
            <input
              value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              style={{ width: '100%', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '7px 10px', fontSize: '13px', color: 'var(--fg)', boxSizing: 'border-box' }}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '600px', overflowY: 'auto' }}>
            {unassignedPlayers.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'var(--bg-card)', border: '0.5px solid var(--border)',
                borderRadius: '8px', padding: '8px 12px', cursor: 'pointer',
                opacity: busy === p.id ? 0.5 : 1,
              }} onClick={() => busy == null && checkIn(p.id)}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{p.first_name} {p.last_name}</div>
                  <div style={{ fontSize: '11px', color: s.dim }}>
                    {p.jersey_number ? `#${p.jersey_number} · ` : ''}{p.prior_team ?? 'No prior team'}
                  </div>
                </div>
                <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 700 }}>+ Check in</span>
              </div>
            ))}
            {unassignedPlayers.length === 0 && search === '' && (
              <div style={{ padding: '2rem', textAlign: 'center', color: s.dim, fontSize: '13px' }}>
                All registered players are assigned to this session.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Walk-up modal */}
      {showWriteIn && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1.5rem', width: '320px' }}>
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '1rem' }}>Add Walk-up Player</div>
            <input value={writeInName} onChange={e => setWriteInName(e.target.value)}
              placeholder="Full name" autoFocus
              style={{ width: '100%', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '8px 10px', fontSize: '13px', color: 'var(--fg)', boxSizing: 'border-box', marginBottom: '10px' }}
            />
            <input value={writeInAgeGroup} onChange={e => setWriteInAgeGroup(e.target.value)}
              placeholder={`Age group (default: ${session?.age_group})`}
              style={{ width: '100%', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '8px 10px', fontSize: '13px', color: 'var(--fg)', boxSizing: 'border-box', marginBottom: '16px' }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={addWriteIn} disabled={!writeInName.trim() || writingIn} style={{
                flex: 1, padding: '9px', borderRadius: '6px', border: 'none',
                background: 'var(--accent)', color: 'var(--accent-text)',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              }}>Add #{nextNumber()}</button>
              <button onClick={() => setShowWriteIn(false)} style={{
                padding: '9px 16px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
                background: 'transparent', color: s.muted, fontSize: '13px', cursor: 'pointer',
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
