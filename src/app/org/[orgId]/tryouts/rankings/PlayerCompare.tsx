'use client'

import { useEffect } from 'react'
import { GC_STAT_DEFS } from '../../../../../lib/tryouts/gcStatDefs'

interface Player {
  id: string; first_name: string; last_name: string
  age_group: string; tryout_age_group: string | null; prior_team: string | null
}
interface RankedPlayer {
  player:          Player
  ageGroup:        string
  tryoutScore:     number | null
  coachEval:       number | null
  intangibles:     number | null
  teamPitching:    number | null
  teamHitting:     number | null
  tryoutPitching:  number | null
  tryoutHitting:   number | null
  speed:           number | null
  gcHittingScore:  number | null
  gcPitchingScore: number | null
  combinedScore:   number | null
  combinedRank:    number | null
  tryoutRank:      number | null
  coachRank:       number | null
  intangiblesRank: number | null
  coachComments:   string | null
  assignedTeamId:  string | null
}
interface GcStatRow {
  player_id: string
  gc_computed_score: number | null
  avg: number | null; obp: number | null; slg: number | null; ops: number | null
  rbi: number | null; r: number | null; hr: number | null; sb: number | null
  bb: number | null; so: number | null
  era: number | null; whip: number | null; ip: number | null
  k: number | null; bb_allowed: number | null; bf: number | null
  baa: number | null; bb_per_inn: number | null
  k_bb: number | null; strike_pct: number | null; w: number | null; sv: number | null
}
interface Team { id: string; name: string; age_group: string; color: string | null }

