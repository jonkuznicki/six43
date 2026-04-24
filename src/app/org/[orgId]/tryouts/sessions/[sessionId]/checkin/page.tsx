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

type UnassignedSort = 'preferred_date' | 'name'

export default function CheckinPage({ params }: { params: { orgId: string; sessionId: string } }) {
  const supabase = createClient()

  const [session,          setSession]          = useState<Session | null>(null)
  const [players,          setPlayers]          = useState<Player[]>([])
  const [checkins,         setCheckins]         = useState<Checkin[]>([])
  const [otherSessionsMax, setOtherSessionsMax] = useState(0)
  const [prefDateMap,      setPrefDateMap]      = useState<Map<string, string | null>>(new Map())
  const [regAgeMap,        setRegAgeMap]        = useState<Map<string, string>>(new Map())
  const [search,           setSearch]           = useState('')
  const [ageFilter,        setAgeFilter]        = useState<string>('')   // '' = all
  const [loading,          setLoading]          = useState(true)
  const [busy,             setBusy]             = useState<string | null>(null)
  const [checkinError,     setCheckinError]     = useState<string | null>(null)

  // Multi-select
  const [selected,         setSelected]         = useState<Set<string>>(new Set())   // player IDs
  const [bulkBusy,         setBulkBusy]         = useState(false)

  // Sort for unassigned list
  const [unassignedSort,   setUnassignedSort]   = useState<UnassignedSort>('preferred_date')

  // Walk-up modal
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

    setAgeFilter(sess.age_group)   // default to session's age group

    const [{ data: pDataRaw }, { data: cData }, { data: otherData }, { data: regData }] = await Promise.all([
      supabase.from('tryout_players').select('id, first_name, last_name, age_group, tryout_age_group, jersey_number, prior_team')
        .eq('org_id', params.orgId).eq('is_active', true)
        .order('last_name').order('first_name'),
      supabase.from('tryout_checkins').select('*')
        .eq('session_id', params.sessionId)
        .order('tryout_number', { ascending: true, nullsFirst: false }),
      supabase.from('tryout_checkins').select('tryout_number')
        .eq('season_id', sess.season_id).eq('age_group', sess.age_group)
        .neq('session_id', params.sessionId)
        .not('tryout_number', 'is', null)
        .order('tryout_number', { ascending: false }).limit(1),
      supabase.from('tryout_registration_staging')
        .select('player_id, age_group, preferred_tryout_date')
        .eq('org_id', params.orgId)
        .eq('season_id', sess.season_id),
    ])
    setPlayers(pDataRaw ?? [])
    setCheckins(cData ?? [])
    setOtherSessionsMax(otherData?.[0]?.tryout_number ?? 0)
    const regRows = regData ?? []
    setPrefDateMap(new Map(regRows.map((r: any) => [r.player_id, r.preferred_tryout_date ?? null])))
    setRegAgeMap(new Map(regRows.filter((r: any) => r.age_group).map((r: any) => [r.player_id, r.age_group])))
    setLoading(false)
  }

  const assignedPlayerIds = useMemo(
    () => new Set(checkins.filter(c => c.player_id).map(c => c.player_id!)),
    [checkins]
  )

  // Players with numbers assigned (the roster so far)
  const assigned = useMemo(
    () => checkins.filter(c => c.tryout_number != null || c.is_write_in),
    [checkins]
  )

  // All age groups present in registered players (prefer staging, fall back to player record)
  const allAgeGroups = useMemo(() => {
    const groups = new Set(players.map(p => regAgeMap.get(p.id) ?? p.age_group).filter(Boolean))
    return Array.from(groups).sort()
  }, [players, regAgeMap])

  // Players without numbers yet
  const unassigned = useMemo(() => {
    const q = search.toLowerCase()
    const hasStaging = regAgeMap.size > 0
    const list = players.filter(p => {
      if (assignedPlayerIds.has(p.id)) return false
      // When staging data exists, only show players registered for this season
      if (hasStaging && !regAgeMap.has(p.id) && !prefDateMap.has(p.id)) return false
      if (ageFilter) {
        const effectiveAge = regAgeMap.get(p.id) ?? (p as any).tryout_age_group ?? p.age_group
        if (effectiveAge !== ageFilter) return false
      }
      if (q && !`${p.first_name} ${p.last_name}`.toLowerCase().includes(q)) return false
      return true
    })
    return [...list].sort((a, b) => {
      if (unassignedSort === 'preferred_date') {
        const da = prefDateMap.get(a.id) ?? ''
        const db = prefDateMap.get(b.id) ?? ''
        if (da !== db) return da.localeCompare(db)
      }
      return `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`)
    })
  }, [players, assignedPlayerIds, search, ageFilter, unassignedSort, prefDateMap, regAgeMap])

  function nextNumber() {
    const nums = checkins.filter(c => c.tryout_number != null).map(c => c.tryout_number as number)
    const localMax = nums.length > 0 ? Math.max(...nums) : 0
    return Math.max(localMax, otherSessionsMax) + 1
  }

  async function assignNumber(playerId: string, precomputedNum?: number | null) {
    setBusy(playerId)
    setCheckinError(null)
    const num = precomputedNum !== undefined ? precomputedNum : (session?.numbering_method === 'alphabetical' ? null : nextNumber())

    // Check if a pre-assignment row exists (arrived=false) — update it, else insert
    const existing = checkins.find(c => c.player_id === playerId)
    let result: Checkin | null = null
    let error: any = null

    if (existing) {
      const { data, error: e } = await supabase
        .from('tryout_checkins')
        .update({ tryout_number: num ?? null, arrived: true, checked_in_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('*').single()
      result = data; error = e
    } else {
      const { data, error: e } = await supabase.from('tryout_checkins').insert({
        session_id:    params.sessionId,
        player_id:     playerId,
        tryout_number: num ?? null,
        season_id:     session!.season_id,
        age_group:     session!.age_group,
        arrived:       true,
        is_write_in:   false,
      }).select('*').single()
      result = data; error = e
    }

    if (error) { setCheckinError(error.message); setBusy(null); return }
    if (result) {
      setCheckins(prev => existing
        ? prev.map(c => c.id === existing.id ? result! : c)
        : [...prev, result!]
      )
      setSelected(prev => { const n = new Set(prev); n.delete(playerId); return n })
      if (session?.numbering_method === 'alphabetical') {
        const all = [...checkins.filter(c => c.id !== existing?.id), result].filter(c => c!.tryout_number != null || c!.is_write_in) as Checkin[]
        await renumberAlphabetically(all)
      }
    }
    setBusy(null)
  }

  async function assignSelected() {
    if (selected.size === 0) return
    setBulkBusy(true)
    setCheckinError(null)

    const ids = Array.from(selected)
    // Pre-compute all numbers before the loop — nextNumber() reads React state
    // which doesn't update between await calls, so every iteration would
    // return the same number and hit the unique constraint.
    let counter = nextNumber()
    for (const playerId of ids) {
      const num = session?.numbering_method === 'alphabetical' ? null : counter++
      await assignNumber(playerId, num)
    }

    setSelected(new Set())
    if (session?.numbering_method === 'alphabetical') {
      const all = checkins.filter(c => c.tryout_number != null || c.is_write_in)
      await renumberAlphabetically(all)
    }
    setBulkBusy(false)
  }

  async function removeCheckin(checkinId: string) {
    setBusy(checkinId)
    await supabase.from('tryout_checkins').delete().eq('id', checkinId)
    const remaining = checkins.filter(c => c.id !== checkinId)
    if (session?.numbering_method === 'alphabetical') {
      await renumberAlphabetically(remaining.filter(c => c.tryout_number != null && !c.is_write_in))
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
    if (method === 'alphabetical' && assigned.length > 0) {
      await renumberAlphabetically(assigned.filter(c => !c.is_write_in))
    }
  }

  async function addWriteIn() {
    if (!writeInName.trim()) return
    setWritingIn(true)
    const { data } = await supabase.from('tryout_checkins').insert({
      session_id:         params.sessionId,
      season_id:          session!.season_id,
      age_group:          session!.age_group,
      tryout_number:      nextNumber(),
      arrived:            true,
      is_write_in:        true,
      write_in_name:      writeInName.trim(),
      write_in_age_group: writeInAgeGroup.trim() || session?.age_group,
    }).select('*').single()
    if (data) setCheckins(prev => [...prev, data])
    setWriteInName('')
    setWriteInAgeGroup('')
    setShowWriteIn(false)
    setWritingIn(false)
  }

  function toggleSelect(playerId: string) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(playerId)) n.delete(playerId); else n.add(playerId)
      return n
    })
  }

  function toggleSelectAll() {
    setSelected(selected.size === unassigned.length
      ? new Set()
      : new Set(unassigned.map(p => p.id))
    )
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
          <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '2px' }}>Assign Tryout Numbers</h1>
          <div style={{ fontSize: '13px', color: s.muted }}>
            {session?.label} · {session?.age_group}
            <span style={{ marginLeft: '10px', padding: '2px 8px', borderRadius: '20px', background: 'rgba(109,184,117,0.12)', color: '#6DB875', fontSize: '11px', fontWeight: 600 }}>
              {assigned.length} assigned
            </span>
            {unassigned.length > 0 && (
              <span style={{ marginLeft: '6px', padding: '2px 8px', borderRadius: '20px', background: 'rgba(var(--fg-rgb),0.07)', color: s.muted, fontSize: '11px', fontWeight: 600 }}>
                {unassigned.length} remaining
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
            }}>{m === 'checkin_order' ? 'Sequential' : 'Alphabetical'}</button>
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
          Error: {checkinError}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>

        {/* ── Left: assigned / roster ──────────────────────────────────────── */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ fontSize: '14px', fontWeight: 700 }}>
              Assigned <span style={{ fontSize: '13px', color: s.dim, fontWeight: 400 }}>({assigned.length})</span>
            </div>
            <button onClick={() => setShowWriteIn(true)} style={{
              padding: '4px 12px', borderRadius: '5px', border: '0.5px solid var(--border-md)',
              background: 'var(--bg-input)', color: s.muted, fontSize: '12px', cursor: 'pointer',
            }}>+ Walk-up</button>
          </div>

          {assigned.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: s.dim, fontSize: '13px', background: 'var(--bg-card)', borderRadius: '10px', border: '0.5px solid var(--border)' }}>
              No numbers assigned yet. Select players on the right and click "Assign numbers."
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '70vh', overflowY: 'auto' }}>
              {[...assigned].sort((a, b) => (a.tryout_number ?? 999) - (b.tryout_number ?? 999)).map(c => {
                const player = c.player_id ? playerMap.get(c.player_id) : null
                const name = c.is_write_in ? (c.write_in_name ?? 'Walk-up') : player ? `${player.first_name} ${player.last_name}` : 'Unknown'
                const prefDate = c.player_id ? prefDateMap.get(c.player_id) : null
                return (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    background: 'var(--bg-card)', border: '0.5px solid var(--border)',
                    borderRadius: '8px', padding: '8px 12px',
                  }}>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--accent)', minWidth: '36px', textAlign: 'center' }}>
                      {c.tryout_number != null ? `#${c.tryout_number}` : '—'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{name}</div>
                      <div style={{ fontSize: '11px', color: s.dim, display: 'flex', gap: '8px' }}>
                        {prefDate && <span style={{ color: '#40A0E8', fontWeight: 600 }}>{prefDate}</span>}
                        {player?.prior_team && <span>↩ {player.prior_team}</span>}
                        {c.is_write_in && <span>Walk-up · {c.write_in_age_group ?? '—'}</span>}
                      </div>
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

        {/* ── Right: unassigned players ─────────────────────────────────────── */}
        <div>
          {/* Toolbar: search + sort + select-all + bulk assign */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, flex: 1 }}>
                Not Assigned <span style={{ fontSize: '13px', color: s.dim, fontWeight: 400 }}>({unassigned.length})</span>
              </div>
              {/* Age group filter */}
              <select value={ageFilter} onChange={e => setAgeFilter(e.target.value)} style={{
                background: 'var(--bg-input)', border: `0.5px solid ${ageFilter ? 'var(--accent)' : 'var(--border-md)'}`,
                borderRadius: '5px', padding: '3px 8px', fontSize: '12px', color: ageFilter ? 'var(--accent)' : s.muted, cursor: 'pointer',
              }}>
                <option value="">All ages</option>
                {allAgeGroups.map(ag => <option key={ag} value={ag}>{ag}</option>)}
              </select>
              {/* Sort */}
              {(['preferred_date', 'name'] as UnassignedSort[]).map(s2 => (
                <button key={s2} onClick={() => setUnassignedSort(s2)} style={{
                  padding: '3px 9px', borderRadius: '4px', border: '0.5px solid',
                  borderColor: unassignedSort === s2 ? '#40A0E8' : 'var(--border-md)',
                  background: unassignedSort === s2 ? 'rgba(64,160,232,0.1)' : 'var(--bg-input)',
                  color: unassignedSort === s2 ? '#40A0E8' : s.dim,
                  fontSize: '11px', cursor: 'pointer',
                }}>{s2 === 'preferred_date' ? 'By date' : 'A–Z'}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search…"
                style={{ flex: 1, background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '7px 10px', fontSize: '13px', color: 'var(--fg)' }}
              />
              {unassigned.length > 0 && (
                <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: s.muted, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <input type="checkbox"
                    checked={selected.size > 0 && selected.size === unassigned.length}
                    ref={el => { if (el) el.indeterminate = selected.size > 0 && selected.size < unassigned.length }}
                    onChange={toggleSelectAll}
                  />
                  All
                </label>
              )}
              {selected.size > 0 && (
                <button onClick={assignSelected} disabled={bulkBusy} style={{
                  padding: '6px 14px', borderRadius: '5px', border: 'none',
                  background: 'var(--accent)', color: 'var(--accent-text)',
                  fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                  opacity: bulkBusy ? 0.6 : 1, whiteSpace: 'nowrap',
                }}>
                  {bulkBusy ? 'Assigning…' : `Assign ${selected.size}`}
                </button>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '60vh', overflowY: 'auto' }}>
            {unassigned.map(p => {
              const prefDate = prefDateMap.get(p.id)
              const isSelected = selected.has(p.id)
              return (
                <div key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  background: isSelected ? 'rgba(232,160,32,0.08)' : 'var(--bg-card)',
                  border: `0.5px solid ${isSelected ? 'rgba(232,160,32,0.35)' : 'var(--border)'}`,
                  borderRadius: '8px', padding: '8px 12px',
                  opacity: busy === p.id ? 0.5 : 1,
                }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(p.id)}
                    style={{ cursor: 'pointer', accentColor: 'var(--accent)', flexShrink: 0 }}
                  />
                  <div style={{ flex: 1, cursor: 'pointer', minWidth: 0 }}
                    onClick={() => busy == null && assignNumber(p.id)}>
                    <div style={{ fontSize: '13px', fontWeight: 600 }}>{p.first_name} {p.last_name}</div>
                    <div style={{ fontSize: '11px', color: s.dim, display: 'flex', gap: '8px' }}>
                      {prefDate && <span style={{ color: '#40A0E8', fontWeight: 600 }}>{prefDate}</span>}
                      {(regAgeMap.get(p.id) ?? p.age_group) && <span style={{ padding: '1px 5px', borderRadius: '3px', background: 'rgba(var(--fg-rgb),0.07)', fontWeight: 600 }}>{regAgeMap.get(p.id) ?? p.age_group}</span>}
                      <span>{p.prior_team ?? 'No prior team'}</span>
                    </div>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
                    onClick={() => busy == null && assignNumber(p.id)}>+ Assign</span>
                </div>
              )
            })}
            {unassigned.length === 0 && (
              <div style={{ padding: '2rem', textAlign: 'center', color: s.dim, fontSize: '13px' }}>
                {search
                  ? 'No players match your search.'
                  : ageFilter
                    ? <>No players found for <strong>{ageFilter}</strong>. Try "All ages" to see everyone.</>
                    : 'All registered players have been assigned numbers.'}
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
