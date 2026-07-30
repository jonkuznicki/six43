'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { GC_STAT_DEFS } from '../../../../../lib/tryouts/gcStatDefs'
import { DEFAULT_SEASON_WEIGHTS, type SeasonWeights } from '../../../../../lib/tryouts/scoring/combinedScore'
import { StatusPill, type StatusTone } from '../../../../../components/ui/StatusPill'
import type { PlayerActionItem } from './page'

const ACTION_STATUS_TONE: Record<string, StatusTone> = {
  open: 'warn', waiting: 'info', in_progress: 'good', blocked: 'bad',
  completed: 'neutral', cancelled: 'neutral',
}
const ACTION_STATUS_LABEL: Record<string, string> = {
  open: 'Open', waiting: 'Waiting', in_progress: 'In Progress', blocked: 'Blocked',
  completed: 'Completed', cancelled: 'Cancelled',
}

interface RankedPlayer {
  player:          { id: string; first_name: string; last_name: string; age_group: string; tryout_age_group: string | null; prior_team: string | null; grade?: string | null }
  ageGroup:        string
  tryoutScore:     number | null
  tryoutPitching:  number | null
  tryoutHitting:   number | null
  speed:           number | null
  coachEval:       number | null
  intangibles:     number | null
  teamPitching:    number | null
  teamHitting:     number | null
  evalSpeed?:       number | null
  evalAthleticism?: number | null
  coachComments:   string | null
  gcHittingScore:  number | null
  gcPitchingScore: number | null
  priorStatScore?: number | null
  combinedScore:   number | null
  combinedRank:    number | null
  tryoutRank:      number | null
  coachRank:       number | null
  intangiblesRank: number | null
  assignedTeamId:  string | null
  adminNotes:      string | null
  isAccepted?:     boolean
}

interface GcStatRow {
  player_id:         string
  gc_computed_score: number | null
  avg:               number | null
  obp:               number | null
  slg:               number | null
  ops:               number | null
  rbi:               number | null
  r:                 number | null
  hr:                number | null
  sb:                number | null
  bb:                number | null
  so:                number | null
  era:               number | null
  whip:              number | null
  ip:                number | null
  k:                 number | null
  bb_allowed:        number | null
  bf:                number | null
  baa:               number | null
  bb_per_inn:        number | null
  k_bb:              number | null
  strike_pct:        number | null
  w:                 number | null
  sv:                number | null
}

interface Team {
  id:        string
  name:      string
  age_group: string
  color:     string | null
}

// Optional identity/registration detail — not fetched by Rankings today, but
// populated when this card is reused from the Data Hub (which has the fuller
// per-player identity record). Rendered as an extra section when present.
export interface PlayerRegistrationDetail {
  grade:            string | null
  school:           string | null
  priorOrg:         string | null
  parentEmail:      string | null
  parentPhone:      string | null
  guardianName:     string | null
  address:          string | null
  registrationDate: string | null
  preferredDate:    string | null
  jerseyNumber:     string | null
  rosterTeam:       string | null
  registered:       boolean
}