interface Props {
  players:  RankedPlayer[]
  gcRows:   GcStatRow[]
  teams:    Team[]
  ranked:   RankedPlayer[]   // full list for rank context
  onClose:  () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function best(vals: (number | null)[], higherBetter: boolean): number | null {
  const valid = vals.filter((v): v is number => v != null)
  if (!valid.length) return null
  return higherBetter ? Math.max(...valid) : Math.min(...valid)
}

function fmtStat(key: string, v: number): string {
  if (['avg', 'obp', 'slg', 'ops', 'baa'].includes(key)) return v.toFixed(3)
  if (['strike_pct'].includes(key)) return `${(v * 100).toFixed(0)}%`
  if (['era', 'whip', 'k_bb', 'bb_per_inn'].includes(key)) return v.toFixed(2)
  if (key === 'ip') return v.toFixed(1)
  return String(Math.round(v))
}

function fmt(v: number | null, dec = 2) { return v != null ? v.toFixed(dec) : '—' }

// ── Component ─────────────────────────────────────────────────────────────────

export default function PlayerCompare({ players, gcRows, teams, ranked, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const s = { muted: `rgba(var(--fg-rgb), 0.55)` as const, dim: `rgba(var(--fg-rgb), 0.35)` as const }

  const gcByPlayer = new Map(gcRows.map(g => [g.player_id, g]))

  // Score rows to compare
  const scoreRows: { label: string; color: string; getValue: (p: RankedPlayer) => number | null; getRank: (p: RankedPlayer) => number | null; higherBetter: boolean }[] = [
    { label: 'Combined',    color: 'var(--accent)', getValue: p => p.combinedScore,  getRank: p => p.combinedRank,    higherBetter: true },
    { label: 'Tryout',      color: '#80B0E8',       getValue: p => p.tryoutScore,    getRank: p => p.tryoutRank,      higherBetter: true },
    { label: 'Coach Eval',  color: '#6DB875',       getValue: p => p.coachEval,      getRank: p => p.coachRank,       higherBetter: true },
    { label: 'Intangibles', color: '#6DB875',       getValue: p => p.intangibles,    getRank: p => p.intangiblesRank, higherBetter: true },
    { label: 'T. Pitching', color: '#C080E8',       getValue: p => p.teamPitching,   getRank: _ => null,              higherBetter: true },
    { label: 'T. Hitting',  color: '#C080E8',       getValue: p => p.teamHitting,    getRank: _ => null,              higherBetter: true },
    { label: 'GC Hitting',  color: s.muted,         getValue: p => p.gcHittingScore,  getRank: _ => null,              higherBetter: true },
    { label: 'GC Pitching', color: s.muted,         getValue: p => p.gcPitchingScore, getRank: _ => null,              higherBetter: true },
  ]

  // GC stat rows that have at least one non-null value across the compared players
  const gcStatRows = GC_STAT_DEFS.filter(def =>
    players.some(p => {
      const gc = gcByPlayer.get(p.player.id)
      return gc && (gc as any)[def.key] != null
    })
  )

  const totalInAge = (ageGroup: string) => ranked.filter(r => r.ageGroup === ageGroup).length

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)' }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        zIndex: 51,
        background: 'var(--bg)',
        border: '0.5px solid var(--border)',
        borderRadius: '14px',
        boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        width: `min(${players.length * 220 + 160}px, 95vw)`,
        maxHeight: '90vh',
        overflowY: 'auto',
        fontFamily: 'sans-serif',
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '0.5px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 2,
        }}>
          <span style={{ fontSize: '14px', fontWeight: 800 }}>Compare Players</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.muted, fontSize: '20px', padding: '0 4px', lineHeight: 1 }}>×</button>
        </div>

        {/* Table */}
        <div style={{ padding: '1rem 1.25rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {/* Label column */}
                <th style={{ width: '140px', padding: '8px 0', textAlign: 'left', fontSize: '10px', color: s.dim, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '0.5px solid var(--border)' }} />
                {players.map(p => {
                  const team = teams.find(t => t.id === p.assignedTeamId)
                  const teamColor = team?.name?.toLowerCase() === 'blue' ? '#4090E0' : team?.name?.toLowerCase() === 'white' ? s.muted : team ? '#6DB875' : undefined
                  return (
                    <th key={p.player.id} style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '0.5px solid var(--border)', verticalAlign: 'bottom' }}>
                      <div style={{ fontSize: '13px', fontWeight: 800 }}>
                        {p.player.first_name} {p.player.last_name}
                      </div>
                      <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', marginTop: '4px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '10px', background: 'rgba(var(--fg-rgb),0.07)', color: s.muted }}>{p.ageGroup}</span>
                        {p.player.prior_team && <span style={{ fontSize: '10px', color: '#40A0E8', fontWeight: 600 }}>{p.player.prior_team}</span>}
                        {team && <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 6px', borderRadius: '10px', background: teamColor ? `${teamColor}18` : 'rgba(var(--fg-rgb),0.07)', color: teamColor ?? s.muted }}>→ {team.name}</span>}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody>
              {/* Score rows */}
              {scoreRows.map(row => {
                const vals = players.map(p => row.getValue(p))
                const bestVal = best(vals, row.higherBetter)
                const hasAny = vals.some(v => v != null)
                if (!hasAny) return null
                return (
                  <tr key={row.label} style={{ borderBottom: '0.5px solid rgba(var(--fg-rgb),0.05)' }}>
                    <td style={{ padding: '9px 0', fontSize: '12px', color: s.muted, fontWeight: 600 }}>{row.label}</td>
                    {players.map((p, i) => {
                      const val = vals[i]
                      const rank = row.getRank(p)
                      const isBest = val != null && val === bestVal
                      return (
                        <td key={p.player.id} style={{ padding: '9px 12px', textAlign: 'center', verticalAlign: 'middle' }}>
                          <div style={{ fontSize: '15px', fontWeight: 800, color: isBest ? row.color : val != null ? 'var(--fg)' : s.dim }}>
                            {fmt(val)}
                          </div>
                          {rank != null && (
                            <div style={{ fontSize: '10px', color: s.dim, marginTop: '1px' }}>
                              #{rank}/{totalInAge(p.ageGroup)}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}

              {/* GC Stats section header */}
              {gcStatRows.length > 0 && (
                <tr>
                  <td colSpan={players.length + 1} style={{ padding: '12px 0 4px', fontSize: '10px', fontWeight: 800, color: s.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    GameChanger Stats
                  </td>
                </tr>
              )}

              {gcStatRows.map(def => {
                const vals = players.map(p => {
                  const gc = gcByPlayer.get(p.player.id)
                  return gc ? (gc as any)[def.key] as number | null : null
                })
                const bestVal = best(vals, def.higherBetter)
                return (
                  <tr key={def.key} style={{ borderBottom: '0.5px solid rgba(var(--fg-rgb),0.04)' }}>
                    <td style={{ padding: '7px 0', fontSize: '12px', color: s.muted }}>
                      {def.label}
                      {!def.higherBetter && <span style={{ fontSize: '9px', color: s.dim, marginLeft: '3px' }}>↓</span>}
                    </td>
                    {players.map((p, i) => {
                      const val = vals[i]
                      const isBest = val != null && val === bestVal
                      return (
                        <td key={p.player.id} style={{ padding: '7px 12px', textAlign: 'center' }}>
                          <span style={{ fontSize: '13px', fontWeight: val != null ? 700 : 400, color: isBest ? '#6DB875' : val != null ? 'var(--fg)' : s.dim }}>
                            {val != null ? fmtStat(def.key, val) : '—'}
                          </span>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}

              {/* Coach comments */}
              {players.some(p => p.coachComments) && (
                <>
                  <tr>
                    <td colSpan={players.length + 1} style={{ padding: '12px 0 4px', fontSize: '10px', fontWeight: 800, color: s.dim, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      Coach Comments
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '4px 0', verticalAlign: 'top', fontSize: '11px', color: s.dim }}></td>
                    {players.map(p => (
                      <td key={p.player.id} style={{ padding: '4px 12px', verticalAlign: 'top' }}>
                        {p.coachComments ? (
                          <div style={{ fontSize: '11px', color: s.muted, lineHeight: 1.5 }}>{p.coachComments}</div>
                        ) : (
                          <span style={{ fontSize: '11px', color: s.dim }}>—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
