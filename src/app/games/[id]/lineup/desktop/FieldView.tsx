'use client'

import { useState, useEffect, useRef } from 'react'

// ── Position layout (% of container width / height) ───────────────────────────
// Container aspect ratio matches the SVG viewBox: 400 × 440
// Home plate is at bottom-center; CF is at the top.

// ViewBox: 400 × 440
// Home plate:  (200, 420)   Diamond side: 80 SVG units (45° so each base ±80 on both axes)
// 3B: (120, 340)   1B: (280, 340)   2B: (200, 260)
// Foul lines extend at 45° to fence corners: (0, 220) and (400, 220)
// Outfield arc: M 0 220 A 260 260 0 0 0 400 220 — peaks at y≈126
// All top/left values are %-of-container (height=440, width=400)
const FIELD_COORDS: Record<string, { top: number; left: number }> = {
  CF:   { top: 34.0, left: 50.0 },  // (200, 150) deep center
  LF:   { top: 48.0, left: 13.5 },  // ( 54, 211) left field
  RF:   { top: 48.0, left: 86.5 },  // (346, 211) right field
  LC:   { top: 41.5, left: 31.5 },  // (126, 183) left-center
  RC:   { top: 41.5, left: 68.5 },  // (274, 183) right-center
  SS:   { top: 66.0, left: 38.5 },  // (154, 290) shortstop
  '2B': { top: 63.0, left: 62.0 },  // (248, 277) second baseman
  '3B': { top: 79.5, left: 23.5 },  // ( 94, 350) third base
  '1B': { top: 79.5, left: 76.5 },  // (306, 350) first base
  P:    { top: 77.5, left: 50.0 },  // (200, 323) pitcher's mound
  C:    { top: 93.5, left: 50.0 },  // (200, 411) catcher
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

// ── SVG anchor points ──────────────────────────────────────────────────────────
// Home:  (200, 420)
// 1B:    (280, 340)  — home+(80,−80), sits on right foul line
// 2B:    (200, 260)  — home+(0,−160), directly above home
// 3B:    (120, 340)  — home+(−80,−80), sits on left foul line
// Mound: (200, 324)  — 60.5/127 of home→2B = 96 px above home
// Left foul line:  (200,420)→(0,220)   passes through 3B ✓
// Right foul line: (200,420)→(400,220) passes through 1B ✓
// Arc:   M 0 220 A 260 260 0 0 0 400 220   peaks at y≈126

function FieldSVG() {
  return (
    <svg
      viewBox="0 0 400 440"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    >
      {/* Foul territory background */}
      <rect width="400" height="440" fill="#243d24" />

      {/* Fair territory — home → left foul corner → outfield arc → right foul corner → home */}
      <path d="M 200 420 L 0 220 A 260 260 0 0 1 400 220 Z" fill="#2e5c32" />

      {/* Warning track */}
      <path d="M 0 220 A 260 260 0 0 1 400 220"
        fill="none" stroke="rgba(180,125,55,0.75)" strokeWidth="22" />
      {/* Outfield fence line */}
      <path d="M 0 220 A 260 260 0 0 1 400 220"
        fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />

      {/* Foul lines at exactly 45° — pass through 3B (120,340) and 1B (280,340) */}
      <line x1="200" y1="420" x2="0"   y2="220" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
      <line x1="200" y1="420" x2="400" y2="220" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />

      {/* Infield dirt — the diamond */}
      <polygon points="200,420 280,340 200,260 120,340" fill="#9a6535" opacity="0.85" />

      {/* Base paths */}
      <line x1="200" y1="420" x2="280" y2="340" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
      <line x1="280" y1="340" x2="200" y2="260" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
      <line x1="200" y1="260" x2="120" y2="340" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
      <line x1="120" y1="340" x2="200" y2="420" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />

      {/* 1B bag at (280, 340) */}
      <rect x="273" y="333" width="14" height="14" rx="1" fill="white" opacity="0.92"
        transform="rotate(45 280 340)" />
      {/* 2B bag at (200, 260) */}
      <rect x="193" y="253" width="14" height="14" rx="1" fill="white" opacity="0.92"
        transform="rotate(45 200 260)" />
      {/* 3B bag at (120, 340) */}
      <rect x="113" y="333" width="14" height="14" rx="1" fill="white" opacity="0.92"
        transform="rotate(45 120 340)" />

      {/* Home plate */}
      <polygon points="193,418 207,418 212,429 200,436 188,429" fill="white" opacity="0.92" />

      {/* Pitcher's mound at (200, 324) */}
      <circle cx="200" cy="324" r="13" fill="#8b5a2b" opacity="0.88" />
      <circle cx="200" cy="324" r="4"  fill="#a06832" />
      <rect x="194" y="321" width="12" height="4" rx="1" fill="white" opacity="0.85" />
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
  onSwap,
  onCopyInning,
  activeInning,
}: {
  slots: any[]
  inningCount: number
  teamPositions: string[]
  readOnly: boolean
  onAssign: (slotId: string, ii: number, pos: string | null) => void
  onSwap?: (slotId1: string, slotId2: string, ii: number) => void
  onCopyInning?: (from: number, to: number[]) => void
  activeInning?: number
}) {
  const [internalInning, setInning] = useState(0)
  const inning = activeInning ?? internalInning
  const [popover,         setPopover]         = useState<Popover | null>(null)
  const [swapMode,        setSwapMode]        = useState(false)
  const [swapFirst,       setSwapFirst]       = useState<string | null>(null)
  const [highlightedOrder, setHighlightedOrder] = useState<number | null>(null)
  const [isMobile,        setIsMobile]        = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 600)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const activeSlots    = slots.filter(s => s.availability !== 'absent')
  const absentSlots    = slots.filter(s => s.availability === 'absent')
  const fieldPositions = teamPositions.filter(p => p !== 'Bench' && p in FIELD_COORDS)

  const posToSlot: Record<string, any> = {}
  for (const s of activeSlots) {
    const p = (s.inning_positions ?? [])[inning]
    if (p && p !== 'Bench' && p in FIELD_COORDS) posToSlot[p] = s
  }

  const benchSlots = activeSlots.filter(s => {
    const p = (s.inning_positions ?? [])[inning]
    return p === 'Bench' || (p && !(p in FIELD_COORDS))
  })
  const unassigned = activeSlots.filter(s => {
    const p = (s.inning_positions ?? [])[inning]
    return p === null || p === undefined
  })

  const dupePosSet = new Set<string>()
  const counts: Record<string, number> = {}
  for (const s of activeSlots) {
    const p = (s.inning_positions ?? [])[inning]
    if (p && p !== 'Bench') counts[p] = (counts[p] ?? 0) + 1
  }
  for (const [p, c] of Object.entries(counts)) if (c > 1) dupePosSet.add(p)

  const inningStatuses = Array.from({ length: inningCount }, (_, ii) => {
    const c: Record<string, number> = {}
    let filled = 0
    for (const s of activeSlots) {
      const p = (s.inning_positions ?? [])[ii]
      if (p) { filled++; if (p !== 'Bench') c[p] = (c[p] ?? 0) + 1 }
    }
    const hasDupe = Object.entries(c).some(([, v]) => v > 1)
    const missing = activeSlots.length - filled
    return {
      complete: !hasDupe && missing === 0 && activeSlots.length > 0,
      hasDupe,
      filled,
      total: activeSlots.length,
    }
  })

  // Sorted active slots by batting order for highlight cycling
  const sortedOrders = [...activeSlots]
    .map(s => s.batting_order)
    .filter((o): o is number => o != null)
    .sort((a, b) => a - b)

  function nextBattingOrder(current: number): number | null {
    if (!sortedOrders.length) return null
    const idx = sortedOrders.indexOf(current)
    if (idx === -1) return sortedOrders[0]
    return sortedOrders[(idx + 1) % sortedOrders.length]
  }

  const upSlot     = highlightedOrder != null ? activeSlots.find(s => s.batting_order === highlightedOrder) : null
  const onDeckOrder = highlightedOrder != null ? nextBattingOrder(highlightedOrder) : null
  const onDeckSlot  = onDeckOrder != null ? activeSlots.find(s => s.batting_order === onDeckOrder) : null

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

  function handleChipClick(pos: string, slot: any | null, e: React.MouseEvent) {
    if (swapMode) {
      if (!slot) { setSwapFirst(null); return }
      if (!swapFirst) { setSwapFirst(slot.id); return }
      if (swapFirst === slot.id) { setSwapFirst(null); return }
      // Execute the swap
      if (onSwap) {
        onSwap(swapFirst, slot.id, inning)
      } else {
        const s1 = slots.find(s => s.id === swapFirst)
        const pos1 = (s1?.inning_positions ?? [])[inning] as string | null
        const pos2 = (slot.inning_positions ?? [])[inning] as string | null
        onAssign(swapFirst, inning, pos2)
        onAssign(slot.id,   inning, pos1)
      }
      setSwapFirst(null)
      return
    }
    // In read-only/locked mode tapping a chip sets the UP-to-bat marker
    if (readOnly) {
      if (slot) handleBattingOrderClick(slot, e)
      return
    }
    if (slot) openPlayerPopover(slot, e)
    else openPositionPopover(pos, e)
  }

  function handleBattingOrderClick(slot: any, e: React.MouseEvent) {
    e.stopPropagation()
    if (slot.batting_order == null) return
    if (highlightedOrder === slot.batting_order) {
      setHighlightedOrder(nextBattingOrder(slot.batting_order))
    } else {
      setHighlightedOrder(slot.batting_order)
    }
  }

  function slotInningCount(slot: any): number {
    return (slot.inning_positions ?? []).slice(0, inningCount)
      .filter((p: string | null) => p != null).length
  }

  const currentInningHasCoverage = activeSlots.some(s => !!(s.inning_positions ?? [])[inning])

  // ── Popover content (shared between floating and bottom-sheet) ─────────────

  function renderPopoverContent() {
    if (!popover) return null

    if (popover.kind === 'player') {
      const slot       = slots.find(s => s.id === popover.slotId)
      if (!slot) return null
      const currentPos = (slot.inning_positions ?? [])[inning] as string | null
      return (
        <>
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
                const isCurrent = currentPos === pos
                const occupant  = pos !== 'Bench' && pos in FIELD_COORDS ? posToSlot[pos] : null
                const willSwap  = occupant && occupant.id !== slot.id
                const pc        = POS_COLOR[pos]
                return (
                  <button
                    key={pos}
                    onClick={() => applyAssign(slot.id, pos)}
                    title={willSwap ? `Swaps with ${lastName(occupant.player)}` : undefined}
                    style={{
                      width: 60, padding: '5px 4px', borderRadius: 5, cursor: 'pointer',
                      fontSize: 11, fontWeight: 700, textAlign: 'center',
                      border: isCurrent
                        ? `1.5px solid ${pc?.text ?? 'var(--accent)'}`
                        : '1px solid var(--border)',
                      background: isCurrent ? (pc?.bg ?? 'var(--bg-card)') : 'var(--bg-card)',
                      color:      isCurrent ? (pc?.text ?? 'var(--fg)')    : `rgba(var(--fg-rgb),0.7)`,
                    }}
                  >
                    {pos}
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
            {slot.batting_order != null && (
              <button
                onClick={() => {
                  if (highlightedOrder === slot.batting_order) {
                    setHighlightedOrder(null)
                  } else {
                    setHighlightedOrder(slot.batting_order)
                  }
                  setPopover(null)
                }}
                style={{
                  marginTop: 4, width: '100%', padding: '5px 0', borderRadius: 5,
                  background: highlightedOrder === slot.batting_order
                    ? 'rgba(75,156,211,0.15)'
                    : 'transparent',
                  border: highlightedOrder === slot.batting_order
                    ? '1px solid rgba(75,156,211,0.4)'
                    : '1px solid var(--border)',
                  color: highlightedOrder === slot.batting_order
                    ? 'var(--accent)'
                    : `rgba(var(--fg-rgb),0.5)`,
                  fontSize: 11, cursor: 'pointer', fontWeight: 600,
                }}
              >
                {highlightedOrder === slot.batting_order ? '✓ Up to bat' : '⚡ Set as up to bat'}
              </button>
            )}
          </div>
        </>
      )
    }

    if (popover.kind === 'position') {
      const { pos } = popover
      const pc      = POS_COLOR[pos]
      const current = posToSlot[pos]
      return (
        <>
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
              const sPos      = (s.inning_positions ?? [])[inning] as string | null
              const isCurrent = s.id === current?.id
              return (
                <button
                  key={s.id}
                  onClick={() => applyAssign(s.id, pos)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                    padding: '7px 11px',
                    background: isCurrent ? (pc?.bg ?? 'var(--bg-card)') : 'transparent',
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
        </>
      )
    }

    return null
  }

  function renderPopover() {
    if (!popover) return null

    if (isMobile) {
      return (
        <div
          onClick={() => setPopover(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            zIndex: 500, display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            ref={popoverRef}
            onClick={e => e.stopPropagation()}
            style={{
              width: '100%', maxHeight: '70vh', overflowY: 'auto',
              background: 'var(--bg2)', borderRadius: '16px 16px 0 0',
              border: '0.5px solid var(--border-md)',
              boxShadow: '0 -4px 24px rgba(0,0,0,0.5)',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            }}
          >
            {renderPopoverContent()}
          </div>
        </div>
      )
    }

    const { rect } = popover
    const vpW = window.innerWidth
    const vpH = window.innerHeight
    const w   = 232
    let left  = rect.left
    let top   = rect.bottom + 6
    if (left + w > vpW - 8) left = vpW - w - 8
    if (left < 8) left = 8
    if (top + 260 > vpH) top = Math.max(8, rect.top - 260)

    return (
      <div ref={popoverRef} style={{
        position: 'fixed', left, top, width: w, zIndex: 400,
        background: 'var(--bg2)', border: '0.5px solid var(--border-md)',
        borderRadius: 10, boxShadow: '0 8px 28px rgba(0,0,0,0.45)',
        overflow: 'hidden',
      }}>
        {renderPopoverContent()}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column',
      background: 'var(--bg)', padding: '14px 20px 40px' }}>

      {/* ── Inning selector (hidden when controlled externally via activeInning) ── */}
      {activeInning === undefined && <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.09em', color: `rgba(var(--fg-rgb),0.35)`,
          marginRight: 6, marginBottom: 3,
        }}>
          Inning
        </span>
        {Array.from({ length: inningCount }, (_, i) => {
          const s = inningStatuses[i]
          const fillPct = s.total > 0 ? s.filled / s.total : 0
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <button
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
              {/* Fill progress bar */}
              <div style={{ width: 34, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${fillPct * 100}%`,
                  borderRadius: 2,
                  background: s.hasDupe ? '#E87060' : s.complete ? '#6DB875' : 'rgba(75,156,211,0.55)',
                  transition: 'width 0.2s',
                }} />
              </div>
            </div>
          )
        })}
        <div style={{ flex: 1 }} />
        {!readOnly && onCopyInning && currentInningHasCoverage && (
          <button
            onClick={() => {
              const targets = Array.from({ length: inningCount }, (_, i) => i).filter(i => i !== inning)
              onCopyInning(inning, targets)
            }}
            title="Copy this inning's assignments to all other innings"
            style={{
              padding: '5px 9px', background: 'transparent', fontSize: 11,
              border: '0.5px solid var(--border)', borderRadius: 6, cursor: 'pointer',
              color: `rgba(var(--fg-rgb),0.5)`, marginBottom: 3,
            }}
          >
            Copy to all
          </button>
        )}
        <button
          onClick={() => setInning(i => Math.max(0, i - 1))}
          disabled={inning === 0}
          style={{
            padding: '5px 9px', background: 'transparent', fontSize: 15,
            border: '0.5px solid var(--border)', borderRadius: 6,
            cursor: inning > 0 ? 'pointer' : 'default',
            color: inning > 0 ? `rgba(var(--fg-rgb),0.6)` : `rgba(var(--fg-rgb),0.2)`,
            marginBottom: 3,
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
            marginBottom: 3,
          }}
        >›</button>
      </div>}

      {/* ── Toolbar: swap mode ── */}
      {!readOnly && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <button
            onClick={() => { setSwapMode(m => !m); setSwapFirst(null) }}
            style={{
              padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
              cursor: 'pointer',
              background: swapMode ? 'rgba(75,156,211,0.2)' : 'transparent',
              border: swapMode ? '1px solid var(--accent)' : '0.5px solid var(--border)',
              color: swapMode ? 'var(--accent)' : `rgba(var(--fg-rgb),0.45)`,
            }}
          >
            ↔ Swap
          </button>
          {swapMode && (
            <span style={{ fontSize: 11, color: `rgba(var(--fg-rgb),0.38)` }}>
              {swapFirst
                ? 'Now tap the player to swap with'
                : 'Tap a player to select'}
            </span>
          )}
        </div>
      )}

      {/* ── Game-day batter highlight bar ── */}
      {highlightedOrder != null && upSlot && (
        <div style={{
          marginBottom: 12, padding: '8px 14px',
          background: 'rgba(75,156,211,0.1)', borderRadius: 8,
          border: '0.5px solid rgba(75,156,211,0.28)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 10, fontWeight: 800, color: '#4B9CD3', letterSpacing: '0.08em' }}>UP</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)' }}>
            #{highlightedOrder} {upSlot.player?.first_name} {lastName(upSlot.player)}
          </span>
          {onDeckSlot && (
            <span style={{ fontSize: 11, color: `rgba(var(--fg-rgb),0.4)` }}>
              · on deck: #{onDeckOrder} {lastName(onDeckSlot.player)}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => setHighlightedOrder(nextBattingOrder(highlightedOrder))}
            style={{
              padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600,
              background: 'rgba(75,156,211,0.18)', border: '0.5px solid rgba(75,156,211,0.35)',
              color: 'var(--accent)', cursor: 'pointer',
            }}
          >
            Next →
          </button>
          <button
            onClick={() => setHighlightedOrder(null)}
            style={{
              padding: '3px 8px', borderRadius: 5, fontSize: 12,
              background: 'transparent', border: '0.5px solid var(--border)',
              color: `rgba(var(--fg-rgb),0.35)`, cursor: 'pointer',
            }}
          >×</button>
        </div>
      )}

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

          {fieldPositions.map(pos => {
            const coords = FIELD_COORDS[pos]
            if (!coords) return null
            const slot          = posToSlot[pos]
            const pc            = POS_COLOR[pos]
            const isDupe        = dupePosSet.has(pos)
            const isSwapSelect  = swapMode && swapFirst === slot?.id
            const isUp          = slot != null && highlightedOrder != null && slot.batting_order === highlightedOrder
            const isOnDeck      = slot != null && onDeckOrder != null && slot.batting_order === onDeckOrder && !isUp

            return (
              <div
                key={pos}
                onClick={e => handleChipClick(pos, slot ?? null, e)}
                style={{
                  position: 'absolute',
                  top: `${coords.top}%`, left: `${coords.left}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 76, padding: '4px 5px', borderRadius: 7,
                  textAlign: 'center', zIndex: 10, overflow: 'hidden',
                  cursor: readOnly ? 'default' : 'pointer',
                  backdropFilter: 'blur(6px)',
                  WebkitBackdropFilter: 'blur(6px)',
                  background: isUp
                    ? 'rgba(75,156,211,0.55)'
                    : slot
                    ? (pc?.bg ?? 'rgba(0,0,0,0.5)')
                    : 'rgba(0,0,0,0.3)',
                  border: isSwapSelect
                    ? '2px solid var(--accent)'
                    : isUp
                    ? '2px solid #4B9CD3'
                    : isOnDeck
                    ? '1.5px solid rgba(75,156,211,0.45)'
                    : slot
                    ? `1.5px solid ${isDupe ? '#E87060' : (pc?.text ?? 'rgba(255,255,255,0.35)')}`
                    : '1.5px dashed rgba(255,255,255,0.22)',
                  boxShadow: isUp
                    ? '0 0 14px rgba(75,156,211,0.55)'
                    : isSwapSelect
                    ? '0 0 8px rgba(75,156,211,0.4)'
                    : 'none',
                  transition: 'transform 0.1s, box-shadow 0.1s',
                }}
                onMouseEnter={e => {
                  if (!readOnly) (e.currentTarget as HTMLElement).style.transform = 'translate(-50%, -50%) scale(1.07)'
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.transform = 'translate(-50%, -50%)'
                }}
              >
                {slot ? (
                  <>
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      gap: 5, lineHeight: 1.3,
                    }}>
                      {/* Batting order — click to activate game-day highlight */}
                      <span
                        onClick={e => handleBattingOrderClick(slot, e)}
                        style={{
                          fontSize: 9, fontWeight: 700, minWidth: 9,
                          color: isUp ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)',
                          cursor: 'pointer',
                        }}
                      >
                        {slot.batting_order ?? ''}
                      </span>
                      <span style={{
                        fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        color: isUp ? '#fff' : (pc?.text ?? 'rgba(255,255,255,0.95)'),
                      }}>
                        {pos}
                      </span>
                    </div>
                    <div style={{
                      fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                      overflow: 'hidden', textOverflow: 'ellipsis',
                      color: '#fff',
                      lineHeight: 1.2, textAlign: 'center',
                      textShadow: '0 1px 3px rgba(0,0,0,0.6)',
                    }}>
                      {lastName(slot.player)}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: '0.04em',
                      textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)',
                      lineHeight: 1.3, textAlign: 'center',
                    }}>
                      {pos}
                    </div>
                    <div style={{
                      fontSize: 13, color: 'rgba(255,255,255,0.35)',
                      lineHeight: 1.2, textAlign: 'center',
                    }}>
                      +
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Sidebar: batting order + bench / unassigned / absent ── */}
        <div style={{ flex: 1, minWidth: 160, paddingTop: 4 }}>

          {/* Batting order */}
          {sortedOrders.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={sectionLabel}>Batting Order</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                {[...activeSlots]
                  .sort((a, b) => (a.batting_order ?? 99) - (b.batting_order ?? 99))
                  .map(s => {
                    const pos    = (s.inning_positions ?? [])[inning] as string | null
                    const pc     = pos ? POS_COLOR[pos] : null
                    const isUpR  = highlightedOrder != null && s.batting_order === highlightedOrder
                    const isNextR = onDeckOrder != null && s.batting_order === onDeckOrder && !isUpR
                    return (
                      <div
                        key={s.id}
                        onClick={e => readOnly ? handleBattingOrderClick(s, e) : openPlayerPopover(s, e)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 7,
                          padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                          background: isUpR
                            ? 'rgba(75,156,211,0.14)'
                            : 'transparent',
                          border: isUpR
                            ? '0.5px solid rgba(75,156,211,0.3)'
                            : '0.5px solid transparent',
                        }}
                      >
                        <span
                          onClick={e => handleBattingOrderClick(s, e)}
                          style={{
                            fontSize: 12, fontWeight: 700, minWidth: 20, textAlign: 'right',
                            color: isUpR ? 'var(--accent)' : `rgba(var(--fg-rgb),0.35)`,
                            cursor: 'pointer', flexShrink: 0,
                          }}
                        >
                          {s.batting_order}
                        </span>
                        <span style={{
                          flex: 1, fontSize: 15, fontWeight: isUpR ? 700 : 500,
                          color: isUpR ? 'var(--fg)' : `rgba(var(--fg-rgb),0.85)`,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {s.player?.first_name?.[0]}. {lastName(s.player)}
                        </span>
                        {isUpR && (
                          <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', flexShrink: 0 }}>UP</span>
                        )}
                        {isNextR && (
                          <span style={{ fontSize: 10, color: 'rgba(75,156,211,0.6)', flexShrink: 0 }}>next</span>
                        )}
                        {pos && (
                          <span style={{
                            fontSize: 11, fontWeight: 700, padding: '2px 5px', borderRadius: 4, flexShrink: 0,
                            color: pc?.text ?? `rgba(var(--fg-rgb),0.4)`,
                            background: pc?.bg ?? 'transparent',
                          }}>
                            {pos === 'Bench' ? 'B' : pos}
                          </span>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {/* Bench */}
          <div style={{ marginBottom: 18 }}>
            <div style={sectionLabel}>Bench</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {benchSlots.map(s => {
                const sPos    = (s.inning_positions ?? [])[inning] as string
                const innCnt  = slotInningCount(s)
                const isUpB   = highlightedOrder != null && s.batting_order === highlightedOrder
                return (
                  <div
                    key={s.id}
                    onClick={e => openPlayerPopover(s, e)}
                    style={{
                      padding: '6px 10px', borderRadius: 6,
                      background: isUpB ? 'rgba(75,156,211,0.12)' : 'rgba(160,160,160,0.1)',
                      border: isUpB
                        ? '0.5px solid rgba(75,156,211,0.35)'
                        : '0.5px solid rgba(160,160,160,0.25)',
                      fontSize: 13, fontWeight: 500,
                      color: `rgba(var(--fg-rgb),0.65)`,
                      cursor: readOnly ? 'default' : 'pointer',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <span
                      onClick={e => handleBattingOrderClick(s, e)}
                      style={{
                        fontSize: 10,
                        color: isUpB ? 'var(--accent)' : `rgba(var(--fg-rgb),0.3)`,
                        minWidth: 14, flexShrink: 0, cursor: 'pointer',
                      }}
                    >
                      {s.batting_order ?? ''}
                    </span>
                    <span style={{ flex: 1 }}>
                      {s.player?.first_name?.[0]}. {lastName(s.player)}
                    </span>
                    {isUpB && (
                      <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--accent)' }}>UP</span>
                    )}
                    <span style={{ fontSize: 9, color: `rgba(var(--fg-rgb),0.25)` }}>
                      {innCnt}/{inningCount}
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
                {unassigned.map(s => {
                  const innCnt = slotInningCount(s)
                  const isUpU  = highlightedOrder != null && s.batting_order === highlightedOrder
                  return (
                    <div
                      key={s.id}
                      onClick={e => openPlayerPopover(s, e)}
                      style={{
                        padding: '6px 10px', borderRadius: 6,
                        background: 'rgba(232,160,32,0.08)',
                        border: '0.5px solid rgba(232,160,32,0.3)',
                        fontSize: 13, fontWeight: 600, color: '#E8A020',
                        cursor: readOnly ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}
                    >
                      <span
                        onClick={e => handleBattingOrderClick(s, e)}
                        style={{
                          fontSize: 10,
                          color: isUpU ? 'var(--accent)' : 'rgba(232,160,32,0.6)',
                          flexShrink: 0, cursor: 'pointer',
                        }}
                      >
                        {s.batting_order ?? ''}
                      </span>
                      <span style={{ flex: 1 }}>
                        {s.player?.first_name?.[0]}. {lastName(s.player)}
                      </span>
                      <span style={{ fontSize: 9, color: 'rgba(232,160,32,0.45)' }}>
                        {innCnt}/{inningCount}
                      </span>
                    </div>
                  )
                })}
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
