'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { createClient } from '../../../lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

type Tab = 'gamechanger' | 'manual' | 'sync'
type Location = 'Home' | 'Away' | 'Neutral'

type ParsedGame = {
  opponent: string
  game_date: string
  game_time: string | null
  selected: boolean
}

type AddedGame = {
  game_number: number
  opponent: string
  game_date: string
  game_time: string | null
  location: Location
}

type SyncChange =
  | { type: 'new';     opponent: string; game_date: string; game_time: string | null; selected: boolean }
  | { type: 'changed'; game_id: string; opponent: string; old_date: string; old_time: string | null; new_date: string; new_time: string | null; selected: boolean }
  | { type: 'removed'; game_id: string; opponent: string; game_date: string; selected: boolean }
  | { type: 'skipped'; game_id: string; opponent: string; game_date: string; reason: string }

const LOCATIONS: Location[] = ['Home', 'Away', 'Neutral']

const s = {
  bg:       '#0B1F3A',
  fg:       '#F5F2EB',
  accent:   '#E8A020',
  muted:    'rgba(245,242,235,0.5)',
  card:     'rgba(255,255,255,0.04)',
  border:   '0.5px solid rgba(245,242,235,0.1)',
  borderMd: '0.5px solid rgba(245,242,235,0.18)',
}

