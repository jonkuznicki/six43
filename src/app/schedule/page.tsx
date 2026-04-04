'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

type Entry = {
  id?: string
  date: string
  note: string   // available field time, e.g. "9am–1pm"
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
  const escapingRef = useRef(false)

  const [loading, setLoading] = useState(true)
  const [season, setSeason] = useState<any>(null)
  const [year, setYear] = useState(new Date().getFullYear())
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [activeMonths, setActiveMonths] = useState<Record<string, boolean>>({})
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
        entryMap[e.date] = { id: e.id, date: e.date, note: e.note ?? '' }
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

  // Upsert or delete an entry based on text content
  async function commitEntry(ds: string, text: string) {
    const s = seasonRef.current
    if (!s) return
    const trimmed = text.trim()
    const existing = entries[ds]

    if (!trimmed) {
      // Empty text → delete
      if (existing) {
        setEntries(prev => { const n = { ...prev }; delete n[ds]; return n })
        if (existing.id) await supabase.from('schedule_entries').delete().eq('id', existing.id)
      }
      return
    }

    // Upsert with text
    setEntries(prev => ({ ...prev, [ds]: { ...existing, date: ds, note: trimmed } }))
    const { data } = await supabase.from('schedule_entries')
      .upsert(
        { season_id: s.id, date: ds, status: 'available', note: trimmed, updated_at: new Date().toISOString() },
        { onConflict: 'season_id,date' }
      )
      .select()
      .single()
    if (data) {
      setEntries(prev => ({ ...prev, [ds]: { id: data.id, date: data.date, note: data.note ?? '' } }))
    }
  }

  async function deleteEntry(ds: string) {
    const existing = entries[ds]
    setEntries(prev => { const n = { ...prev }; delete n[ds]; return n })
    setEditingDate(null)
    if (existing?.id) await supabase.from('schedule_entries').delete().eq('id', existing.id)
  }

  // Click a date to enter edit mode
  function handleCellClick(ds: string) {
    if (editingDate === ds) return
    // If another cell is being edited, blur will handle saving it
    const existing = entries[ds]
    setEditText(existing?.note ?? '')
    setEditingDate(ds)
  }

  // Tab: save current, move to next day in this month
  async function tabToNext(ds: string) {
    await commitEntry(ds, editText)
    const nextDs = nextDateStr(ds)
    const [ny, nm] = nextDs.split('-').map(Number)
    if (nm - 1 === currentMonth && ny === year) {
      const nextEntry = entries[nextDs]
      setEditText(nextEntry?.note ?? '')
      setEditingDate(nextDs)
    } else {
      setEditingDate(null)
    }
  }

  function handleKeyDown(ds: string) {
    return async (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault()
        await tabToNext(ds)
      } else if (e.key === 'Enter') {
        await commitEntry(ds, editText)
        escapingRef.current = true
        setEditingDate(null)
      } else if (e.key === 'Escape') {
        escapingRef.current = true
        setEditingDate(null)
      } else if (e.key === 'Backspace' && editText === '') {
        escapingRef.current = true
        await deleteEntry(ds)
      }
    }
  }

  function handleBlur(ds: string) {
    if (escapingRef.current) {
      escapingRef.current = false
      return
    }
    commitEntry(ds, editText)
    setEditingDate(null)
  }

  const today = new Date().toISOString().split('T')[0]
  const totalMarked = Object.values(entries).filter(e => {
    const d = new Date(e.date + 'T12:00:00')
    return activeMonths[monthKey(d.getFullYear(), d.getMonth())]
  }).length

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
      const isEditing = !compact && editingDate === ds
      const isToday = !compact && ds === today
      const hasEntry = !!entry

      if (compact) {
        cells.push(
          <div key={ds} style={{
            borderRadius: '3px',
            background: hasEntry ? '#d4edda' : 'transparent',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'flex-start',
            minHeight: '22px', padding: '2px',
          }}>
            <span style={{ fontSize: '8px', color: hasEntry ? '#155724' : '#bbb', lineHeight: 1, fontWeight: hasEntry ? 700 : 400 }}>{d}</span>
            {entry?.note && (
              <span style={{ fontSize: '6px', color: '#155724', lineHeight: 1.2, textAlign: 'center', wordBreak: 'break-all' }}>
                {entry.note}
              </span>
            )}
          </div>
        )
        continue
      }

      cells.push(
        <div
          key={ds}
          onClick={() => handleCellClick(ds)}
          style={{
            borderRadius: '6px',
            background: isEditing
              ? 'rgba(109,184,117,0.22)'
              : hasEntry
              ? 'rgba(109,184,117,0.15)'
              : 'transparent',
            border: isEditing
              ? '1.5px solid #6DB875'
              : isToday
              ? '1px solid rgba(var(--fg-rgb), 0.35)'
              : hasEntry
              ? '0.5px solid rgba(109,184,117,0.4)'
              : '0.5px solid transparent',
            cursor: 'pointer',
            minHeight: '52px',
            padding: '4px',
            display: 'flex',
            flexDirection: 'column',
            transition: 'background 0.1s',
          }}
        >
          <span style={{
            fontSize: isEditing ? '9px' : '12px',
            fontWeight: isToday ? 700 : 400,
            color: hasEntry ? '#6DB875' : `rgba(var(--fg-rgb), 0.6)`,
            lineHeight: 1,
          }}>
            {d}
          </span>

          {isEditing ? (
            <input
              ref={editInputRef}
              value={editText}
              onChange={e => setEditText(e.target.value)}
              onKeyDown={handleKeyDown(ds)}
              onBlur={() => handleBlur(ds)}
              placeholder="9am–1pm"
              style={{
                flex: 1, width: '100%',
                border: 'none', background: 'transparent',
                color: '#6DB875', fontSize: '10px',
                outline: 'none', padding: '2px 0 0 0',
                fontFamily: 'inherit',
              }}
            />
          ) : entry?.note ? (
            <span style={{
              fontSize: '9px', color: '#6DB875',
              lineHeight: 1.2, marginTop: '2px',
              wordBreak: 'break-word', overflow: 'hidden',
            }}>
              {entry.note}
            </span>
          ) : null}
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

          <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.25)`, marginTop: '10px', textAlign: 'center' }}>
            Click a date and type your available hours · Tab = next day · Backspace on empty = remove
          </div>
        </div>

        {/* Summary */}
        {totalMarked > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '10px 14px', borderRadius: '8px',
            background: 'rgba(109,184,117,0.12)',
            border: '0.5px solid rgba(109,184,117,0.3)',
          }}>
            <span style={{ fontSize: '18px', fontWeight: 800, color: '#6DB875', lineHeight: 1 }}>{totalMarked}</span>
            <span style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.6)` }}>
              available date{totalMarked !== 1 ? 's' : ''} in active months
            </span>
          </div>
        )}

      </div>{/* end no-print */}


      {/* ── Print-only view ── */}
      <div className="sched-print">
        <div style={{ marginBottom: '16px', paddingBottom: '8px', borderBottom: '1.5px solid #333' }}>
          <div style={{ fontSize: '18px', fontWeight: 800 }}>Field Availability — {teamName}</div>
          <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
            {seasonName} · {year} · {totalMarked} available date{totalMarked !== 1 ? 's' : ''}
          </div>
        </div>

        {activeMonthList.length === 0 ? (
          <div style={{ fontSize: '13px', color: '#999' }}>No active months selected.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
            {activeMonthList.map(m => {
              const datesInMonth = Object.values(entries).filter(e => {
                const d = new Date(e.date + 'T12:00:00')
                return d.getFullYear() === year && d.getMonth() === m
              })
              return (
                <div key={m}>
                  <div style={{ fontSize: '11px', fontWeight: 700, marginBottom: '6px',
                    textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {MONTHS[m]} {year}
                    <span style={{ fontWeight: 400, color: '#666', marginLeft: '6px', fontSize: '10px' }}>
                      ({datesInMonth.length} dates)
                    </span>
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
                  {/* List of dates with times below the grid */}
                  {datesInMonth.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      {datesInMonth
                        .sort((a, b) => a.date.localeCompare(b.date))
                        .map(e => (
                          <div key={e.date} style={{ fontSize: '9px', color: '#333', marginBottom: '3px', display: 'flex', gap: '4px' }}>
                            <span style={{ fontWeight: 700, minWidth: '30px' }}>
                              {new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })}
                            </span>
                            <span>{e.note || '—'}</span>
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
