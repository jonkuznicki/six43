'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../../../lib/supabase'
import { useRouter } from 'next/navigation'
import FieldView from '../lineup/desktop/FieldView'

// ── Score storage helpers (same format as BoxScoreInput: game.notes._box) ──────

function readBoxScores(
  notes: string | null,
  count: number,
): [(number | null)[], (number | null)[]] {
  try {
    const p = JSON.parse(notes ?? '{}')
    const us   = Array.isArray(p._box?.us)   ? p._box.us   : Array(count).fill(null)
    const them = Array.isArray(p._box?.them) ? p._box.them : Array(count).fill(null)
    return [us, them]
  } catch {
    return [Array(count).fill(null), Array(count).fill(null)]
  }
}

function writeBoxScores(
  notes: string | null,
  us: (number | null)[],
  them: (number | null)[],
): string {
  try {
    const p = JSON.parse(notes ?? '{}')
    p._box = { us, them }
    return JSON.stringify(p)
  } catch {
    return JSON.stringify({ _box: { us, them } })
  }
}

// ── Position colours (dark theme) ─────────────────────────────────────────────

const POS_COLORS: Record<string, { bg: string; color: string }> = {
  P:    { bg: '#7C4D00', color: '#FFC040' },
  C:    { bg: '#6B1040', color: '#FFB0D0' },
  '1B': { bg: '#0F3070', color: '#80C0FF' },
  '2B': { bg: '#0F3070', color: '#80C0FF' },
  SS:   { bg: '#0F3070', color: '#80C0FF' },
  '3B': { bg: '#0F3070', color: '#80C0FF' },
  LF:   { bg: '#0D4020', color: '#60D080' },
  CF:   { bg: '#0D4020', color: '#60D080' },
  LC:   { bg: '#0D4020', color: '#60D080' },
  RC:   { bg: '#0D4020', color: '#60D080' },
  RF:   { bg: '#0D4020', color: '#60D080' },
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function InGameView({
  game,
  slots,
  inningCount,
  teamName,
  teamPositions,
  isOwner,
}: {
  game: any
  slots: any[]
  inningCount: number
  teamName: string
  teamPositions: string[]
  isOwner: boolean
}) {
  const supabase  = createClient()
  const router    = useRouter()

  // ── Inning & batting order ─────────────────────────────────────────────────
  const [inning,           setInning]           = useState(0)
  const [highlightedOrder, setHighlightedOrder] = useState<number | null>(null)

  // ── Lock mode (UI-only; intentional tap required to unlock) ────────────────
  const [locked,           setLocked]           = useState(false)
  const [showUnlockModal,  setShowUnlockModal]  = useState(false)

  // ── Fullscreen (native + CSS fallback for iPad Safari) ────────────────────
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false)
  const [isCssFullscreen,    setIsCssFullscreen]    = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Status / game-end ─────────────────────────────────────────────────────
  const [status,          setStatus]          = useState<string>(game.status ?? 'in_progress')
  const [savingStatus,    setSavingStatus]    = useState(false)
  const [showEndConfirm,  setShowEndConfirm]  = useState(false)

  // ── View mode (list = batting order, field = FieldView) ──────────────────
  const [viewMode, setViewMode] = useState<'list' | 'field'>('field')
  const [localSlots, setLocalSlots] = useState<any[]>(slots)

  // ── Body class: hide games-left-nav while in-game view is open ───────────
  useEffect(() => {
    document.body.classList.add('ingame-mode')
    return () => document.body.classList.remove('ingame-mode')
  }, [])

  function assignPosition(slotId: string, ii: number, pos: string | null) {
    if (locked) return
    setLocalSlots(prev => {
      const next = prev.map(s => {
        if (s.id !== slotId) return s
        const positions = [...(s.inning_positions ?? [])]
        positions[ii] = pos
        return { ...s, inning_positions: positions }
      })
      const updated = next.find(s => s.id === slotId)
      if (updated) {
        supabase.from('lineup_slots')
          .update({ inning_positions: updated.inning_positions })
          .eq('id', slotId)
          .then(() => {})
      }
      return next
    })
  }

  // ── Scoreboard ────────────────────────────────────────────────────────────
  const notesRawRef                                  = useRef<string | null>(game.notes ?? null)
  const [us,   setUs]   = useState<(number | null)[]>(() => readBoxScores(game.notes, inningCount)[0])
  const [them, setThem] = useState<(number | null)[]>(() => readBoxScores(game.notes, inningCount)[1])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Native fullscreen listener ─────────────────────────────────────────────
  useEffect(() => {
    const onChange = () => setIsNativeFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const isFullscreen = isNativeFullscreen || isCssFullscreen

  function toggleFullscreen() {
    if (isNativeFullscreen) {
      document.exitFullscreen().catch(() => {})
      return
    }
    if (isCssFullscreen) {
      setIsCssFullscreen(false)
      return
    }
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {
        // iPad Safari: fall back to CSS overlay
        setIsCssFullscreen(true)
      })
    } else {
      setIsCssFullscreen(true)
    }
  }

  function exitFullscreen() {
    if (isNativeFullscreen) document.exitFullscreen().catch(() => {})
    setIsCssFullscreen(false)
  }

  // ── Score save (debounced, 800 ms) ─────────────────────────────────────────
  function scheduleSave(nextUs: (number | null)[], nextThem: (number | null)[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const newNotes = writeBoxScores(notesRawRef.current, nextUs, nextThem)
      notesRawRef.current = newNotes
      await supabase.from('games').update({ notes: newNotes }).eq('id', game.id)
    }, 800)
  }

  function setUsInning(i: number, val: string) {
    if (locked) return
    const n = val === '' ? null : Math.max(0, Math.min(99, parseInt(val) || 0))
    const next = [...us]; next[i] = n; setUs(next); scheduleSave(next, them)
  }

  function setThemInning(i: number, val: string) {
    if (locked) return
    const n = val === '' ? null : Math.max(0, Math.min(99, parseInt(val) || 0))
    const next = [...them]; next[i] = n; setThem(next); scheduleSave(us, next)
  }

  const usTotal   = us.reduce<number>((a, v)   => a + (v ?? 0), 0)
  const themTotal = them.reduce<number>((a, v) => a + (v ?? 0), 0)

  // ── Status helpers ─────────────────────────────────────────────────────────
  async function endGame() {
    setSavingStatus(true)
    setStatus('final')
    await supabase.from('games').update({ status: 'final' }).eq('id', game.id)
    setSavingStatus(false)
    setShowEndConfirm(false)
    router.push(`/games/${game.id}/lineup/desktop`)
  }

  // ── Batting order helpers ──────────────────────────────────────────────────
  const sortedSlots = [...slots].sort((a, b) => (a.batting_order ?? 99) - (b.batting_order ?? 99))
  const sortedOrders = sortedSlots.map(s => s.batting_order).filter((o): o is number => o != null)

  function nextOrder(cur: number): number | null {
    if (!sortedOrders.length) return null
    const idx = sortedOrders.indexOf(cur)
    if (idx === -1) return sortedOrders[0]
    return sortedOrders[(idx + 1) % sortedOrders.length]
  }

  const upSlot      = highlightedOrder != null ? slots.find(s => s.batting_order === highlightedOrder) : null
  const onDeckOrder = highlightedOrder != null ? nextOrder(highlightedOrder) : null
  const onDeckSlot  = onDeckOrder != null ? slots.find(s => s.batting_order === onDeckOrder) : null

  function tapPlayer(s: any) {
    if (!s.batting_order) return
    if (highlightedOrder === s.batting_order) {
      setHighlightedOrder(nextOrder(s.batting_order))
    } else {
      setHighlightedOrder(s.batting_order)
    }
  }

  // ── Inning completion dots ─────────────────────────────────────────────────
  const inningStatuses = Array.from({ length: inningCount }, (_, ii) => {
    const filled = slots.filter(s => !!(s.inning_positions ?? [])[ii]).length
    return { filled, total: slots.length }
  })

  // ── Common styles ──────────────────────────────────────────────────────────
  const BG     = '#050D1A'
  const FG     = '#F0F4FF'
  const BORDER = 'rgba(255,255,255,0.08)'
  const ACCENT = '#E8A020'

  // ── Container style: fullscreen overlay when using CSS fallback ────────────
  const containerStyle: React.CSSProperties = isCssFullscreen
    ? {
        position: 'fixed', inset: 0, zIndex: 9999,
        background: BG, color: FG, overflowY: 'auto',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        display: 'flex', flexDirection: 'column',
      }
    : {
        minHeight: '100vh', background: BG, color: FG,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        display: 'flex', flexDirection: 'column',
      }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} style={containerStyle}>

      {/* ── HEADER ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        borderBottom: `1px solid ${BORDER}`,
        flexShrink: 0, flexWrap: 'wrap',
        position: 'sticky', top: 0, zIndex: 100, background: BG,
      }}>
        {/* Back to lineup — visible, intentional exit */}
        <a
          href={`/games/${game.id}/lineup/desktop`}
          style={{
            fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.55)',
            textDecoration: 'none', flexShrink: 0,
            padding: '5px 10px', borderRadius: 6,
            border: `1px solid rgba(255,255,255,0.12)`,
            background: 'rgba(255,255,255,0.05)',
          }}
        >
          ← Edit Lineup
        </a>

        <div style={{ width: 1, height: 18, background: BORDER, flexShrink: 0 }} />

        {/* Opponent */}
        <div style={{ flex: 1, minWidth: 120, fontWeight: 700, fontSize: 15, color: FG }}>
          vs {game.opponent}
        </div>

        {/* Score summary */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 18, fontWeight: 800, flexShrink: 0,
        }}>
          <span style={{ color: usTotal > themTotal ? '#60D080' : usTotal < themTotal ? '#E87060' : FG }}>
            {usTotal}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>–</span>
          <span style={{ color: usTotal < themTotal ? '#60D080' : usTotal > themTotal ? '#E87060' : FG }}>
            {themTotal}
          </span>
        </div>

        {/* Status badge */}
        <div style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
          letterSpacing: '0.07em', textTransform: 'uppercase', flexShrink: 0,
          background: status === 'in_progress'
            ? 'rgba(232,160,32,0.18)'
            : status === 'final'
            ? 'rgba(109,184,117,0.18)'
            : 'rgba(255,255,255,0.08)',
          color: status === 'in_progress' ? ACCENT : status === 'final' ? '#6DB875' : 'rgba(255,255,255,0.5)',
          border: `1px solid ${status === 'in_progress' ? 'rgba(232,160,32,0.3)' : 'rgba(255,255,255,0.1)'}`,
        }}>
          {status === 'in_progress' ? 'Live' : status === 'final' ? 'Final' : status}
        </div>

        {/* Lock button */}
        <button
          onClick={() => locked ? setShowUnlockModal(true) : setLocked(true)}
          title={locked ? 'Locked — tap to unlock' : 'Lock screen to prevent accidental changes'}
          style={{
            flexShrink: 0, padding: '5px 10px', borderRadius: 6, fontSize: 13,
            border: locked ? '1px solid rgba(232,112,96,0.4)' : `1px solid ${BORDER}`,
            background: locked ? 'rgba(232,112,96,0.12)' : 'transparent',
            color: locked ? '#E87060' : 'rgba(255,255,255,0.4)',
            cursor: 'pointer', fontWeight: 600,
          }}
        >
          {locked ? '🔒' : '🔓'}
        </button>

        {/* Fullscreen button */}
        <button
          onClick={isFullscreen ? exitFullscreen : toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          style={{
            flexShrink: 0, padding: '5px 10px', borderRadius: 6, fontSize: 13,
            border: `1px solid ${BORDER}`, background: 'transparent',
            color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
          }}
        >
          {isFullscreen ? '⊡' : '⛶'}
        </button>

        {/* View mode toggle: list ↔ field */}
        <div style={{ display: 'flex', gap: 2, flexShrink: 0, border: `1px solid ${BORDER}`, borderRadius: 7, overflow: 'hidden' }}>
          {(['list', 'field'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '5px 11px', border: 'none', fontSize: 12, fontWeight: 600,
                cursor: 'pointer',
                background: viewMode === mode ? 'rgba(255,255,255,0.14)' : 'transparent',
                color: viewMode === mode ? FG : 'rgba(255,255,255,0.38)',
              }}
            >
              {mode === 'list' ? '≡ List' : '◈ Field'}
            </button>
          ))}
        </div>

        {/* End game — owner only */}
        {isOwner && status !== 'final' && (
          <button
            onClick={() => setShowEndConfirm(true)}
            style={{
              flexShrink: 0, padding: '5px 12px', borderRadius: 6, fontSize: 12,
              fontWeight: 700, border: '1px solid rgba(109,184,117,0.35)',
              background: 'rgba(109,184,117,0.1)', color: '#6DB875', cursor: 'pointer',
            }}
          >
            End game
          </button>
        )}
      </div>

      {/* ── LOCKED BANNER ── */}
      {locked && (
        <div style={{
          background: 'rgba(232,112,96,0.1)', borderBottom: '1px solid rgba(232,112,96,0.2)',
          padding: '7px 16px', display: 'flex', alignItems: 'center', gap: 10,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, color: '#E87060', fontWeight: 600, flex: 1 }}>
            🔒 Screen is locked — tap 🔒 to unlock
          </span>
        </div>
      )}

      {/* ── INNING SELECTOR ── */}
      <div style={{
        display: 'flex', gap: 6, padding: '10px 14px',
        borderBottom: `1px solid ${BORDER}`,
        flexShrink: 0, overflowX: 'auto',
        WebkitOverflowScrolling: 'touch' as any,
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em',
          color: 'rgba(255,255,255,0.25)', alignSelf: 'center', marginRight: 4, flexShrink: 0,
        }}>
          Inn
        </span>
        {Array.from({ length: inningCount }, (_, i) => {
          const s = inningStatuses[i]
          const hasSomeScore = (us[i] != null || them[i] != null)
          return (
            <button
              key={i}
              onClick={() => setInning(i)}
              style={{
                minWidth: 48, height: 48, borderRadius: 8, border: 'none',
                background: inning === i ? ACCENT : 'rgba(255,255,255,0.07)',
                color: inning === i ? BG : 'rgba(255,255,255,0.55)',
                fontSize: 17, fontWeight: 800, cursor: 'pointer', flexShrink: 0,
                position: 'relative',
              }}
            >
              {i + 1}
              {/* Dot: score entered for this inning */}
              {hasSomeScore && (
                <span style={{
                  position: 'absolute', top: 4, right: 4, width: 6, height: 6,
                  borderRadius: '50%',
                  background: inning === i ? 'rgba(0,0,0,0.4)' : ACCENT,
                }} />
              )}
            </button>
          )
        })}
      </div>

      {/* ── UP-TO-BAT BANNER (when active) ── */}
      {upSlot && (
        <div style={{
          padding: '8px 16px', flexShrink: 0,
          background: `rgba(232,160,32,0.12)`,
          borderBottom: `1px solid rgba(232,160,32,0.2)`,
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: ACCENT, letterSpacing: '0.09em' }}>UP</span>
          <span style={{ fontSize: 16, fontWeight: 800, color: FG }}>
            #{highlightedOrder} {upSlot.player?.first_name} {upSlot.player?.last_name}
          </span>
          {onDeckSlot && (
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              · on deck: #{onDeckOrder} {onDeckSlot.player?.last_name}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => highlightedOrder != null && setHighlightedOrder(nextOrder(highlightedOrder))}
            style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
              background: `rgba(232,160,32,0.2)`, border: `1px solid rgba(232,160,32,0.4)`,
              color: ACCENT, cursor: 'pointer',
            }}
          >
            Next →
          </button>
          <button
            onClick={() => setHighlightedOrder(null)}
            style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 14,
              background: 'transparent', border: `1px solid ${BORDER}`,
              color: 'rgba(255,255,255,0.3)', cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* ── MAIN CONTENT: batting order + scoreboard ── */}
      <div style={{
        flex: 1, display: 'flex', gap: 0,
        flexWrap: 'wrap', alignItems: 'flex-start',
        overflowY: 'auto',
      }}>

        {/* ── BATTING ORDER (list mode) ── */}
        {viewMode === 'list' && (
        <div style={{
          flex: '1 1 320px', minWidth: 0,
          borderRight: `1px solid ${BORDER}`,
          overflowY: 'auto',
        }}>
          <div style={{
            padding: '10px 16px 4px',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)',
          }}>
            Batting Order — Inning {inning + 1}
          </div>

          <div style={{ padding: '4px 10px 24px' }}>
            {sortedSlots.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3rem 0', color: 'rgba(255,255,255,0.2)', fontSize: 14 }}>
                No lineup built yet.
              </div>
            ) : (
              sortedSlots.map(s => {
                const pos     = (s.inning_positions ?? [])[inning] as string | null
                const isBench = pos === 'Bench' || pos === null
                const pc      = pos && !isBench ? (POS_COLORS[pos] ?? null) : null
                const isUp    = highlightedOrder != null && s.batting_order === highlightedOrder
                const isNext  = onDeckOrder != null && s.batting_order === onDeckOrder && !isUp

                return (
                  <div
                    key={s.id}
                    onClick={() => tapPlayer(s)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 8px', marginBottom: 3,
                      borderRadius: 10, cursor: 'pointer',
                      background: isUp
                        ? 'rgba(232,160,32,0.15)'
                        : isNext
                        ? 'rgba(232,160,32,0.06)'
                        : isBench
                        ? 'rgba(255,255,255,0.02)'
                        : 'rgba(255,255,255,0.04)',
                      border: isUp
                        ? '1px solid rgba(232,160,32,0.4)'
                        : isNext
                        ? `1px solid rgba(232,160,32,0.2)`
                        : `1px solid ${isBench ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.07)'}`,
                      opacity: isBench ? 0.45 : 1,
                      transition: 'background 0.12s',
                    }}
                  >
                    {/* Batting number */}
                    <div style={{
                      width: 26, textAlign: 'center', flexShrink: 0,
                      fontSize: 13, fontWeight: 700,
                      color: isUp ? ACCENT : 'rgba(255,255,255,0.22)',
                    }}>
                      {s.batting_order ?? '·'}
                    </div>

                    {/* Jersey */}
                    <div style={{
                      width: 32, textAlign: 'center', flexShrink: 0,
                      fontSize: 13, fontWeight: 700,
                      color: isUp ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.3)',
                    }}>
                      {s.player?.jersey_number ?? '—'}
                    </div>

                    {/* Name */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 22, fontWeight: 700, lineHeight: 1.1,
                        letterSpacing: '-0.3px',
                        color: isUp ? FG : isBench ? 'rgba(255,255,255,0.28)' : FG,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {s.player?.first_name} {s.player?.last_name}
                      </div>
                      {isUp && (
                        <div style={{ fontSize: 10, fontWeight: 800, color: ACCENT, letterSpacing: '0.1em', marginTop: 1 }}>
                          UP TO BAT
                        </div>
                      )}
                      {isNext && !isUp && (
                        <div style={{ fontSize: 10, color: 'rgba(232,160,32,0.55)', letterSpacing: '0.07em', marginTop: 1 }}>
                          on deck
                        </div>
                      )}
                    </div>

                    {/* Position badge */}
                    <div style={{ flexShrink: 0 }}>
                      {isBench ? (
                        <span style={{
                          fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 6,
                          background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.18)',
                          letterSpacing: '0.05em',
                        }}>
                          {pos === 'Bench' ? 'BENCH' : '—'}
                        </span>
                      ) : (
                        <span style={{
                          fontSize: 18, fontWeight: 800, padding: '6px 12px', borderRadius: 8,
                          background: pc ? pc.bg : 'rgba(255,255,255,0.1)',
                          color: pc ? pc.color : FG,
                          minWidth: 52, display: 'inline-block', textAlign: 'center',
                          letterSpacing: '0.02em',
                        }}>
                          {pos}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
        )}

        {/* ── FIELD VIEW (field mode) ── */}
        {viewMode === 'field' && (
        <div style={{ flex: '1 1 400px', minWidth: 0, borderRight: `1px solid ${BORDER}`, overflowY: 'auto' }}>
          <FieldView
            slots={localSlots}
            inningCount={inningCount}
            teamPositions={teamPositions}
            readOnly={locked}
            onAssign={assignPosition}
            activeInning={inning}
          />
        </div>
        )}

        {/* ── SCOREBOARD + CONTROLS ── */}
        <div style={{ flex: '0 1 320px', minWidth: 260, padding: '14px 16px' }}>

          {/* Score section label */}
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)',
            marginBottom: 12,
          }}>
            Score by Inning
          </div>

          {/* Inning header row */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6, paddingRight: 4 }}>
            <div style={{ width: 72, flexShrink: 0 }} />
            {Array.from({ length: inningCount }, (_, i) => (
              <div
                key={i}
                style={{
                  flex: 1, textAlign: 'center', fontSize: 11,
                  fontWeight: i === inning ? 700 : 400,
                  color: i === inning ? ACCENT : 'rgba(255,255,255,0.28)',
                  minWidth: 28,
                }}
              >
                {i + 1}
              </div>
            ))}
            <div style={{
              width: 36, textAlign: 'center', flexShrink: 0,
              fontSize: 11, color: 'rgba(255,255,255,0.28)', marginLeft: 4,
            }}>R</div>
          </div>

          {/* Our team row */}
          <ScoreRow
            label={teamName}
            isUs
            values={us}
            total={usTotal}
            inningCount={inningCount}
            activeInning={inning}
            locked={locked}
            onChange={setUsInning}
          />

          {/* Opponent row */}
          <ScoreRow
            label={game.opponent}
            values={them}
            total={themTotal}
            inningCount={inningCount}
            activeInning={inning}
            locked={locked}
            onChange={setThemInning}
          />

          {locked && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginTop: 8, textAlign: 'center' }}>
              Tap 🔒 in the header to edit the score
            </div>
          )}

          {/* ── End-game button (owner only, not yet final) ── */}
          {isOwner && status !== 'final' && (
            <div style={{ marginTop: 32 }}>
              {!showEndConfirm ? (
                <button
                  onClick={() => setShowEndConfirm(true)}
                  style={{
                    width: '100%', padding: '14px 0', borderRadius: 10, fontSize: 15,
                    fontWeight: 700, border: '1px solid rgba(109,184,117,0.3)',
                    background: 'rgba(109,184,117,0.08)', color: '#6DB875', cursor: 'pointer',
                  }}
                >
                  End game
                </button>
              ) : (
                <div style={{
                  padding: 16, borderRadius: 10,
                  background: 'rgba(109,184,117,0.08)',
                  border: '1px solid rgba(109,184,117,0.3)',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: FG, marginBottom: 8 }}>
                    Mark this game as Final?
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>
                    Final score: {usTotal}–{themTotal}. You'll be returned to the lineup editor.
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setShowEndConfirm(false)}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 7, fontSize: 13,
                        border: `1px solid ${BORDER}`, background: 'transparent',
                        color: 'rgba(255,255,255,0.45)', cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={endGame}
                      disabled={savingStatus}
                      style={{
                        flex: 2, padding: '10px 0', borderRadius: 7, fontSize: 13,
                        fontWeight: 700, border: 'none',
                        background: '#6DB875', color: '#050D1A',
                        cursor: savingStatus ? 'not-allowed' : 'pointer',
                        opacity: savingStatus ? 0.7 : 1,
                      }}
                    >
                      {savingStatus ? 'Saving…' : 'Yes, end game'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {status === 'final' && (
            <div style={{
              marginTop: 32, padding: '14px 16px', borderRadius: 10,
              background: 'rgba(109,184,117,0.1)', border: '1px solid rgba(109,184,117,0.25)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#6DB875' }}>Game Final</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: FG, margin: '8px 0' }}>
                {usTotal} – {themTotal}
              </div>
              <a
                href={`/games/${game.id}/lineup/desktop`}
                style={{
                  display: 'inline-block', marginTop: 4, fontSize: 12,
                  color: 'rgba(255,255,255,0.4)', textDecoration: 'none',
                }}
              >
                Back to lineup →
              </a>
            </div>
          )}
        </div>
      </div>

      {/* ── UNLOCK MODAL ── */}
      {showUnlockModal && (
        <div
          onClick={() => setShowUnlockModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#0D1F3C', border: `1px solid rgba(255,255,255,0.12)`,
              borderRadius: 16, padding: '24px 20px', maxWidth: 320, width: '100%',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: FG, marginBottom: 8 }}>
              Unlock screen?
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 20, lineHeight: 1.5 }}>
              This will allow the score and lineup to be edited. Unlock only if you need to make changes.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowUnlockModal(false)}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 8, fontSize: 14,
                  border: `1px solid ${BORDER}`, background: 'transparent',
                  color: 'rgba(255,255,255,0.45)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setLocked(false); setShowUnlockModal(false) }}
                style={{
                  flex: 2, padding: '11px 0', borderRadius: 8, fontSize: 14,
                  fontWeight: 700, border: 'none',
                  background: '#E87060', color: '#fff', cursor: 'pointer',
                }}
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ── Score row sub-component ────────────────────────────────────────────────────

