'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Status = 'available' | 'blocked' | 'tournament' | 'game_scheduled'

type Entry = {
  id?: string
  date: string
  status: Status
  note: string   // used as the available-time text, e.g. "9am–1pm"
}

const MODE_CONFIG: Record<Status, { label: string; color: string; bg: string; border: string; print: string }> = {
  available:      { label: 'Available',    color: '#6DB875', bg: 'rgba(109,184,117,0.18)', border: 'rgba(109,184,117,0.4)',  print: '#d4edda' },
  blocked:        { label: 'Blocked',      color: '#E85050', bg: 'rgba(232,80,80,0.18)',   border: 'rgba(232,80,80,0.4)',    print: '#f8d7da' },
  tournament:     { label: 'Tournament',   color: '#9B59B6', bg: 'rgba(155,89,182,0.18)',  border: 'rgba(155,89,182,0.4)',   print: '#e8d5f5' },
  game_scheduled: { label: 'Game Sched.', color: '#5B9BD5', bg: 'rgba(91,155,213,0.18)',  border: 'rgba(91,155,213,0.4)',   print: '#cce5ff' },
}

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}
function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}
function toDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
function monthKey(year: number, month: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}
function nextDateStr(ds: string): string {
  const d = new Date(ds + 'T12:00:00')
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

export default function SchedulePage() {
  const supabase = createClient()
  const router = useRouter()
  const editInputRef = useRef<HTMLInputElement>(null)
  const seasonRef = useRef<any>(null)

  const [loading, setLoading] = useState(true)
  const [season, setSeason] = useState<any>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [activeMonths, setActiveMonths] = useState<Record<string, boolean>>({})
  const [mode, setMode] = useState<Status>('available')
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const [editingDate, setEditingDate] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (editingDate && editInputRef.current) {
      editInputRef.current.focus()
      editInputRef.current.select()
    }
  }, [editingDate])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('profiles').select('beta_features').eq('user_id', user.id).maybeSingle()
    if (!profile?.beta_features) { router.push('/games'); return }

    const { data: seasonData } = await supabase
      .from('seasons')
      .select('id, name, start_date, team:teams(name)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    setSeason(seasonData)
    seasonRef.current = seasonData

    if (seasonData) {
      if (seasonData.start_date) {
        setYear(new Date(seasonData.start_date + 'T12:00:00').getFullYear())
      }
      const { data: entryRows } = await supabase
        .from('schedule_entries').select('*').eq('season_id', seasonData.id)
      const entryMap: Record<string, Entry> = {}
      for (const e of entryRows ?? []) {
        entryMap[e.date] = { id: e.id, date: e.date, status: e.status as Status, note: e.note ?? '' }
      }
      setEntries(entryMap)

      const { data: monthRows } = await supabase
        .from('schedule_months').select('*').eq('season_id', seasonData.id)
      const monthMap: Record<string, boolean> = {}
      for (const m of monthRows ?? []) {
        monthMap[`${m.year}-${String(m.month).padStart(2, '0')}`] = m.active
      }
      setActiveMonths(monthMap)
    }
    setLoading(false)
  }

  function isMonthActive(m: number) {
    return activeMonths[monthKey(year, m)] ?? false
  }

  async function toggleMonth(m: number) {
    if (!season) return
    const key = monthKey(year, m)
    const newActive = !isMonthActive(m)
    setActiveMonths(prev => ({ ...prev, [key]: newActive }))
    await supabase.from('schedule_months').upsert(
      { season_id: season.id, year, month: m + 1, active: newActive },
      { onConflict: 'season_id,year,month' }
    )
  }

  function prevMonth() {
    if (currentMonth === 0) { setYear(y => y - 1); setCurrentMonth(11) }
    else setCurrentMonth(m => m - 1)
  }

  function nextMonth() {
    if (currentMonth === 11) { setYear(y => y + 1); setCurrentMonth(0) }
    else setCurrentMonth(m => m + 1)
  }

  // Save the note/time text for a date without changing status
  async function saveNote(ds: string, text: string) {
    const s = seasonRef.current
    if (!s) return
    setEntries(prev => prev[ds] ? { ...prev, [ds]: { ...prev[ds], note: text } } : prev)
    await supabase.from('schedule_entries')
      .update({ note: text || null, updated_at: new Date().toISOString() })
      .eq('season_id', s.id)
      .eq('date', ds)
  }

  // Upsert a date with the given status and optional note
  async function upsertEntry(ds: string, status: Status, note: string): Promise<Entry | null> {
    const s = seasonRef.current
    if (!s) return null
    const { data } = await supabase.from('schedule_entries')
      .upsert(
        { season_id: s.id, date: ds, status, note: note || null, updated_at: new Date().toISOString() },
        { onConflict: 'season_id,date' }
      )
      .select()
      .single()
    return data ? { id: data.id, date: data.date, status: data.status as Status, note: data.note ?? '' } : null
  }

  async function deleteEntry(ds: string) {
    const existing = entries[ds]
    setEntries(prev => { const n = { ...prev }; delete n[ds]; return n })
    setEditingDate(null)
    if (existing?.id) {
      await supabase.from('schedule_entries').delete().eq('id', existing.id)
    }
  }

  // Click a date cell: mark/unmark status, enter inline edit mode
  async function handleDateClick(ds: string) {
    if (!season) return
    if (editingDate === ds) return   // already editing

    // Commit any in-progress edit first
    if (editingDate) {
      await saveNote(editingDate, editText)
      setEditingDate(null)
    }

    const existing = entries[ds]
    if (existing && existing.status === mode) {
      // Same mode → remove
      await deleteEntry(ds)
      return
    }

    // Mark/update with current mode, keep existing note
    const note = existing?.note ?? ''
    setEntries(prev => ({ ...prev, [ds]: { ...existing, date: ds, status: mode, note } }))
    setEditingDate(ds)
    setEditText(note)

    const saved = await upsertEntry(ds, mode, note)
    if (saved) setEntries(prev => ({ ...prev, [ds]: saved }))
  }

  // Tab: save current cell, move to next day (auto-mark if empty)
  async function tabToNextDay(fromDs: string) {
    await saveNote(fromDs, editText)

    const nextDs = nextDateStr(fromDs)
    const [ny, nm] = nextDs.split('-').map(Number)
    if (nm - 1 !== currentMonth || ny !== year) {
      setEditingDate(null)
      return
    }

    const nextEntry = entries[nextDs]
    if (nextEntry) {
      setEditingDate(nextDs)
      setEditText(nextEntry.note)
    } else {
      // Auto-mark next day with current mode
      const optimistic: Entry = { date: nextDs, status: mode, note: '' }
      setEntries(prev => ({ ...prev, [nextDs]: optimistic }))
      setEditingDate(nextDs)
      setEditText('')
      const saved = await upsertEntry(nextDs, mode, '')
      if (saved) setEntries(prev => ({ ...prev, [nextDs]: saved }))
    }
  }

  function handleKeyDown(ds: string) {
    return async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        await tabToNextDay(ds)
      } else if (e.key === 'Enter') {
        await saveNote(ds, editText)
        setEditingDate(null)
      } else if (e.key === 'Escape') {
        setEditingDate(null)
      } else if (e.key === 'Backspace' && editText === '') {
        // Delete entry on backspace in empty cell
        await deleteEntry(ds)
      }
    }
  }

  // Summary across active months
  const summary = Object.values(entries).reduce((acc, e) => {
    const d = new Date(e.date + 'T12:00:00')
    if (activeMonths[monthKey(d.getFullYear(), d.getMonth())]) {
      acc[e.status] = (acc[e.status] ?? 0) + 1
    }
    return acc
  }, {} as Partial<Record<Status, number>>)

  const today = new Date().toISOString().split('T')[0]

  function renderCells(y: number, m: number, compact = false) {
    const numDays = daysInMonth(y, m)
    const firstDay = firstDayOfMonth(y, m)
    const cells = []

    for (let i = 0; i < firstDay; i++) {
      cells.push(<div key={`pad-${i}`} />)
    }

    for (let d = 1; d <= numDays; d++) {
      const ds = toDateStr(y, m, d)
      const entry = entries[ds]
      const cfg = entry ? MODE_CONFIG[entry.status] : null
      const isEditing = !compact && editingDate === ds
      const isToday = !compact && ds === today

      if (compact) {
        cells.push(
          <div
            key={ds}
            data-status={entry?.status}
            style={{
              borderRadius: '3px',
              background: cfg ? cfg.print : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '22px',
            }}
          >
            <span style={{ fontSize: '8px', color: cfg ? '#000' : '#bbb', lineHeight: 1 }}>{d}</span>
          </div>
        )
        continue
      }

      cells.push(
        <div
          key={ds}
          onClick={() => !isEditing && handleDateClick(ds)}
          style={{
            borderRadius: '6px',
            background: cfg ? cfg.bg : 'transparent',
            border: isEditing
              ? `1.5px solid ${cfg ? cfg.color : 'rgba(var(--fg-rgb), 0.5)'}`
              : isToday
              ? '1px solid rgba(var(--fg-rgb), 0.35)'
              : cfg
              ? `0.5px solid ${cfg.border}`
              : '0.5px solid transparent',
            cursor: isEditing ? 'default' : 'pointer',
            minHeight: '52px',
            padding: '4px',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            transition: 'background 0.1s',
          }}
        >
          {/* Day number */}
          <span style={{
            fontSize: isEditing ? '9px' : '12px',
            fontWeight: isToday ? 700 : 400,
            color: cfg ? cfg.color : `rgba(var(--fg-rgb), 0.65)`,
            lineHeight: 1,
            alignSelf: 'flex-start',
          }}>
            {d}
          </span>

          {/* Inline time input when editing */}
          {isEditing ? (
            <input
              ref={editInputRef}
              value={editText}
              onChange={e => setEditText(e.target.value)}
              onKeyDown={handleKeyDown(ds)}
              onBlur={() => { saveNote(ds, editText); setEditingDate(null) }}
              placeholder="9am–1pm"
              style={{
                flex: 1,
                width: '100%',
                border: 'none',
                background: 'transparent',
                color: cfg?.color ?? 'var(--fg)',
                fontSize: '10px',
                outline: 'none',
                padding: '2px 0 0 0',
                fontFamily: 'inherit',
              }}
            />
          ) : (
            /* Time text when not editing */
            entry?.note ? (
              <span style={{
                fontSize: '9px',
                color: cfg?.color,
                lineHeight: 1.2,
                marginTop: '2px',
                wordBreak: 'break-word',
                overflow: 'hidden',
              }}>
                {entry.note}
              </span>
            ) : null
          )}
        </div>
      )
    }
    return cells
  }

  if (loading) return (
    <main style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--fg)',
      fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading…
    </main>
  )

  const teamName = (season?.team as any)?.name ?? ''
  const seasonName = season?.name ?? ''
  const activeMonthList = MONTHS.map((_, m) => m).filter(m => isMonthActive(m))

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '560px', margin: '0 auto',
      padding: '1.5rem 1rem 6rem',
    }}>

      {/* ── Screen UI ── */}
      <div className="no-print">

        <Link href="/settings" style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`,
          textDecoration: 'none', display: 'block', marginBottom: '1rem' }}>
          ‹ Settings
        </Link>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 700 }}>Field Availability</h1>
              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                background: 'rgba(155,89,182,0.15)', color: '#9B59B6', border: '0.5px solid rgba(155,89,182,0.3)' }}>
                BETA
              </span>
            </div>
            {(teamName || seasonName) && (
              <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.4)` }}>
                {teamName}{seasonName ? ` · ${seasonName}` : ''}
              </div>
            )}
          </div>
          <button onClick={() => window.print()} style={{
            fontSize: '12px', fontWeight: 600, padding: '7px 14px', borderRadius: '6px',
            border: '0.5px solid var(--border-md)', background: 'var(--bg-card)',
            color: `rgba(var(--fg-rgb), 0.6)`, cursor: 'pointer',
          }}>
            Print
          </button>
        </div>

        {/* Year selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1rem' }}>
          <button onClick={() => setYear(y => y - 1)} style={{ background: 'transparent', border: 'none',
            cursor: 'pointer', color: `rgba(var(--fg-rgb), 0.5)`, fontSize: '20px', lineHeight: 1, padding: '0 4px' }}>‹</button>
          <span style={{ fontSize: '16px', fontWeight: 700, minWidth: '48px', textAlign: 'center' }}>{year}</span>
          <button onClick={() => setYear(y => y + 1)} style={{ background: 'transparent', border: 'none',
            cursor: 'pointer', color: `rgba(var(--fg-rgb), 0.5)`, fontSize: '20px', lineHeight: 1, padding: '0 4px' }}>›</button>
          <span style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.35)` }}>
            Click a month pill to activate it
          </span>
        </div>

        {/* Month strip */}
        <div style={{ display: 'flex', gap: '4px', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
          {MONTHS.map((name, m) => {
            const active = isMonthActive(m)
            const isCurrent = m === currentMonth
            return (
              <div key={m} style={{ position: 'relative' }}>
                <button
                  onClick={() => { setCurrentMonth(m); if (!active) toggleMonth(m) }}
                  style={{
                    padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                    cursor: 'pointer',
                    border: `0.5px solid ${isCurrent ? 'rgba(var(--fg-rgb), 0.5)' : active ? 'var(--border-md)' : 'var(--border-subtle)'}`,
                    background: isCurrent ? 'var(--bg-card)' : active ? 'var(--bg-card-alt)' : 'transparent',
                    color: active ? `rgba(var(--fg-rgb), 0.8)` : `rgba(var(--fg-rgb), 0.25)`,
                  }}
                >
                  {name.slice(0, 3)}
                </button>
                {active && (
                  <button
                    onClick={e => { e.stopPropagation(); toggleMonth(m) }}
                    title="Deactivate month"
                    style={{
                      position: 'absolute', top: '-5px', right: '-5px',
                      width: '14px', height: '14px', borderRadius: '50%',
                      background: 'var(--bg2)', border: '0.5px solid var(--border-md)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '8px', color: `rgba(var(--fg-rgb), 0.5)`,
                      cursor: 'pointer', lineHeight: 1, padding: 0,
                    }}
                  >✕</button>
                )}
              </div>
            )
          })}
        </div>

        {/* Mode selector */}
        <div style={{ marginBottom: '6px' }}>
          <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '6px' }}>
            Mark mode — click a date to apply, then type available hours. Tab to move to next day.
          </div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(Object.entries(MODE_CONFIG) as [Status, typeof MODE_CONFIG[Status]][]).map(([status, cfg]) => (
              <button key={status} onClick={() => setMode(status)} style={{
                padding: '6px 12px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
                cursor: 'pointer',
                border: `0.5px solid ${mode === status ? cfg.color : 'var(--border)'}`,
                background: mode === status ? cfg.bg : 'transparent',
                color: mode === status ? cfg.color : `rgba(var(--fg-rgb), 0.5)`,
              }}>
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Calendar */}
        <div style={{
          background: 'var(--bg-card)', border: '0.5px solid var(--border)',
          borderRadius: '12px', padding: '1rem', marginBottom: '1rem', marginTop: '1rem',
        }}>
          {/* Month nav */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <button onClick={prevMonth} style={{ background: 'transparent', border: 'none',
              cursor: 'pointer', color: `rgba(var(--fg-rgb), 0.5)`, fontSize: '20px', padding: '4px 8px' }}>‹</button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '15px', fontWeight: 700 }}>{MONTHS[currentMonth]} {year}</div>
              {!isMonthActive(currentMonth) && (
                <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '3px' }}>
                  Inactive — excluded from printout ·{' '}
                  <button onClick={() => toggleMonth(currentMonth)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--accent)', fontSize: '11px', padding: 0,
                  }}>Activate</button>
                </div>
              )}
            </div>
            <button onClick={nextMonth} style={{ background: 'transparent', border: 'none',
              cursor: 'pointer', color: `rgba(var(--fg-rgb), 0.5)`, fontSize: '20px', padding: '4px 8px' }}>›</button>
          </div>

          {/* Day headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px', marginBottom: '3px' }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 700,
                color: `rgba(var(--fg-rgb), 0.3)`, padding: '3px 0' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Date cells */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px',
            opacity: isMonthActive(currentMonth) ? 1 : 0.45,
          }}>
            {renderCells(year, currentMonth)}
          </div>

          {/* Hint */}
          <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.25)`, marginTop: '10px', textAlign: 'center' }}>
            Click to mark · Type available hours · Tab = next day · Backspace on empty = remove
          </div>
        </div>

        {/* Summary bar */}
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
          {(Object.entries(MODE_CONFIG) as [Status, typeof MODE_CONFIG[Status]][]).map(([status, cfg]) => {
            const count = summary[status] ?? 0
            return (
              <div key={status} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '7px 12px', borderRadius: '8px',
                background: count > 0 ? cfg.bg : 'var(--bg-card)',
                border: `0.5px solid ${count > 0 ? cfg.border : 'var(--border-subtle)'}`,
                opacity: count > 0 ? 1 : 0.4,
              }}>
                <span style={{ fontSize: '16px', fontWeight: 800, color: cfg.color, lineHeight: 1 }}>{count}</span>
                <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.6)` }}>{cfg.label}</span>
              </div>
            )
          })}
        </div>

      </div>{/* end no-print */}


      {/* ── Print-only view ── */}
      <div className="sched-print">
        <div style={{ marginBottom: '16px', paddingBottom: '8px', borderBottom: '1.5px solid #333' }}>
          <div style={{ fontSize: '18px', fontWeight: 800 }}>Field Availability — {teamName}</div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>{seasonName} · {year}</div>
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
          {(Object.entries(MODE_CONFIG) as [Status, typeof MODE_CONFIG[Status]][]).map(([status, cfg]) => (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '2px', background: cfg.print, border: '0.5px solid #999' }} />
              <span style={{ fontSize: '10px', color: '#333' }}>{cfg.label}</span>
              {summary[status] ? <span style={{ fontSize: '10px', color: '#666' }}>({summary[status]})</span> : null}
            </div>
          ))}
        </div>

        {/* Month grids */}
        {activeMonthList.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#999' }}>No active months selected.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            {activeMonthList.map(m => {
              const notesInMonth = Object.values(entries).filter(e => {
                const d = new Date(e.date + 'T12:00:00')
                return d.getFullYear() === year && d.getMonth() === m && e.note
              })
              return (
                <div key={m}>
                  <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '6px',
                    textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {MONTHS[m]} {year}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', marginBottom: '3px' }}>
                    {DAYS.map(d => (
                      <div key={d} style={{ textAlign: 'center', fontSize: '7px', color: '#999', fontWeight: 600, padding: '1px 0' }}>
                        {d[0]}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px' }}>
                    {renderCells(year, m, true)}
                  </div>
                  {notesInMonth.length > 0 && (
                    <div style={{ marginTop: '6px' }}>
                      {notesInMonth.map(e => (
                        <div key={e.date} style={{ fontSize: '8px', color: '#444', marginBottom: '2px' }}>
                          <span style={{ fontWeight: 700 }}>
                            {new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}:
                          </span>{' '}{e.note}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

    </main>
  )
}
