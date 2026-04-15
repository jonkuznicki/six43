'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'

interface Player {
  id:           string
  first_name:   string
  last_name:    string
  age_group:    string
  dob:          string | null
  jersey_number: string | null
  parent_email: string | null
  parent_name:  string | null
  phone:        string | null
  is_active:    boolean
  created_at:   string
  _scoreCount?: number
}

interface Season {
  id:         string
  label:      string
  age_groups: string[]
}

export default function PlayersPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()

  const [players,   setPlayers]   = useState<Player[]>([])
  const [season,    setSeason]    = useState<Season | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [search,    setSearch]    = useState('')
  const [ageFilter, setAgeFilter] = useState('all')
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [mergeMode, setMergeMode] = useState(false)
  const [selected,  setSelected]  = useState<Set<string>>(new Set())
  const [merging,   setMerging]   = useState(false)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: seasonData } = await supabase
      .from('tryout_seasons').select('id, label, age_groups')
      .eq('org_id', params.orgId).eq('is_active', true).maybeSingle()
    setSeason(seasonData)

    const { data: playerData } = await supabase
      .from('tryout_players').select('id, first_name, last_name, age_group, dob, jersey_number, parent_email, parent_name, phone, is_active, created_at')
      .eq('org_id', params.orgId)
      .order('last_name').order('first_name')

    if (!playerData?.length) { setPlayers([]); setLoading(false); return }

    // Score counts per player
    const ids = playerData.map((p: any) => p.id)
    const { data: scores } = await supabase
      .from('tryout_scores').select('player_id')
      .in('player_id', ids)

    const scoreCounts: Record<string, number> = {}
    for (const s of scores ?? []) {
      scoreCounts[s.player_id] = (scoreCounts[s.player_id] ?? 0) + 1
    }

    setPlayers(playerData.map((p: any) => ({ ...p, _scoreCount: scoreCounts[p.id] ?? 0 })))
    setLoading(false)
  }

  const filtered = useMemo(() => {
    let list = players
    if (ageFilter !== 'all') list = list.filter(p => p.age_group === ageFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(p =>
        `${p.first_name} ${p.last_name}`.toLowerCase().includes(q) ||
        (p.parent_email ?? '').toLowerCase().includes(q) ||
        (p.jersey_number ?? '').includes(q)
      )
    }
    return list
  }, [players, ageFilter, search])

  // Count per age group
  const ageCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const p of players) {
      counts[p.age_group] = (counts[p.age_group] ?? 0) + 1
    }
    return counts
  }, [players])

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function mergeSelected() {
    if (selected.size < 2) return
    const ids = Array.from(selected)
    // Keep the first alphabetically (oldest created), deactivate rest
    const toKeep   = ids[0]
    const toRemove = ids.slice(1)
    setMerging(true)

    // Create aliases for the removed players pointing to the kept player
    for (const removeId of toRemove) {
      const p = players.find(x => x.id === removeId)
      if (p) {
        await supabase.from('tryout_player_aliases').insert({
          player_id:  toKeep,
          org_id:     params.orgId,
          raw_name:   `${p.first_name} ${p.last_name}`,
          source:     'manual_merge',
        })
      }
      // Reassign scores
      await supabase.from('tryout_scores').update({ player_id: toKeep }).eq('player_id', removeId).eq('org_id', params.orgId)
      // Deactivate
      await supabase.from('tryout_players').update({ is_active: false }).eq('id', removeId)
    }

    setSelected(new Set())
    setMergeMode(false)
    setMerging(false)
    await loadData()
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

  const ageGroups = season?.age_groups ?? []

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', maxWidth: '820px', margin: '0 auto', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800 }}>Players</h1>
          {season && <div style={{ fontSize: '13px', color: s.muted, marginTop: '2px' }}>{season.label}</div>}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {mergeMode ? (
            <>
              <span style={{ fontSize: '13px', color: s.muted }}>{selected.size} selected</span>
              <button onClick={mergeSelected} disabled={selected.size < 2 || merging} style={{
                padding: '7px 14px', borderRadius: '6px', border: 'none',
                background: selected.size >= 2 ? 'rgba(232,160,32,0.15)' : 'var(--bg-input)',
                color: selected.size >= 2 ? 'var(--accent)' : s.dim,
                fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              }}>{merging ? 'Merging…' : 'Merge'}</button>
              <button onClick={() => { setMergeMode(false); setSelected(new Set()) }} style={{
                padding: '7px 14px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
                background: 'transparent', color: s.muted, fontSize: '13px', cursor: 'pointer',
              }}>Cancel</button>
            </>
          ) : (
            <button onClick={() => setMergeMode(true)} style={{
              padding: '7px 14px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
              background: 'transparent', color: s.muted, fontSize: '13px', cursor: 'pointer',
            }}>Merge duplicates</button>
          )}
        </div>
      </div>

      {/* Age group filter chips */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <button onClick={() => setAgeFilter('all')} style={{
          padding: '5px 12px', borderRadius: '20px', border: '0.5px solid',
          borderColor: ageFilter === 'all' ? 'var(--accent)' : 'var(--border-md)',
          background: ageFilter === 'all' ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
          color: ageFilter === 'all' ? 'var(--accent)' : s.muted,
          fontSize: '12px', fontWeight: ageFilter === 'all' ? 700 : 400, cursor: 'pointer',
        }}>All ({players.length})</button>
        {ageGroups.map(ag => (
          <button key={ag} onClick={() => setAgeFilter(ag)} style={{
            padding: '5px 12px', borderRadius: '20px', border: '0.5px solid',
            borderColor: ageFilter === ag ? 'var(--accent)' : 'var(--border-md)',
            background: ageFilter === ag ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
            color: ageFilter === ag ? 'var(--accent)' : s.muted,
            fontSize: '12px', fontWeight: ageFilter === ag ? 700 : 400, cursor: 'pointer',
          }}>{ag} ({ageCounts[ag] ?? 0})</button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search by name, email, jersey…"
        style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '8px', padding: '9px 14px', fontSize: '14px', color: 'var(--fg)', marginBottom: '1rem' }}
      />

      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '14px' }}>
          {players.length === 0
            ? 'No players yet. Import a registration file to add players.'
            : 'No players match your search.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filtered.map(player => {
            const isExpanded = expanded === player.id
            const isSelected = selected.has(player.id)
            return (
              <div key={player.id} style={{
                background: isSelected ? 'rgba(232,160,32,0.07)' : 'var(--bg-card)',
                border: `0.5px solid ${isSelected ? 'rgba(232,160,32,0.4)' : 'var(--border)'}`,
                borderRadius: '10px', overflow: 'hidden',
              }}>
                <div
                  onClick={() => mergeMode ? toggleSelect(player.id) : setExpanded(v => v === player.id ? null : player.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px', cursor: 'pointer' }}
                >
                  {mergeMode && (
                    <div style={{
                      width: '18px', height: '18px', borderRadius: '4px', flexShrink: 0,
                      border: `2px solid ${isSelected ? 'var(--accent)' : 'var(--border-md)'}`,
                      background: isSelected ? 'var(--accent)' : 'transparent',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {isSelected && <span style={{ color: 'var(--accent-text)', fontSize: '12px', lineHeight: 1 }}>✓</span>}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 700, fontSize: '14px' }}>{player.first_name} {player.last_name}</span>
                      <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(var(--fg-rgb),0.07)', color: s.muted, fontWeight: 600 }}>{player.age_group}</span>
                      {player.jersey_number && (
                        <span style={{ fontSize: '11px', color: s.dim }}>#{player.jersey_number}</span>
                      )}
                    </div>
                    {player.parent_email && (
                      <div style={{ fontSize: '12px', color: s.dim, marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {player.parent_email}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {(player._scoreCount ?? 0) > 0 && (
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: 'rgba(109,184,117,0.12)', color: '#6DB875', fontWeight: 700 }}>
                        {player._scoreCount} scores
                      </span>
                    )}
                    {!mergeMode && (
                      <span style={{ fontSize: '11px', color: s.dim }}>{isExpanded ? '▲' : '▼'}</span>
                    )}
                  </div>
                </div>

                {isExpanded && !mergeMode && (
                  <div style={{ borderTop: '0.5px solid var(--border)', padding: '12px 14px', fontSize: '13px', color: s.muted, display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {player.dob && (
                      <div><span style={{ color: s.dim, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>DOB</span>{' '}
                        {new Date(player.dob + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </div>
                    )}
                    {player.parent_name && (
                      <div><span style={{ color: s.dim, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Parent</span>{' '}{player.parent_name}</div>
                    )}
                    {player.parent_email && (
                      <div><span style={{ color: s.dim, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</span>{' '}{player.parent_email}</div>
                    )}
                    {player.phone && (
                      <div><span style={{ color: s.dim, fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone</span>{' '}{player.phone}</div>
                    )}
                    <div style={{ marginTop: '4px', fontSize: '11px', color: s.dim }}>
                      Added {new Date(player.created_at).toLocaleDateString()}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