function ScoreRow({
  label, isUs, values, total, inningCount, activeInning, locked, onChange,
}: {
  label: string
  isUs?: boolean
  values: (number | null)[]
  total: number
  inningCount: number
  activeInning: number
  locked: boolean
  onChange: (i: number, val: string) => void
}) {
  const BG     = '#050D1A'
  const FG     = '#F0F4FF'
  const ACCENT = '#E8A020'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', marginBottom: 6,
      background: 'rgba(255,255,255,0.04)',
      border: '0.5px solid rgba(255,255,255,0.08)',
      borderRadius: 8, overflow: 'hidden',
    }}>
      {/* Team name */}
      <div style={{
        width: 72, flexShrink: 0, padding: '10px 8px 10px 12px',
        fontSize: 13, fontWeight: isUs ? 700 : 500,
        color: isUs ? FG : 'rgba(255,255,255,0.5)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        borderRight: '0.5px solid rgba(255,255,255,0.07)',
      }}>
        {label}
      </div>

      {/* Inning cells */}
      {Array.from({ length: inningCount }, (_, i) => {
        const isActive = i === activeInning
        const val = values[i]
        return (
          <div
            key={i}
            style={{
              flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center',
              minWidth: 28, padding: '6px 2px',
              background: isActive ? (isUs ? 'rgba(232,160,32,0.1)' : 'rgba(255,255,255,0.04)') : 'transparent',
              borderLeft: isActive ? '0.5px solid rgba(232,160,32,0.2)' : '0.5px solid rgba(255,255,255,0.04)',
              borderRight: isActive ? '0.5px solid rgba(232,160,32,0.2)' : '0.5px solid rgba(255,255,255,0.04)',
            }}
          >
            {locked ? (
              <span style={{
                fontSize: 16, fontWeight: val != null ? 700 : 400,
                color: val != null ? (isUs ? ACCENT : FG) : 'rgba(255,255,255,0.18)',
                minWidth: 24, textAlign: 'center', display: 'block',
              }}>
                {val != null ? val : '·'}
              </span>
            ) : (
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={val ?? ''}
                onChange={e => onChange(i, e.target.value)}
                style={{
                  width: 28, height: 32, textAlign: 'center',
                  background: 'transparent',
                  border: isActive
                    ? `1px solid rgba(232,160,32,${isUs ? '0.5' : '0.25'})`
                    : '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 5,
                  color: isUs ? ACCENT : FG,
                  fontSize: 16, fontWeight: 700, padding: 0,
                  outline: 'none',
                }}
              />
            )}
          </div>
        )
      })}

      {/* Total */}
      <div style={{
        width: 36, textAlign: 'center', flexShrink: 0,
        fontSize: 20, fontWeight: 800, padding: '0 4px',
        color: isUs ? ACCENT : 'rgba(255,255,255,0.55)',
        borderLeft: '1px solid rgba(255,255,255,0.1)',
      }}>
        {total}
      </div>
    </div>
  )
}
