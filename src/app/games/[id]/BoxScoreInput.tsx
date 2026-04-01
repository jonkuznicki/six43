'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../../lib/supabase'

// Scores stored in game.notes as JSON: {"_box":{"us":[...],"them":[...]}}
// We only read/write the _box key; other note content is preserved.

function readScores(notes: string | null, count: number): [number[], number[]] {
  const empty = () => Array(count).fill(null)
  try {
    const parsed = JSON.parse(notes ?? '{}')
    const us   = parsed._box?.us   ?? empty()
    const them = parsed._box?.them ?? empty()
    return [us, them]
  } catch { return [empty(), empty()] }
}

function writeScores(notes: string | null, us: (number|null)[], them: (number|null)[]): string {
  try {
    const parsed = JSON.parse(notes ?? '{}')
    parsed._box = { us, them }
    return JSON.stringify(parsed)
  } catch { return JSON.stringify({ _box: { us, them } }) }
}

export default function BoxScoreInput({
  gameId, notes, inningCount, teamName, opponent,
}: {
  gameId: string
  notes: string | null
  inningCount: number
  teamName: string
  opponent: string
}) {
  const supabase = createClient()
  const innings = Array.from({ length: inningCount }, (_, i) => i)

  const [us, setUs]     = useState<(number|null)[]>(() => readScores(notes, inningCount)[0])
  const [them, setThem] = useState<(number|null)[]>(() => readScores(notes, inningCount)[1])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Re-init if inningCount changes
  useEffect(() => {
    const [initUs, initThem] = readScores(notes, inningCount)
    setUs(initUs)
    setThem(initThem)
  }, [inningCount])

  function scheduleSave(newUs: (number|null)[], newThem: (number|null)[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      const newNotes = writeScores(notes, newUs, newThem)
      await supabase.from('games').update({ notes: newNotes }).eq('id', gameId)
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

  const usTotal   = us.reduce<number>((a, v) => a + (v ?? 0), 0)
  const themTotal = them.reduce<number>((a, v) => a + (v ?? 0), 0)

  const cellW = 36
  const nameW = 100

  return (
    <div style={{ marginTop: '1.25rem' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
        textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '8px' }}>
        Score
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '4px', paddingRight: '48px' }}>
        <div style={{ width: nameW, flexShrink: 0 }} />
        {innings.map(i => (
          <div key={i} style={{ width: cellW, flexShrink: 0, textAlign: 'center',
            fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)` }}>{i + 1}</div>
        ))}
        <div style={{ width: 42, flexShrink: 0, textAlign: 'center',
          fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)`, marginLeft: '4px' }}>R</div>
      </div>

      {/* Our team */}
      <ScoreRow
        label={teamName} us innings={innings} values={us} total={usTotal}
        nameW={nameW} cellW={cellW}
        onChange={setUsInning}
      />

      {/* Opponent */}
      <ScoreRow
        label={opponent} innings={innings} values={them} total={themTotal}
        nameW={nameW} cellW={cellW}
        onChange={setThemInning}
      />
    </div>
  )
}

function ScoreRow({ label, us, innings, values, total, nameW, cellW, onChange }: {
  label: string; us?: boolean
  innings: number[]; values: (number|null)[]
  total: number; nameW: number; cellW: number
  onChange: (i: number, val: string) => void
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', marginBottom: '4px',
      background: 'var(--bg-card)',
      border: '0.5px solid var(--border-subtle)',
      borderRadius: '6px', padding: '4px 0',
    }}>
      <div style={{
        width: nameW, flexShrink: 0, paddingLeft: '10px',
        fontSize: '12px', fontWeight: 600,
        color: us ? 'var(--fg)' : `rgba(var(--fg-rgb), 0.6)`,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{label}</div>

      {innings.map(i => (
        <div key={i} style={{ width: cellW, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
          <input
            type="text" inputMode="numeric" pattern="[0-9]*"
            value={values[i] ?? ''}
            onChange={e => onChange(i, e.target.value)}
            style={{
              width: '28px', height: '28px', textAlign: 'center',
              background: 'var(--bg-input)',
              border: '0.5px solid var(--border-md)',
              borderRadius: '4px', color: 'var(--fg)', fontSize: '13px',
              fontWeight: 600, padding: 0,
            }}
          />
        </div>
      ))}

      <div style={{
        width: 42, flexShrink: 0, textAlign: 'center', marginLeft: '4px',
        fontSize: '16px', fontWeight: 800,
        color: us ? 'var(--accent)' : `rgba(var(--fg-rgb), 0.5)`,
        borderLeft: '0.5px solid var(--border)',
        paddingLeft: '4px',
      }}>{total}</div>
    </div>
  )
}
