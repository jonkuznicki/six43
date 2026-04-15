'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'

// ── Types ────────────────────────────────────────────────────────────────────

interface Player {
  id:               string
  first_name:       string
  last_name:        string
  age_group:        string
  tryout_age_group: string | null
  prior_team:       string | null
  jersey_number:    string | null
}

interface RegStaging {
  player_id:  string
  prior_team: string | null
  age_group:  string | null
  imported_at: string
}

interface RosterStaging {
  player_id:    string
  team_name:    string | null
  jersey_number: string | null
  imported_at:  string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function nextAgeGroup(ag: string): string {
  const m = ag.match(/^(\d+)u$/i)
  if (!m) return ag
  return `${parseInt(m[1], 10) + 1}u`
}

function sortAgeGroup(ag: string): number {
  const m = ag.match(/^(\d+)/)
  return m ? parseInt(m[1], 10) : 99
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DataHubPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()

  const [players,       setPlayers]       = useState<Player[]>([])
  const [regStaging,    setRegStaging]    = useState<Map<string, RegStaging>>(new Map())
  const [rosterStaging, setRosterStaging] = useState<Map<string, RosterStaging>>(new Map())
  const [gcPlayerIds,   setGcPlayerIds]   = useState<Set<string>>(new Set())
  const [evalPlayerIds, setEvalPlayerIds] = useState<Set<string>>(new Set())
  const [scorePlayerIds,setScorePlayerIds]= useState<Set<string>>(new Set())
  const [seasonId,      setSeasonId]      = useState<string | null>(null)
  const [ageFilter,     setAgeFilter]     = useState('all')
  const [loading,       setLoading]       = useState(true)
  const [autoFilling,   setAutoFilling]   = useState(false)

  // Inline edit state
  const [editingCell,   setEditingCell]   = useState<string | null>(null)  // `${playerId}_field`
  const [editVal,       setEditVal]       = useState('')
  const [savingCell,    setSavingCell]    = useState<string | null>(null)
  const [savedCell,     setSavedCell]     = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Local overrides so UI updates without re-fetch
  const [localUpdates, setLocalUpdates]   = useState<Map<string, Partial<Player>>>(new Map())

  useEffect(() => { loadData() }, [])
  useEffect(() => { if (editingCell && inputRef.current) inputRef.current.focus() }, [editingCell])

  async function loadData() {
    setLoading(true)
    const { data: seasonData } = await supabase
      .from('tryout_seasons')
      .select('id')
      .eq('org_id', params.orgId)
      .eq('is_active', true)
      .maybeSingle()

    setSeasonId(seasonData?.id ?? null)

    const [
      { data: playerData },
      { data: regData },
      { data: rosterData },
      { data: gcData },
      { data: evalData },
      { data: scoreData },
    ] = await Promise.all([
      supabase.from('tryout_players')
        .select('id, first_name, last_name, age_group, tryout_age_group, prior_team, jersey_number')
        .eq('org_id', params.orgId)
        .eq('is_active', true)
        .order('last_name').order('first_name'),
      seasonData ? supabase.from('tryout_registration_staging')
        .select('player_id, prior_team, age_group, imported_at')
        .eq('org_id', params.orgId)
        .eq('season_id', seasonData.id) : Promise.resolve({ data: [] }),
      seasonData ? supabase.from('tryout_roster_staging')
        .select('player_id, team_name, jersey_number, imported_at')
        .eq('org_id', params.orgId)
        .eq('season_id', seasonData.id) : Promise.resolve({ data: [] }),
      supabase.from('tryout_gc_stats')
        .select('player_id')
        .eq('org_id', params.orgId),
      supabase.from('tryout_coach_evals')
        .select('player_id')
        .eq('org_id', params.orgId)
        .eq('status', 'submitted'),
      supabase.from('tryout_scores')
        .select('player_id')
        .eq('org_id', params.orgId),
    ])

    setPlayers(playerData ?? [])
    setRegStaging(new Map((regData ?? []).map((r: any) => [r.player_id, r])))
    setRosterStaging(new Map((rosterData ?? []).map((r: any) => [r.player_id, r])))
    setGcPlayerIds(new Set((gcData ?? []).map((r: any) => r.player_id)))
    setEvalPlayerIds(new Set((evalData ?? []).map((r: any) => r.player_id)))
    setScorePlayerIds(new Set((scoreData ?? []).map((r: any) => r.player_id)))
    setLoading(false)
  }

  function playerValue(p: Player, field: keyof Player): string | null {
    const local = localUpdates.get(p.id)
    if (local && field in local) return (local as any)[field] ?? null
    return (p as any)[field] ?? null
  }

  function startEdit(playerId: string, field: string, currentVal: string) {
    setEditingCell(`${playerId}_${field}`)
    setEditVal(currentVal)
  }

  async function commitEdit(playerId: string, field: string) {
    const key = `${playerId}_${field}`
    if (savingCell === key) return
    setSavingCell(key)
    setEditingCell(null)

    const dbField: Record<string, string> = {
      team:       'prior_team',
      tryout_ag:  'tryout_age_group',
      jersey:     'jersey_number',
    }
    const col = dbField[field]
    if (!col) { setSavingCell(null); return }

    await supabase.from('tryout_players')
      .update({ [col]: editVal.trim() || null })
      .eq('id', playerId)

    setLocalUpdates(prev => {
      const m = new Map(prev)
      const existing = m.get(playerId) ?? {}
      m.set(playerId, { ...existing, [col as keyof Player]: editVal.trim() || null })
      return m
    })

    setSavingCell(null)
    setSavedCell(key)
    setTimeout(() => setSavedCell(c => c === key ? null : c), 1500)
  }

  function handleKeyDown(e: React.KeyboardEvent, playerId: string, field: string) {
    if (e.key === 'Enter') { e.preventDefault(); commitEdit(playerId, field) }
    if (e.key === 'Escape') { setEditingCell(null) }
  }

  async function autoFillTryoutAgeGroups() {
    setAutoFilling(true)
    const toFill = players.filter(p => !playerValue(p, 'tryout_age_group') && p.age_group)
    if (toFill.length === 0) { setAutoFilling(false); return }

    await Promise.all(toFill.map(p =>
      supabase.from('tryout_players')
        .update({ tryout_age_group: nextAgeGroup(p.age_group) })
        .eq('id', p.id)
    ))

    setLocalUpdates(prev => {
      const m = new Map(prev)
      toFill.forEach(p => {
        const existing = m.get(p.id) ?? {}
        m.set(p.id, { ...existing, tryout_age_group: nextAgeGroup(p.age_group) })
      })
      return m
    })
    setAutoFilling(false)
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const ageGroups = Array.from(new Set(players.map(p => p.age_group).filter(Boolean)))
    .sort((a, b) => sortAgeGroup(a) - sortAgeGroup(b))

  const filteredPlayers = ageFilter === 'all'
    ? players
    : players.filter(p => p.age_group === ageFilter)

  const groupedPlayers: [string, Player[]][] = ageFilter === 'all'
    ? ageGroups.map(ag => [ag, players.filter(p => p.age_group === ag)])
    : [[ageFilter, filteredPlayers]]

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading…
    </main>
  )

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '1100px', margin: '0 auto',
      padding: '2rem 1.5rem 6rem',
    }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{
        fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem',
      }}>‹ Tryouts</Link>

      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', marginBottom: '1.75rem', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '0.25rem' }}>Player data hub</h1>
          <p style={{ fontSize: '14px', color: s.muted, margin: 0 }}>
            Review imported data by source, resolve conflicts, and set tryout age groups.
          </p>
        </div>
        <button
          onClick={autoFillTryoutAgeGroups}
          disabled={autoFilling}
          style={{
            fontSize: '13px', fontWeight: 600, padding: '8px 16px', borderRadius: '6px',
            border: '0.5px solid var(--border-md)', background: 'var(--bg-card)',
            color: s.muted, cursor: autoFilling ? 'default' : 'pointer', opacity: autoFilling ? 0.6 : 1,
            flexShrink: 0,
          }}
        >
          {autoFilling ? 'Filling…' : 'Auto-fill tryout age groups'}
        </button>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '1.25rem', fontSize: '12px', color: s.dim }}>
        <span><span style={{ color: '#80B0E8', marginRight: 4 }}>●</span>Reg</span>
        <span><span style={{ color: '#6DB875', marginRight: 4 }}>●</span>Roster</span>
        <span><span style={{ color: '#E8A020', marginRight: 4 }}>●</span>GC Stats</span>
        <span><span style={{ color: '#C084FC', marginRight: 4 }}>●</span>Coach Eval</span>
        <span><span style={{ color: '#F472B6', marginRight: 4 }}>●</span>Tryout Score</span>
        <span style={{ marginLeft: 8, color: '#E8A020' }}>⚠ = conflict between reg and roster team</span>
      </div>

      {/* Age group filter pills */}
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
        {(['all', ...ageGroups] as string[]).map(ag => (
          <button key={ag} onClick={() => setAgeFilter(ag)} style={{
            padding: '5px 14px', borderRadius: '20px', border: '0.5px solid',
            borderColor: ageFilter === ag ? 'var(--accent)' : 'var(--border)',
            background: ageFilter === ag ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
            color: ageFilter === ag ? 'var(--accent)' : s.muted,
            fontSize: '12px', fontWeight: ageFilter === ag ? 700 : 400,
            cursor: 'pointer',
          }}>
            {ag === 'all' ? `All (${players.length})` : `${ag} (${players.filter(p => p.age_group === ag).length})`}
          </button>
        ))}
      </div>

      {/* Groups */}
      {groupedPlayers.map(([ag, group]) => (
        <div key={ag} style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)', marginBottom: '8px' }}>
            {ag} — {group.length} players
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead>
                <tr style={{ borderBottom: '0.5px solid var(--border)' }}>
                  {[
                    { label: 'Player',       w: '200px' },
                    { label: 'Reg Team',     w: '140px' },
                    { label: 'Roster Team',  w: '140px' },
                    { label: 'Current Team', w: '160px' },
                    { label: 'Tryout AG',    w: '100px' },
                    { label: 'Jersey',       w: '72px'  },
                    { label: 'Data',         w: '90px'  },
                  ].map(col => (
                    <th key={col.label} style={{
                      textAlign: 'left', padding: '6px 10px', fontWeight: 600,
                      fontSize: '11px', color: s.dim, textTransform: 'uppercase',
                      letterSpacing: '0.06em', minWidth: col.w,
                    }}>{col.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.map((p, i) => {
                  const reg    = regStaging.get(p.id)
                  const roster = rosterStaging.get(p.id)
                  const team   = playerValue(p, 'prior_team')
                  const tag    = playerValue(p, 'tryout_age_group')
                  const jersey = playerValue(p, 'jersey_number')

                  const regTeam    = reg?.prior_team ?? null
                  const rosterTeam = roster?.team_name ?? null
                  const hasConflict = regTeam && rosterTeam && regTeam.toLowerCase() !== rosterTeam.toLowerCase()

                  const editTeam = editingCell === `${p.id}_team`
                  const editTag  = editingCell === `${p.id}_tryout_ag`
                  const editJer  = editingCell === `${p.id}_jersey`

                  const rowBg = i % 2 === 0 ? 'transparent' : 'rgba(var(--fg-rgb),0.02)'

                  return (
                    <tr key={p.id} style={{ background: rowBg, borderBottom: '0.5px solid rgba(var(--fg-rgb),0.05)' }}>
                      {/* Player name */}
                      <td style={{ padding: '8px 10px', fontWeight: 600 }}>
                        <Link href={`/org/${params.orgId}/tryouts/players`} style={{ color: 'inherit', textDecoration: 'none' }}>
                          {p.last_name}, {p.first_name}
                        </Link>
                      </td>

                      {/* Reg team (read-only reference) */}
                      <td style={{ padding: '8px 10px', color: regTeam ? '#80B0E8' : s.dim }}>
                        {regTeam ?? <span style={{ opacity: 0.3 }}>—</span>}
                      </td>

                      {/* Roster team (read-only reference) */}
                      <td style={{ padding: '8px 10px', color: rosterTeam ? '#6DB875' : s.dim }}>
                        {rosterTeam
                          ? <span>{rosterTeam}</span>
                          : <span style={{ opacity: 0.3 }}>—</span>
                        }
                      </td>

                      {/* Current team (editable master) */}
                      <td style={{ padding: '8px 10px' }}>
                        {editTeam ? (
                          <input
                            ref={inputRef}
                            value={editVal}
                            onChange={e => setEditVal(e.target.value)}
                            onBlur={() => commitEdit(p.id, 'team')}
                            onKeyDown={e => handleKeyDown(e, p.id, 'team')}
                            style={{
                              width: '100%', background: 'var(--bg-input)', border: '1px solid var(--accent)',
                              borderRadius: '4px', padding: '4px 8px', fontSize: '13px', color: 'var(--fg)',
                              outline: 'none',
                            }}
                          />
                        ) : (
                          <div
                            onClick={() => startEdit(p.id, 'team', team ?? '')}
                            style={{
                              cursor: 'text', padding: '3px 6px', borderRadius: '4px', minHeight: '24px',
                              border: hasConflict ? '0.5px solid rgba(232,160,32,0.5)' : '0.5px solid transparent',
                              background: hasConflict ? 'rgba(232,160,32,0.08)' : 'transparent',
                              display: 'flex', alignItems: 'center', gap: '6px',
                              transition: 'border-color 0.1s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-md)')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = hasConflict ? 'rgba(232,160,32,0.5)' : 'transparent')}
                          >
                            {hasConflict && <span style={{ fontSize: '11px', color: '#E8A020' }}>⚠</span>}
                            <span style={{ fontWeight: team ? 600 : 400, color: team ? 'var(--fg)' : s.dim }}>
                              {team ?? <span style={{ opacity: 0.4, fontStyle: 'italic' }}>click to set</span>}
                            </span>
                            {savedCell === `${p.id}_team` && <span style={{ fontSize: '11px', color: '#6DB875' }}>✓</span>}
                          </div>
                        )}
                      </td>

                      {/* Tryout age group (editable) */}
                      <td style={{ padding: '8px 10px' }}>
                        {editTag ? (
                          <input
                            ref={inputRef}
                            value={editVal}
                            onChange={e => setEditVal(e.target.value)}
                            onBlur={() => commitEdit(p.id, 'tryout_ag')}
                            onKeyDown={e => handleKeyDown(e, p.id, 'tryout_ag')}
                            style={{
                              width: '72px', background: 'var(--bg-input)', border: '1px solid var(--accent)',
                              borderRadius: '4px', padding: '4px 8px', fontSize: '13px', color: 'var(--fg)',
                              outline: 'none',
                            }}
                          />
                        ) : (
                          <div
                            onClick={() => startEdit(p.id, 'tryout_ag', tag ?? nextAgeGroup(p.age_group))}
                            style={{
                              cursor: 'text', padding: '3px 6px', borderRadius: '4px', minHeight: '24px',
                              border: '0.5px solid transparent', display: 'inline-flex', alignItems: 'center', gap: '4px',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-md)')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                          >
                            <span style={{ fontWeight: tag ? 700 : 400, color: tag ? 'var(--fg)' : s.dim }}>
                              {tag ?? <span style={{ opacity: 0.4, fontStyle: 'italic' }}>{nextAgeGroup(p.age_group)}?</span>}
                            </span>
                            {savedCell === `${p.id}_tryout_ag` && <span style={{ fontSize: '11px', color: '#6DB875' }}>✓</span>}
                          </div>
                        )}
                      </td>

                      {/* Jersey (editable) */}
                      <td style={{ padding: '8px 10px' }}>
                        {editJer ? (
                          <input
                            ref={inputRef}
                            value={editVal}
                            onChange={e => setEditVal(e.target.value)}
                            onBlur={() => commitEdit(p.id, 'jersey')}
                            onKeyDown={e => handleKeyDown(e, p.id, 'jersey')}
                            style={{
                              width: '52px', background: 'var(--bg-input)', border: '1px solid var(--accent)',
                              borderRadius: '4px', padding: '4px 8px', fontSize: '13px', color: 'var(--fg)',
                              outline: 'none',
                            }}
                          />
                        ) : (
                          <div
                            onClick={() => startEdit(p.id, 'jersey', jersey ?? '')}
                            style={{
                              cursor: 'text', padding: '3px 6px', borderRadius: '4px', minHeight: '24px',
                              border: '0.5px solid transparent', display: 'inline-flex', alignItems: 'center', gap: '4px',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-md)')}
                            onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                          >
                            <span style={{ color: jersey ? 'var(--fg)' : s.dim }}>
                              {jersey ?? <span style={{ opacity: 0.4 }}>—</span>}
                            </span>
                            {savedCell === `${p.id}_jersey` && <span style={{ fontSize: '11px', color: '#6DB875' }}>✓</span>}
                          </div>
                        )}
                      </td>

                      {/* Data source dots */}
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ display: 'flex', gap: '5px', alignItems: 'center' }}>
                          <span title="Registration"   style={{ width: 8, height: 8, borderRadius: '50%', background: reg    ? '#80B0E8' : 'rgba(var(--fg-rgb),0.1)' }} />
                          <span title="Roster"         style={{ width: 8, height: 8, borderRadius: '50%', background: roster ? '#6DB875' : 'rgba(var(--fg-rgb),0.1)' }} />
                          <span title="GC Stats"       style={{ width: 8, height: 8, borderRadius: '50%', background: gcPlayerIds.has(p.id)    ? '#E8A020' : 'rgba(var(--fg-rgb),0.1)' }} />
                          <span title="Coach Eval"     style={{ width: 8, height: 8, borderRadius: '50%', background: evalPlayerIds.has(p.id)  ? '#C084FC' : 'rgba(var(--fg-rgb),0.1)' }} />
                          <span title="Tryout Score"   style={{ width: 8, height: 8, borderRadius: '50%', background: scorePlayerIds.has(p.id) ? '#F472B6' : 'rgba(var(--fg-rgb),0.1)' }} />
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {players.length === 0 && (
        <div style={{ textAlign: 'center', padding: '4rem', color: s.dim, fontSize: '14px' }}>
          No players found. Import registration data first.
        </div>
      )}
    </main>
  )
}
