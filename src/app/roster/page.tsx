'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../lib/supabase'
import Link from 'next/link'
import { parseRosterCsv, type ParsedPlayer } from '../../lib/parseRosterCsv'

const POSITIONS = ['P','C','1B','2B','SS','3B','LF','CF','RF']

const POSITION_COLORS: Record<string, { bg: string; color: string }> = {
  P:    { bg: 'rgba(232,160,32,0.2)',  color: '#E8C060' },
  C:    { bg: 'rgba(192,80,120,0.2)', color: '#E090B0' },
  '1B': { bg: 'rgba(59,109,177,0.2)', color: '#80B0E8' },
  '2B': { bg: 'rgba(59,109,177,0.2)', color: '#80B0E8' },
  SS:   { bg: 'rgba(59,109,177,0.2)', color: '#80B0E8' },
  '3B': { bg: 'rgba(59,109,177,0.2)', color: '#80B0E8' },
  LF:   { bg: 'rgba(45,106,53,0.2)',  color: '#6DB875' },
  CF:   { bg: 'rgba(45,106,53,0.2)',  color: '#6DB875' },
  RF:   { bg: 'rgba(45,106,53,0.2)',  color: '#6DB875' },
}

const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  active:   { color: '#6DB875', label: 'Active' },
  inactive: { color: `rgba(var(--fg-rgb), 0.35)`, label: 'Inactive' },
  injured:  { color: '#E8A020', label: 'Injured' },
}

function PosChip({ pos }: { pos: string | null }) {
  if (!pos) return null
  const c = POSITION_COLORS[pos]
  if (!c) return null
  return (
    <span style={{
      fontSize: '11px', fontWeight: 600, padding: '2px 7px', borderRadius: '3px',
      background: c.bg, color: c.color, display: 'inline-block',
    }}>{pos}</span>
  )
}

const BLANK = { first_name: '', last_name: '', jersey_number: '', primary_position: '', status: 'active', innings_target: '' }

const EVAL_SKILLS = [
  { key: 'hitting',      label: 'Hitting',      short: 'Hit' },
  { key: 'fielding',     label: 'Fielding',      short: 'Fld' },
  { key: 'arm',          label: 'Arm',           short: 'Arm' },
  { key: 'speed',        label: 'Speed',         short: 'Spd' },
  { key: 'coachability', label: 'Coachability',  short: 'Cch' },
]

