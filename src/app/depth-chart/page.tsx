'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import Link from 'next/link'

const POSITIONS = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF']

const POS_COLORS: Record<string, { bg: string; color: string }> = {
  P:    { bg: 'rgba(232,160,32,0.15)',  color: '#E8C060' },
  C:    { bg: 'rgba(192,80,120,0.15)', color: '#E090B0' },
  '1B': { bg: 'rgba(59,109,177,0.15)', color: '#80B0E8' },
  '2B': { bg: 'rgba(59,109,177,0.15)', color: '#80B0E8' },
  SS:   { bg: 'rgba(59,109,177,0.15)', color: '#80B0E8' },
  '3B': { bg: 'rgba(59,109,177,0.15)', color: '#80B0E8' },
  LF:   { bg: 'rgba(45,106,53,0.15)',  color: '#6DB875' },
  CF:   { bg: 'rgba(45,106,53,0.15)',  color: '#6DB875' },
  RF:   { bg: 'rgba(45,106,53,0.15)',  color: '#6DB875' },
}

export default function DepthChartPage() {
  const supabase = createClient()
  const [players, setPlayers] = useState<any[]>([])
  const [entries, setEntries] = useState<Record<string, any>>({})
  const [seasonId, setSeasonId] = useState<string | null>(null)
  const [selectedPos, setSelectedPos] = useState('P')
  const [loading, setLoading] = useState(true)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data: teams } = await supabase.from('teams').select('id').eq('is_active', true)
    const teamIds = (teams ?? []).map((t: any) => t.id)
    if (!teamIds.length) { setLoading(false); return }

    const { data: season } = await supabase
      .from('seasons').select('id').in('team_id', teamIds).eq('is_active', true).maybeSingle()
    if (!season) { setLoading(false); return }
    setSeasonId(season.id)

    const { data: playerRows } = await supabase
      .from('players')
      .select('id, first_name, last_name, jersey_number, primary_position')
      .eq('season_id', season.id).eq('status', 'active').order('last_name')
    setPlayers(playerRows ?? [])

    const { data: chartRows } = await supabase
      .from('depth_chart').select('*').eq('season_id', season.id)
    const map: Record<string, any> = {}
    for (const row of chartRows ?? []) {
      map[`${row.player_id}::${row.position}`] = row
    }
    setEntries(map)
    setLoading(false)
  }

  const eKey = (playerId: string, pos = selectedPos) => `${playerId}::${pos}`
  const getEntry = (playerId: string, pos = selectedPos) => entries[eKey(playerId, pos)]

  const ranked = players
    .filter(p => { const e = getEntry(p.id); return e && !e.restricted && e.depth_order != null })
    .sort((a, b) => getEntry(a.id).depth_order - getEntry(b.id).depth_order)

  const restricted = players.filter(p => getEntry(p.id)?.restricted)

  const available = players.filter(p => {
    const e = getEntry(p.id)
    return !e || (!e.restricted && e.depth_order == null)
  })

  async function addToDepth(playerId: string) {
    if (!seasonId) return
    const nextOrder = ranked.length + 1
    const existing = getEntry(playerId)
    setEntries(prev => ({
      ...prev,
      [eKey(playerId)]: { ...existing, player_id: playerId, position: selectedPos, depth_order: nextOrder, restricted: false },
    }))
    if (existing?.id) {
      await supabase.from('depth_chart').update({ depth_order: nextOrder, restricted: false }).eq('id', existing.id)
    } else {
      const { data } = await supabase.from('depth_chart')
        .insert({ season_id: seasonId, player_id: playerId, position: selectedPos, depth_order: nextOrder, restricted: false })
        .select().single()
      if (data) setEntries(prev => ({ ...prev, [eKey(playerId)]: data }))
    }
  }

  async function restrict(playerId: string) {
    if (!seasonId) return
    const existing = getEntry(playerId)
    const wasRanked = existing && !existing.restricted && existing.depth_order != null
    setEntries(prev => ({
      ...prev,
      [eKey(playerId)]: { ...existing, player_id: playerId, position: selectedPos, depth_order: null, restricted: true },
    }))
    if (existing?.id) {
      await supabase.from('depth_chart').update({ depth_order: null, restricted: true }).eq('id', existing.id)
      if (wasRanked) await reorderRemaining(ranked.filter(p => p.id !== playerId))
    } else {
      const { data } = await supabase.from('depth_chart')
        .insert({ season_id: seasonId, player_id: playerId, position: selectedPos, depth_order: null, restricted: true })
        .select().single()
      if (data) setEntries(prev => ({ ...prev, [eKey(playerId)]: data }))
    }
  }

  async function unrestrict(playerId: string) {
    const existing = getEntry(playerId)
    if (!existing?.id) return
    setEntries(prev => ({ ...prev, [eKey(playerId)]: { ...existing, restricted: false, depth_order: null } }))
    await supabase.from('depth_chart').update({ restricted: false, depth_order: null }).eq('id', existing.id)
  }

  async function removeFromDepth(playerId: string) {
    const existing = getEntry(playerId)
    if (!existing?.id) return
    const remaining = ranked.filter(p => p.id !== playerId)
    setEntries(prev => ({ ...prev, [eKey(playerId)]: { ...existing, depth_order: null } }))
    await supabase.from('depth_chart').update({ depth_order: null }).eq('id', existing.id)
    await reorderRemaining(remaining)
  }

  async function reorderRemaining(remaining: any[]) {
    setEntries(prev => {
      const next = { ...prev }
      remaining.forEach((p, i) => { next[eKey(p.id)] = { ...next[eKey(p.id)], depth_order: i + 1 } })
      return next
    })
    await Promise.all(remaining.map((p, i) =>
      supabase.from('depth_chart').update({ depth_order: i + 1 }).eq('id', getEntry(p.id).id)
    ))
  }

  async function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); return }
    const fromIdx = ranked.findIndex(p => p.id === dragId)
    const toIdx = ranked.findIndex(p => p.id === targetId)
    if (fromIdx < 0 || toIdx < 0) { setDragId(null); return }
    const reordered = [...ranked]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    setEntries(prev => {
      const next = { ...prev }
      reordered.forEach((p, i) => { next[eKey(p.id)] = { ...next[eKey(p.id)], depth_order: i + 1 } })
      return next
    })
    setDragId(null); setDragOverId(null)
    await Promise.all(reordered.map((p, i) =>
      supabase.from('depth_chart').update({ depth_order: i + 1 }).eq('id', getEntry(p.id).id)
    ))
  }

  const posColor = POS_COLORS[selectedPos] ?? { bg: 'var(--bg-card)', color: 'var(--fg)' }

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto',
      padding: '1.5rem 1rem 6rem',
    }}>
      <Link href="/roster" style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`,
        textDecoration: 'none', display: 'block', marginBottom: '1rem' }}>
        ‹ Roster
      </Link>

      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '0.25rem' }}>Depth Chart</h1>
      <p style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '1.25rem' }}>
        Rank players by position and flag who shouldn't play where.
      </p>

      {/* Position tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '1.75rem', overflowX: 'auto', paddingBottom: '4px' }}>
        {POSITIONS.map(pos => {
          const active = pos === selectedPos
          const pc = POS_COLORS[pos]
          // Count ranked + restricted for badge
          const posEntryCount = players.filter(p => entries[eKey(p.id, pos)] != null).length
          return (
            <button key={pos} onClick={() => setSelectedPos(pos)} style={{
              padding: '6px 14px', borderRadius: '6px', border: 'none',
              background: active ? pc.bg : 'var(--bg-card)',
              color: active ? pc.color : `rgba(var(--fg-rgb), 0.5)`,
              fontWeight: active ? 700 : 400, fontSize: '13px',
              cursor: 'pointer', flexShrink: 0,
              outline: active ? `1px solid ${pc.color}55` : 'none',
              position: 'relative',
            }}>
              {pos}
              {posEntryCount > 0 && !active && (
                <span style={{
                  position: 'absolute', top: '-4px', right: '-4px',
                  width: '8px', height: '8px', borderRadius: '50%',
                  background: pc.color, opacity: 0.7,
                }} />
              )}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '4rem' }}>Loading…</div>
      ) : players.length === 0 ? (
        <div style={{ textAlign: 'center', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '4rem', fontSize: '14px' }}>
          No active players. <Link href="/roster" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Add players to your roster →</Link>
        </div>
      ) : (
        <>
          {/* ── Depth Order ── */}
          <div style={{ marginBottom: '1.75rem' }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '8px' }}>
              Depth Order{ranked.length > 1 ? ' · drag to reorder' : ''}
            </div>

            {ranked.length === 0 && (
              <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.25)`, padding: '8px 0' }}>
                No players ranked yet — add from below.
              </div>
            )}

            {ranked.map((player, idx) => (
              <div
                key={player.id}
                draggable
                onDragStart={() => setDragId(player.id)}
                onDragOver={e => { e.preventDefault(); setDragOverId(player.id) }}
                onDrop={() => handleDrop(player.id)}
                onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', marginBottom: '4px',
                  background: 'var(--bg-card)',
                  border: dragOverId === player.id && dragId !== player.id
                    ? `1.5px solid ${posColor.color}` : '0.5px solid var(--border-subtle)',
                  borderRadius: '8px',
                  opacity: dragId === player.id ? 0.4 : 1,
                  cursor: 'grab',
                }}
              >
                <span style={{ fontSize: '13px', fontWeight: 800, color: posColor.color,
                  width: '20px', textAlign: 'center', flexShrink: 0 }}>{idx + 1}</span>
                <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.3)`, width: '24px', flexShrink: 0 }}>
                  #{player.jersey_number}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 500, flex: 1 }}>
                  {player.first_name} {player.last_name}
                </span>
                <button onClick={() => restrict(player.id)} title="Should not play this position" style={{
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  fontSize: '14px', padding: '2px 4px', opacity: 0.4,
                }}>⛔</button>
                <button onClick={() => removeFromDepth(player.id)} title="Remove from depth order" style={{
                  background: 'transparent', border: '0.5px solid var(--border-md)',
                  cursor: 'pointer', fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)`,
                  padding: '2px 7px', borderRadius: '4px',
                }}>✕</button>
                <span style={{ fontSize: '16px', color: `rgba(var(--fg-rgb), 0.2)`, userSelect: 'none' }}>⠿</span>
              </div>
            ))}
          </div>

          {/* ── Available ── */}
          {available.length > 0 && (
            <div style={{ marginBottom: '1.75rem' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '8px' }}>
                Available
              </div>
              {available.map(player => (
                <div key={player.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', marginBottom: '4px',
                  background: 'var(--bg-card)', border: '0.5px solid var(--border-subtle)', borderRadius: '8px',
                }}>
                  <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.3)`, width: '24px', flexShrink: 0 }}>
                    #{player.jersey_number}
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 500, flex: 1 }}>
                    {player.first_name} {player.last_name}
                  </span>
                  {player.primary_position === selectedPos && (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: posColor.color,
                      background: posColor.bg, borderRadius: '3px', padding: '2px 6px', flexShrink: 0 }}>
                      Primary
                    </span>
                  )}
                  <button onClick={() => addToDepth(player.id)} style={{
                    fontSize: '12px', fontWeight: 600, padding: '4px 10px', borderRadius: '4px',
                    border: `0.5px solid ${posColor.color}55`,
                    background: posColor.bg, color: posColor.color, cursor: 'pointer', flexShrink: 0,
                  }}>+ Add</button>
                  <button onClick={() => restrict(player.id)} title="Should not play this position" style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    fontSize: '14px', padding: '2px 4px', opacity: 0.35, flexShrink: 0,
                  }}>⛔</button>
                </div>
              ))}
            </div>
          )}

          {/* ── Restricted ── */}
          {restricted.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '8px' }}>
                Should not play {selectedPos}
              </div>
              {restricted.map(player => (
                <div key={player.id} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 12px', marginBottom: '4px',
                  background: 'rgba(192,57,43,0.05)',
                  border: '0.5px solid rgba(192,57,43,0.15)', borderRadius: '8px',
                }}>
                  <span style={{ fontSize: '15px', flexShrink: 0 }}>⛔</span>
                  <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.3)`, width: '24px', flexShrink: 0 }}>
                    #{player.jersey_number}
                  </span>
                  <span style={{ fontSize: '14px', flex: 1, color: `rgba(var(--fg-rgb), 0.45)` }}>
                    {player.first_name} {player.last_name}
                  </span>
                  <button onClick={() => unrestrict(player.id)} style={{
                    fontSize: '12px', padding: '4px 10px', borderRadius: '4px',
                    border: '0.5px solid var(--border-md)', background: 'transparent',
                    color: `rgba(var(--fg-rgb), 0.45)`, cursor: 'pointer', flexShrink: 0,
                  }}>Remove</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  )
}
