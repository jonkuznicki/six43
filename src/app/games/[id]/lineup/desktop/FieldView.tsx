'use client'

import { useState, useEffect, useRef } from 'react'

// ── Position layout (% of container width / height) ───────────────────────────
// Container aspect ratio matches the SVG viewBox: 400 × 440
// Home plate is at bottom-center; CF is at the top.

const FIELD_COORDS: Record<string, { top: number; left: number }> = {
  CF:   { top: 10.5, left: 50.0 },
  LF:   { top: 21.8, left: 13.5 },
  RF:   { top: 21.8, left: 86.5 },
  LC:   { top: 15.5, left: 31.5 },
  RC:   { top: 15.5, left: 68.5 },
  SS:   { top: 48.9, left: 38.5 },
  '2B': { top: 47.7, left: 62.5 },
  '3B': { top: 64.8, left: 20.5 },
  '1B': { top: 64.8, left: 80.0 },
  P:    { top: 60.2, left: 50.0 },
  C:    { top: 82.3, left: 50.0 },
}

const POS_COLOR: Record<string, { bg: string; text: string }> = {
  P:    { bg: 'rgba(75,156,211,0.28)',  text: '#4B9CD3' },
  C:    { bg: 'rgba(192,80,120,0.28)', text: '#E090B0' },
  '1B': { bg: 'rgba(128,176,232,0.2)', text: '#80B0E8' },
  '2B': { bg: 'rgba(128,176,232,0.2)', text: '#80B0E8' },
  SS:   { bg: 'rgba(128,176,232,0.2)', text: '#80B0E8' },
  '3B': { bg: 'rgba(128,176,232,0.2)', text: '#80B0E8' },
  LF:   { bg: 'rgba(109,184,117,0.2)', text: '#6DB875' },
  CF:   { bg: 'rgba(109,184,117,0.2)', text: '#6DB875' },
  RF:   { bg: 'rgba(109,184,117,0.2)', text: '#6DB875' },
  LC:   { bg: 'rgba(109,184,117,0.2)', text: '#6DB875' },
  RC:   { bg: 'rgba(109,184,117,0.2)', text: '#6DB875' },
  Bench:{ bg: 'rgba(160,160,160,0.15)', text: 'rgba(200,200,200,0.8)' },
}

function lastName(player: any): string {
  return player?.last_name ?? player?.first_name ?? '?'
}

// ── SVG field background ──────────────────────────────────────────────────────

