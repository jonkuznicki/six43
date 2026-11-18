// Phone-sized lineup demo for the homepage hero on small screens.
//
// Mirrors the REAL mobile lineup builder (src/app/games/[id]/lineup/page.tsx)
// at its real sizes, so it stays readable on a 390px screen instead of
// shrinking the desktop editor:
//   - the same dark-theme colors (globals.css: --bg #0B1F3A, --fg #EDF2F7,
//     --accent #4B9CD3) and the page's own POSITION_COLORS;
//   - header ("‹ All games", "vs <opponent>" at 20px, date at 12px, Done
//     button), the status and Home/Away row, the Paint/Pick toggle and the
//     position palette;
//   - grid columns COL_NUM 28 / COL_NAME 110 / COL_INN 42 / COL_STATUS 24,
//     13px player names and 36×32 inning cells with 10px labels.
// Like the real page, the grid is wider than a phone, so later innings sit
// off to the right (the real page scrolls; here a fade marks the edge).
// Players and positions are the same sample data as the desktop demos.

import React from 'react'

const BG = '#0B1F3A'
const FG = '#EDF2F7'
const fg = (a: number) => `rgba(237,242,247,${a})`
const ACCENT = '#4B9CD3'
const ACCENT_TEXT = '#0B1F3A'

// Copied from src/app/games/[id]/lineup/page.tsx (dark theme).
const POSITION_COLORS: Record<string, { bg: string; color: string }> = {
  P:     { bg: 'rgba(75,156,211,0.25)',  color: '#4B9CD3' },
  C:     { bg: 'rgba(192,80,120,0.25)',  color: '#E090B0' },
  '1B':  { bg: 'rgba(59,109,177,0.25)',  color: '#80B0E8' },
  '2B':  { bg: 'rgba(59,109,177,0.25)',  color: '#80B0E8' },
  SS:    { bg: 'rgba(59,109,177,0.25)',  color: '#80B0E8' },
  '3B':  { bg: 'rgba(59,109,177,0.25)',  color: '#80B0E8' },
  LF:    { bg: 'rgba(45,106,53,0.25)',   color: '#6DB875' },
  CF:    { bg: 'rgba(45,106,53,0.25)',   color: '#6DB875' },
  RF:    { bg: 'rgba(45,106,53,0.25)',   color: '#6DB875' },
  Bench: { bg: 'rgba(100,100,100,0.15)', color: fg(0.4) },
}

const COL_NUM = 28
const COL_NAME = 110
const COL_INN = 42
const COL_STATUS = 24
const INNINGS = 6

const ROWS = [
  { n: 12, name: 'J. Martinez', inn: ['P', 'P', '1B', 'CF', '1B', 'P'] },
  { n: 5,  name: 'C. Brown',    inn: ['C', 'C', 'C', 'C', 'C', 'C'] },
  { n: 8,  name: 'T. Smith',    inn: ['1B', 'SS', 'SS', '1B', '2B', 'SS'] },
  { n: 3,  name: 'M. Lee',      inn: ['SS', '2B', '2B', 'SS', '1B', '2B'] },
  { n: 17, name: 'R. Parker',   inn: ['LF', 'LF', 'CF', 'RF', 'LF', 'LF'] },
  { n: 21, name: 'D. King',     inn: ['CF', 'RF', 'LF', 'LF', 'RF', 'CF'] },
  { n: 9,  name: 'S. Torres',   inn: ['2B', '3B', '3B', '2B', '3B', '3B'] },
]

const PALETTE = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'Bench']
const ACTIVE = 'SS'

function Cell({ pos }: { pos: string }) {
  const c = POSITION_COLORS[pos] ?? POSITION_COLORS.Bench
  const active = pos === ACTIVE
  return (
    <div style={{ width: COL_INN, flexShrink: 0, display: 'flex', justifyContent: 'center', padding: '3px 0' }}>
      <span style={{
        width: 36, height: 32, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: active ? `1.5px solid ${c.color}` : `0.5px solid ${c.color}55`,
        background: c.bg, color: c.color, fontSize: 10, fontWeight: 700,
      }}>
        {pos === 'Bench' ? 'B' : pos}
      </span>
    </div>
  )
}

