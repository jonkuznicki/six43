// Playing-time demo for the homepage.
//
// Modeled on the real Playing Time screen (src/app/fairness/page.tsx) and
// deliberately kept in the CURRENT app colors (navy, plus the app's existing position and status
// colors) until the application itself is redesigned.
// All names and numbers are illustrative sample data, and are labeled as such.

import React from 'react'

const NAVY = '#0B1F3A'
const NAVY2 = '#132844'
const FG = '#EDF2F7'
const DIM = 'rgba(237,242,247,0.5)'
const LINE = 'rgba(237,242,247,0.08)'

// Same position colors as the Playing Time page.
const SEG = [
  { key: 'P',  label: 'P',     color: '#4B9CD3' },
  { key: 'C',  label: 'C',     color: '#E090B0' },
  { key: 'IF', label: 'IF',    color: '#80B0E8' },
  { key: 'OF', label: 'OF',    color: '#6DB875' },
  { key: 'B',  label: 'Bench', color: 'rgba(150,150,160,0.45)' },
] as const

type Row = { name: string; P: number; C: number; IF: number; OF: number; B: number }

// 8 games × 6 innings = 48 innings per player.
const ROWS: Row[] = [
  { name: 'Jake M.',   P: 14, C: 0,  IF: 18, OF: 8,  B: 8 },
  { name: 'Connor B.', P: 0,  C: 30, IF: 6,  OF: 4,  B: 8 },
  { name: 'Tyler S.',  P: 4,  C: 0,  IF: 32, OF: 4,  B: 8 },
  { name: 'Marcus L.', P: 0,  C: 0,  IF: 30, OF: 10, B: 8 },
  { name: 'Ryan P.',   P: 0,  C: 0,  IF: 8,  OF: 32, B: 8 },
  { name: 'Drew K.',   P: 0,  C: 6,  IF: 10, OF: 24, B: 8 },
  { name: 'Sam T.',    P: 6,  C: 0,  IF: 26, OF: 8,  B: 8 },
  { name: 'Josh M.',   P: 0,  C: 0,  IF: 12, OF: 26, B: 10 },
]

const total = (r: Row) => r.P + r.C + r.IF + r.OF + r.B
const pct = (n: number) => `${Math.round(n * 100)}%`
// Same thresholds as the Playing Time page's "Avg bench" tile.
const benchColor = (b: number) => (b > 0.4 ? '#E87060' : b > 0.25 ? '#E8A020' : '#6DB875')

export function PlayingTimeDemo() {
  const avgBench = ROWS.reduce((s, r) => s + r.B / total(r), 0) / ROWS.length
  return (
    <div style={{ background: NAVY, color: FG, borderRadius: 10, overflow: 'hidden', fontFamily: 'sans-serif', boxShadow: '0 0 0 1px rgba(255,255,255,0.07), 0 30px 60px -20px rgba(0,0,0,0.6)' }}>
      <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${LINE}` }}>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Playing Time</div>
        <div style={{ fontSize: 11, color: DIM }}>Spring season · sample data</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '12px 16px' }}>
        {[
          { label: 'Games', value: '8' },
          { label: 'Players', value: String(ROWS.length) },
          { label: 'Avg bench', value: pct(avgBench), color: benchColor(avgBench) },
        ].map(t => (
          <div key={t.label} style={{ background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${LINE}`, borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 10, color: DIM }}>{t.label}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: t.color ?? FG }}>{t.value}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: '4px 16px 8px' }}>
        {ROWS.map(r => {
          const t = total(r)
          const bench = r.B / t
          return (
            <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '74px 1fr 38px', alignItems: 'center', gap: 10, padding: '6px 0', borderTop: `0.5px solid ${LINE}` }}>
              <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>{r.name}</span>
              <div style={{ display: 'flex', height: 10, borderRadius: 3, overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
                {SEG.map(s => {
                  const v = r[s.key]
                  return v > 0 ? <div key={s.key} title={`${s.label}: ${v} inn`} style={{ width: `${(v / t) * 100}%`, background: s.color }} /> : null
                })}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, textAlign: 'right', color: benchColor(bench) }}>{pct(bench)}</span>
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', padding: '8px 16px 14px', borderTop: `0.5px solid ${LINE}` }}>
        {SEG.map(s => (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, color: DIM }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: s.color }} />{s.label}
          </span>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: 10, color: DIM }}>Bench %</span>
      </div>
    </div>
  )
}