export default function RosterPage() {
  const supabase = createClient()
  const [players, setPlayers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [teamId, setTeamId] = useState<string | null>(null)
  const [seasonId, setSeasonId] = useState<string | null>(null)
  const [teamName, setTeamName] = useState('')
  const [seasonName, setSeasonName] = useState('')
  const [form, setForm] = useState<typeof BLANK | (typeof BLANK & { id: string })>(BLANK)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [reorderMode, setReorderMode] = useState(false)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [csvPreview, setCsvPreview] = useState<ParsedPlayer[] | null>(null)
  const [importingCsv, setImportingCsv] = useState(false)
  const csvInputRef = useRef<HTMLInputElement>(null)
  const [rosterView, setRosterView] = useState<'players' | 'evaluations'>('players')
  const [generatingReportId, setGeneratingReportId] = useState<string | null>(null)
  const [reportPlayer, setReportPlayer] = useState<any>(null)
  const [reportText, setReportText] = useState('')
  const [reportCopied, setReportCopied] = useState(false)
  const [evalPlayer, setEvalPlayer] = useState<any>(null)
  const [evalNotes, setEvalNotes] = useState<any[]>([])
  const [evalScores, setEvalScores] = useState<Record<string, number | null>>({})
  const [newNote, setNewNote] = useState('')
  const [newNoteDate, setNewNoteDate] = useState(new Date().toISOString().split('T')[0])
  const [evalLoading, setEvalLoading] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null)

  useEffect(() => { loadRoster() }, [])

  async function loadRoster() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const params = new URLSearchParams(window.location.search)
    const seasonIdParam = params.get('seasonId')
    const teamIdParam = params.get('teamId')

    let resolvedSeasonId: string | null = null
    let resolvedTeamId: string | null = null
    let resolvedTeamName = ''
    let resolvedSeasonName = ''

    if (seasonIdParam) {
      // Load season + its team
      const { data: season } = await supabase
        .from('seasons')
        .select('id, name, team_id, teams(name)')
        .eq('id', seasonIdParam)
        .single()
      if (!season) { setLoading(false); return }
      resolvedSeasonId = season.id
      resolvedTeamId = season.team_id
      resolvedSeasonName = season.name
      resolvedTeamName = (season as any).teams?.name ?? ''
    } else {
      // Fall back: find the active season for the given team (cookie → URL param → first team)
      const cookieMatch = document.cookie.match(/(?:^|; )selected_team_id=([^;]*)/)
      const cookieTeamId = cookieMatch ? decodeURIComponent(cookieMatch[1]) : null
      const resolvedTeamIdParam = teamIdParam ?? cookieTeamId
      const { data: team } = resolvedTeamIdParam
        ? await supabase.from('teams').select('id, name').eq('id', resolvedTeamIdParam).single()
        : await supabase.from('teams').select('id, name').order('created_at').limit(1).single()
      if (!team) { setLoading(false); return }
      resolvedTeamId = team.id
      resolvedTeamName = (team as any).name ?? ''

      const { data: season } = await supabase
        .from('seasons')
        .select('id, name')
        .eq('team_id', team.id)
        .eq('is_active', true)
        .maybeSingle()
      resolvedSeasonId = season?.id ?? null
      resolvedSeasonName = season?.name ?? ''
    }

    setTeamId(resolvedTeamId)
    setSeasonId(resolvedSeasonId)
    setTeamName(resolvedTeamName)
    setSeasonName(resolvedSeasonName)

    if (resolvedSeasonId) {
      const { data } = await supabase
        .from('players')
        .select('*')
        .eq('season_id', resolvedSeasonId)
        .order('batting_pref_order', { ascending: true, nullsFirst: false })
      setPlayers(data ?? [])
    }
    setLoading(false)
  }

  function openAdd() {
    setForm(BLANK)
    setError('')
    setShowForm(true)
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
      setCsvPreview(parseRosterCsv(text))
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function confirmCsvImport() {
    if (!csvPreview || !teamId || !seasonId) return
    setImportingCsv(true)
    const rows = csvPreview.filter(p => p.firstName || p.lastName)
    const maxOrder = players.reduce((m, p) => Math.max(m, p.batting_pref_order ?? 0), 0)
    const { data } = await supabase.from('players').insert(
      rows.map((p, i) => ({
        team_id: teamId, season_id: seasonId,
        first_name: p.firstName, last_name: p.lastName,
        jersey_number: parseInt(p.jersey) || 0,
        primary_position: p.position || null,
        batting_pref_order: maxOrder + i + 1,
        status: 'active',
      }))
    ).select()
    if (data) setPlayers(prev => [...prev, ...data])
    setCsvPreview(null)
    setImportingCsv(false)
  }

  function openEdit(player: any) {
    setForm({
      id: player.id,
      first_name: player.first_name,
      last_name: player.last_name,
      jersey_number: String(player.jersey_number),
      primary_position: player.primary_position ?? '',
      status: player.status,
      innings_target: player.innings_target != null ? String(player.innings_target) : '',
    })
    setError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setError('')
  }

  async function savePlayer() {
    if (!form.first_name.trim() || !form.last_name.trim()) {
      setError('First and last name are required.')
      return
    }
    const num = parseInt(form.jersey_number)
    if (isNaN(num) || num < 0 || num > 99) {
      setError('Jersey number must be 0–99.')
      return
    }

    setSaving(true)
    setError('')

    const targetNum = parseInt((form as any).innings_target)
    const payload = {
      first_name: form.first_name.trim(),
      last_name: form.last_name.trim(),
      jersey_number: num,
      primary_position: form.primary_position || null,
      status: form.status,
      innings_target: (!isNaN(targetNum) && targetNum > 0) ? targetNum : null,
    }

    const isEdit = 'id' in form

    if (isEdit) {
      const { error: err } = await supabase
        .from('players').update(payload).eq('id', (form as any).id)
      if (err) { setError(err.message); setSaving(false); return }
      setPlayers(prev => prev.map(p =>
        p.id === (form as any).id ? { ...p, ...payload } : p
      ))
    } else {
      if (!teamId || !seasonId) return
      const { data, error: err } = await supabase
        .from('players').insert({ ...payload, team_id: teamId, season_id: seasonId }).select().single()
      if (err) { setError(err.message); setSaving(false); return }
      setPlayers(prev => [...prev, data].sort((a, b) => a.jersey_number - b.jersey_number))
    }

    setSaving(false)
    closeForm()
  }

  async function deletePlayer(id: string) {
    setDeleting(true)
    await supabase.from('players').delete().eq('id', id)
    setPlayers(prev => prev.filter(p => p.id !== id))
    setDeleteConfirm(null)
    setDeleting(false)
  }

  async function openEval(player: any) {
    setEvalPlayer(player)
    setEvalScores(player.eval_scores ?? {})
    setEvalNotes([])
    setNewNote('')
    setNewNoteDate(new Date().toISOString().split('T')[0])
    if (!seasonId) return
    setEvalLoading(true)
    const { data } = await supabase
      .from('player_eval_notes')
      .select('*')
      .eq('player_id', player.id)
      .eq('season_id', seasonId)
      .order('note_date', { ascending: false })
    setEvalNotes(data ?? [])
    setEvalLoading(false)
  }

  async function saveScore(skill: string, value: number | null) {
    if (!evalPlayer) return
    const next = { ...evalScores, [skill]: value }
    setEvalScores(next)
    await supabase.from('players').update({ eval_scores: next }).eq('id', evalPlayer.id)
    setPlayers(prev => prev.map(p => p.id === evalPlayer.id ? { ...p, eval_scores: next } : p))
  }

  async function addNote() {
    if (!newNote.trim() || !evalPlayer || !seasonId) return
    setSavingNote(true)
    const { data } = await supabase.from('player_eval_notes').insert({
      player_id: evalPlayer.id, season_id: seasonId,
      note_date: newNoteDate, body: newNote.trim(),
    }).select().single()
    if (data) setEvalNotes(prev => [data, ...prev])
    setNewNote('')
    setSavingNote(false)
  }

  async function generateReport(player: any) {
    if (!seasonId) return
    setGeneratingReportId(player.id)
    try {
      const res = await fetch('/api/players/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerId: player.id, seasonId }),
      })
      const data = await res.json()
      if (data.report) {
        setReportPlayer(player)
        setReportText(data.report)
        setReportCopied(false)
      } else {
        alert(`Report error: ${data.error ?? 'Unknown error'}`)
      }
    } catch (e: any) {
      alert(`Request failed: ${e.message}`)
    } finally {
      setGeneratingReportId(null)
    }
  }

  async function deleteNote(noteId: string) {
    setDeletingNoteId(noteId)
    await supabase.from('player_eval_notes').delete().eq('id', noteId)
    setEvalNotes(prev => prev.filter(n => n.id !== noteId))
    setDeletingNoteId(null)
  }

  async function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); return }
    const active = players.filter(p => p.status === 'active')
    const fromIdx = active.findIndex(p => p.id === dragId)
    const toIdx = active.findIndex(p => p.id === targetId)
    if (fromIdx < 0 || toIdx < 0) { setDragId(null); return }
    const reordered = [...active]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    const updated = reordered.map((p, i) => ({ ...p, batting_pref_order: i + 1 }))
    const inactive = players.filter(p => p.status !== 'active')
    setPlayers([...updated, ...inactive])
    setDragId(null)
    setDragOverId(null)
    await Promise.all(updated.map((p, i) =>
      supabase.from('players').update({ batting_pref_order: i + 1 }).eq('id', p.id)
    ))
  }

  const active = players.filter(p => p.status === 'active')
  const inactive = players.filter(p => p.status !== 'active')

  if (loading) return (
    <main style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--fg)',
      fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading...
    </main>
  )

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '480px', margin: '0 auto',
      padding: '1.5rem 1rem 6rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <Link href="/settings" style={{
          fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`,
          textDecoration: 'none',
        }}>‹ Settings</Link>
        <div style={{ display: 'flex', gap: '8px' }}>
          {rosterView === 'players' && active.length > 1 && (
            <button onClick={() => setReorderMode(m => !m)} style={{
              fontSize: '13px', fontWeight: 600, padding: '7px 14px', borderRadius: '6px',
              border: '0.5px solid var(--border-md)',
              background: reorderMode ? 'rgba(59,109,177,0.15)' : 'var(--bg-card)',
              color: reorderMode ? '#80B0E8' : `rgba(var(--fg-rgb), 0.6)`, cursor: 'pointer',
            }}>{reorderMode ? '✓ Done' : '↕ Order'}</button>
          )}
          {rosterView === 'players' && (<>
            <input ref={csvInputRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={handleCsvFile} />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
              <button onClick={() => csvInputRef.current?.click()} disabled={!seasonId} style={{
                fontSize: '13px', fontWeight: 600, padding: '7px 14px', borderRadius: '6px',
                border: '0.5px solid var(--border-md)', background: 'transparent',
                color: seasonId ? `rgba(var(--fg-rgb), 0.6)` : `rgba(var(--fg-rgb), 0.3)`, cursor: seasonId ? 'pointer' : 'not-allowed',
              }}>↑ Import CSV</button>
              <button onClick={downloadCsvTemplate} style={{
                fontSize: '10px', background: 'none', border: 'none', cursor: 'pointer',
                color: `rgba(var(--fg-rgb), 0.3)`, padding: 0, textDecoration: 'underline',
              }}>download template</button>
            </div>
            <button onClick={openAdd} disabled={!seasonId} style={{
              fontSize: '13px', fontWeight: 600, padding: '7px 14px', borderRadius: '6px',
              border: 'none', background: seasonId ? 'var(--accent)' : 'var(--bg-card)',
              color: seasonId ? 'var(--accent-text)' : `rgba(var(--fg-rgb), 0.3)`, cursor: seasonId ? 'pointer' : 'not-allowed',
            }}>+ Add player</button>
          </>)}
        </div>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Roster</h1>
        {(teamName || seasonName) && (
          <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '2px' }}>
            {teamName}{seasonName ? ` · ${seasonName}` : ''}
          </div>
        )}
      </div>

      {/* View toggle — always visible, includes Depth Chart */}
      <div style={{ display: 'flex', background: 'var(--bg-input)', borderRadius: '6px', padding: '2px', gap: '2px', marginBottom: '1.25rem' }}>
        {(['players', 'evaluations'] as const).map(v => (
          <button key={v} onClick={() => setRosterView(v)} style={{
            flex: 1, padding: '5px 10px', borderRadius: '4px', border: 'none',
            background: rosterView === v ? 'var(--accent)' : 'transparent',
            color: rosterView === v ? 'var(--accent-text)' : `rgba(var(--fg-rgb), 0.5)`,
            fontSize: '12px', fontWeight: rosterView === v ? 700 : 400, cursor: 'pointer',
          }}>
            {v === 'players' ? 'Players' : 'Evaluations'}
          </button>
        ))}
        <Link href="/depth-chart" style={{
          flex: 1, padding: '5px 10px', borderRadius: '4px',
          background: 'transparent',
          color: `rgba(var(--fg-rgb), 0.5)`,
          fontSize: '12px', fontWeight: 400, textDecoration: 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>Depth Chart</Link>
      </div>

      {!seasonId && (
        <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`, textAlign: 'center', marginTop: '3rem' }}>
          No active season for this team.{' '}
          <Link href="/settings" style={{ color: 'var(--accent)', textDecoration: 'none' }}>Set one up in Settings →</Link>
        </div>
      )}

      {/* ── PLAYERS VIEW ── */}
      {rosterView === 'players' && (<>
        {active.length > 0 && (
          <section style={{ marginBottom: '2rem' }}>
            <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)`, textTransform: 'uppercase',
              letterSpacing: '0.08em', marginBottom: '8px' }}>
              {reorderMode ? 'Drag to set batting order' : `Active · ${active.length}`}
            </div>
            {active.map((player, idx) => (
              <div
                key={player.id}
                draggable={reorderMode}
                onDragStart={() => setDragId(player.id)}
                onDragOver={e => { e.preventDefault(); setDragOverId(player.id) }}
                onDrop={() => handleDrop(player.id)}
                onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                style={{
                  opacity: dragId === player.id ? 0.4 : 1,
                  outline: dragOverId === player.id && dragId !== player.id
                    ? '2px solid var(--accent)' : 'none',
                  borderRadius: '8px',
                  cursor: reorderMode ? 'grab' : 'default',
                }}
              >
                <PlayerRow
                  player={player}
                  onEdit={reorderMode ? () => {} : openEdit}
                  onDelete={setDeleteConfirm}
                  onEval={reorderMode ? undefined : openEval}
                  reorderMode={reorderMode}
                  order={idx + 1}
                />
              </div>
            ))}
          </section>
        )}

        {inactive.length > 0 && (
          <section>
            <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)`, textTransform: 'uppercase',
              letterSpacing: '0.08em', marginBottom: '8px' }}>
              Inactive / Injured · {inactive.length}
            </div>
            {inactive.map(player => (
              <PlayerRow key={player.id} player={player} onEdit={openEdit} onDelete={setDeleteConfirm} onEval={openEval} />
            ))}
          </section>
        )}

        {players.length === 0 && (
          <div style={{ textAlign: 'center', marginTop: '4rem', padding: '0 1rem' }}>
            <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚾</div>
            <div style={{ fontSize: '16px', fontWeight: 600, color: 'var(--fg)', marginBottom: '8px' }}>
              No players yet
            </div>
            <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`, lineHeight: 1.6, maxWidth: '260px', margin: '0 auto 20px' }}>
              Add each player on your roster so they show up in the lineup builder.
            </div>
            <button
              onClick={() => openEdit(null)}
              style={{
                fontSize: '14px', fontWeight: 700, padding: '10px 24px', borderRadius: '8px',
                border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', cursor: 'pointer',
              }}>
              + Add first player
            </button>
          </div>
        )}
      </>)}

      {/* ── EVALUATIONS VIEW ── */}
      {rosterView === 'evaluations' && (
        <div>
          <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '1.25rem', lineHeight: 1.5 }}>
            Add notes during the season using the Notes button on each player. At season end, generate a personalized evaluation summary for each player to share with families.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {players.filter(p => p.status === 'active').map(player => (
              <div key={player.id} style={{
                background: 'var(--bg-card)', border: '0.5px solid var(--border-subtle)',
                borderRadius: '8px', padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: '10px',
              }}>
                <span style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.3)`, width: '24px', textAlign: 'center', flexShrink: 0 }}>
                  {player.jersey_number}
                </span>
                <span style={{ fontSize: '14px', fontWeight: 500, flex: 1 }}>
                  {player.first_name} {player.last_name}
                </span>
                <button onClick={() => openEval(player)} style={{
                  fontSize: '12px', padding: '4px 10px', borderRadius: '4px',
                  border: '0.5px solid var(--border-md)', background: 'transparent',
                  color: `rgba(var(--fg-rgb), 0.45)`, cursor: 'pointer', flexShrink: 0,
                }}>Notes</button>
                <button
                  onClick={() => generateReport(player)}
                  disabled={generatingReportId === player.id}
                  style={{
                    fontSize: '12px', padding: '4px 10px', borderRadius: '4px',
                    border: 'none', background: generatingReportId === player.id ? 'rgba(59,109,177,0.15)' : 'rgba(59,109,177,0.2)',
                    color: generatingReportId === player.id ? `rgba(var(--fg-rgb), 0.3)` : '#80B0E8',
                    cursor: generatingReportId === player.id ? 'not-allowed' : 'pointer', flexShrink: 0,
                    fontWeight: 600,
                  }}
                >
                  {generatingReportId === player.id ? '…' : '✦ Report'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ADD / EDIT FORM ── */}
      {showForm && (
        <div onClick={closeForm} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg2)', borderRadius: '16px 16px 0 0', padding: '1.5rem',
            width: '100%', maxWidth: '480px', border: '0.5px solid var(--border)',
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '1.25rem' }}>
              {'id' in form ? 'Edit player' : 'Add player'}
            </div>

            {error && (
              <div style={{ fontSize: '12px', color: '#E87060', background: 'rgba(192,57,43,0.15)',
                border: '0.5px solid rgba(192,57,43,0.3)', borderRadius: '6px',
                padding: '8px 12px', marginBottom: '12px' }}>
                {error}
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <Field label="First name">
                <input value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))}
                  placeholder="First" style={inputStyle} />
              </Field>
              <Field label="Last name">
                <input value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))}
                  placeholder="Last" style={inputStyle} />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <Field label="Jersey #">
                <input value={form.jersey_number} onChange={e => setForm(f => ({ ...f, jersey_number: e.target.value }))}
                  placeholder="0–99" type="number" min={0} max={99} style={inputStyle} />
              </Field>
              <Field label="Position">
                <select value={form.primary_position} onChange={e => setForm(f => ({ ...f, primary_position: e.target.value }))}
                  style={inputStyle}>
                  <option value="">—</option>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </Field>
              <Field label="Min inn">
                <input value={(form as any).innings_target} onChange={e => setForm(f => ({ ...f, innings_target: e.target.value.replace(/\D/g, '') }))}
                  placeholder="—" type="text" inputMode="numeric" style={inputStyle} />
              </Field>
              <Field label="Status">
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  style={inputStyle}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                  <option value="injured">Injured</option>
                </select>
              </Field>
            </div>

            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              {'id' in form && (
                <button onClick={() => { closeForm(); setDeleteConfirm((form as any).id) }}
                  style={{ padding: '11px 16px', borderRadius: '6px', border: '0.5px solid rgba(192,57,43,0.3)',
                    background: 'transparent', color: 'rgba(232,100,80,0.7)', fontSize: '13px', cursor: 'pointer' }}>
                  Delete
                </button>
              )}
              <button onClick={closeForm} style={{
                flex: 1, padding: '11px', borderRadius: '6px',
                border: '0.5px solid var(--border-strong)', background: 'transparent',
                color: `rgba(var(--fg-rgb), 0.6)`, fontSize: '13px', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={savePlayer} disabled={saving} style={{
                flex: 2, padding: '11px', borderRadius: '6px', border: 'none',
                background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '13px', fontWeight: 700,
                cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
              }}>{saving ? 'Saving…' : ('id' in form ? 'Save changes' : 'Add player')}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── EVAL BOTTOM SHEET ── */}
      {evalPlayer && (
        <div onClick={() => setEvalPlayer(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg2)', borderRadius: '16px 16px 0 0', padding: '1.5rem',
            width: '100%', maxWidth: '480px', border: '0.5px solid var(--border)',
            maxHeight: '85vh', overflowY: 'auto',
          }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 700 }}>
                  #{evalPlayer.jersey_number} {evalPlayer.first_name} {evalPlayer.last_name}
                </div>
                <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '2px' }}>
                  {evalPlayer.primary_position ?? 'No position'} · Player evaluation
                </div>
              </div>
              <button onClick={() => setEvalPlayer(null)} style={{
                fontSize: '22px', lineHeight: 1, background: 'none', border: 'none',
                color: `rgba(var(--fg-rgb), 0.35)`, cursor: 'pointer', padding: '0 4px',
              }}>×</button>
            </div>

            {/* Skill scores */}
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: `rgba(var(--fg-rgb), 0.35)`,
                textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
                Skill Scores
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {EVAL_SKILLS.map(skill => {
                  const current = evalScores[skill.key] ?? null
                  return (
                    <div key={skill.key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ fontSize: '13px', width: '90px', flexShrink: 0 }}>{skill.label}</div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {[1, 2, 3, 4, 5].map(v => (
                          <button key={v} onClick={() => saveScore(skill.key, current === v ? null : v)} style={{
                            width: '32px', height: '32px', borderRadius: '6px', border: 'none',
                            background: current === v
                              ? (v >= 4 ? '#2A6633' : v >= 3 ? 'rgba(59,109,177,0.5)' : 'rgba(180,60,40,0.35)')
                              : 'var(--bg-input)',
                            color: current === v
                              ? (v >= 4 ? '#6DB875' : v >= 3 ? '#80B0E8' : '#E87060')
                              : `rgba(var(--fg-rgb), 0.35)`,
                            fontWeight: current === v ? 700 : 400,
                            fontSize: '14px', cursor: 'pointer', flexShrink: 0,
                          }}>{v}</button>
                        ))}
                      </div>
                      {current !== null && (
                        <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.3)` }}>
                          {current >= 4 ? 'Strong' : current >= 3 ? 'Average' : 'Needs work'}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Add note */}
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: `rgba(var(--fg-rgb), 0.35)`,
                textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
                Add Note
              </div>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <input
                  type="date"
                  value={newNoteDate}
                  onChange={e => setNewNoteDate(e.target.value)}
                  style={{ ...inputStyle, width: 'auto', flex: '0 0 auto' }}
                />
              </div>
              <textarea
                value={newNote}
                onChange={e => setNewNote(e.target.value)}
                placeholder="Add an observation or note…"
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
              <button onClick={addNote} disabled={savingNote || !newNote.trim()} style={{
                marginTop: '8px', width: '100%', padding: '10px', borderRadius: '6px',
                border: 'none', background: 'var(--accent)', color: 'var(--accent-text)',
                fontSize: '13px', fontWeight: 700, cursor: savingNote || !newNote.trim() ? 'not-allowed' : 'pointer',
                opacity: savingNote || !newNote.trim() ? 0.5 : 1,
              }}>{savingNote ? 'Saving…' : 'Add Note'}</button>
            </div>

            {/* Notes log */}
            <div>
              <div style={{ fontSize: '11px', fontWeight: 700, color: `rgba(var(--fg-rgb), 0.35)`,
                textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: '10px' }}>
                Notes {evalNotes.length > 0 ? `· ${evalNotes.length}` : ''}
              </div>
              {evalLoading ? (
                <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.35)`, textAlign: 'center', padding: '1rem 0' }}>Loading…</div>
              ) : evalNotes.length === 0 ? (
                <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.3)`, textAlign: 'center', padding: '1rem 0' }}>No notes yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {evalNotes.map(note => (
                    <div key={note.id} style={{
                      background: 'var(--bg-card)', borderRadius: '8px', padding: '10px 12px',
                      border: '0.5px solid var(--border-subtle)',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, flexShrink: 0 }}>
                          {new Date(note.note_date + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <button
                          onClick={() => deleteNote(note.id)}
                          disabled={deletingNoteId === note.id}
                          style={{ fontSize: '12px', background: 'none', border: 'none',
                            color: `rgba(var(--fg-rgb), 0.25)`, cursor: 'pointer', flexShrink: 0, padding: 0 }}
                        >✕</button>
                      </div>
                      <div style={{ fontSize: '13px', marginTop: '4px', lineHeight: 1.5 }}>{note.body}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CSV IMPORT PREVIEW ── */}
      {csvPreview && (
        <div onClick={() => setCsvPreview(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg2)', borderRadius: '16px 16px 0 0', padding: '1.5rem',
            width: '100%', maxWidth: '480px', border: '0.5px solid var(--border)',
            maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontSize: '16px', fontWeight: 700 }}>
                {csvPreview.length} player{csvPreview.length !== 1 ? 's' : ''} found
              </div>
              <button onClick={() => setCsvPreview(null)} style={{
                fontSize: '22px', lineHeight: 1, background: 'none', border: 'none',
                color: `rgba(var(--fg-rgb), 0.35)`, cursor: 'pointer', padding: '0 4px',
              }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1rem' }}>
              {csvPreview.slice(0, 50).map((p, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '7px 0',
                  borderBottom: '0.5px solid var(--border-subtle)',
                }}>
                  <span style={{
                    fontSize: '11px', fontWeight: 700, width: '28px', height: '28px', borderRadius: '50%',
                    background: p.jersey ? 'rgba(45,106,53,0.15)' : 'rgba(var(--fg-rgb),0.07)',
                    color: p.jersey ? '#6DB875' : `rgba(var(--fg-rgb),0.3)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>{p.jersey || '?'}</span>
                  <span style={{ flex: 1, fontSize: '13px' }}>
                    {p.firstName} {p.lastName}
                    {p.position && <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb),0.4)`, marginLeft: '6px' }}>{p.position}</span>}
                  </span>
                </div>
              ))}
              {csvPreview.length > 50 && (
                <div style={{ padding: '8px 0', fontSize: '12px', color: `rgba(var(--fg-rgb),0.35)`, fontStyle: 'italic' }}>
                  …and {csvPreview.length - 50} more
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setCsvPreview(null)} style={{
                flex: 1, padding: '11px', borderRadius: '7px', border: '0.5px solid var(--border-strong)',
                background: 'transparent', color: `rgba(var(--fg-rgb),0.6)`, fontSize: '13px', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={confirmCsvImport} disabled={importingCsv} style={{
                flex: 2, padding: '11px', borderRadius: '7px', border: 'none',
                background: 'var(--accent)', color: 'var(--accent-text)',
                fontSize: '13px', fontWeight: 700, cursor: importingCsv ? 'not-allowed' : 'pointer',
                opacity: importingCsv ? 0.7 : 1,
              }}>{importingCsv ? 'Importing…' : `Import ${csvPreview.length} player${csvPreview.length !== 1 ? 's' : ''}`}</button>
            </div>
          </div>
        </div>
      )}

      {/* ── REPORT MODAL ── */}
      {reportPlayer && reportText && (
        <div onClick={() => setReportPlayer(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 300,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg2)', borderRadius: '16px 16px 0 0', padding: '1.5rem',
            width: '100%', maxWidth: '480px', border: '0.5px solid var(--border)',
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontSize: '17px', fontWeight: 700 }}>
                  {reportPlayer.first_name} {reportPlayer.last_name}
                </div>
                <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '2px' }}>
                  End-of-season evaluation
                </div>
              </div>
              <button onClick={() => setReportPlayer(null)} style={{
                fontSize: '22px', lineHeight: 1, background: 'none', border: 'none',
                color: `rgba(var(--fg-rgb), 0.35)`, cursor: 'pointer', padding: '0 4px',
              }}>×</button>
            </div>
            <div style={{
              flex: 1, overflowY: 'auto', fontSize: '14px', lineHeight: 1.7,
              color: `rgba(var(--fg-rgb), 0.85)`, marginBottom: '1rem',
              whiteSpace: 'pre-wrap',
            }}>
              {reportText}
            </div>
            <button
              onClick={() => {
                navigator.clipboard.writeText(reportText)
                setReportCopied(true)
                setTimeout(() => setReportCopied(false), 2500)
              }}
              style={{
                width: '100%', padding: '11px', borderRadius: '7px', border: 'none',
                background: reportCopied ? 'rgba(45,106,53,0.3)' : 'var(--accent)',
                color: reportCopied ? '#6DB875' : 'var(--accent-text)',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              {reportCopied ? '✓ Copied to clipboard' : 'Copy to clipboard'}
            </button>
          </div>
        </div>
      )}

      {/* ── DELETE CONFIRM ── */}
      {deleteConfirm && (
        <div onClick={() => setDeleteConfirm(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg2)', borderRadius: '12px', padding: '1.5rem',
            width: '300px', border: '0.5px solid rgba(192,57,43,0.3)',
          }}>
            <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Remove player?</div>
            <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.5)`, marginBottom: '1.5rem' }}>
              This will permanently remove the player and all their lineup history. This cannot be undone.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setDeleteConfirm(null)} style={{
                flex: 1, padding: '10px', borderRadius: '6px',
                border: '0.5px solid var(--border-strong)', background: 'transparent',
                color: `rgba(var(--fg-rgb), 0.6)`, fontSize: '13px', cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={() => deletePlayer(deleteConfirm)} disabled={deleting} style={{
                flex: 1, padding: '10px', borderRadius: '6px', border: 'none',
                background: '#C0392B', color: 'white', fontSize: '13px', fontWeight: 600,
                cursor: deleting ? 'not-allowed' : 'pointer', opacity: deleting ? 0.7 : 1,
              }}>{deleting ? 'Removing…' : 'Yes, remove'}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function PlayerRow({ player, onEdit, onDelete, onEval, reorderMode, order }: {
  player: any
  onEdit: (p: any) => void
  onDelete: (id: string) => void
  onEval?: (p: any) => void
  reorderMode?: boolean
  order?: number
}) {
  const statusStyle = STATUS_STYLES[player.status] ?? STATUS_STYLES.inactive
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '10px 12px',
      background: 'var(--bg-card)',
      border: '0.5px solid var(--border-subtle)',
      borderRadius: '8px', marginBottom: '4px',
      opacity: player.status === 'inactive' ? 0.6 : 1,
    }}>
      {reorderMode ? (
        <span style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.3)`, width: '24px',
          textAlign: 'center', flexShrink: 0, userSelect: 'none' }}>
          {order}
        </span>
      ) : (
        <span style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.3)`, width: '24px',
          textAlign: 'center', flexShrink: 0 }}>
          {player.jersey_number}
        </span>
      )}
      <span style={{ fontSize: '14px', fontWeight: 500, flex: 1 }}>
        {player.first_name} {player.last_name}
      </span>
      {!reorderMode && <PosChip pos={player.primary_position} />}
      {!reorderMode && player.innings_target != null && (
        <span style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.35)`, flexShrink: 0 }}>
          {player.innings_target} inn min
        </span>
      )}
      {!reorderMode && (
        <span style={{ fontSize: '11px', color: statusStyle.color, flexShrink: 0 }}>
          {player.status !== 'active' ? statusStyle.label : ''}
        </span>
      )}
      {reorderMode ? (
        <span style={{ fontSize: '16px', color: `rgba(var(--fg-rgb), 0.2)`, flexShrink: 0 }}>⠿</span>
      ) : (<>
        {onEval && (
          <button onClick={() => onEval(player)} style={{
            fontSize: '12px', padding: '4px 10px', borderRadius: '4px',
            border: '0.5px solid var(--border-md)', background: 'transparent',
            color: `rgba(var(--fg-rgb), 0.45)`, cursor: 'pointer', flexShrink: 0,
          }}>Eval</button>
        )}
        <button onClick={() => onEdit(player)} style={{
          fontSize: '12px', padding: '4px 10px', borderRadius: '4px',
          border: '0.5px solid var(--border-md)', background: 'transparent',
          color: `rgba(var(--fg-rgb), 0.45)`, cursor: 'pointer', flexShrink: 0,
        }}>Edit</button>
      </>)}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '4px' }}>{label}</div>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 10px', borderRadius: '6px',
  border: '0.5px solid var(--border-md)',
  background: 'var(--bg-input)', color: 'var(--fg)',
  fontSize: '13px', boxSizing: 'border-box',
}
