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

// ── Position colors — matches the lineup editor exactly ───────────────────────

const POS_COLOR: Record<string, { bg: string; color: string }> = {
  P:    { bg: 'rgba(75,156,211,0.22)',  color: '#4B9CD3' },
  C:    { bg: 'rgba(192,80,120,0.22)', color: '#E090B0' },
  '1B': { bg: 'rgba(128,176,232,0.1)', color: '#80B0E8' },
  '2B': { bg: 'rgba(128,176,232,0.1)', color: '#80B0E8' },
  SS:   { bg: 'rgba(128,176,232,0.1)', color: '#80B0E8' },
  '3B': { bg: 'rgba(128,176,232,0.1)', color: '#80B0E8' },
  LF:   { bg: 'rgba(109,184,117,0.1)', color: '#6DB875' },
  CF:   { bg: 'rgba(109,184,117,0.1)', color: '#6DB875' },
  LC:   { bg: 'rgba(109,184,117,0.1)', color: '#6DB875' },
  RC:   { bg: 'rgba(109,184,117,0.1)', color: '#6DB875' },
  RF:   { bg: 'rgba(109,184,117,0.1)', color: '#6DB875' },
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
  const supabase = createClient()
  const router   = useRouter()

  // ── Inning & batting order ─────────────────────────────────────────────────
  const [inning,           setInning]           = useState(0)
  const [highlightedOrder, setHighlightedOrder] = useState<number | null>(null)

  // ── Lock mode ─────────────────────────────────────────────────────────────
  const [locked,          setLocked]          = useState(false)
  const [showUnlockModal, setShowUnlockModal] = useState(false)

  // ── Fullscreen ────────────────────────────────────────────────────────────
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false)
  const [isCssFullscreen,    setIsCssFullscreen]    = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Status / game-end ─────────────────────────────────────────────────────
  const [status,         setStatus]         = useState<string>(game.status ?? 'in_progress')
  const [savingStatus,   setSavingStatus]   = useState(false)
  const [showEndConfirm, setShowEndConfirm] = useState(false)

  // ── View mode ─────────────────────────────────────────────────────────────
  const [viewMode,    setViewMode]    = useState<'list' | 'field'>('field')
  const [localSlots,  setLocalSlots]  = useState<any[]>(slots)

  // ── Game Mode (high-visibility dugout display) ────────────────────────────
  const [gameMode, setGameMode] = useState(false)

  function enterGameMode() {
    setGameMode(true)
    setLocked(true)
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => setIsCssFullscreen(true))
    } else {
      setIsCssFullscreen(true)
    }
  }

  function exitGameMode() {
    setGameMode(false)
    if (isNativeFullscreen) document.exitFullscreen().catch(() => {})
    setIsCssFullscreen(false)
  }

  // ── Hide games-left-nav while in-game view is mounted ────────────────────
  useEffect(() => {
    document.body.classList.add('ingame-mode')
    return () => document.body.classList.remove('ingame-mode')
  }, [])

  // ── Native fullscreen listener ────────────────────────────────────────────
  useEffect(() => {
    const onChange = () => setIsNativeFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const isFullscreen = isNativeFullscreen || isCssFullscreen

  function toggleFullscreen() {
    if (isNativeFullscreen) { document.exitFullscreen().catch(() => {}); return }
    if (isCssFullscreen)    { setIsCssFullscreen(false); return }
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => setIsCssFullscreen(true))
    } else {
      setIsCssFullscreen(true)
    }
  }

  function exitFullscreen() {
    if (isNativeFullscreen) document.exitFullscreen().catch(() => {})
    setIsCssFullscreen(false)
  }

  // ── Position assignment ───────────────────────────────────────────────────
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
  const notesRawRef = useRef<string | null>(game.notes ?? null)
  const [us,   setUs]   = useState<(number | null)[]>(() => readBoxScores(game.notes, inningCount)[0])
  const [them, setThem] = useState<(number | null)[]>(() => readBoxScores(game.notes, inningCount)[1])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function scheduleSave(nextUs: (number | null)[], nextThem: (number | null)[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const newNotes = writeBoxScores(notesRawRef.current, nextUs, nextThem)
      notesRawRef.current = newNotes
      await supabase.from('games').update({ notes: newNotes }).eq('id', game.id)
    }, 800)
  }

  function setUsInning(i: number, val: string) {
    const n = val === '' ? null : Math.max(0, Math.min(99, parseInt(val) || 0))
    const next = [...us]; next[i] = n; setUs(next); scheduleSave(next, them)
  }

  function setThemInning(i: number, val: string) {
    const n = val === '' ? null : Math.max(0, Math.min(99, parseInt(val) || 0))
    const next = [...them]; next[i] = n; setThem(next); scheduleSave(us, next)
  }

  const usTotal   = us.reduce<number>((a, v)   => a + (v ?? 0), 0)
  const themTotal = them.reduce<number>((a, v) => a + (v ?? 0), 0)

  // ── Game end ──────────────────────────────────────────────────────────────
  async function endGame() {
    setSavingStatus(true)
    setStatus('final')
    await supabase.from('games').update({ status: 'final' }).eq('id', game.id)
    setSavingStatus(false)
    setShowEndConfirm(false)
    router.push(`/games/${game.id}/lineup/desktop`)
  }

  // ── Batting order ─────────────────────────────────────────────────────────
  const sortedSlots  = [...slots].sort((a, b) => (a.batting_order ?? 99) - (b.batting_order ?? 99))
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
    setHighlightedOrder(highlightedOrder === s.batting_order ? nextOrder(s.batting_order) : s.batting_order)
  }

  // ── Inning fill statuses (for score dots) ────────────────────────────────
  const inningStatuses = Array.from({ length: inningCount }, (_, ii) => {
    const filled = slots.filter(s => !!(s.inning_positions ?? [])[ii]).length
    return { filled, total: slots.length }
  })

  // ── GAME MODE RENDER (early return) ──────────────────────────────────────
  if (gameMode) {
    // High-contrast constants — max readability at arm's length
    const GM_BG      = '#060E1C'
    const GM_BG2     = '#0B1628'
    const GM_FG      = '#EEF4FF'
    const GM_FG_DIM  = 'rgba(238,244,255,0.45)'
    const GM_BORDER  = 'rgba(238,244,255,0.1)'
    const GM_AMBER   = '#F5A623'

    const GM_POS: Record<string, { bg: string; color: string }> = {
      P:    { bg: 'rgba(75,156,211,0.25)',  color: '#6BB8FF' },
      C:    { bg: 'rgba(220,100,150,0.25)', color: '#F0A0C8' },
      '1B': { bg: 'rgba(128,176,232,0.18)', color: '#9EC8FF' },
      '2B': { bg: 'rgba(128,176,232,0.18)', color: '#9EC8FF' },
      SS:   { bg: 'rgba(128,176,232,0.18)', color: '#9EC8FF' },
      '3B': { bg: 'rgba(128,176,232,0.18)', color: '#9EC8FF' },
      LF:   { bg: 'rgba(109,184,117,0.22)', color: '#80D890' },
      CF:   { bg: 'rgba(109,184,117,0.22)', color: '#80D890' },
      LC:   { bg: 'rgba(109,184,117,0.22)', color: '#80D890' },
      RC:   { bg: 'rgba(109,184,117,0.22)', color: '#80D890' },
      RF:   { bg: 'rgba(109,184,117,0.22)', color: '#80D890' },
    }

    const gmContainer: React.CSSProperties = isCssFullscreen
      ? { position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', flexDirection: 'column',
          background: GM_BG, color: GM_FG, overflowY: 'auto' }
      : { minHeight: '100vh', display: 'flex', flexDirection: 'column',
          background: GM_BG, color: GM_FG }

    return (
      <div ref={containerRef} style={gmContainer}>

        {/* ── GM HEADER ── */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '0 16px', height: 56, flexShrink: 0,
          background: GM_BG2,
          borderBottom: `1px solid ${GM_BORDER}`,
          position: 'sticky', top: 0, zIndex: 100,
        }}>
          {/* Exit */}
          <button
            onClick={exitGameMode}
            style={{
              padding: '7px 14px', borderRadius: 7, fontSize: 13, fontWeight: 700,
              border: `1px solid ${GM_BORDER}`,
              background: 'rgba(238,244,255,0.06)',
              color: GM_FG_DIM, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap',
            }}
          >
            ✕ Exit Game Mode
          </button>

          <div style={{ width: 1, height: 22, background: GM_BORDER, flexShrink: 0 }} />

          {/* Inning selector — inline ‹ N › */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <button
              onClick={() => setInning(i => Math.max(0, i - 1))}
              disabled={inning === 0}
              style={{
                width: 32, height: 32, borderRadius: 6, border: `1px solid ${GM_BORDER}`,
                background: 'transparent', color: inning > 0 ? GM_FG : GM_FG_DIM,
                fontSize: 16, cursor: inning > 0 ? 'pointer' : 'default',
              }}
            >‹</button>
            <div style={{ textAlign: 'center', minWidth: 72 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: GM_FG_DIM }}>Inning</div>
              <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: GM_FG }}>{inning + 1}</div>
            </div>
            <button
              onClick={() => setInning(i => Math.min(inningCount - 1, i + 1))}
              disabled={inning === inningCount - 1}
              style={{
                width: 32, height: 32, borderRadius: 6, border: `1px solid ${GM_BORDER}`,
                background: 'transparent',
                color: inning < inningCount - 1 ? GM_FG : GM_FG_DIM,
                fontSize: 16, cursor: inning < inningCount - 1 ? 'pointer' : 'default',
              }}
            >›</button>
          </div>

          <div style={{ width: 1, height: 22, background: GM_BORDER, flexShrink: 0 }} />

          {/* Score */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
            padding: '4px 14px', borderRadius: 8,
            background: 'rgba(238,244,255,0.05)',
            border: `1px solid ${GM_BORDER}`,
          }}>
            <span style={{
              fontSize: 24, fontWeight: 800, lineHeight: 1,
              color: usTotal > themTotal ? '#6DD880' : usTotal < themTotal ? '#FF7060' : GM_FG,
            }}>{usTotal}</span>
            <span style={{ fontSize: 14, color: GM_FG_DIM, fontWeight: 300 }}>–</span>
            <span style={{
              fontSize: 24, fontWeight: 800, lineHeight: 1,
              color: usTotal < themTotal ? '#6DD880' : usTotal > themTotal ? '#FF7060' : GM_FG,
            }}>{themTotal}</span>
          </div>

          <div style={{ flex: 1 }} />

          {/* View toggle */}
          <div style={{
            display: 'flex', flexShrink: 0,
            border: `1px solid ${GM_BORDER}`, borderRadius: 7, overflow: 'hidden',
          }}>
            {(['field', 'list'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  padding: '6px 14px', border: 'none', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer',
                  background: viewMode === mode ? 'rgba(75,156,211,0.25)' : 'transparent',
                  color: viewMode === mode ? '#6BB8FF' : GM_FG_DIM,
                }}
              >
                {mode === 'field' ? '◈ Field' : '≡ List'}
              </button>
            ))}
          </div>

          {/* Unlock — subtle, always accessible */}
          <button
            onClick={() => locked ? setShowUnlockModal(true) : setLocked(true)}
            style={{
              flexShrink: 0, padding: '6px 11px', borderRadius: 6, fontSize: 13,
              border: locked ? `1px solid rgba(245,166,35,0.4)` : `1px solid ${GM_BORDER}`,
              background: locked ? 'rgba(245,166,35,0.1)' : 'transparent',
              color: locked ? GM_AMBER : GM_FG_DIM,
              cursor: 'pointer',
            }}
          >
            {locked ? '🔒' : '🔓'}
          </button>
        </div>

        {/* ── GM UP-TO-BAT BANNER ── */}
        {upSlot && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
            padding: '10px 20px', flexShrink: 0,
            background: 'rgba(245,166,35,0.12)',
            borderBottom: `1px solid rgba(245,166,35,0.25)`,
          }}>
            <span style={{ fontSize: 12, fontWeight: 900, color: GM_AMBER, letterSpacing: '0.12em' }}>UP</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: GM_FG }}>
              #{highlightedOrder} {upSlot.player?.first_name} {upSlot.player?.last_name}
            </span>
            {onDeckSlot && (
              <span style={{ fontSize: 14, color: GM_FG_DIM }}>
                on deck: #{onDeckOrder} {onDeckSlot.player?.last_name}
              </span>
            )}
            <div style={{ flex: 1 }} />
            <button
              onClick={() => highlightedOrder != null && setHighlightedOrder(nextOrder(highlightedOrder))}
              style={{
                padding: '7px 18px', borderRadius: 7, fontSize: 14, fontWeight: 800,
                background: 'rgba(245,166,35,0.2)', border: `1px solid rgba(245,166,35,0.45)`,
                color: GM_AMBER, cursor: 'pointer',
              }}
            >
              Next →
            </button>
            <button
              onClick={() => setHighlightedOrder(null)}
              style={{
                padding: '7px 11px', borderRadius: 7, fontSize: 18,
                background: 'transparent', border: `1px solid ${GM_BORDER}`,
                color: GM_FG_DIM, cursor: 'pointer', lineHeight: 1,
              }}
            >×</button>
          </div>
        )}

        {/* ── GM MAIN CONTENT ── */}
        <div style={{ flex: 1, overflow: 'auto' }}>

          {/* BATTING LIST */}
          {viewMode === 'list' && (
            <div style={{ padding: '8px 0 40px' }}>
              {sortedSlots.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 0', fontSize: 18, color: GM_FG_DIM }}>
                  No lineup built yet.
                </div>
              ) : (
                sortedSlots.map(s => {
                  const pos     = (s.inning_positions ?? [])[inning] as string | null
                  const isBench = pos === 'Bench' || pos === null
                  const pc      = pos && !isBench ? (GM_POS[pos] ?? null) : null
                  const isUp    = highlightedOrder != null && s.batting_order === highlightedOrder
                  const isNext  = onDeckOrder != null && s.batting_order === onDeckOrder && !isUp

                  return (
                    <div
                      key={s.id}
                      onClick={() => tapPlayer(s)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 16,
                        padding: '14px 20px',
                        borderBottom: `1px solid ${GM_BORDER}`,
                        cursor: 'pointer',
                        background: isUp
                          ? 'rgba(245,166,35,0.13)'
                          : isNext
                          ? 'rgba(245,166,35,0.05)'
                          : 'transparent',
                        borderLeft: isUp
                          ? `4px solid ${GM_AMBER}`
                          : isNext
                          ? `4px solid rgba(245,166,35,0.3)`
                          : '4px solid transparent',
                        opacity: isBench && !isUp ? 0.5 : 1,
                      }}
                    >
                      {/* Batting # */}
                      <div style={{
                        width: 36, textAlign: 'center', flexShrink: 0,
                        fontSize: 18, fontWeight: 800,
                        color: isUp ? GM_AMBER : GM_FG_DIM,
                      }}>
                        {s.batting_order ?? '·'}
                      </div>

                      {/* Jersey */}
                      <div style={{
                        width: 42, flexShrink: 0, textAlign: 'center',
                        fontSize: 13, fontWeight: 600, color: GM_FG_DIM,
                      }}>
                        #{s.player?.jersey_number ?? '—'}
                      </div>

                      {/* Name */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 28, fontWeight: 800, lineHeight: 1.1,
                          color: GM_FG,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {s.player?.first_name} {s.player?.last_name}
                        </div>
                        {isUp && (
                          <div style={{ fontSize: 11, fontWeight: 900, color: GM_AMBER, letterSpacing: '0.12em', marginTop: 2 }}>
                            UP TO BAT — TAP NEXT WHEN DONE
                          </div>
                        )}
                        {isNext && !isUp && (
                          <div style={{ fontSize: 11, color: `rgba(245,166,35,0.6)`, letterSpacing: '0.07em', marginTop: 2 }}>
                            on deck
                          </div>
                        )}
                      </div>

                      {/* Position */}
                      <div style={{ flexShrink: 0 }}>
                        {isBench ? (
                          <span style={{
                            fontSize: 14, fontWeight: 700, padding: '6px 12px', borderRadius: 7,
                            background: 'rgba(238,244,255,0.06)',
                            color: 'rgba(238,244,255,0.3)',
                          }}>
                            {pos === 'Bench' ? 'BENCH' : '—'}
                          </span>
                        ) : (
                          <span style={{
                            fontSize: 22, fontWeight: 900, padding: '7px 16px', borderRadius: 8,
                            background: pc ? pc.bg : 'rgba(238,244,255,0.08)',
                            color: pc ? pc.color : GM_FG,
                            minWidth: 60, display: 'inline-block', textAlign: 'center',
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
          )}

          {/* FIELD VIEW */}
          {viewMode === 'field' && (
            <FieldView
              slots={localSlots}
              inningCount={inningCount}
              teamPositions={teamPositions}
              readOnly={locked}
              onAssign={assignPosition}
              activeInning={inning}
            />
          )}
        </div>

        {/* ── GM UNLOCK MODAL (reuse standard) ── */}
        {showUnlockModal && (
          <div
            onClick={() => setShowUnlockModal(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 1000,
              background: 'rgba(0,0,0,0.75)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: GM_BG2, border: `1px solid ${GM_BORDER}`,
                borderRadius: 16, padding: '28px 24px', maxWidth: 360, width: '100%',
              }}
            >
              <div style={{ fontSize: 18, fontWeight: 800, color: GM_FG, marginBottom: 8 }}>
                Unlock positions?
              </div>
              <div style={{ fontSize: 14, color: GM_FG_DIM, marginBottom: 24, lineHeight: 1.55 }}>
                This will allow field position changes. The score is always editable.
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => setShowUnlockModal(false)}
                  style={{
                    flex: 1, padding: '13px 0', borderRadius: 9, fontSize: 15,
                    border: `1px solid ${GM_BORDER}`, background: 'transparent',
                    color: GM_FG_DIM, cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => { setLocked(false); setShowUnlockModal(false) }}
                  style={{
                    flex: 2, padding: '13px 0', borderRadius: 9, fontSize: 15,
                    fontWeight: 800, border: 'none',
                    background: '#4B9CD3', color: '#060E1C', cursor: 'pointer',
                  }}
                >
                  Unlock Positions
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }
  // ── END GAME MODE ─────────────────────────────────────────────────────────

  // ── Container: CSS fullscreen fallback for iPad Safari ───────────────────
  const containerStyle: React.CSSProperties = isCssFullscreen
    ? { position: 'fixed', inset: 0, zIndex: 9999, overflowY: 'auto',
        background: 'var(--bg)', color: 'var(--fg)', display: 'flex', flexDirection: 'column' }
    : { minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
        display: 'flex', flexDirection: 'column' }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div ref={containerRef} style={containerStyle}>

      {/* ── HEADER ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 16px', height: 52,
        borderBottom: '0.5px solid var(--border)',
        background: 'var(--bg2)',
        flexShrink: 0, flexWrap: 'nowrap', overflowX: 'auto',
        position: 'sticky', top: 0, zIndex: 100,
      }}>

        {/* Back */}
        <a
          href={`/games/${game.id}/lineup/desktop`}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 13, fontWeight: 600,
            color: 'rgba(var(--fg-rgb),0.5)',
            textDecoration: 'none', flexShrink: 0,
            padding: '5px 10px', borderRadius: 6,
            border: '0.5px solid var(--border-md)',
            background: 'var(--bg-card)',
            whiteSpace: 'nowrap',
          }}
        >
          ← Lineup
        </a>

        <div style={{ width: '0.5px', height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {/* Opponent + Live badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
          <span style={{
            fontSize: 14, fontWeight: 700, color: 'var(--fg)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            vs {game.opponent}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
            letterSpacing: '0.07em', textTransform: 'uppercase', flexShrink: 0,
            background: status === 'in_progress'
              ? 'rgba(232,160,32,0.15)'
              : status === 'final'
              ? 'rgba(109,184,117,0.15)'
              : 'var(--bg-card)',
            color: status === 'in_progress'
              ? '#E8A020'
              : status === 'final'
              ? '#6DB875'
              : 'rgba(var(--fg-rgb),0.4)',
            border: status === 'in_progress'
              ? '0.5px solid rgba(232,160,32,0.35)'
              : status === 'final'
              ? '0.5px solid rgba(109,184,117,0.35)'
              : '0.5px solid var(--border)',
          }}>
            {status === 'in_progress' ? '● Live' : status === 'final' ? 'Final' : status}
          </span>
        </div>

        {/* Score */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          flexShrink: 0,
          padding: '4px 10px', borderRadius: 6,
          background: 'var(--bg-card)',
          border: '0.5px solid var(--border)',
        }}>
          <span style={{
            fontSize: 17, fontWeight: 800, lineHeight: 1,
            color: usTotal > themTotal ? '#6DB875' : usTotal < themTotal ? '#E87060' : 'var(--fg)',
          }}>
            {usTotal}
          </span>
          <span style={{ fontSize: 12, color: 'rgba(var(--fg-rgb),0.25)', fontWeight: 400 }}>–</span>
          <span style={{
            fontSize: 17, fontWeight: 800, lineHeight: 1,
            color: usTotal < themTotal ? '#6DB875' : usTotal > themTotal ? '#E87060' : 'var(--fg)',
          }}>
            {themTotal}
          </span>
        </div>

        {/* View toggle */}
        <div style={{
          display: 'flex', flexShrink: 0,
          border: '0.5px solid var(--border-md)', borderRadius: 7, overflow: 'hidden',
        }}>
          {(['field', 'list'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                padding: '5px 12px', border: 'none', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', lineHeight: 1,
                background: viewMode === mode ? 'var(--accent)' : 'transparent',
                color: viewMode === mode ? 'var(--accent-text)' : 'rgba(var(--fg-rgb),0.45)',
              }}
            >
              {mode === 'field' ? '◈ Field' : '≡ List'}
            </button>
          ))}
        </div>

        {/* Lock */}
        <button
          onClick={() => locked ? setShowUnlockModal(true) : setLocked(true)}
          title={locked ? 'Screen locked — tap to unlock' : 'Lock screen'}
          style={{
            flexShrink: 0, padding: '5px 10px', borderRadius: 6, fontSize: 13,
            border: locked ? '0.5px solid rgba(232,160,32,0.45)' : '0.5px solid var(--border-md)',
            background: locked ? 'rgba(232,160,32,0.12)' : 'var(--bg-card)',
            color: locked ? '#E8A020' : 'rgba(var(--fg-rgb),0.45)',
            cursor: 'pointer', fontWeight: 600,
          }}
        >
          {locked ? '🔒' : '🔓'}
        </button>

        {/* Fullscreen */}
        <button
          onClick={isFullscreen ? exitFullscreen : toggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          style={{
            flexShrink: 0, padding: '5px 10px', borderRadius: 6, fontSize: 13,
            border: isFullscreen ? '0.5px solid var(--accent)' : '0.5px solid var(--border-md)',
            background: isFullscreen ? 'rgba(75,156,211,0.12)' : 'var(--bg-card)',
            color: isFullscreen ? 'var(--accent)' : 'rgba(var(--fg-rgb),0.45)',
            cursor: 'pointer',
          }}
        >
          {isFullscreen ? '⊡' : '⛶'}
        </button>

        {/* Game Mode */}
        <button
          onClick={enterGameMode}
          title="Enter Game Mode — large fonts, locked, fullscreen"
          style={{
            flexShrink: 0, padding: '5px 12px', borderRadius: 6, fontSize: 12,
            fontWeight: 700, whiteSpace: 'nowrap',
            border: '0.5px solid rgba(75,156,211,0.5)',
            background: 'rgba(75,156,211,0.1)',
            color: 'var(--accent)', cursor: 'pointer',
          }}
        >
          ◉ Game Mode
        </button>

        {/* End game */}
        {isOwner && status !== 'final' && (
          <button
            onClick={() => setShowEndConfirm(true)}
            style={{
              flexShrink: 0, padding: '5px 12px', borderRadius: 6, fontSize: 12,
              fontWeight: 700, whiteSpace: 'nowrap',
              border: '0.5px solid rgba(109,184,117,0.4)',
              background: 'rgba(109,184,117,0.1)',
              color: '#6DB875', cursor: 'pointer',
            }}
          >
            End Game
          </button>
        )}
      </div>

      {/* ── LOCK NOTICE (subtle — below header, not alarming) ───────────────── */}
      {locked && (
        <div style={{
          padding: '6px 16px',
          background: 'rgba(232,160,32,0.07)',
          borderBottom: '0.5px solid rgba(232,160,32,0.2)',
          display: 'flex', alignItems: 'center', gap: 8,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 11, color: '#E8A020', fontWeight: 600 }}>
            🔒 Positions locked — score is still editable · tap 🔒 to unlock
          </span>
        </div>
      )}

      {/* ── INNING SELECTOR ──────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5,
        padding: '10px 16px',
        borderBottom: '0.5px solid var(--border)',
        flexShrink: 0, overflowX: 'auto',
        background: 'var(--bg2)',
      }}>
        <span style={{
          fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
          letterSpacing: '0.09em', color: 'rgba(var(--fg-rgb),0.3)',
          alignSelf: 'center', marginRight: 4, flexShrink: 0,
        }}>
          Inning
        </span>
        {Array.from({ length: inningCount }, (_, i) => {
          const hasSomeScore = (us[i] != null || them[i] != null)
          return (
            <button
              key={i}
              onClick={() => setInning(i)}
              style={{
                position: 'relative',
                minWidth: 38, height: 38, borderRadius: 7,
                border: inning === i ? '1.5px solid var(--accent)' : '0.5px solid var(--border)',
                background: inning === i ? 'rgba(75,156,211,0.15)' : 'var(--bg-card)',
                color: inning === i ? 'var(--accent)' : 'rgba(var(--fg-rgb),0.55)',
                fontSize: 14, fontWeight: inning === i ? 700 : 400,
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              {i + 1}
              {hasSomeScore && (
                <span style={{
                  position: 'absolute', top: 3, right: 3,
                  width: 5, height: 5, borderRadius: '50%',
                  background: inning === i ? 'var(--accent)' : '#E8A020',
                }} />
              )}
            </button>
          )
        })}
      </div>

      {/* ── UP-TO-BAT BANNER ─────────────────────────────────────────────────── */}
      {upSlot && (
        <div style={{
          padding: '8px 16px', flexShrink: 0,
          background: 'rgba(232,160,32,0.08)',
          borderBottom: '0.5px solid rgba(232,160,32,0.2)',
          display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{
            fontSize: 10, fontWeight: 800, color: '#E8A020',
            letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>Up</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--fg)' }}>
            #{highlightedOrder} {upSlot.player?.first_name} {upSlot.player?.last_name}
          </span>
          {onDeckSlot && (
            <span style={{ fontSize: 12, color: 'rgba(var(--fg-rgb),0.4)' }}>
              on deck: #{onDeckOrder} {onDeckSlot.player?.last_name}
            </span>
          )}
          <div style={{ flex: 1 }} />
          <button
            onClick={() => highlightedOrder != null && setHighlightedOrder(nextOrder(highlightedOrder))}
            style={{
              padding: '5px 14px', borderRadius: 6, fontSize: 12, fontWeight: 700,
              background: 'rgba(232,160,32,0.15)',
              border: '0.5px solid rgba(232,160,32,0.4)',
              color: '#E8A020', cursor: 'pointer',
            }}
          >
            Next →
          </button>
          <button
            onClick={() => setHighlightedOrder(null)}
            style={{
              padding: '5px 10px', borderRadius: 6, fontSize: 16, lineHeight: 1,
              background: 'transparent', border: '0.5px solid var(--border)',
              color: 'rgba(var(--fg-rgb),0.3)', cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', flexWrap: 'wrap',
        alignItems: 'flex-start', minHeight: 0,
      }}>

        {/* ── BATTING ORDER (list mode) ── */}
        {viewMode === 'list' && (
          <div style={{
            flex: '1 1 340px', minWidth: 0,
            borderRight: '0.5px solid var(--border)',
            overflowY: 'auto', height: '100%',
          }}>
            <div style={{
              padding: '12px 16px 6px',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'rgba(var(--fg-rgb),0.3)',
            }}>
              Batting Order · Inning {inning + 1}
            </div>

            <div style={{ padding: '4px 12px 32px' }}>
              {sortedSlots.length === 0 ? (
                <div style={{
                  textAlign: 'center', padding: '3rem 0',
                  color: 'rgba(var(--fg-rgb),0.2)', fontSize: 14,
                }}>
                  No lineup built yet.
                </div>
              ) : (
                sortedSlots.map(s => {
                  const pos     = (s.inning_positions ?? [])[inning] as string | null
                  const isBench = pos === 'Bench' || pos === null
                  const pc      = pos && !isBench ? (POS_COLOR[pos] ?? null) : null
                  const isUp    = highlightedOrder != null && s.batting_order === highlightedOrder
                  const isNext  = onDeckOrder != null && s.batting_order === onDeckOrder && !isUp

                  return (
                    <div
                      key={s.id}
                      onClick={() => tapPlayer(s)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '10px 8px', marginBottom: 3, borderRadius: 8,
                        cursor: 'pointer',
                        background: isUp
                          ? 'rgba(232,160,32,0.1)'
                          : isNext
                          ? 'rgba(232,160,32,0.05)'
                          : 'var(--bg-card)',
                        border: isUp
                          ? '0.5px solid rgba(232,160,32,0.4)'
                          : isNext
                          ? '0.5px solid rgba(232,160,32,0.2)'
                          : '0.5px solid var(--border-subtle)',
                        opacity: isBench ? 0.45 : 1,
                        transition: 'background 0.1s',
                      }}
                    >
                      {/* Batting number */}
                      <div style={{
                        width: 24, textAlign: 'center', flexShrink: 0,
                        fontSize: 12, fontWeight: 700,
                        color: isUp ? '#E8A020' : 'rgba(var(--fg-rgb),0.22)',
                      }}>
                        {s.batting_order ?? '·'}
                      </div>

                      {/* Jersey */}
                      <div style={{
                        width: 30, textAlign: 'center', flexShrink: 0,
                        fontSize: 12, fontWeight: 700,
                        color: isUp ? 'var(--fg)' : 'rgba(var(--fg-rgb),0.3)',
                      }}>
                        #{s.player?.jersey_number ?? '—'}
                      </div>

                      {/* Name */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 20, fontWeight: 700, lineHeight: 1.15,
                          color: isBench ? 'rgba(var(--fg-rgb),0.3)' : 'var(--fg)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}>
                          {s.player?.first_name} {s.player?.last_name}
                        </div>
                        {isUp && (
                          <div style={{ fontSize: 9, fontWeight: 800, color: '#E8A020', letterSpacing: '0.1em', marginTop: 1 }}>
                            UP TO BAT
                          </div>
                        )}
                        {isNext && !isUp && (
                          <div style={{ fontSize: 9, color: 'rgba(232,160,32,0.5)', letterSpacing: '0.07em', marginTop: 1 }}>
                            on deck
                          </div>
                        )}
                      </div>

                      {/* Position badge */}
                      <div style={{ flexShrink: 0 }}>
                        {isBench ? (
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 5,
                            background: 'var(--bg-card-alt)',
                            color: 'rgba(var(--fg-rgb),0.2)',
                            letterSpacing: '0.04em',
                          }}>
                            {pos === 'Bench' ? 'BENCH' : '—'}
                          </span>
                        ) : (
                          <span style={{
                            fontSize: 15, fontWeight: 800, padding: '5px 10px', borderRadius: 6,
                            background: pc ? pc.bg : 'var(--bg-card)',
                            color: pc ? pc.color : 'var(--fg)',
                            minWidth: 44, display: 'inline-block', textAlign: 'center',
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
          <div style={{
            flex: '1 1 400px', minWidth: 0,
            borderRight: '0.5px solid var(--border)',
            overflowY: 'auto', height: '100%',
          }}>
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
        <div style={{
          flex: '0 1 300px', minWidth: 260,
          padding: '16px 16px 32px',
          overflowY: 'auto',
        }}>

          {/* Section label */}
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'rgba(var(--fg-rgb),0.3)',
            marginBottom: 10,
          }}>
            Score by Inning
          </div>

          {/* Inning header row */}
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4, paddingRight: 2 }}>
            <div style={{ width: 68, flexShrink: 0 }} />
            {Array.from({ length: inningCount }, (_, i) => (
              <div key={i} style={{
                flex: 1, textAlign: 'center', fontSize: 10,
                fontWeight: i === inning ? 700 : 400,
                color: i === inning ? 'var(--accent)' : 'rgba(var(--fg-rgb),0.3)',
                minWidth: 24,
              }}>
                {i + 1}
              </div>
            ))}
            <div style={{
              width: 34, textAlign: 'center', flexShrink: 0,
              fontSize: 10, color: 'rgba(var(--fg-rgb),0.3)', marginLeft: 2,
            }}>R</div>
          </div>

          {/* Score rows */}
          <ScoreRow
            label={teamName}
            isUs
            values={us}
            total={usTotal}
            inningCount={inningCount}
            activeInning={inning}
            onChange={setUsInning}
          />
          <ScoreRow
            label={game.opponent}
            values={them}
            total={themTotal}
            inningCount={inningCount}
            activeInning={inning}
            onChange={setThemInning}
          />

          {locked && (
            <div style={{
              fontSize: 10, color: 'rgba(var(--fg-rgb),0.25)',
              marginTop: 6, textAlign: 'center',
            }}>
              Score is always editable
            </div>
          )}

          {/* ── End Game ── */}
          {isOwner && status !== 'final' && (
            <div style={{ marginTop: 28 }}>
              {!showEndConfirm ? (
                <button
                  onClick={() => setShowEndConfirm(true)}
                  style={{
                    width: '100%', padding: '12px 0', borderRadius: 8, fontSize: 14,
                    fontWeight: 700,
                    border: '0.5px solid rgba(109,184,117,0.35)',
                    background: 'rgba(109,184,117,0.08)',
                    color: '#6DB875', cursor: 'pointer',
                  }}
                >
                  End Game
                </button>
              ) : (
                <div style={{
                  padding: 16, borderRadius: 10,
                  background: 'var(--bg-card)',
                  border: '0.5px solid var(--border-md)',
                }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--fg)', marginBottom: 6 }}>
                    Mark this game as Final?
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(var(--fg-rgb),0.4)', marginBottom: 14, lineHeight: 1.5 }}>
                    Final score: {usTotal}–{themTotal}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => setShowEndConfirm(false)}
                      style={{
                        flex: 1, padding: '10px 0', borderRadius: 7, fontSize: 13,
                        border: '0.5px solid var(--border-md)',
                        background: 'transparent',
                        color: 'rgba(var(--fg-rgb),0.5)', cursor: 'pointer',
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
                        background: '#6DB875', color: '#0B1F3A',
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

          {/* ── Final card ── */}
          {status === 'final' && (
            <div style={{
              marginTop: 28, padding: '16px', borderRadius: 10,
              background: 'var(--bg-card)',
              border: '0.5px solid rgba(109,184,117,0.3)',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6DB875', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                Game Final
              </div>
              <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--fg)', margin: '8px 0 4px', letterSpacing: '-1px' }}>
                {usTotal} – {themTotal}
              </div>
              <a
                href={`/games/${game.id}/lineup/desktop`}
                style={{
                  fontSize: 12, color: 'var(--accent)', textDecoration: 'none', fontWeight: 600,
                }}
              >
                Back to Lineup →
              </a>
            </div>
          )}
        </div>
      </div>

      {/* ── UNLOCK MODAL ─────────────────────────────────────────────────────── */}
      {showUnlockModal && (
        <div
          onClick={() => setShowUnlockModal(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'var(--bg2)',
              border: '0.5px solid var(--border-md)',
              borderRadius: 14, padding: '24px 20px',
              maxWidth: 320, width: '100%',
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--fg)', marginBottom: 8 }}>
              Unlock positions?
            </div>
            <div style={{ fontSize: 13, color: 'rgba(var(--fg-rgb),0.45)', marginBottom: 20, lineHeight: 1.55 }}>
              This will allow field position changes. The score is always editable.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setShowUnlockModal(false)}
                style={{
                  flex: 1, padding: '11px 0', borderRadius: 8, fontSize: 14,
                  border: '0.5px solid var(--border-md)',
                  background: 'transparent',
                  color: 'rgba(var(--fg-rgb),0.5)', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => { setLocked(false); setShowUnlockModal(false) }}
                style={{
                  flex: 2, padding: '11px 0', borderRadius: 8, fontSize: 14,
                  fontWeight: 700, border: 'none',
                  background: 'var(--accent)', color: 'var(--accent-text)',
                  cursor: 'pointer',
                }}
              >
                Unlock Positions
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

// ── ScoreRow ──────────────────────────────────────────────────────────────────

function ScoreRow({
  label, isUs, values, total, inningCount, activeInning, onChange,
}: {
  label: string
  isUs?: boolean
  values: (number | null)[]
  total: number
  inningCount: number
  activeInning: number
  onChange: (i: number, val: string) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', marginBottom: 5,
      background: 'var(--bg-card)',
      border: '0.5px solid var(--border)',
      borderRadius: 8, overflow: 'hidden',
    }}>
      {/* Team label */}
      <div style={{
        width: 68, flexShrink: 0, padding: '10px 8px 10px 10px',
        fontSize: 12, fontWeight: isUs ? 700 : 500,
        color: isUs ? 'var(--fg)' : 'rgba(var(--fg-rgb),0.5)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        borderRight: '0.5px solid var(--border)',
      }}>
        {label}
      </div>

      {/* Per-inning cells */}
      {Array.from({ length: inningCount }, (_, i) => {
        const isActive = i === activeInning
        const val = values[i]
        return (
          <div key={i} style={{
            flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center',
            minWidth: 24, padding: '5px 1px',
            background: isActive
              ? isUs ? 'rgba(75,156,211,0.1)' : 'var(--bg-card-alt)'
              : 'transparent',
            borderLeft:  isActive ? '0.5px solid rgba(75,156,211,0.25)' : '0.5px solid var(--border-subtle)',
            borderRight: isActive ? '0.5px solid rgba(75,156,211,0.25)' : '0.5px solid var(--border-subtle)',
          }}>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={val ?? ''}
              onChange={e => onChange(i, e.target.value)}
              style={{
                width: 26, height: 30, textAlign: 'center',
                background: 'transparent',
                border: isActive
                  ? `0.5px solid ${isUs ? 'rgba(75,156,211,0.5)' : 'rgba(75,156,211,0.2)'}`
                  : '0.5px solid var(--border)',
                borderRadius: 4,
                color: isUs ? 'var(--accent)' : 'var(--fg)',
                fontSize: 14, fontWeight: 700, padding: 0,
                outline: 'none',
              }}
            />
          </div>
        )
      })}

      {/* Total */}
      <div style={{
        width: 34, textAlign: 'center', flexShrink: 0,
        fontSize: 18, fontWeight: 800, padding: '0 2px',
        color: isUs ? 'var(--accent)' : 'rgba(var(--fg-rgb),0.6)',
        borderLeft: '0.5px solid var(--border)',
        marginLeft: 2,
      }}>
        {total}
      </div>
    </div>
  )
}
