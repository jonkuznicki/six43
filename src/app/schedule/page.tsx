'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Status = 'available' | 'preferred' | 'blocked' | 'tournament' | 'game_scheduled'

type Entry = {
  id?: string
  date: string
  status: Status
  note: string
}

const MODE_CONFIG: Record<Status, { label: string; color: string; bg: string; border: string; print: string }> = {
  available:      { label: 'Available',      color: '#6DB875', bg: 'rgba(109,184,117,0.18)', border: 'rgba(109,184,117,0.4)',  print: '#d4edda' },
  preferred:      { label: 'Preferred',      color: '#E8A020', bg: 'rgba(232,160,32,0.18)',  border: 'rgba(232,160,32,0.4)',   print: '#ffeeba' },
  blocked:        { label: 'Blocked',        color: '#E85050', bg: 'rgba(232,80,80,0.18)',   border: 'rgba(232,80,80,0.4)',    print: '#f8d7da' },
  tournament:     { label: 'Tournament',     color: '#9B59B6', bg: 'rgba(155,89,182,0.18)',  border: 'rgba(155,89,182,0.4)',   print: '#e8d5f5' },
  game_scheduled: { label: 'Game Scheduled', color: '#5B9BD5', bg: 'rgba(91,155,213,0.18)',  border: 'rgba(91,155,213,0.4)',   print: '#cce5ff' },
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

export default function SchedulePage() {
  const supabase = createClient()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [season, setSeason] = useState<any>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [activeMonths, setActiveMonths] = useState<Record<string, boolean>>({})
  const [mode, setMode] = useState<Status>('available')
  const [entries, setEntries] = useState<Record<string, Entry>>({})
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [noteInput, setNoteInput] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: profile } = await supabase
      .from('profiles')
      .select('beta_features')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!profile?.beta_features) {
      router.push('/games')
      return
    }

    const { data: seasonData } = await supabase
      .from('seasons')
      .select('id, name, start_date, team:teams(name)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    setSeason(seasonData)

    if (seasonData) {
      if (seasonData.start_date) {
        setYear(new Date(seasonData.start_date + 'T12:00:00').getFullYear())
      }

      const { data: entryRows } = await supabase
        .from('schedule_entries')
        .select('*')
        .eq('season_id', seasonData.id)

      const entryMap: Record<string, Entry> = {}
      for (const e of entryRows ?? []) {
        entryMap[e.date] = { id: e.id, date: e.date, status: e.status, note: e.note ?? '' }
      }
      setEntries(entryMap)

      const { data: monthRows } = await supabase
        .from('schedule_months')
        .select('*')
        .eq('season_id', seasonData.id)

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

  async function handleDateClick(dateString: string) {
    if (!season) return
    const existing = entries[dateString]

    if (existing && existing.status === mode) {
      // Same mode → remove
      const next = { ...entries }
      delete next[dateString]
      setEntries(next)
      if (selectedDate === dateString) setSelectedDate(null)
      if (existing.id) {
        await supabase.from('schedule_entries').delete().eq('id', existing.id)
      }
    } else {
      // New or different mode → upsert
      const optimistic: Entry = { ...existing, date: dateString, status: mode, note: existing?.note ?? '' }
      setEntries(prev => ({ ...prev, [dateString]: optimistic }))
      setSelectedDate(dateString)
      setNoteInput(optimistic.note)

      const { data } = await supabase
        .from('schedule_entries')
        .upsert(
          { season_id: season.id, date: dateString, status: mode, note: existing?.note ?? null, updated_at: new Date().toISOString() },
          { onConflict: 'season_id,date' }
        )
        .select()
        .single()

      if (data) {
        setEntries(prev => ({ ...prev, [dateString]: { id: data.id, date: data.date, status: data.status, note: data.note ?? '' } }))
      }
    }
  }

  async function saveNote() {
    if (!selectedDate || !season) return
    const existing = entries[selectedDate]
    if (!existing) return
    setSaving(true)
    setEntries(prev => ({ ...prev, [selectedDate]: { ...existing, note: noteInput } }))
    await supabase.from('schedule_entries')
      .update({ note: noteInput || null, updated_at: new Date().toISOString() })
      .eq('season_id', season.id)
      .eq('date', selectedDate)
    setSaving(false)
  }

  // Summary counts across active months only
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
      const isSelected = !compact && selectedDate === ds
      const isToday = !compact && ds === today

      cells.push(
        <div
          key={ds}
          onClick={() => !compact && handleDateClick(ds)}
          className={compact ? 'sched-print-cell' : undefined}
          data-status={entry?.status}
          style={{
            borderRadius: compact ? '3px' : '6px',
            background: cfg ? (compact ? cfg.print : cfg.bg) : 'transparent',
            border: compact ? 'none' : (
              isSelected ? `1.5px solid ${cfg ? cfg.color : 'var(--fg)'}` :
              isToday    ? '1px solid rgba(var(--fg-rgb), 0.35)' :
              cfg        ? `0.5px solid ${cfg.border}` :
                           '0.5px solid transparent'
            ),
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            cursor: compact ? 'default' : 'pointer',
            aspectRatio: compact ? undefined : '1',
            height: compact ? '26px' : undefined,
            transition: compact ? undefined : 'background 0.1s',
          }}
        >
          <span style={{
            fontSize: compact ? '9px' : '13px',
            fontWeight: isToday ? 700 : 400,
            color: compact
              ? (cfg ? '#000' : '#999')
              : (cfg ? cfg.color : `rgba(var(--fg-rgb), 0.75)`),
            lineHeight: 1,
          }}>
            {d}
          </span>
          {!compact && entry?.note && (
            <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: cfg?.color, marginTop: '2px' }} />
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

      {/* ── Screen-only UI ── */}
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
          <span style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.35)`, marginLeft: '4px' }}>
            Click a month to activate it
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
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}
        </div>

        {/* Mode selector */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
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

        {/* Calendar */}
        <div style={{
          background: 'var(--bg-card)', border: '0.5px solid var(--border)',
          borderRadius: '12px', padding: '1rem', marginBottom: '1rem',
        }}>
          {/* Month nav */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <button onClick={prevMonth} style={{ background: 'transparent', border: 'none',
              cursor: 'pointer', color: `rgba(var(--fg-rgb), 0.5)`, fontSize: '20px', padding: '4px 8px' }}>‹</button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '15px', fontWeight: 700 }}>{MONTHS[currentMonth]} {year}</div>
              {!isMonthActive(currentMonth) && (
                <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '3px' }}>
                  Inactive — dates excluded from printout ·{' '}
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

          {/* Day-of-week headers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
            {DAYS.map(d => (
              <div key={d} style={{ textAlign: 'center', fontSize: '10px', fontWeight: 700,
                color: `rgba(var(--fg-rgb), 0.3)`, padding: '4px 0' }}>
                {d}
              </div>
            ))}
          </div>

          {/* Date cells */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px',
            opacity: isMonthActive(currentMonth) ? 1 : 0.45,
          }}>
            {renderCells(year, currentMonth)}
          </div>
        </div>

        {/* Note editor */}
        {selectedDate && entries[selectedDate] && (
          <div style={{
            background: 'var(--bg-card)',
            border: `0.5px solid ${MODE_CONFIG[entries[selectedDate].status].border}`,
            borderRadius: '10px', padding: '14px', marginBottom: '1rem',
          }}>
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.06em',
              textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '8px' }}>
              Note · {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
              {' · '}
              <span style={{ color: MODE_CONFIG[entries[selectedDate].status].color }}>
                {MODE_CONFIG[entries[selectedDate].status].label}
              </span>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={noteInput}
                onChange={e => setNoteInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveNote()}
                placeholder="Add a note for this date…"
                autoFocus
                style={{
                  flex: 1, padding: '8px 12px', borderRadius: '6px',
                  border: '0.5px solid var(--border-md)',
                  background: 'var(--bg-input)', color: 'var(--fg)', fontSize: '13px',
                }}
              />
              <button onClick={saveNote} disabled={saving} style={{
                padding: '8px 14px', borderRadius: '6px', border: 'none',
                background: 'var(--accent)', color: 'var(--accent-text)',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              }}>
                {saving ? '…' : 'Save'}
              </button>
              <button onClick={() => setSelectedDate(null)} style={{
                padding: '8px 10px', borderRadius: '6px',
                border: '0.5px solid var(--border)', background: 'transparent',
                color: `rgba(var(--fg-rgb), 0.45)`, fontSize: '14px', cursor: 'pointer',
              }}>✕</button>
            </div>
          </div>
        )}

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
                opacity: count > 0 ? 1 : 0.45,
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
        {/* Header */}
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
                  <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
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