interface Props {
  player:          RankedPlayer
  gcRow:           GcStatRow | null
  ageGroupGcRows:  GcStatRow[]
  teams:           Team[]
  totalInAge:      number
  onClose:         () => void
  weights?:        SeasonWeights
  registration?:   PlayerRegistrationDetail | null
  // Action-item integration — only wired up from Rankings (see phase summary
  // for why Data Hub's instance omits these: Data Hub is data quality/analysis,
  // not team-selection decisions).
  orgId?:              string
  actionItems?:        PlayerActionItem[]
  onQuickActionStatus?: (itemId: string, status: string) => void
  onQuickCreateAction?: (title?: string) => void
  // Acceptance — only wired from Rankings, matching the Follow-up gating above.
  onToggleAccepted?: () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function computePercentile(value: number, allValues: number[], higherBetter: boolean): number {
  if (allValues.length <= 1) return 0.5
  const below = allValues.filter(v => v < value).length
  const equal = allValues.filter(v => v === value).length
  const raw = (below + equal / 2) / allValues.length
  return higherBetter ? raw : 1 - raw
}

function pctLabel(p: number): string {
  const n = Math.round(p * 100)
  if (n >= 90) return `top ${100 - n}%`
  if (n >= 50) return `top ${100 - n}%`
  return `btm ${n}%`
}

function pctColor(p: number): string {
  if (p >= 0.8) return '#6DB875'
  if (p >= 0.5) return 'var(--accent)'
  if (p >= 0.25) return '#E8A020'
  return '#E87060'
}

function fmtStat(key: string, v: number): string {
  if (['avg', 'obp', 'slg', 'ops', 'baa'].includes(key)) return v.toFixed(3)
  if (['sb_pct', 'qab_pct', 'strike_pct'].includes(key)) return `${(v * 100).toFixed(0)}%`
  if (['era', 'whip', 'k_bb', 'bb_per_inn'].includes(key)) return v.toFixed(2)
  if (key === 'ip') return v.toFixed(1)
  return String(Math.round(v))
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoreBar({ value, max = 5, color = 'var(--accent)' }: { value: number | null; max?: number; color?: string }) {
  if (value == null) return <span style={{ fontSize: '11px', color: 'rgba(var(--fg-rgb),0.3)' }}>—</span>
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, height: '6px', borderRadius: '3px', background: 'rgba(var(--fg-rgb),0.08)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', borderRadius: '3px', background: color }} />
      </div>
      <span style={{ fontSize: '12px', fontWeight: 700, minWidth: '32px', textAlign: 'right' }}>{value.toFixed(2)}</span>
    </div>
  )
}

function Section({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1.25rem' }}>
      <div style={{ fontSize: '10px', fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color, marginBottom: '10px' }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function ScoreRow({ label, value, rank, totalInAge, color, max = 5 }: {
  label: string; value: number | null; rank?: number | null; totalInAge?: number; color: string; max?: number
}) {
  const s = { muted: `rgba(var(--fg-rgb), 0.55)` as const }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
      <span style={{ fontSize: '12px', color: s.muted }}>{label}</span>
      <ScoreBar value={value} max={max} color={color} />
      {rank != null && totalInAge != null ? (
        <span style={{ fontSize: '10px', color: 'rgba(var(--fg-rgb),0.4)', minWidth: '36px', textAlign: 'right' }}>
          #{rank}/{totalInAge}
        </span>
      ) : (
        <span style={{ minWidth: '36px' }} />
      )}
    </div>
  )
}

function RegRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  const s = { muted: `rgba(var(--fg-rgb), 0.55)` as const }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '10px', marginBottom: '6px' }}>
      <span style={{ fontSize: '12px', color: s.muted }}>{label}</span>
      <span style={{ fontSize: '12.5px', color: 'var(--fg)' }}>{value}</span>
    </div>
  )
}