function FieldSVG() {
  return (
    <svg
      viewBox="0 0 400 440"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      preserveAspectRatio="xMidYMid slice"
    >
      {/* Grass */}
      <rect width="400" height="440" fill="#1b3d1b" />
      {/* Warning track */}
      <path d="M 30 65 A 200 200 0 0 1 370 65" fill="none" stroke="rgba(139,90,43,0.45)" strokeWidth="16" />
      <path d="M 30 65 A 200 200 0 0 1 370 65" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
      {/* Foul lines */}
      <line x1="200" y1="415" x2="30" y2="55" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
      <line x1="200" y1="415" x2="370" y2="55" stroke="rgba(255,255,255,0.28)" strokeWidth="1.5" />
      {/* Infield dirt */}
      <polygon points="200,405 310,280 200,155 90,280" fill="#7a4f2a" opacity="0.7" />
      {/* Inner grass circle */}
      <circle cx="200" cy="295" r="78" fill="#256025" opacity="0.55" />
      {/* Base paths */}
      <line x1="200" y1="405" x2="310" y2="280" stroke="rgba(255,255,255,0.6)" strokeWidth="2" />
      <line x1="310" y1="280" x2="200" y2="155" stroke="rgba(255,255,255,0.6)" strokeWidth="2" />
      <line x1="200" y1="155" x2="90"  y2="280" stroke="rgba(255,255,255,0.6)" strokeWidth="2" />
      <line x1="90"  y1="280" x2="200" y2="405" stroke="rgba(255,255,255,0.6)" strokeWidth="2" />
      {/* Bases */}
      <rect x="303" y="273" width="14" height="14" rx="1" fill="white" opacity="0.9" transform="rotate(45 310 280)" />
      <rect x="193" y="148" width="14" height="14" rx="1" fill="white" opacity="0.9" transform="rotate(45 200 155)" />
      <rect x="83"  y="273" width="14" height="14" rx="1" fill="white" opacity="0.9" transform="rotate(45 90 280)"  />
      {/* Home plate */}
      <polygon points="192,405 208,405 213,418 200,424 187,418" fill="white" opacity="0.9" />
      {/* Pitcher's mound */}
      <circle cx="200" cy="265" r="14" fill="#8b5a2b" opacity="0.8" />
      <circle cx="200" cy="265" r="4"  fill="#a06832" />
      <rect x="194" y="262" width="12" height="4" rx="1" fill="white" opacity="0.85" />
    </svg>
  )
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Popover =
  | { kind: 'player';   slotId: string; rect: DOMRect }
  | { kind: 'position'; pos: string;    rect: DOMRect }

// ── Component ─────────────────────────────────────────────────────────────────

export default function FieldView({
  slots,
  inningCount,
  teamPositions,
  readOnly,
  onAssign,
}: {
  slots: any[]
  inningCount: number
  teamPositions: string[]
  readOnly: boolean
  onAssign: (slotId: string, ii: number, pos: string | null) => void
}) {
  const [inning,  setInning]  = useState(0)
  const [popover, setPopover] = useState<Popover | null>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  const activeSlots    = slots.filter(s => s.availability !== 'absent')
  const absentSlots    = slots.filter(s => s.availability === 'absent')
  // Positions this component can show on the field diagram
  const fieldPositions = teamPositions.filter(p => p !== 'Bench' && p in FIELD_COORDS)

  // Player at each field position for the current inning
  const posToSlot: Record<string, any> = {}
  for (const s of activeSlots) {
    const p = (s.inning_positions ?? [])[inning]
    if (p && p !== 'Bench' && p in FIELD_COORDS) posToSlot[p] = s
  }

  // Bench = explicitly assigned 'Bench', or a position the field diagram doesn't cover
  const benchSlots = activeSlots.filter(s => {
    const p = (s.inning_positions ?? [])[inning]
    return p === 'Bench' || (p && !(p in FIELD_COORDS))
  })
  const unassigned = activeSlots.filter(s => {
    const p = (s.inning_positions ?? [])[inning]
    return p === null || p === undefined
  })

  // Positions with duplicates this inning (for red border)
  const dupePosSet = new Set<string>()
  const counts: Record<string, number> = {}
  for (const s of activeSlots) {
    const p = (s.inning_positions ?? [])[inning]
    if (p && p !== 'Bench') counts[p] = (counts[p] ?? 0) + 1
  }
  for (const [p, c] of Object.entries(counts)) if (c > 1) dupePosSet.add(p)

  // Per-inning completion dots for the inning selector
  const inningStatuses = Array.from({ length: inningCount }, (_, ii) => {
    const c: Record<string, number> = {}
    for (const s of activeSlots) {
      const p = (s.inning_positions ?? [])[ii]
      if (p) c[p] = (c[p] ?? 0) + 1
    }
    const hasDupe = Object.entries(c).some(([p, v]) => p !== 'Bench' && v > 1)
    const missing = activeSlots.filter(s => !(s.inning_positions ?? [])[ii]).length
    return { complete: !hasDupe && missing === 0 && activeSlots.length > 0, hasDupe }
  })

  // Dismiss popover on outside click
  useEffect(() => {
    if (!popover) return
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopover(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [!!popover])

  function openPlayerPopover(slot: any, e: React.MouseEvent) {
    if (readOnly) return
    e.stopPropagation()
    setPopover({ kind: 'player', slotId: slot.id, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() })
  }

  function openPositionPopover(pos: string, e: React.MouseEvent) {
    if (readOnly) return
    e.stopPropagation()
    setPopover({ kind: 'position', pos, rect: (e.currentTarget as HTMLElement).getBoundingClientRect() })
  }

  function applyAssign(slotId: string, newPos: string | null) {
    onAssign(slotId, inning, newPos)
    setPopover(null)
  }

  // ── Popover ────────────────────────────────────────────────────────────────

  function renderPopover() {
    if (!popover) return null

    const { rect } = popover
    const vpW = window.innerWidth
    const vpH = window.innerHeight
    const w   = 232
    let left  = rect.left
    let top   = rect.bottom + 6
    if (left + w > vpW - 8) left = vpW - w - 8
    if (left < 8) left = 8
    if (top + 260 > vpH) top = Math.max(8, rect.top - 260)

    const panelStyle: React.CSSProperties = {
      position: 'fixed', left, top, width: w, zIndex: 400,
      background: 'var(--bg2)', border: '0.5px solid var(--border-md)',
      borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
      overflow: 'hidden',
    }

    // ── Player-first: move this player somewhere ────────────────────────────
    if (popover.kind === 'player') {
      const slot       = slots.find(s => s.id === popover.slotId)
      if (!slot) return null
      const currentPos = (slot.inning_positions ?? [])[inning] as string | null

      return (
        <div ref={popoverRef} style={panelStyle}>
          <div style={{ padding: '9px 11px 6px', borderBottom: '0.5px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg)' }}>
              {slot.player?.first_name} {slot.player?.last_name}
            </div>
            <div style={{ fontSize: 10, color: `rgba(var(--fg-rgb),0.4)`, marginTop: 1 }}>
              Inning {inning + 1}
              {currentPos ? ` · ${currentPos}` : ' · unassigned'}
            </div>
          </div>
          <div style={{ padding: 8 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {teamPositions.map(pos => {
                const isCurrent  = currentPos === pos
                const occupant   = pos !== 'Bench' && pos in FIELD_COORDS ? posToSlot[pos] : null
                const willSwap   = occupant && occupant.id !== slot.id
                const pc         = POS_COLOR[pos]
                return (
                  <button
                    key={pos}
                    onClick={() => applyAssign(slot.id, pos)}
                    title={willSwap ? `Swaps with ${lastName(occupant.player)}` : undefined}
                    style={{
                      padding: '4px 7px', borderRadius: 5, cursor: 'pointer',
                      fontSize: 11, fontWeight: 700,
                      border: isCurrent
                        ? `1.5px solid ${pc?.text ?? 'var(--accent)'}`
                        : '1px solid var(--border)',
                      background: isCurrent ? (pc?.bg ?? 'var(--bg-card)') : 'var(--bg-card)',
                      color:      isCurrent ? (pc?.text ?? 'var(--fg)')    : `rgba(var(--fg-rgb),0.7)`,
                    }}
                  >
                    {pos === 'Bench' ? 'Bench' : pos}
                    {willSwap && (
                      <span style={{ display: 'block', fontSize: 8, fontWeight: 400, color: `rgba(var(--fg-rgb),0.38)`, lineHeight: 1.2 }}>
                        ↕ {lastName(occupant.player)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {currentPos && (
              <button
                onClick={() => applyAssign(slot.id, null)}
                style={{
                  marginTop: 6, width: '100%', padding: '5px 0', borderRadius: 5,
                  background: 'transparent', border: '1px solid var(--border)',
                  color: `rgba(var(--fg-rgb),0.38)`, fontSize: 11, cursor: 'pointer',
                }}
              >
                Clear (unassign)
              </button>
            )}
          </div>
        </div>
      )
    }

    // ── Position-first: who plays here ─────────────────────────────────────
    if (popover.kind === 'position') {
      const { pos }   = popover
      const pc        = POS_COLOR[pos]
      const current   = posToSlot[pos]

      return (
        <div ref={popoverRef} style={panelStyle}>
          <div style={{ padding: '9px 11px 6px', borderBottom: '0.5px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: pc?.text ?? 'var(--fg)' }}>
              {pos} · Inning {inning + 1}
            </div>
            <div style={{ fontSize: 10, color: `rgba(var(--fg-rgb),0.4)`, marginTop: 1 }}>
              {current
                ? `${current.player?.first_name} ${current.player?.last_name} is here`
                : 'No player assigned'}
            </div>
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 0' }}>
            {activeSlots.map(s => {
              const sPos     = (s.inning_positions ?? [])[inning] as string | null
              const isCurrent = s.id === current?.id
              return (
                <button
                  key={s.id}
                  onClick={() => applyAssign(s.id, pos)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '7px 11px', background: isCurrent ? (pc?.bg ?? 'var(--bg-card)') : 'transparent',
                    border: 'none', cursor: 'pointer', textAlign: 'left',
                    color: isCurrent ? (pc?.text ?? 'var(--fg)') : 'var(--fg)',
                    fontSize: 13, fontWeight: isCurrent ? 700 : 400,
                  }}
                >
                  <span style={{ flex: 1 }}>
                    {s.player?.first_name} {s.player?.last_name}
                  </span>
                  {sPos && (
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3,
                      color: POS_COLOR[sPos]?.text ?? `rgba(var(--fg-rgb),0.4)`,
                      background: POS_COLOR[sPos]?.bg ?? 'transparent',
                    }}>
                      {sPos === 'Bench' ? 'B' : sPos}
                    </span>
                  )}
                </button>
              )
            })}
            {current && (
              <button
                onClick={() => applyAssign(current.id, null)}
                style={{
                  display: 'block', width: '100%', padding: '7px 11px',
                  background: 'transparent', borderTop: '0.5px solid var(--border)',
                  borderLeft: 'none', borderRight: 'none', borderBottom: 'none',
                  cursor: 'pointer', color: `rgba(var(--fg-rgb),0.38)`, fontSize: 11, textAlign: 'left',
                }}
              >
                Remove player from {pos}
              </button>
            )}
          </div>
        </div>
      )
    }

    return null
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)', padding: '14px 20px 40px' }}>

      {/* ── Inning selector ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 14, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.09em', color: `rgba(var(--fg-rgb),0.35)`, marginRight: 6,
        }}>
          Inning
        </span>
        {Array.from({ length: inningCount }, (_, i) => {
          const s = inningStatuses[i]
          return (
            <button
              key={i}
              onClick={() => setInning(i)}
              style={{
                position: 'relative', width: 34, height: 34, borderRadius: 7,
                border: inning === i ? '1.5px solid var(--accent)' : '0.5px solid var(--border)',
                background: inning === i ? 'rgba(75,156,211,0.12)' : 'transparent',
                color: inning === i ? 'var(--accent)' : `rgba(var(--fg-rgb),0.55)`,
                fontSize: 13, fontWeight: inning === i ? 700 : 400, cursor: 'pointer',
              }}
            >
              {i + 1}
              {s.complete && !s.hasDupe && (
                <span style={{
                  position: 'absolute', top: -3, right: -3, width: 8, height: 8,
                  borderRadius: '50%', background: '#6DB875', border: '1.5px solid var(--bg)',
                }} />
              )}
              {s.hasDupe && (
                <span style={{
                  position: 'absolute', top: -3, right: -3, width: 8, height: 8,
                  borderRadius: '50%', background: '#E87060', border: '1.5px solid var(--bg)',
                }} />
              )}
            </button>
          )
        })}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setInning(i => Math.max(0, i - 1))}
          disabled={inning === 0}
          style={{
            padding: '5px 9px', background: 'transparent', fontSize: 15,
            border: '0.5px solid var(--border)', borderRadius: 6, cursor: inning > 0 ? 'pointer' : 'default',
            color: inning > 0 ? `rgba(var(--fg-rgb),0.6)` : `rgba(var(--fg-rgb),0.2)`,
          }}
        >‹</button>
        <button
          onClick={() => setInning(i => Math.min(inningCount - 1, i + 1))}
          disabled={inning === inningCount - 1}
          style={{
            padding: '5px 9px', background: 'transparent', fontSize: 15,
            border: '0.5px solid var(--border)', borderRadius: 6,
            cursor: inning < inningCount - 1 ? 'pointer' : 'default',
            color: inning < inningCount - 1 ? `rgba(var(--fg-rgb),0.6)` : `rgba(var(--fg-rgb),0.2)`,
          }}
        >›</button>
      </div>

      {/* ── Main layout: field + sidebar ── */}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>

        {/* ── Field ── */}
        <div style={{
          position: 'relative', flexShrink: 0,
          width: '100%', maxWidth: 460,
          aspectRatio: '400 / 440',
          borderRadius: 14, overflow: 'hidden',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
        }}>
          <FieldSVG />

          {/* Player chips + empty position markers */}
          {fieldPositions.map(pos => {
            const coords = FIELD_COORDS[pos]
            if (!coords) return null
            const slot   = posToSlot[pos]
            const pc     = POS_COLOR[pos]
            const isDupe = dupePosSet.has(pos)

            return (
              <div
                key={pos}
                onClick={e => slot ? openPlayerPopover(slot, e) : openPositionPopover(pos, e)}
                style={{
                  position: 'absolute',
                  top: `${coords.top}%`, left: `${coords.left}%`,
                  transform: 'translate(-50%, -50%)',
                  minWidth: 58, padding: '3px 7px', borderRadius: 7,
                  textAlign: 'center', zIndex: 10,
                  cursor: readOnly ? 'default' : 'pointer',
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                  background: slot
                    ? (pc?.bg ?? 'rgba(0,0,0,0.5)')
                    : 'rgba(0,0,0,0.3)',
                  border: slot
                    ? `1.5px solid ${isDupe ? '#E87060' : (pc?.text ?? 'rgba(255,255,255,0.35)')}`
                    : '1.5px dashed rgba(255,255,255,0.22)',
                  transition: 'transform 0.1s, box-shadow 0.1s',
                }}
                onMouseEnter={e => {
                  if (!readOnly) (e.currentTarget as HTMLElement).style.transform = 'translate(-50%, -50%) scale(1.07)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.transform = 'translate(-50%, -50%)'
                }}
              >
                <div style={{
                  fontSize: 8, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: slot ? (pc?.text ?? 'rgba(255,255,255,0.9)') : 'rgba(255,255,255,0.38)',
                  lineHeight: 1.3,
                }}>
                  {pos}
                </div>
                <div style={{
                  fontSize: 11, fontWeight: slot ? 700 : 400, whiteSpace: 'nowrap',
                  color: slot ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.28)',
                  lineHeight: 1.2,
                }}>
                  {slot ? lastName(slot.player) : '—'}
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Sidebar: bench / unassigned / absent ── */}
        <div style={{ flex: 1, minWidth: 160, paddingTop: 4 }}>

          {/* Bench */}
          <div style={{ marginBottom: 18 }}>
            <div style={sectionLabel}>Bench</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {benchSlots.map(s => {
                const sPos = (s.inning_positions ?? [])[inning] as string
                return (
                  <div
                    key={s.id}
                    onClick={e => openPlayerPopover(s, e)}
                    style={{
                      padding: '6px 10px', borderRadius: 6,
                      background: 'rgba(160,160,160,0.1)',
                      border: '0.5px solid rgba(160,160,160,0.25)',
                      fontSize: 13, fontWeight: 500,
                      color: `rgba(var(--fg-rgb),0.65)`,
                      cursor: readOnly ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <span style={{ flex: 1 }}>
                      {s.player?.first_name?.[0]}. {lastName(s.player)}
                    </span>
                    {sPos && sPos !== 'Bench' && (
                      <span style={{ fontSize: 9, color: `rgba(var(--fg-rgb),0.35)` }}>{sPos}</span>
                    )}
                  </div>
                )
              })}
              {benchSlots.length === 0 && (
                <div style={{ fontSize: 11, color: `rgba(var(--fg-rgb),0.22)`, fontStyle: 'italic' }}>
                  No bench players
                </div>
              )}
            </div>
          </div>

          {/* Unassigned */}
          {unassigned.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ ...sectionLabel, color: '#E8A020' }}>⚠ Unassigned</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {unassigned.map(s => (
                  <div
                    key={s.id}
                    onClick={e => openPlayerPopover(s, e)}
                    style={{
                      padding: '6px 10px', borderRadius: 6,
                      background: 'rgba(232,160,32,0.08)',
                      border: '0.5px solid rgba(232,160,32,0.3)',
                      fontSize: 13, fontWeight: 600, color: '#E8A020',
                      cursor: readOnly ? 'default' : 'pointer',
                    }}
                  >
                    {s.player?.first_name?.[0]}. {lastName(s.player)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Absent */}
          {absentSlots.length > 0 && (
            <div>
              <div style={sectionLabel}>Absent</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {absentSlots.map(s => (
                  <div key={s.id} style={{
                    padding: '5px 10px', borderRadius: 6, fontSize: 12,
                    color: `rgba(var(--fg-rgb),0.22)`, textDecoration: 'line-through',
                  }}>
                    {s.player?.first_name?.[0]}. {lastName(s.player)}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {renderPopover()}
    </div>
  )
}

const sectionLabel: React.CSSProperties = {
  fontSize: 9, fontWeight: 800, textTransform: 'uppercase',
  letterSpacing: '0.1em', color: `rgba(var(--fg-rgb),0.3)`,
  marginBottom: 7,
}
