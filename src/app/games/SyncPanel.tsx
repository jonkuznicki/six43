'use client'

import { useState } from 'react'
import { createClient } from '../../lib/supabase'

type SyncChange =
  | { type: 'new';     opponent: string; game_date: string; game_time: string | null; selected: boolean }
  | { type: 'changed'; game_id: string; opponent: string; old_date: string; old_time: string | null; new_date: string; new_time: string | null; selected: boolean }
  | { type: 'removed'; game_id: string; opponent: string; game_date: string; selected: boolean }
  | { type: 'skipped'; game_id: string; opponent: string; game_date: string; reason: string }

function fmt(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function fmtTime(t: string | null) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')}${ampm}`
}

export default function SyncPanel({ seasonId, teamId }: { seasonId: string; teamId: string | null }) {
  const supabase = createClient()
  const [open, setOpen]       = useState(false)
  const [checking, setChecking] = useState(false)
  const [done, setDone]       = useState(false)
  const [changes, setChanges] = useState<SyncChange[]>([])
  const [error, setError]     = useState('')
  const [applying, setApplying] = useState(false)
  const [applied, setApplied] = useState(false)

  async function check() {
    setOpen(true)
    setChecking(true)
    setDone(false)
    setError('')
    setChanges([])
    setApplied(false)

    const url = teamId ? `/api/sync-ical?teamId=${teamId}` : '/api/sync-ical'
    const res = await fetch(url)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error ?? 'Failed to check for updates')
      setChecking(false)
      return
    }
    const { changes: raw } = await res.json()
    setChanges((raw as SyncChange[]).map(c => ({ ...c, selected: c.type !== 'skipped' } as SyncChange)))
    setDone(true)
    setChecking(false)
  }

  function toggle(i: number) {
    setChanges(prev => prev.map((c, idx) =>
      idx === i && c.type !== 'skipped' ? { ...c, selected: !(c as any).selected } : c
    ))
  }

  async function apply() {
    setApplying(true)
    const selected = changes.filter(c => c.type !== 'skipped' && (c as any).selected)

    let num = 1
    try {
      const { data: maxGame } = await supabase
        .from('games').select('game_number').eq('season_id', seasonId)
        .order('game_number', { ascending: false }).limit(1).maybeSingle()
      num = (maxGame?.game_number ?? 0) + 1
    } catch { /* column may not exist */ }

    for (const c of selected) {
      if (c.type === 'new') {
        const row: any = {
          season_id: seasonId, opponent: c.opponent,
          game_date: c.game_date, game_time: c.game_time,
          location: 'Home', status: 'scheduled',
        }
        try { row.game_number = num++ } catch { /* ignore */ }
        await supabase.from('games').insert(row)
      } else if (c.type === 'changed') {
        await supabase.from('games')
          .update({ game_date: c.new_date, game_time: c.new_time })
          .eq('id', c.game_id)
      } else if (c.type === 'removed') {
        await supabase.from('games').delete().eq('id', c.game_id)
      }
    }

    setApplied(true)
    setApplying(false)
    // Refresh the page to show updated games
    window.location.reload()
  }

  const selectableCount = changes.filter(c => c.type !== 'skipped' && (c as any).selected).length
  const totalChanges    = changes.filter(c => c.type !== 'skipped').length

  const chipStyle = (type: string): React.CSSProperties => {
    const map: Record<string, { bg: string; color: string }> = {
      new:     { bg: 'rgba(109,184,117,0.15)', color: '#6DB875' },
      changed: { bg: 'rgba(var(--accent-rgb, 232,160,32),0.15)', color: 'var(--accent)' },
      removed: { bg: 'rgba(232,80,80,0.15)',   color: '#E85050' },
      skipped: { bg: 'var(--bg-card)',          color: `rgba(var(--fg-rgb),0.4)` },
    }
    const c = map[type] ?? map.skipped
    return {
      fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px',
      background: c.bg, color: c.color,
    }
  }

  return (
    <div style={{ marginTop: '6px' }}>
      <button
        onClick={open ? () => setOpen(false) : check}
        style={{
          width: '100%', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer',
          border: '0.5px solid var(--border-subtle)', background: 'transparent',
          color: `rgba(var(--fg-rgb), 0.4)`, fontSize: '12px', textAlign: 'center',
        }}
      >
        ↻ Refresh from GameChanger
      </button>

      {open && (
        <div style={{
          marginTop: '8px', background: 'var(--bg-card)',
          border: '0.5px solid var(--border)', borderRadius: '10px', overflow: 'hidden',
        }}>
          {checking && (
            <div style={{ padding: '1.5rem', textAlign: 'center',
              fontSize: '13px', color: `rgba(var(--fg-rgb), 0.5)` }}>
              Checking GameChanger…
            </div>
          )}

          {error && (
            <div style={{ padding: '12px 14px', fontSize: '13px', color: '#E87060' }}>
              {error}
            </div>
          )}

          {done && !checking && totalChanges === 0 && (
            <div style={{ padding: '1.25rem', textAlign: 'center' }}>
              <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>
                Schedule is up to date ✓
              </div>
              <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.5)` }}>
                No changes found in GameChanger.
              </div>
            </div>
          )}

          {done && !checking && totalChanges > 0 && (
            <>
              <div style={{ padding: '10px 14px 0',
                fontSize: '11px', color: `rgba(var(--fg-rgb), 0.5)` }}>
                {totalChanges} change{totalChanges !== 1 ? 's' : ''} found — select which to apply
              </div>
              {changes.map((c, i) => {
                const isSkipped = c.type === 'skipped'
                const isSelected = !isSkipped && (c as any).selected
                return (
                  <div key={i} style={{
                    display: 'flex', gap: '10px', alignItems: 'flex-start',
                    padding: '10px 14px',
                    borderTop: '0.5px solid var(--border)',
                    opacity: isSkipped ? 0.45 : 1,
                  }}>
                    {!isSkipped ? (
                      <input type="checkbox" checked={isSelected} onChange={() => toggle(i)}
                        style={{ accentColor: 'var(--accent)', width: '15px', height: '15px',
                          flexShrink: 0, marginTop: '3px' }} />
                    ) : (
                      <div style={{ width: '15px', flexShrink: 0 }} />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 600 }}>{c.opponent}</span>
                        <span style={chipStyle(c.type)}>
                          {c.type === 'new' ? 'New' : c.type === 'changed' ? 'Changed' : c.type === 'removed' ? 'Removed' : 'Skipped'}
                        </span>
                      </div>
                      {c.type === 'new' && (
                        <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.5)` }}>
                          {fmt(c.game_date)}{c.game_time ? ` · ${fmtTime(c.game_time)}` : ''}
                        </div>
                      )}
                      {c.type === 'changed' && (
                        <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.5)` }}>
                          <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>
                            {fmt(c.old_date)}{c.old_time ? ` · ${fmtTime(c.old_time)}` : ''}
                          </span>
                          {' → '}
                          <span style={{ color: 'var(--accent)' }}>
                            {fmt(c.new_date)}{c.new_time ? ` · ${fmtTime(c.new_time)}` : ''}
                          </span>
                        </div>
                      )}
                      {c.type === 'removed' && (
                        <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.5)` }}>
                          {fmt(c.game_date)} — will be deleted
                        </div>
                      )}
                      {c.type === 'skipped' && (
                        <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.5)` }}>
                          {fmt(c.game_date)} · {c.reason}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              <div style={{ padding: '12px 14px', borderTop: '0.5px solid var(--border)', display: 'flex', gap: '8px' }}>
                {selectableCount > 0 && (
                  <button onClick={apply} disabled={applying} style={{
                    flex: 1, padding: '10px', borderRadius: '6px', border: 'none',
                    background: 'var(--accent)', color: 'var(--accent-text)',
                    fontSize: '13px', fontWeight: 700, cursor: applying ? 'not-allowed' : 'pointer',
                    opacity: applying ? 0.6 : 1,
                  }}>
                    {applying ? 'Applying…' : `Apply ${selectableCount} change${selectableCount !== 1 ? 's' : ''}`}
                  </button>
                )}
                <button onClick={check} disabled={checking} style={{
                  padding: '10px 14px', borderRadius: '6px',
                  border: '0.5px solid var(--border-md)', background: 'transparent',
                  color: `rgba(var(--fg-rgb), 0.5)`, fontSize: '13px', cursor: 'pointer',
                }}>
                  Re-check
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