function StatChip({ label, value, color }: { label: string; value: string | null; color?: string }) {
  return (
    <div style={{
      padding: '8px 12px', borderRadius: '8px',
      background: color ? `${color}14` : 'rgba(var(--fg-rgb),0.05)',
      border: `0.5px solid ${color ? `${color}30` : 'rgba(var(--fg-rgb),0.1)'}`,
      textAlign: 'center', minWidth: '72px',
    }}>
      <div style={{ fontSize: '16px', fontWeight: 800, color: color ?? 'var(--fg)' }}>
        {value ?? '—'}
      </div>
      <div style={{ fontSize: '10px', color: 'rgba(var(--fg-rgb),0.5)', marginTop: '2px', fontWeight: 600, letterSpacing: '0.04em' }}>
        {label}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PlayerCard({
  player: rp, gcRow, ageGroupGcRows, teams, totalInAge, onClose,
  weights = DEFAULT_SEASON_WEIGHTS, registration,
  orgId, actionItems, onQuickActionStatus, onQuickCreateAction, onToggleAccepted,
}: Props) {
  const [newActionTitle, setNewActionTitle] = useState('')
  const team = teams.find(t => t.id === rp.assignedTeamId)
  const teamColor = team?.name?.toLowerCase() === 'blue'  ? '#4090E0'
                  : team?.name?.toLowerCase() === 'white' ? 'rgba(var(--fg-rgb),0.5)'
                  : team ? '#6DB875' : undefined

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Compute percentile for each GC stat within this player's age group
  const gcPercentiles = useMemo(() => {
    if (!gcRow) return new Map<string, number>()
    const result = new Map<string, number>()
    for (const def of GC_STAT_DEFS) {
      const myVal = (gcRow as any)[def.key]
      if (myVal == null) continue
      const allVals = ageGroupGcRows
        .map(r => (r as any)[def.key] as number | null)
        .filter((v): v is number => v != null)
      result.set(def.key, computePercentile(myVal, allVals, def.higherBetter))
    }
    return result
  }, [gcRow, ageGroupGcRows])

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  const weightCaption = useMemo(() => {
    const parts = [
      ['Tryout', weights.tryoutWeight],
      ['Coach Eval', weights.coachEvalWeight],
      ['Intangibles', weights.intangiblesWeight],
      ['Season Stats', weights.priorStatsWeight],
    ] as const
    const desc = parts
      .filter(([, w]) => w > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([label, w]) => `${Math.round(w * 100)}% ${label}`)
      .join(' + ')
    return `${desc}. Redistributed across whichever sources are available for this player.`
  }, [weights])

  // GC stats that have non-null values, grouped by category
  const gcBatting  = GC_STAT_DEFS.filter(d => d.category === 'batting'  && gcRow && (gcRow as any)[d.key] != null)
  const gcPitching = GC_STAT_DEFS.filter(d => d.category === 'pitching' && gcRow && (gcRow as any)[d.key] != null)

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 50, background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: 'min(460px, 100vw)',
        zIndex: 51,
        background: 'var(--bg)',
        borderLeft: '0.5px solid var(--border)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.18)',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'sans-serif',
      }}>

        {/* Header */}
        <div style={{
          padding: '1.25rem 1.25rem 1rem',
          borderBottom: '0.5px solid var(--border)',
          position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 2,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 800, margin: 0, letterSpacing: '-0.01em' }}>
                {rp.player.first_name} {rp.player.last_name}
              </h2>
              <div style={{ display: 'flex', gap: '8px', marginTop: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{
                  fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                  background: 'rgba(var(--fg-rgb),0.07)', color: s.muted,
                }}>{rp.ageGroup}</span>
                {rp.player.grade && (
                  <span style={{ fontSize: '11px', color: s.muted }}>Grade {rp.player.grade}</span>
                )}
                {rp.player.prior_team && (
                  <span style={{ fontSize: '12px', color: 'var(--status-info)', fontWeight: 600 }}>
                    {rp.player.prior_team}
                  </span>
                )}
                {team && (
                  <span style={{
                    fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                    background: teamColor ? `${teamColor}18` : 'rgba(var(--fg-rgb),0.07)',
                    color: teamColor ?? s.muted,
                    border: `0.5px solid ${teamColor ? `${teamColor}40` : 'transparent'}`,
                  }}>→ {team.name}</span>
                )}
                {team && onToggleAccepted && (
                  <label
                    title={rp.isAccepted ? 'Player has accepted their roster spot — click to unmark' : 'Mark player as having accepted their roster spot'}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!rp.isAccepted} onChange={onToggleAccepted}
                      style={{ cursor: 'pointer', accentColor: rp.isAccepted ? 'var(--status-good)' : 'var(--status-warn)' }} />
                    <span style={{ fontSize: '11px', fontWeight: 700, color: rp.isAccepted ? 'var(--status-good)' : 'var(--status-warn)' }}>
                      {rp.isAccepted ? 'Accepted' : 'Pending'}
                    </span>
                  </label>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: s.muted, fontSize: '20px', padding: '2px 6px',
                borderRadius: '6px', lineHeight: 1,
              }}
            >×</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '1.25rem', flex: 1 }}>

          {/* Hero score chips */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <StatChip label="Combined" value={rp.combinedScore?.toFixed(2) ?? null} color="var(--accent)" />
            {rp.combinedRank != null && (
              <StatChip label="Rank" value={`#${rp.combinedRank}/${totalInAge}`} color="var(--accent)" />
            )}
            {rp.tryoutScore != null && (
              <StatChip label="Tryout"     value={rp.tryoutScore.toFixed(2)} color="#80B0E8" />
            )}
            {rp.coachEval != null && (
              <StatChip label="Coach Eval" value={rp.coachEval.toFixed(2)}   color="#6DB875" />
            )}
            {rp.gcHittingScore != null && (
              <StatChip label="GC Hit"  value={rp.gcHittingScore.toFixed(2)} />
            )}
            {rp.gcPitchingScore != null && (
              <StatChip label="GC Pit"  value={rp.gcPitchingScore.toFixed(2)} />
            )}
          </div>

          {/* Combined */}
          <Section label="Combined Score" color="var(--accent)">
            <ScoreRow label="Combined" value={rp.combinedScore} rank={rp.combinedRank} totalInAge={totalInAge} color="var(--accent)" />
            <div style={{ fontSize: '11px', color: s.dim, marginTop: '4px', lineHeight: 1.5 }}>
              {weightCaption}
            </div>
          </Section>

          {/* Follow-up / Action Items — only wired from Rankings, not Data Hub */}
          {actionItems && orgId && (
            <Section label="Follow-up" color="var(--status-warn)">
              {actionItems.length === 0 ? (
                <div style={{ fontSize: '12px', color: s.dim, marginBottom: '8px' }}>No open action items.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                  {actionItems.map(item => (
                    <div key={item.id} style={{
                      display: 'flex', flexDirection: 'column', gap: '4px',
                      padding: '6px 8px', borderRadius: '6px', background: 'var(--bg-card)', border: '0.5px solid var(--border)',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <StatusPill tone={ACTION_STATUS_TONE[item.status] ?? 'neutral'} size="sm">
                          {ACTION_STATUS_LABEL[item.status] ?? item.status}
                        </StatusPill>
                        <span style={{ fontSize: '12px', flex: 1, minWidth: '120px' }}>{item.title}</span>
                        {onQuickActionStatus && (
                          <select
                            value={item.status}
                            onChange={e => onQuickActionStatus(item.id, e.target.value)}
                            style={{ fontSize: '11px', padding: '2px 4px', borderRadius: '4px', border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: 'var(--fg)' }}
                          >
                            {Object.keys(ACTION_STATUS_LABEL).map(st => <option key={st} value={st}>{ACTION_STATUS_LABEL[st]}</option>)}
                          </select>
                        )}
                      </div>
                      {(item.owner_name || item.due_date) && (
                        <div style={{ display: 'flex', gap: '10px', fontSize: '10.5px', color: s.muted }}>
                          {item.owner_name && <span>Owner: {item.owner_name}</span>}
                          {item.due_date && <span>Due: {item.due_date}</span>}
                        </div>
                      )}
                      {item.details && (
                        <div title={item.details} style={{
                          fontSize: '11px', color: s.muted, overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap', cursor: 'help',
                        }}>{item.details}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {onQuickCreateAction && (
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <input
                      type="text" value={newActionTitle} onChange={e => setNewActionTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { onQuickCreateAction(newActionTitle); setNewActionTitle('') }
                      }}
                      placeholder={`Follow up on ${rp.player.first_name}…`}
                      style={{
                        flex: 1, fontSize: '11px', padding: '5px 8px', borderRadius: '5px',
                        border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: 'var(--fg)',
                      }}
                    />
                    <button onClick={() => { onQuickCreateAction(newActionTitle); setNewActionTitle('') }} style={{
                      fontSize: '11px', fontWeight: 700, padding: '4px 10px', borderRadius: '5px', cursor: 'pointer',
                      border: '0.5px solid var(--border-md)', background: 'var(--bg-input)', color: s.muted, whiteSpace: 'nowrap',
                    }}>+ Add</button>
                  </div>
                )}
                <Link href={`/org/${orgId}/tryouts/action-items?player=${rp.player.id}`} style={{ fontSize: '11px', color: 'var(--accent)' }}>
                  Manage all →
                </Link>
              </div>
            </Section>
          )}

          {/* Registration — only present when this card is opened from Data Hub */}
          {registration && (
            <Section label="Registration" color="var(--status-info)">
              <RegRow label="Registered"  value={registration.registered ? 'Yes' : 'No'} />
              <RegRow label="Prior team"  value={registration.rosterTeam ?? registration.priorOrg} />
              <RegRow label="Jersey #"    value={registration.jerseyNumber} />
              <RegRow label="Grade"       value={registration.grade} />
              <RegRow label="School"      value={registration.school} />
              <RegRow label="Guardian"    value={registration.guardianName} />
              <RegRow label="Email"       value={registration.parentEmail} />
              <RegRow label="Phone"       value={registration.parentPhone} />
              <RegRow label="Address"     value={registration.address} />
              <RegRow label="Registered on" value={registration.registrationDate} />
              <RegRow label="Preferred date" value={registration.preferredDate} />
            </Section>
          )}

          {/* Tryout */}
          {(rp.tryoutScore != null || rp.tryoutPitching != null || rp.tryoutHitting != null || rp.speed != null) && (
            <Section label="Tryout" color="#80B0E8">
              <ScoreRow label="Overall"  value={rp.tryoutScore}    rank={rp.tryoutRank} totalInAge={totalInAge} color="#80B0E8" />
              {rp.tryoutHitting  != null && <ScoreRow label="Hitting"  value={rp.tryoutHitting}  color="#80B0E8" />}
              {rp.tryoutPitching != null && <ScoreRow label="Pitching" value={rp.tryoutPitching} color="#80B0E8" />}
              {rp.speed != null && (
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                  <span style={{ fontSize: '12px', color: s.muted }}>Speed (60yd)</span>
                  <span style={{ fontSize: '12px', fontWeight: 700 }}>{rp.speed.toFixed(2)}s</span>
                  <span style={{ minWidth: '36px' }} />
                </div>
              )}
            </Section>
          )}

          {/* Coach Eval */}
          {(rp.coachEval != null || rp.intangibles != null || rp.teamPitching != null || rp.teamHitting != null) && (
            <Section label="Coach Evaluation" color="#6DB875">
              {rp.coachEval    != null && <ScoreRow label="Overall"     value={rp.coachEval}    rank={rp.coachRank}       totalInAge={totalInAge} color="#6DB875" />}
              {rp.intangibles  != null && <ScoreRow label="Intangibles" value={rp.intangibles}  rank={rp.intangiblesRank} totalInAge={totalInAge} color="#6DB875" />}
              {rp.teamHitting  != null && <ScoreRow label="Hitting"     value={rp.teamHitting}  color="#6DB875" />}
              {rp.teamPitching != null && <ScoreRow label="Pitching"    value={rp.teamPitching} color="#6DB875" />}
            </Section>
          )}

          {/* GC Stats */}
          {!gcRow && (
            <Section label="GameChanger Stats" color={s.muted}>
              <div style={{ fontSize: '12px', color: s.dim }}>No GC stats imported for this player.</div>
            </Section>
          )}
          {gcRow && gcBatting.length === 0 && gcPitching.length === 0 && (
            <Section label="GameChanger Stats" color={s.muted}>
              <div style={{ fontSize: '12px', color: s.dim }}>GC stats row exists but all values are null.</div>
            </Section>
          )}
          {gcRow && (gcBatting.length > 0 || gcPitching.length > 0) && (
            <Section label="GameChanger Stats" color={s.muted}>
              {gcBatting.length > 0 && (
                <>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: s.dim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Batting</div>
                  {gcBatting.map(def => {
                    const val = (gcRow as any)[def.key] as number
                    const pct = gcPercentiles.get(def.key)
                    return (
                      <GcStatRow key={def.key} def={def} value={val} percentile={pct} groupSize={ageGroupGcRows.length} />
                    )
                  })}
                </>
              )}
              {gcPitching.length > 0 && (
                <div style={{ marginTop: gcBatting.length > 0 ? '10px' : 0 }}>
                  <div style={{ fontSize: '10px', fontWeight: 700, color: s.dim, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '8px' }}>Pitching</div>
                  {gcPitching.map(def => {
                    const val = (gcRow as any)[def.key] as number
                    const pct = gcPercentiles.get(def.key)
                    return (
                      <GcStatRow key={def.key} def={def} value={val} percentile={pct} groupSize={ageGroupGcRows.length} />
                    )
                  })}
                </div>
              )}
            </Section>
          )}

          {/* Coach Comments */}
          {rp.coachComments && (
            <Section label="Coach Comments" color="#6DB875">
              <div style={{
                padding: '10px 12px', borderRadius: '8px',
                background: 'rgba(109,184,117,0.06)',
                border: '0.5px solid rgba(109,184,117,0.2)',
                fontSize: '13px', color: 'var(--fg)', lineHeight: 1.65,
              }}>
                {rp.coachComments}
              </div>
            </Section>
          )}

          {/* Admin Notes */}
          {rp.adminNotes && (
            <Section label="Notes" color={s.muted}>
              <div style={{
                padding: '10px 12px', borderRadius: '8px',
                background: 'rgba(var(--fg-rgb),0.04)',
                border: '0.5px solid var(--border)',
                fontSize: '13px', color: 'var(--fg)', lineHeight: 1.65,
              }}>
                {rp.adminNotes}
              </div>
            </Section>
          )}

        </div>
      </div>
    </>
  )
}

// ── GC stat row with percentile bar ──────────────────────────────────────────

function GcStatRow({
  def, value, percentile, groupSize,
}: {
  def:        { key: string; label: string; higherBetter: boolean }
  value:      number
  percentile: number | undefined
  groupSize:  number
}) {
  const s = { muted: `rgba(var(--fg-rgb), 0.55)` as const }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr auto auto', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
      <span style={{ fontSize: '12px', color: s.muted }}>{def.label}</span>
      <span style={{ fontSize: '13px', fontWeight: 700 }}>{fmtStat(def.key, value)}</span>
      {percentile != null && groupSize > 1 ? (
        <>
          {/* Thin pct bar */}
          <div style={{ width: '60px', height: '4px', borderRadius: '2px', background: 'rgba(var(--fg-rgb),0.08)', overflow: 'hidden' }}>
            <div style={{
              width: `${Math.round(percentile * 100)}%`,
              height: '100%',
              borderRadius: '2px',
              background: pctColor(percentile),
            }} />
          </div>
          <span style={{ fontSize: '10px', color: pctColor(percentile), fontWeight: 700, minWidth: '44px', textAlign: 'right' }}>
            {pctLabel(percentile)}
          </span>
        </>
      ) : (
        <><div style={{ width: '60px' }} /><span style={{ minWidth: '44px' }} /></>
      )}
    </div>
  )
}
