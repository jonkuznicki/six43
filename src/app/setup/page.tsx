'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import { parseRosterCsv, type ParsedPlayer } from '../../lib/parseRosterCsv'

const POSITIONS_BASEBALL = ['P','C','1B','2B','SS','3B','LF','CF','RF','Bench']
const POSITIONS_SOFTBALL = ['P','C','1B','2B','SS','3B','LF','LC','RC','RF','Bench']
const AGE_GROUPS = ['6U','7U','8U','9U','10U','11U','12U','13U','14U','15U','16U','17U','18U','Varsity','JV','Adult','Other']
const NAVY = '#0B1F3A'
const GOLD = '#E8A020'

type PlayerRow = { firstName: string; lastName: string; jersey: string }
type GameRow   = { opponent: string; date: string }

export default function SetupWizard() {
  const supabase = createClient()
  const router   = useRouter()

  const [step, setStep]     = useState(1)
  const [saving, setSaving] = useState(false)
  const teamNameRef         = useRef<HTMLInputElement>(null)
  const playerFirstRef      = useRef<HTMLInputElement>(null)
  const gameOpponentRef     = useRef<HTMLInputElement>(null)

  // ── Step 1 state ──────────────────────────────────────────────────────────
  const [teamName,       setTeamName]       = useState('')
  const [ageGroup,       setAgeGroup]       = useState('')
  const [sport,          setSport]          = useState<'baseball' | 'softball'>('baseball')
  const [seasonName,     setSeasonName]     = useState(`${new Date().getFullYear()} Season`)
  const [inningsPerGame, setInningsPerGame] = useState(6)

  // Created IDs passed to subsequent steps
  const [teamId,   setTeamId]   = useState('')
  const [seasonId, setSeasonId] = useState('')

  // ── Step 2 state ──────────────────────────────────────────────────────────
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [pFirst,  setPFirst]  = useState('')
  const [pLast,   setPLast]   = useState('')
  const [pJersey, setPJersey] = useState('')
  const [csvPreview, setCsvPreview] = useState<ParsedPlayer[] | null>(null)
  const csvInputRef = useRef<HTMLInputElement>(null)

  // ── Step 3 state ──────────────────────────────────────────────────────────
  const [games,      setGames]      = useState<GameRow[]>([])
  const [gOpponent,  setGOpponent]  = useState('')
  const [gDate,      setGDate]      = useState('')

  // Redirect away if user already has a team
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace('/login'); return }
      supabase.from('teams').select('id').eq('user_id', user.id).limit(1).then(({ data }) => {
        if (data?.length) router.replace('/games')
      })
    })
  }, [])

  // Autofocus the first field on each step
  useEffect(() => {
    if (step === 1) teamNameRef.current?.focus()
    if (step === 2) setTimeout(() => playerFirstRef.current?.focus(), 50)
    if (step === 3) setTimeout(() => gameOpponentRef.current?.focus(), 50)
  }, [step])

  // ── Step 1: create team + season ─────────────────────────────────────────
  async function finishStep1() {
    if (!teamName.trim()) return
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const positions = sport === 'softball' ? POSITIONS_SOFTBALL : POSITIONS_BASEBALL
    const { data: team } = await supabase.from('teams')
      .insert({ name: teamName.trim(), age_group: ageGroup || null, positions, user_id: user!.id })
      .select().single()
    const { data: season } = await supabase.from('seasons')
      .insert({ team_id: team!.id, name: seasonName.trim() || `${new Date().getFullYear()} Season`,
        innings_per_game: inningsPerGame, is_active: true })
      .select().single()
    setTeamId(team!.id)
    setSeasonId(season!.id)
    setSaving(false)
    setStep(2)
  }

  // ── Step 2: add players to list ───────────────────────────────────────────
  function addPlayer() {
    if (!pFirst.trim() || !pLast.trim() || !pJersey.trim()) return
    setPlayers(p => [...p, { firstName: pFirst.trim(), lastName: pLast.trim(), jersey: pJersey.trim() }])
    setPFirst(''); setPLast(''); setPJersey('')
    playerFirstRef.current?.focus()
  }

  function downloadCsvTemplate() {
    const rows = [
      'First Name,Last Name,Jersey Number,Position',
      'Alex,Smith,12,SS',
      'Jordan,Lee,7,P',
      'Taylor,Brown,21,C',
    ]
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'six43-roster-template.csv'
    a.click()
  }

  function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const text = ev.target?.result as string
      const parsed = parseRosterCsv(text)
      setCsvPreview(parsed)
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  function confirmCsvImport() {
    if (!csvPreview) return
    const toAdd: PlayerRow[] = csvPreview
      .filter(p => p.firstName || p.lastName)
      .map(p => ({ firstName: p.firstName, lastName: p.lastName, jersey: p.jersey }))
    setPlayers(prev => {
      const existing = new Set(prev.map(p => `${p.firstName}|${p.lastName}|${p.jersey}`))
      return [...prev, ...toAdd.filter(p => !existing.has(`${p.firstName}|${p.lastName}|${p.jersey}`))]
    })
    setCsvPreview(null)
  }

  async function finishStep2() {
    if (players.length > 0) {
      setSaving(true)
      await supabase.from('players').insert(
        players.map((p, i) => ({
          team_id: teamId, season_id: seasonId,
          first_name: p.firstName, last_name: p.lastName,
          jersey_number: parseInt(p.jersey), batting_pref_order: i + 1,
          status: 'active',
        }))
      )
      setSaving(false)
    }
    setStep(3)
  }

  // ── Step 3: add games to list ─────────────────────────────────────────────
  function addGame() {
    if (!gOpponent.trim() || !gDate) return
    setGames(g => [...g, { opponent: gOpponent.trim(), date: gDate }])
    setGOpponent(''); setGDate('')
    gameOpponentRef.current?.focus()
  }

  async function finish() {
    setSaving(true)
    if (games.length > 0) {
      await supabase.from('games').insert(
        games.map(g => ({
          season_id: seasonId, opponent: g.opponent, game_date: g.date,
          innings_played: inningsPerGame, status: 'scheduled',
        }))
      )
    }
    router.push('/games')
  }

  // ── Shared styles ─────────────────────────────────────────────────────────
  const input: React.CSSProperties = {
    width: '100%', padding: '11px 14px', borderRadius: 8,
    border: '0.5px solid var(--border-md)', background: 'var(--bg-input)',
    color: 'var(--fg)', fontSize: 15, boxSizing: 'border-box',
    fontFamily: 'inherit',
  }
  const label: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: `rgba(var(--fg-rgb),0.38)`,
    display: 'block', marginBottom: 6,
  }
  function chip(active: boolean): React.CSSProperties {
    return {
      padding: '5px 11px', borderRadius: 20, cursor: 'pointer', fontSize: 12,
      fontWeight: active ? 700 : 500,
      border: `1px solid ${active ? GOLD : 'var(--border-md)'}`,
      background: active ? `rgba(232,160,32,0.12)` : 'transparent',
      color: active ? GOLD : `rgba(var(--fg-rgb),0.5)`,
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'var(--bg)', overflowY: 'auto',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '0 1rem 4rem',
    }}>

      {/* ── Top bar ── */}
      <div style={{
        width: '100%', maxWidth: 500, display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
        padding: '18px 0 0',
      }}>
        <span style={{ fontWeight: 800, fontSize: 16, color: GOLD, letterSpacing: '0.04em' }}>
          SIX43
        </span>
        {step > 1 && (
          <button
            onClick={() => setStep(s => s - 1)}
            style={{ background: 'none', border: 'none', cursor: 'pointer',
              color: `rgba(var(--fg-rgb),0.35)`, fontSize: 13, padding: 0 }}
          >
            ← Back
          </button>
        )}
      </div>

      {/* ── Progress dots ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        margin: '24px 0 36px',
      }}>
        {[1,2,3].map(n => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: n === step ? 28 : 8, height: 8, borderRadius: 4,
              background: n < step ? '#6DB875' : n === step ? GOLD : `rgba(var(--fg-rgb),0.12)`,
              transition: 'all 0.25s',
            }} />
          </div>
        ))}
      </div>

      <div style={{ width: '100%', maxWidth: 500 }}>

        {/* ══════════════════════════════════════════════
            STEP 1 — Name your team
        ══════════════════════════════════════════════ */}
        {step === 1 && (
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4, lineHeight: 1.2 }}>
              Let's set up your team
            </h1>
            <p style={{ fontSize: 14, color: `rgba(var(--fg-rgb),0.45)`, marginBottom: 32 }}>
              Takes about 3 minutes. You can change everything later.
            </p>

            {/* Team name */}
            <div style={{ marginBottom: 22 }}>
              <label style={label}>Team name</label>
              <input
                ref={teamNameRef}
                value={teamName}
                onChange={e => setTeamName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && finishStep1()}
                placeholder="e.g. Northside Hawks"
                style={{ ...input, fontSize: 17, fontWeight: 600 }}
              />
            </div>

            {/* Age group */}
            <div style={{ marginBottom: 22 }}>
              <label style={label}>Age group <span style={{ fontWeight: 400, opacity: 0.6 }}>(optional)</span></label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {AGE_GROUPS.map(ag => (
                  <button key={ag} onClick={() => setAgeGroup(ag === ageGroup ? '' : ag)} style={chip(ageGroup === ag)}>
                    {ag}
                  </button>
                ))}
              </div>
            </div>

            {/* Sport */}
            <div style={{ marginBottom: 22 }}>
              <label style={label}>Sport</label>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setSport('baseball')} style={{
                  ...chip(sport === 'baseball'), flex: 1, padding: '10px',
                  fontSize: 14, borderRadius: 8,
                }}>
                  ⚾ Baseball
                </button>
                <button onClick={() => setSport('softball')} style={{
                  ...chip(sport === 'softball'), flex: 1, padding: '10px',
                  fontSize: 14, borderRadius: 8,
                }}>
                  🥎 Softball
                </button>
              </div>
            </div>

            {/* Season name */}
            <div style={{ marginBottom: 22 }}>
              <label style={label}>Season name</label>
              <input
                value={seasonName}
                onChange={e => setSeasonName(e.target.value)}
                placeholder="e.g. Spring 2026"
                style={input}
              />
            </div>

            {/* Innings per game */}
            <div style={{ marginBottom: 32 }}>
              <label style={label}>Innings per game</label>
              <div style={{ display: 'flex', gap: 10 }}>
                {[6,7,9].map(n => (
                  <button key={n} onClick={() => setInningsPerGame(n)} style={{
                    ...chip(inningsPerGame === n), flex: 1, padding: '10px',
                    fontSize: 15, fontWeight: 700, borderRadius: 8,
                  }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={finishStep1}
              disabled={!teamName.trim() || saving}
              style={primaryBtn(!teamName.trim() || saving)}
            >
              {saving ? 'Creating…' : 'Next — Add your roster →'}
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            STEP 2 — Roster
        ══════════════════════════════════════════════ */}
        {step === 2 && (
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>Add your players</h1>
            <p style={{ fontSize: 14, color: `rgba(var(--fg-rgb),0.45)`, marginBottom: 28 }}>
              Add as many or as few as you like. You can always add more from the Roster page.
            </p>

            {/* CSV import */}
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              style={{ display: 'none' }}
              onChange={handleCsvFile}
            />
            <div style={{ marginBottom: 16 }}>
              <button
                onClick={() => csvInputRef.current?.click()}
                style={{
                  width: '100%', padding: '11px', borderRadius: 8,
                  border: '0.5px dashed var(--border-md)', background: 'transparent',
                  color: `rgba(var(--fg-rgb),0.5)`, fontSize: 13, cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                ↑ Import from CSV or spreadsheet
              </button>
              <div style={{ textAlign: 'center', marginTop: 6 }}>
                <button onClick={downloadCsvTemplate} style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: `rgba(var(--fg-rgb),0.3)`, fontSize: 11, textDecoration: 'underline',
                  fontFamily: 'inherit', padding: 0,
                }}>
                  download template
                </button>
              </div>
            </div>

            {/* CSV preview */}
            {csvPreview && (
              <div style={{
                background: 'var(--bg-card)', borderRadius: 10,
                border: '0.5px solid var(--border)', marginBottom: 16, overflow: 'hidden',
              }}>
                <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border-subtle)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {csvPreview.length} player{csvPreview.length !== 1 ? 's' : ''} found in file
                  </div>
                  <button onClick={() => setCsvPreview(null)} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: `rgba(var(--fg-rgb),0.3)`, fontSize: 16, padding: 0,
                  }}>×</button>
                </div>
                <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                  {csvPreview.slice(0, 30).map((p, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 14px',
                      borderBottom: i < csvPreview.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
                    }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, width: 24, height: 24, borderRadius: '50%',
                        background: p.jersey ? 'rgba(45,106,53,0.15)' : 'rgba(var(--fg-rgb),0.07)',
                        color: p.jersey ? '#6DB875' : `rgba(var(--fg-rgb),0.3)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {p.jersey || '?'}
                      </span>
                      <span style={{ flex: 1, fontSize: 13 }}>
                        {p.firstName} {p.lastName}
                        {p.position && <span style={{ fontSize: 11, color: `rgba(var(--fg-rgb),0.4)`, marginLeft: 6 }}>{p.position}</span>}
                      </span>
                    </div>
                  ))}
                  {csvPreview.length > 30 && (
                    <div style={{ padding: '8px 14px', fontSize: 12, color: `rgba(var(--fg-rgb),0.35)`, fontStyle: 'italic' }}>
                      …and {csvPreview.length - 30} more
                    </div>
                  )}
                </div>
                <div style={{ padding: '10px 14px', borderTop: '0.5px solid var(--border-subtle)', display: 'flex', gap: 8 }}>
                  <button onClick={() => setCsvPreview(null)} style={{
                    flex: 1, padding: '9px', borderRadius: 7, border: '0.5px solid var(--border-md)',
                    background: 'transparent', color: `rgba(var(--fg-rgb),0.5)`, fontSize: 13, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}>Cancel</button>
                  <button onClick={confirmCsvImport} style={{
                    flex: 2, padding: '9px', borderRadius: 7, border: 'none',
                    background: GOLD, color: NAVY, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}>Add {csvPreview.length} player{csvPreview.length !== 1 ? 's' : ''}</button>
                </div>
              </div>
            )}

            {/* Inline add row */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 0' }}>
                <div style={{ ...label, marginBottom: 4 }}>First</div>
                <input
                  ref={playerFirstRef}
                  value={pFirst}
                  onChange={e => setPFirst(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { document.getElementById('p-last')?.focus() } }}
                  placeholder="Alex"
                  style={{ ...input, fontSize: 13 }}
                />
              </div>
              <div style={{ flex: '1 1 0' }}>
                <div style={{ ...label, marginBottom: 4 }}>Last</div>
                <input
                  id="p-last"
                  value={pLast}
                  onChange={e => setPLast(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { document.getElementById('p-jersey')?.focus() } }}
                  placeholder="Smith"
                  style={{ ...input, fontSize: 13 }}
                />
              </div>
              <div style={{ width: 64, flexShrink: 0 }}>
                <div style={{ ...label, marginBottom: 4 }}>#</div>
                <input
                  id="p-jersey"
                  value={pJersey}
                  onChange={e => setPJersey(e.target.value.replace(/\D/g, '').slice(0,2))}
                  onKeyDown={e => { if (e.key === 'Enter') addPlayer() }}
                  placeholder="12"
                  inputMode="numeric"
                  style={{ ...input, fontSize: 13, textAlign: 'center' }}
                />
              </div>
              <button
                onClick={addPlayer}
                disabled={!pFirst.trim() || !pLast.trim() || !pJersey.trim()}
                style={{
                  flexShrink: 0, padding: '11px 14px', borderRadius: 8, border: 'none',
                  background: (!pFirst.trim() || !pLast.trim() || !pJersey.trim())
                    ? `rgba(var(--fg-rgb),0.07)` : 'rgba(232,160,32,0.15)',
                  color: (!pFirst.trim() || !pLast.trim() || !pJersey.trim())
                    ? `rgba(var(--fg-rgb),0.2)` : GOLD,
                  cursor: (!pFirst.trim() || !pLast.trim() || !pJersey.trim()) ? 'not-allowed' : 'pointer',
                  fontSize: 18, fontWeight: 700, alignSelf: 'flex-end',
                }}
              >+</button>
            </div>

            {/* Player list */}
            {players.length > 0 && (
              <div style={{
                borderRadius: 10, border: '0.5px solid var(--border)',
                overflow: 'hidden', marginBottom: 24,
              }}>
                {players.map((p, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px',
                    borderBottom: i < players.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
                    background: 'var(--bg-card)',
                  }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, width: 28, height: 28,
                      borderRadius: '50%', background: 'rgba(45,106,53,0.15)',
                      color: '#6DB875', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', flexShrink: 0,
                    }}>
                      {p.jersey}
                    </span>
                    <span style={{ flex: 1, fontSize: 14 }}>{p.firstName} {p.lastName}</span>
                    <button
                      onClick={() => setPlayers(ps => ps.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                        color: `rgba(var(--fg-rgb),0.25)`, fontSize: 16, padding: '0 2px' }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            {players.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0 24px',
                color: `rgba(var(--fg-rgb),0.25)`, fontSize: 13, fontStyle: 'italic' }}>
                No players added yet
              </div>
            )}

            <button
              onClick={finishStep2}
              disabled={saving}
              style={primaryBtn(saving)}
            >
              {saving ? 'Saving…' : players.length > 0
                ? `Next — Schedule games → (${players.length} player${players.length > 1 ? 's' : ''} added)`
                : 'Next — Schedule games →'}
            </button>
            <button
              onClick={() => setStep(3)}
              style={{ display: 'block', width: '100%', marginTop: 10, background: 'none',
                border: 'none', cursor: 'pointer', color: `rgba(var(--fg-rgb),0.35)`,
                fontSize: 13, padding: '8px', textAlign: 'center' }}
            >
              Skip — I'll add players later
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            STEP 3 — Schedule
        ══════════════════════════════════════════════ */}
        {step === 3 && (
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>Schedule your games</h1>
            <p style={{ fontSize: 14, color: `rgba(var(--fg-rgb),0.45)`, marginBottom: 28 }}>
              Add a few upcoming games to get started. You can import a full schedule from the Games page later.
            </p>

            {/* Inline add row */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 0' }}>
                <div style={{ ...label, marginBottom: 4 }}>Opponent</div>
                <input
                  ref={gameOpponentRef}
                  value={gOpponent}
                  onChange={e => setGOpponent(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') document.getElementById('g-date')?.focus() }}
                  placeholder="e.g. Blue Jays"
                  style={{ ...input, fontSize: 13 }}
                />
              </div>
              <div style={{ width: 148, flexShrink: 0 }}>
                <div style={{ ...label, marginBottom: 4 }}>Date</div>
                <input
                  id="g-date"
                  type="date"
                  value={gDate}
                  onChange={e => setGDate(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addGame() }}
                  style={{ ...input, fontSize: 13 }}
                />
              </div>
              <button
                onClick={addGame}
                disabled={!gOpponent.trim() || !gDate}
                style={{
                  flexShrink: 0, padding: '11px 14px', borderRadius: 8, border: 'none',
                  background: (!gOpponent.trim() || !gDate) ? `rgba(var(--fg-rgb),0.07)` : 'rgba(232,160,32,0.15)',
                  color: (!gOpponent.trim() || !gDate) ? `rgba(var(--fg-rgb),0.2)` : GOLD,
                  cursor: (!gOpponent.trim() || !gDate) ? 'not-allowed' : 'pointer',
                  fontSize: 18, fontWeight: 700, alignSelf: 'flex-end',
                }}
              >+</button>
            </div>

            {/* Game list */}
            {games.length > 0 && (
              <div style={{
                borderRadius: 10, border: '0.5px solid var(--border)',
                overflow: 'hidden', marginBottom: 24,
              }}>
                {games.map((g, i) => (
                  <div key={i} style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 12px',
                    borderBottom: i < games.length - 1 ? '0.5px solid var(--border-subtle)' : 'none',
                    background: 'var(--bg-card)',
                  }}>
                    <span style={{ fontSize: 11, color: `rgba(var(--fg-rgb),0.4)`, flexShrink: 0 }}>
                      {new Date(g.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <span style={{ flex: 1, fontSize: 14 }}>vs {g.opponent}</span>
                    <button
                      onClick={() => setGames(gs => gs.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer',
                        color: `rgba(var(--fg-rgb),0.25)`, fontSize: 16, padding: '0 2px' }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            {games.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px 0 24px',
                color: `rgba(var(--fg-rgb),0.25)`, fontSize: 13, fontStyle: 'italic' }}>
                No games scheduled yet
              </div>
            )}

            <button
              onClick={finish}
              disabled={saving}
              style={primaryBtn(saving)}
            >
              {saving ? 'Setting up…' : games.length > 0
                ? `Go to my lineup →`
                : `Go to my lineup →`}
            </button>
            {games.length === 0 && (
              <button
                onClick={finish}
                style={{ display: 'block', width: '100%', marginTop: 10, background: 'none',
                  border: 'none', cursor: 'pointer', color: `rgba(var(--fg-rgb),0.35)`,
                  fontSize: 13, padding: '8px', textAlign: 'center' }}
              >
                Skip — I'll add games later
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function primaryBtn(disabled: boolean): React.CSSProperties {
  return {
    width: '100%', padding: '14px', borderRadius: 10, border: 'none',
    background: disabled ? `rgba(var(--fg-rgb),0.07)` : '#E8A020',
    color: disabled ? `rgba(var(--fg-rgb),0.2)` : '#0B1F3A',
    fontSize: 15, fontWeight: 800, cursor: disabled ? 'not-allowed' : 'pointer',
    transition: 'background 0.15s',
  }
}