function fmt(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function fmtTime(t: string | null) {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ampm = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2,'0')}${ampm}`
}

function LocationPicker({ value, onChange }: { value: Location; onChange: (v: Location) => void }) {
  return (
    <div style={{ display: 'flex', borderRadius: '6px', overflow: 'hidden', border: s.borderMd }}>
      {LOCATIONS.map(l => (
        <button
          key={l}
          onClick={() => onChange(l)}
          style={{
            flex: 1, padding: '7px 4px', fontSize: '11px', fontWeight: 600,
            border: 'none', cursor: 'pointer',
            background: value === l ? s.accent : 'transparent',
            color: value === l ? s.bg : s.muted,
            borderRight: l !== 'Neutral' ? s.borderMd : 'none',
          }}
        >{l}</button>
      ))}
    </div>
  )
}

function inp(extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: '100%', padding: '10px 12px', borderRadius: '6px',
    border: s.borderMd, background: 'rgba(255,255,255,0.06)',
    color: s.fg, fontSize: '14px', boxSizing: 'border-box', ...extra,
  }
}

export default function ImportPage() {
  return (
    <Suspense fallback={
      <main style={{ background: '#0B1F3A', minHeight: '100vh', color: '#F5F2EB',
        fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading…
      </main>
    }>
      <ImportPageInner />
    </Suspense>
  )
}

function ImportPageInner() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [loading, setLoading]     = useState(true)
  const [season, setSeason]       = useState<any>(null)
  const [tab, setTab]             = useState<Tab>(() =>
    searchParams.get('tab') === 'sync' ? 'sync' : 'gamechanger'
  )

  // ── GameChanger tab ──────────────────────────────
  const [gcUrl, setGcUrl]           = useState('')
  const [gcPreviewing, setGcPrev]   = useState(false)
  const [gcGames, setGcGames]       = useState<ParsedGame[]>([])
  const [gcLocation, setGcLoc]      = useState<Location>('Home')
  const [gcImporting, setGcImp]     = useState(false)
  const [gcError, setGcError]       = useState('')
  const [gcDone, setGcDone]         = useState(false)
  const [gcImportedCount, setGcN]   = useState(0)

  // ── Add manually tab ────────────────────────────
  const [form, setForm] = useState({
    opponent: '',
    game_date: new Date().toISOString().split('T')[0],
    game_time: '',
    location: 'Home' as Location,
  })
  const [nextNum, setNextNum]       = useState(1)
  const [added, setAdded]           = useState<AddedGame[]>([])
  const [saving, setSaving]         = useState(false)
  const [manErr, setManErr]         = useState('')

  // ── Sync tab ────────────────────────────────────
  const [syncing, setSyncing]       = useState(false)
  const [syncDone, setSyncDone]     = useState(false)
  const [syncChanges, setSyncChanges] = useState<SyncChange[]>([])
  const [syncError, setSyncError]   = useState('')
  const [applying, setApplying]     = useState(false)
  const syncLoadedRef               = useRef(false)

  useEffect(() => { init() }, [])

  // Auto-run sync check when tab=sync is active and we have a season
  useEffect(() => {
    if (tab === 'sync' && season && !syncLoadedRef.current) {
      syncLoadedRef.current = true
      runSync()
    }
  }, [tab, season])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data: seasonData } = await supabase
      .from('seasons')
      .select('id, name, webcal_url, team:teams(name)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    setSeason(seasonData)

    if (seasonData) {
      const { data: maxGame } = await supabase
        .from('games')
        .select('game_number')
        .eq('season_id', seasonData.id)
        .order('game_number', { ascending: false })
        .limit(1)
        .maybeSingle()
      setNextNum((maxGame?.game_number ?? 0) + 1)

      // Pre-fill URL if already saved
      if (seasonData.webcal_url) setGcUrl(seasonData.webcal_url)
    }

    setLoading(false)
  }

  // ── GameChanger ──────────────────────────────────

  async function handlePreview() {
    if (!gcUrl.trim()) return
    setGcPrev(true)
    setGcError('')
    setGcGames([])
    setGcDone(false)

    const res = await fetch('/api/import-ical', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: gcUrl.trim() }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setGcError(body.error ?? 'Failed to fetch schedule')
      setGcPrev(false)
      return
    }

    const { games } = await res.json()
    setGcGames((games as any[]).map(g => ({ ...g, selected: true })))
    setGcPrev(false)
  }

  async function handleImport() {
    if (!season) return
    const selected = gcGames.filter(g => g.selected)
    if (!selected.length) return

    setGcImp(true)
    setGcError('')

    const { data: existing } = await supabase
      .from('games')
      .select('game_date, game_number')
      .eq('season_id', season.id)

    const existingDates = new Set((existing ?? []).map((g: any) => g.game_date))
    const maxNum = Math.max(0, ...(existing ?? []).map((g: any) => g.game_number ?? 0))
    let num = maxNum + 1

    const rows = selected
      .filter(g => !existingDates.has(g.game_date))
      .sort((a, b) => a.game_date.localeCompare(b.game_date))
      .map(g => ({
        season_id:   season.id,
        opponent:    g.opponent,
        game_date:   g.game_date,
        game_time:   g.game_time,
        location:    gcLocation,
        status:      'scheduled',
        game_number: num++,
      }))

    const skipped = selected.length - rows.length
    if (rows.length) {
      const { error } = await supabase.from('games').insert(rows)
      if (error) { setGcError(error.message); setGcImp(false); return }
    }

    setGcN(rows.length)
    setGcDone(true)
    setGcImp(false)
    // Update nextNum for the manual tab too
    setNextNum(num)
  }

  // ── Add manually ────────────────────────────────

  async function handleAdd() {
    if (!form.opponent.trim() || !form.game_date || !season) return
    setSaving(true)
    setManErr('')

    const { data: game, error } = await supabase
      .from('games')
      .insert({
        season_id:   season.id,
        opponent:    form.opponent.trim(),
        game_date:   form.game_date,
        game_time:   form.game_time || null,
        location:    form.location,
        status:      'scheduled',
        game_number: nextNum,
      })
      .select()
      .single()

    if (error || !game) {
      setManErr(error?.message ?? 'Failed to save')
      setSaving(false)
      return
    }

    setAdded(prev => [...prev, {
      game_number: nextNum,
      opponent:    form.opponent.trim(),
      game_date:   form.game_date,
      game_time:   form.game_time || null,
      location:    form.location,
    }])
    setNextNum(n => n + 1)
    setForm(f => ({ ...f, opponent: '', game_time: '' }))
    setSaving(false)
  }

  // ── Sync ────────────────────────────────────────

  async function runSync() {
    setSyncing(true)
    setSyncError('')
    setSyncDone(false)
    setSyncChanges([])

    const res = await fetch('/api/sync-ical')
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setSyncError(body.error ?? 'Failed to check for updates')
      setSyncing(false)
      return
    }

    const { changes } = await res.json()
    setSyncChanges((changes as SyncChange[]).map(c => ({ ...c, selected: c.type !== 'skipped' } as SyncChange)))
    setSyncDone(true)
    setSyncing(false)
  }

  async function applyChanges() {
    if (!season) return
    setApplying(true)

    const selected = syncChanges.filter(c => c.type !== 'skipped' && (c as any).selected)

    // Get current max game_number for 'new' games
    const { data: maxGame } = await supabase
      .from('games')
      .select('game_number')
      .eq('season_id', season.id)
      .order('game_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    let num = (maxGame?.game_number ?? 0) + 1

    for (const change of selected) {
      if (change.type === 'new') {
        await supabase.from('games').insert({
          season_id:   season.id,
          opponent:    change.opponent,
          game_date:   change.game_date,
          game_time:   change.game_time,
          location:    'Home',
          status:      'scheduled',
          game_number: num++,
        })
      } else if (change.type === 'changed') {
        await supabase.from('games')
          .update({ game_date: change.new_date, game_time: change.new_time })
          .eq('id', change.game_id)
      } else if (change.type === 'removed') {
        await supabase.from('games').delete().eq('id', change.game_id)
      }
    }

    setApplying(false)
    router.push('/games')
  }

  // ── Helpers ─────────────────────────────────────

  function toggleGcGame(i: number) {
    setGcGames(prev => prev.map((g, idx) => idx === i ? { ...g, selected: !g.selected } : g))
  }

  function toggleSyncChange(i: number) {
    setSyncChanges(prev => prev.map((c, idx) =>
      idx === i && c.type !== 'skipped' ? { ...c, selected: !(c as any).selected } : c
    ))
  }

  const selectedGcCount   = gcGames.filter(g => g.selected).length
  const selectedSyncCount = syncChanges.filter(c => c.type !== 'skipped' && (c as any).selected).length

  // ── Render ──────────────────────────────────────

  if (loading) return (
    <main style={{ background: s.bg, minHeight: '100vh', color: s.fg,
      fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading…
    </main>
  )

  const teamName   = (season?.team as any)?.name ?? ''
  const seasonName = season?.name ?? ''
  const hasWebcal  = !!season?.webcal_url

  return (
    <main style={{
      minHeight: '100vh', background: s.bg, color: s.fg,
      fontFamily: 'sans-serif', maxWidth: '480px', margin: '0 auto',
      padding: '1.5rem 1rem 6rem',
    }}>
      <Link href="/games" style={{ fontSize: '13px', color: s.muted,
        textDecoration: 'none', display: 'block', marginBottom: '1rem' }}>
        ‹ Games
      </Link>

      <h1 style={{ fontSize: '22px', fontWeight: 700, marginBottom: '2px' }}>Import Schedule</h1>
      {(teamName || seasonName) && (
        <div style={{ fontSize: '13px', color: s.muted, marginBottom: '1.5rem' }}>
          {teamName}{seasonName ? ` · ${seasonName}` : ''}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '1.5rem' }}>
        {(['gamechanger', 'manual', ...(hasWebcal ? ['sync' as Tab] : [])] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600,
            cursor: 'pointer', border: s.borderMd,
            background: tab === t ? s.accent : 'transparent',
            color: tab === t ? s.bg : s.muted,
          }}>
            {t === 'gamechanger' ? 'GameChanger' : t === 'manual' ? 'Add manually' : 'Check for updates'}
          </button>
        ))}
      </div>

      {/* ── TAB: GameChanger ── */}
      {tab === 'gamechanger' && (
        <div>
          {!gcDone ? (
            <>
              {/* Instructions */}
              <div style={{
                background: s.card, border: s.border, borderRadius: '10px',
                padding: '16px', marginBottom: '1.25rem',
              }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: s.accent,
                  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>
                  How to get your schedule link
                </div>
                {[
                  'Open the GameChanger app',
                  'Tap your team name, then the gear icon (top right)',
                  'Tap "Schedule Sync" → "Sync Schedule to Your Calendar"',
                  'Tap "Copy Link" instead of opening your calendar',
                  'Paste the link below',
                ].map((step, i) => (
                  <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'flex-start',
                    marginBottom: i < 4 ? '8px' : 0 }}>
                    <span style={{
                      width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
                      background: 'rgba(232,160,32,0.15)', border: '0.5px solid rgba(232,160,32,0.35)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '10px', fontWeight: 700, color: s.accent,
                    }}>{i + 1}</span>
                    <span style={{ fontSize: '13px', color: s.fg, lineHeight: 1.5 }}>{step}</span>
                  </div>
                ))}
                <div style={{ fontSize: '11px', color: s.muted, marginTop: '12px',
                  paddingTop: '10px', borderTop: s.border }}>
                  The link starts with <code style={{ color: s.accent }}>webcal://</code> — paste it as-is.
                </div>
              </div>

              {/* URL input */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '11px', color: s.muted, marginBottom: '5px' }}>
                  Webcal link
                </div>
                <input
                  value={gcUrl}
                  onChange={e => setGcUrl(e.target.value)}
                  placeholder="webcal://..."
                  style={inp()}
                  onKeyDown={e => e.key === 'Enter' && handlePreview()}
                />
              </div>

              {gcError && (
                <div style={{ fontSize: '13px', color: '#E87060',
                  background: 'rgba(192,57,43,0.1)', border: '0.5px solid rgba(192,57,43,0.3)',
                  borderRadius: '6px', padding: '10px 12px', marginBottom: '1rem' }}>
                  {gcError}
                </div>
              )}

              {gcGames.length === 0 && (
                <button onClick={handlePreview} disabled={gcPreviewing || !gcUrl.trim()} style={{
                  width: '100%', padding: '12px', borderRadius: '6px', border: 'none',
                  background: s.accent, color: s.bg, fontSize: '14px', fontWeight: 700,
                  cursor: gcPreviewing || !gcUrl.trim() ? 'not-allowed' : 'pointer',
                  opacity: gcPreviewing || !gcUrl.trim() ? 0.6 : 1,
                }}>
                  {gcPreviewing ? 'Fetching schedule…' : 'Preview games'}
                </button>
              )}

              {/* Preview list */}
              {gcGames.length > 0 && (
                <>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: s.muted,
                    textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '10px' }}>
                    {gcGames.length} games found
                  </div>

                  <div style={{ background: s.card, border: s.border, borderRadius: '10px',
                    overflow: 'hidden', marginBottom: '1rem' }}>
                    {gcGames.map((g, i) => (
                      <label key={i} style={{
                        display: 'flex', gap: '12px', alignItems: 'center',
                        padding: '12px 14px', cursor: 'pointer',
                        borderBottom: i < gcGames.length - 1 ? s.border : 'none',
                        background: g.selected ? 'transparent' : 'rgba(0,0,0,0.15)',
                      }}>
                        <input type="checkbox" checked={g.selected}
                          onChange={() => toggleGcGame(i)}
                          style={{ accentColor: s.accent, width: '16px', height: '16px', flexShrink: 0 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '14px', fontWeight: 600, color: g.selected ? s.fg : s.muted }}>
                            {g.opponent}
                          </div>
                          <div style={{ fontSize: '11px', color: s.muted, marginTop: '2px' }}>
                            {fmt(g.game_date)}{g.game_time ? ` · ${fmtTime(g.game_time)}` : ''}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Location for all */}
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{ fontSize: '11px', color: s.muted, marginBottom: '6px' }}>
                      Location (applies to all games)
                    </div>
                    <LocationPicker value={gcLocation} onChange={setGcLoc} />
                  </div>

                  <button onClick={handleImport} disabled={gcImporting || selectedGcCount === 0} style={{
                    width: '100%', padding: '13px', borderRadius: '6px', border: 'none',
                    background: s.accent, color: s.bg, fontSize: '14px', fontWeight: 700,
                    cursor: gcImporting || selectedGcCount === 0 ? 'not-allowed' : 'pointer',
                    opacity: gcImporting || selectedGcCount === 0 ? 0.6 : 1,
                  }}>
                    {gcImporting ? 'Importing…' : `Import ${selectedGcCount} game${selectedGcCount !== 1 ? 's' : ''}`}
                  </button>

                  <button onClick={() => { setGcGames([]); setGcError('') }} style={{
                    width: '100%', padding: '10px', borderRadius: '6px', marginTop: '8px',
                    border: s.borderMd, background: 'transparent',
                    color: s.muted, fontSize: '13px', cursor: 'pointer',
                  }}>
                    Try a different link
                  </button>
                </>
              )}
            </>
          ) : (
            /* Success */
            <div style={{ textAlign: 'center', padding: '2rem 0' }}>
              <div style={{ fontSize: '40px', marginBottom: '12px' }}>⚾</div>
              <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px' }}>
                {gcImportedCount} game{gcImportedCount !== 1 ? 's' : ''} imported
              </div>
              <div style={{ fontSize: '13px', color: s.muted, marginBottom: '1.5rem' }}>
                Your schedule is ready. Edit individual games to adjust lineups, location, or details.
              </div>
              <Link href="/games" style={{
                display: 'inline-block', padding: '12px 28px', borderRadius: '6px',
                background: s.accent, color: s.bg, fontWeight: 700, fontSize: '14px',
                textDecoration: 'none',
              }}>
                Go to games list →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Add manually ── */}
      {tab === 'manual' && (
        <div>
          {!season && (
            <div style={{ fontSize: '13px', color: '#E87060', background: 'rgba(192,57,43,0.1)',
              border: '0.5px solid rgba(192,57,43,0.3)', borderRadius: '8px',
              padding: '12px 14px', marginBottom: '1rem' }}>
              No active season. <Link href="/settings" style={{ color: s.accent }}>Set one up →</Link>
            </div>
          )}

          {manErr && (
            <div style={{ fontSize: '13px', color: '#E87060', background: 'rgba(192,57,43,0.1)',
              border: '0.5px solid rgba(192,57,43,0.3)', borderRadius: '6px',
              padding: '10px 12px', marginBottom: '1rem' }}>
              {manErr}
            </div>
          )}

          <div style={{ background: s.card, border: s.border, borderRadius: '10px',
            padding: '16px', marginBottom: '1.25rem' }}>

            {/* Opponent */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: s.muted, marginBottom: '5px' }}>Opponent</div>
              <input
                value={form.opponent}
                onChange={e => setForm(f => ({ ...f, opponent: e.target.value }))}
                placeholder="e.g. Tigers"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleAdd()}
                style={inp()}
              />
            </div>

            {/* Date + Time */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
              <div>
                <div style={{ fontSize: '11px', color: s.muted, marginBottom: '5px' }}>Date</div>
                <input type="date" value={form.game_date}
                  onChange={e => setForm(f => ({ ...f, game_date: e.target.value }))}
                  style={inp()} />
              </div>
              <div>
                <div style={{ fontSize: '11px', color: s.muted, marginBottom: '5px' }}>
                  Start time <span style={{ opacity: 0.55 }}>(optional)</span>
                </div>
                <input type="time" value={form.game_time}
                  onChange={e => setForm(f => ({ ...f, game_time: e.target.value }))}
                  style={inp()} />
              </div>
            </div>

            {/* Location */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '11px', color: s.muted, marginBottom: '5px' }}>Location</div>
              <LocationPicker value={form.location} onChange={v => setForm(f => ({ ...f, location: v }))} />
            </div>

            {/* Game number (read-only) */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', color: s.muted, marginBottom: '5px' }}>Game number</div>
              <div style={{
                padding: '10px 12px', borderRadius: '6px',
                border: s.border, background: 'rgba(255,255,255,0.02)',
                color: s.muted, fontSize: '14px',
              }}>
                #{nextNum}
                <span style={{ fontSize: '11px', marginLeft: '8px', opacity: 0.55 }}>
                  Auto-assigned based on your current schedule
                </span>
              </div>
            </div>

            <button onClick={handleAdd} disabled={saving || !form.opponent.trim() || !form.game_date || !season}
              style={{
                width: '100%', padding: '12px', borderRadius: '6px', border: 'none',
                background: s.accent, color: s.bg, fontSize: '14px', fontWeight: 700,
                cursor: saving || !form.opponent.trim() ? 'not-allowed' : 'pointer',
                opacity: saving || !form.opponent.trim() ? 0.6 : 1,
              }}>
              {saving ? 'Saving…' : 'Add game'}
            </button>
          </div>

          {/* Running list */}
          {added.length > 0 && (
            <>
              <div style={{ fontSize: '11px', fontWeight: 700, color: s.muted,
                textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>
                Added this session
              </div>
              <div style={{ background: s.card, border: s.border, borderRadius: '10px', overflow: 'hidden' }}>
                {added.map((g, i) => (
                  <div key={i} style={{
                    display: 'flex', gap: '10px', alignItems: 'center', padding: '11px 14px',
                    borderBottom: i < added.length - 1 ? s.border : 'none',
                  }}>
                    <span style={{ fontSize: '11px', color: s.muted, minWidth: '28px' }}>#{g.game_number}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{g.opponent}</div>
                      <div style={{ fontSize: '11px', color: s.muted, marginTop: '1px' }}>
                        {fmt(g.game_date)}{g.game_time ? ` · ${fmtTime(g.game_time)}` : ''}
                      </div>
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                      background: 'rgba(109,184,117,0.15)', color: '#6DB875',
                      border: '0.5px solid rgba(109,184,117,0.3)',
                    }}>{g.location}</span>
                    <span style={{ fontSize: '11px', color: '#6DB875' }}>✓</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── TAB: Check for updates ── */}
      {tab === 'sync' && (
        <div>
          {syncError && (
            <div style={{ fontSize: '13px', color: '#E87060', background: 'rgba(192,57,43,0.1)',
              border: '0.5px solid rgba(192,57,43,0.3)', borderRadius: '6px',
              padding: '10px 12px', marginBottom: '1rem' }}>
              {syncError}
            </div>
          )}

          {syncing && (
            <div style={{ textAlign: 'center', padding: '3rem 0', color: s.muted, fontSize: '14px' }}>
              Checking GameChanger for updates…
            </div>
          )}

          {syncDone && !syncing && (
            <>
              {syncChanges.filter(c => c.type !== 'skipped').length === 0 &&
               syncChanges.filter(c => c.type === 'skipped').length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                  <div style={{ fontSize: '28px', marginBottom: '10px' }}>✓</div>
                  <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>
                    Your schedule is up to date
                  </div>
                  <div style={{ fontSize: '13px', color: s.muted }}>
                    No changes found in GameChanger.
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ fontSize: '13px', color: s.muted, marginBottom: '1rem' }}>
                    {syncChanges.filter(c => c.type !== 'skipped').length} change{syncChanges.filter(c => c.type !== 'skipped').length !== 1 ? 's' : ''} found.
                    Select which to apply.
                  </div>

                  <div style={{ background: s.card, border: s.border, borderRadius: '10px',
                    overflow: 'hidden', marginBottom: '1.25rem' }}>
                    {syncChanges.map((c, i) => {
                      const isSkipped = c.type === 'skipped'
                      const chipColors: Record<string, { bg: string; color: string; label: string }> = {
                        new:     { bg: 'rgba(109,184,117,0.15)', color: '#6DB875', label: 'New' },
                        changed: { bg: 'rgba(232,160,32,0.15)',  color: '#E8A020', label: 'Changed' },
                        removed: { bg: 'rgba(232,80,80,0.15)',   color: '#E85050', label: 'Removed' },
                        skipped: { bg: 'rgba(245,242,235,0.08)', color: s.muted,   label: 'Skipped' },
                      }
                      const chip = chipColors[c.type]
                      const isSelected = !isSkipped && (c as any).selected

                      return (
                        <div key={i} style={{
                          display: 'flex', gap: '12px', alignItems: 'flex-start', padding: '12px 14px',
                          borderBottom: i < syncChanges.length - 1 ? s.border : 'none',
                          opacity: isSkipped ? 0.5 : 1,
                        }}>
                          {!isSkipped && (
                            <input type="checkbox" checked={isSelected}
                              onChange={() => toggleSyncChange(i)}
                              style={{ accentColor: s.accent, width: '16px', height: '16px',
                                flexShrink: 0, marginTop: '2px' }} />
                          )}
                          {isSkipped && <div style={{ width: '16px', flexShrink: 0 }} />}

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                              <span style={{ fontSize: '14px', fontWeight: 600 }}>{c.opponent}</span>
                              <span style={{
                                fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '20px',
                                background: chip.bg, color: chip.color,
                                border: `0.5px solid ${chip.color}40`,
                              }}>{chip.label}</span>
                            </div>
                            {c.type === 'new' && (
                              <div style={{ fontSize: '11px', color: s.muted }}>
                                {fmt(c.game_date)}{c.game_time ? ` · ${fmtTime(c.game_time)}` : ''}
                              </div>
                            )}
                            {c.type === 'changed' && (
                              <div style={{ fontSize: '11px', color: s.muted }}>
                                <span style={{ textDecoration: 'line-through', opacity: 0.6 }}>
                                  {fmt(c.old_date)}{c.old_time ? ` · ${fmtTime(c.old_time)}` : ''}
                                </span>
                                {' → '}
                                <span style={{ color: s.accent }}>
                                  {fmt(c.new_date)}{c.new_time ? ` · ${fmtTime(c.new_time)}` : ''}
                                </span>
                              </div>
                            )}
                            {c.type === 'removed' && (
                              <div style={{ fontSize: '11px', color: s.muted }}>
                                {fmt(c.game_date)} — will be deleted
                              </div>
                            )}
                            {c.type === 'skipped' && (
                              <div style={{ fontSize: '11px', color: s.muted }}>
                                {fmt(c.game_date)} · {c.reason}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {selectedSyncCount > 0 && (
                    <button onClick={applyChanges} disabled={applying} style={{
                      width: '100%', padding: '13px', borderRadius: '6px', border: 'none',
                      background: s.accent, color: s.bg, fontSize: '14px', fontWeight: 700,
                      cursor: applying ? 'not-allowed' : 'pointer', opacity: applying ? 0.6 : 1,
                    }}>
                      {applying ? 'Applying…' : `Apply ${selectedSyncCount} change${selectedSyncCount !== 1 ? 's' : ''}`}
                    </button>
                  )}

                  <button onClick={() => { syncLoadedRef.current = false; runSync() }} style={{
                    width: '100%', padding: '10px', borderRadius: '6px', marginTop: '8px',
                    border: s.borderMd, background: 'transparent',
                    color: s.muted, fontSize: '13px', cursor: 'pointer',
                  }}>
                    Re-check
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </main>
  )
}