export function MobileLineupDemo() {
  const rowWidth = COL_NUM + COL_NAME + COL_INN * INNINGS + COL_STATUS
  return (
    <div style={{ background: BG, color: FG, fontFamily: 'sans-serif', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 0' }}>
        <div style={{ fontSize: 13, color: fg(0.45), marginBottom: 10 }}>‹ All games</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>vs Cardinals</div>
            <div style={{ fontSize: 12, color: fg(0.45), marginTop: 2 }}>Sat, Apr 12</div>
          </div>
          <span style={{ padding: '8px 16px', borderRadius: 6, background: ACCENT, color: ACCENT_TEXT, fontSize: 13, fontWeight: 700 }}>Done</span>
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <span style={{ padding: '5px 8px', borderRadius: 5, fontSize: 12, fontWeight: 700, border: `0.5px solid ${fg(0.15)}`, background: 'rgba(255,255,255,0.06)' }}>Lineup Ready ▾</span>
          <span style={{ padding: '5px 10px', borderRadius: 5, fontSize: 12, fontWeight: 700, border: '0.5px solid rgba(109,184,117,0.4)', background: 'rgba(109,184,117,0.12)', color: '#6DB875' }}>Home</span>
        </div>
        <div style={{ display: 'inline-flex', border: `0.5px solid ${fg(0.2)}`, borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
          <span style={{ fontSize: 11, padding: '5px 11px', background: 'rgba(59,109,177,0.2)', color: '#80B0E8', fontWeight: 700 }}>🖌 Paint</span>
          <span style={{ fontSize: 11, padding: '5px 11px', color: fg(0.5), fontWeight: 500 }}>☝ Pick</span>
        </div>
      </div>

      {/* Position palette (paint mode) */}
      <div style={{ display: 'flex', gap: 6, padding: '8px 16px 10px', borderBottom: `0.5px solid ${fg(0.08)}`, overflow: 'hidden' }}>
        {PALETTE.map(pos => {
          const c = POSITION_COLORS[pos]
          const active = pos === ACTIVE
          return (
            <span key={pos} style={{
              flexShrink: 0, padding: '8px 11px', borderRadius: 6, fontSize: 11, fontWeight: active ? 700 : 600,
              background: active ? c.bg : c.bg.replace('0.25', '0.12'),
              border: active ? `1.5px solid ${c.color}` : `0.5px solid ${c.color}88`,
              color: c.color,
            }}>{pos}</span>
          )
        })}
      </div>

      {/* Grid */}
      <div style={{ padding: '8px 16px 0', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4, minWidth: rowWidth }}>
          <div style={{ width: COL_NUM, flexShrink: 0 }} />
          <div style={{ width: COL_NAME, flexShrink: 0, fontSize: 10, color: fg(0.35), paddingLeft: 4 }}>Player</div>
          {Array.from({ length: INNINGS }, (_, i) => (
            <div key={i} style={{ width: COL_INN, flexShrink: 0, textAlign: 'center', fontSize: 10, color: fg(0.35) }}>{i + 1}</div>
          ))}
          <div style={{ width: COL_STATUS, flexShrink: 0 }} />
        </div>
        {ROWS.map((r, idx) => (
          <div key={r.n} style={{
            display: 'flex', alignItems: 'center', minWidth: rowWidth, borderRadius: 4, marginBottom: 2,
            background: idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
          }}>
            <div style={{ width: COL_NUM, flexShrink: 0, fontSize: 11, color: fg(0.3), paddingLeft: 4 }}>{r.n}</div>
            <div style={{ width: COL_NAME, flexShrink: 0, paddingLeft: 4, fontSize: 13, whiteSpace: 'nowrap' }}>{r.name}</div>
            {r.inn.map((p, i) => <Cell key={i} pos={p} />)}
            <div style={{ width: COL_STATUS, flexShrink: 0, textAlign: 'center', fontSize: 13, color: '#6DB875' }}>✓</div>
          </div>
        ))}
      </div>
    </div>
  )
}
