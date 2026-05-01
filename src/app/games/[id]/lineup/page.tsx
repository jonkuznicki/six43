'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../../../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import PrintLineupCard from '../PrintLineupCard'
import FieldView from './desktop/FieldView'

const POSITION_COLORS: Record<string, { bg: string; color: string }> = {
  P:     { bg: 'rgba(75,156,211,0.25)',    color: '#4B9CD3' },
  C:     { bg: 'rgba(192,80,120,0.25)',   color: '#E090B0' },
  '1B':  { bg: 'rgba(59,109,177,0.25)',   color: '#80B0E8' },
  '2B':  { bg: 'rgba(59,109,177,0.25)',   color: '#80B0E8' },
  SS:    { bg: 'rgba(59,109,177,0.25)',   color: '#80B0E8' },
  '3B':  { bg: 'rgba(59,109,177,0.25)',   color: '#80B0E8' },
  LF:    { bg: 'rgba(45,106,53,0.25)',    color: '#6DB875' },
  CF:    { bg: 'rgba(45,106,53,0.25)',    color: '#6DB875' },
  LC:    { bg: 'rgba(45,106,53,0.25)',    color: '#6DB875' },
  RC:    { bg: 'rgba(45,106,53,0.25)',    color: '#6DB875' },
  RF:    { bg: 'rgba(45,106,53,0.25)',    color: '#6DB875' },
  Bench: { bg: 'rgba(100,100,100,0.15)', color: `rgba(var(--fg-rgb), 0.4)` },
}

export default function LineupBuilder({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const router = useRouter()
  const [game, setGame] = useState<any>(null)
  const [slots, setSlots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editorMode, setEditorMode] = useState<'paint' | 'pick'>('pick')

  // Redirect desktop browsers to the full desktop editor
  useEffect(() => {
    if (window.innerWidth >= 960) router.replace(`/games/${params.id}/lineup/desktop`)
  }, [])
  const [activePosition, setActivePosition] = useState<string>('P')
  const [pickTarget, setPickTarget] = useState<{ slotId: string; inningIndex: number } | null>(null)
  const [reorderMode, setReorderMode] = useState(false)
  const [dragSlotId, setDragSlotId] = useState<string | null>(null)
  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null)
  const [showHelp, setShowHelp] = useState(false)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [showCopyPicker, setShowCopyPicker] = useState(false)
  const [copyGames, setCopyGames] = useState<any[]>([])
  const [copyGameId, setCopyGameId] = useState<string>('')
  const [copyMode, setCopyMode] = useState<'full' | 'order'>('full')
  const [copying, setCopying] = useState(false)
  const [viewMode, setViewMode] = useState<'grid' | 'field'>('grid')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [teamName, setTeamName] = useState<string | undefined>(undefined)
  const [teamPositions, setTeamPositions] = useState<string[]>(
    ['P','C','1B','2B','SS','3B','LF','CF','RF','Bench']
  )
  const [restrictedSet, setRestrictedSet] = useState<Set<string>>(new Set())
  const [dcWarning, setDcWarning] = useState<string | null>(null)
  const [statusSaving, setStatusSaving] = useState(false)
  const [gameScore, setGameScore] = useState<{ us: number; them: number } | null>(null)
  const [showScoreEdit, setShowScoreEdit] = useState(false)
  const [scoreUs, setScoreUs] = useState('')
  const [scoreThem, setScoreThem] = useState('')
  const notesRawRef = useRef<string | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: gameData } = await supabase
      .from('games')
      .select('*, season:seasons(team:teams(name, positions))')
      .eq('id', params.id).single()
    setGame(gameData)
    const rawNotes = (gameData as any)?.notes ?? null
    notesRawRef.current = rawNotes
    try {
      const parsed = JSON.parse(rawNotes ?? '{}')
      if (parsed._score) setGameScore({ us: parsed._score.us, them: parsed._score.them })
    } catch {}
    const team = (gameData as any)?.season?.team
    if (team?.name) setTeamName(team.name)
    if (team?.positions?.length) {
      setTeamPositions(team.positions)
      setActivePosition(team.positions[0] ?? 'P')
    }

    let { data: slotData } = await supabase
      .from('lineup_slots')
      .select('*, player:players(first_name, last_name, jersey_number, innings_target)')
      .eq('game_id', params.id)
      .order('batting_order', { ascending: true, nullsFirst: false })

    // Auto-initialize from roster if no slots exist yet
    if (!slotData?.length && gameData?.season_id) {
      const { data: rosterPlayers } = await supabase
        .from('players')
        .select('id, first_name, last_name, jersey_number, batting_pref_order, innings_target')
        .eq('season_id', gameData.season_id)
        .eq('status', 'active')
        .order('batting_pref_order', { ascending: true, nullsFirst: false })
      if (rosterPlayers?.length) {
        await supabase.from('lineup_slots').insert(
          rosterPlayers.map((p, i) => ({
            game_id: params.id, player_id: p.id,
            batting_order: i + 1, availability: 'available',
            inning_positions: [null,null,null,null,null,null,null,null,null],
          }))
        )
        const { data: fresh } = await supabase
          .from('lineup_slots')
          .select('*, player:players(first_name, last_name, jersey_number, innings_target)')
          .eq('game_id', params.id)
          .order('batting_order', { ascending: true, nullsFirst: false })
        slotData = fresh
      }
    }

    setSlots(slotData ?? [])

    if (gameData?.season_id) {
      const { data: dcRows } = await supabase
        .from('depth_chart')
        .select('player_id, position')
        .eq('season_id', gameData.season_id)
        .eq('restricted', true)
      setRestrictedSet(new Set((dcRows ?? []).map((r: any) => `${r.player_id}::${r.position}`)))
    }

    setLoading(false)
  }

  // ── BATTING ORDER ──────────────────────────────────────────
  async function moveBattingOrder(slotId: string, direction: 'up' | 'down') {
    const active = slots.filter(s => s.availability !== 'absent')
    const idx = active.findIndex(s => s.id === slotId)
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === active.length - 1) return

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    const reordered = [...active]
    ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]

    const updatedActive = reordered.map((s, i) => ({ ...s, batting_order: i + 1 }))
    setSlots(prev => [...updatedActive, ...prev.filter(s => s.availability === 'absent')])

    const [r1, r2] = await Promise.all([
      supabase.from('lineup_slots').update({ batting_order: swapIdx + 1 }).eq('id', reordered[swapIdx].id),
      supabase.from('lineup_slots').update({ batting_order: idx + 1 }).eq('id', reordered[idx].id),
    ])
    if (r1.error || r2.error) setSaveError('Could not save batting order. You may not have permission to edit this lineup.')
  }

  // ── DRAG & DROP ────────────────────────────────────────────
  async function handleDrop(e: React.DragEvent, targetSlotId: string) {
    e.preventDefault()
    setDragOverSlotId(null)
    if (!dragSlotId || dragSlotId === targetSlotId) { setDragSlotId(null); return }
    const activeSlots = slots.filter(s => s.availability !== 'absent')
    const fromIdx = activeSlots.findIndex(s => s.id === dragSlotId)
    const toIdx = activeSlots.findIndex(s => s.id === targetSlotId)
    if (fromIdx === -1 || toIdx === -1) { setDragSlotId(null); return }
    const reordered = [...activeSlots]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)
    const updated = reordered.map((s, i) => ({ ...s, batting_order: i + 1 }))
    setSlots(prev => [...updated, ...prev.filter(s => s.availability === 'absent')])
    setDragSlotId(null)
    const results = await Promise.all(
      updated.map(s => supabase.from('lineup_slots').update({ batting_order: s.batting_order }).eq('id', s.id))
    )
    if (results.some(r => r.error)) setSaveError('Could not save batting order. You may not have permission to edit this lineup.')
  }

  // ── AVAILABILITY ───────────────────────────────────────────
  async function toggleAvailability(slotId: string) {
    const slot = slots.find(s => s.id === slotId)
    if (!slot) return
    const newAvail = slot.availability === 'absent' ? 'available' : 'absent'
    const newPositions = newAvail === 'absent' ? [null,null,null,null,null,null,null,null,null] : slot.inning_positions
    setSlots(prev => prev.map(s =>
      s.id === slotId ? { ...s, availability: newAvail, inning_positions: newPositions } : s
    ))
    await supabase.from('lineup_slots').update({ availability: newAvail, inning_positions: newPositions }).eq('id', slotId)
  }

  // ── STATUS & SCORE ─────────────────────────────────────────
  async function saveStatus(newStatus: string) {
    setStatusSaving(true)
    setGame((g: any) => ({ ...g, status: newStatus }))
    await supabase.from('games').update({ status: newStatus }).eq('id', params.id)
    setStatusSaving(false)
  }

  async function saveScore() {
    const us   = parseInt(scoreUs)   || 0
    const them = parseInt(scoreThem) || 0
    let parsed: any = {}
    try { parsed = JSON.parse(notesRawRef.current ?? '{}') } catch {}
    parsed._score = { us, them }
    const newRaw = JSON.stringify(parsed)
    await supabase.from('games').update({ notes: newRaw }).eq('id', params.id)
    notesRawRef.current = newRaw
    setGameScore({ us, them })
    setShowScoreEdit(false)
  }

  // ── INNINGS COUNT ──────────────────────────────────────────
  async function changeInnings(delta: number) {
    const current = game?.innings_played ?? 6
    const next = Math.min(9, Math.max(6, current + delta))
    if (next === current) return
    setGame((g: any) => ({ ...g, innings_played: next }))
    await supabase.from('games').update({ innings_played: next }).eq('id', params.id)
  }

  // ── CLEAR LINEUP ───────────────────────────────────────────
  async function clearGame() {
    setClearing(true)
    const blank = [null,null,null,null,null,null,null,null,null]
    setSlots(prev => prev.map(s => ({ ...s, inning_positions: blank })))
    for (const slot of slots) {
      await supabase.from('lineup_slots').update({ inning_positions: blank }).eq('id', slot.id)
    }
    setShowClearConfirm(false)
    setClearing(false)
  }

  // ── COPY FROM PREVIOUS GAME ───────────────────────────────
  async function openCopyPicker() {
    if (!game?.season_id) return
    const { data } = await supabase
      .from('games')
      .select('id, opponent, game_date')
      .eq('season_id', game.season_id)
      .neq('id', params.id)
      .order('game_date', { ascending: false })
    const games = data ?? []
    setCopyGames(games)
    setCopyGameId(games[0]?.id ?? '')
    setCopyMode('full')
    setShowCopyPicker(true)
  }

  async function doCopy() {
    if (!copyGameId) return
    setCopying(true)

    const { data: sourceSlots } = await supabase
      .from('lineup_slots')
      .select('player_id, batting_order, inning_positions, availability')
      .eq('game_id', copyGameId)

    if (!sourceSlots || sourceSlots.length === 0) { setCopying(false); return }

    const sourceByPlayer = new Map(sourceSlots.map((s: any) => [s.player_id, s]))
    const blank = [null,null,null,null,null,null,null,null,null]

    // Build updated slots — only touch players present in both games
    const updates = slots
      .filter(s => s.availability !== 'absent' && sourceByPlayer.has(s.player_id))
      .map(s => {
        const src = sourceByPlayer.get(s.player_id)
        return {
          id: s.id,
          batting_order: src.batting_order,
          inning_positions: copyMode === 'full' ? src.inning_positions : blank,
        }
      })

    // Optimistic update
    setSlots(prev => {
      const updateMap = new Map(updates.map(u => [u.id, u]))
      const updated = prev.map(s => updateMap.has(s.id)
        ? { ...s, ...updateMap.get(s.id) }
        : s
      )
      // Re-sort active slots by new batting_order
      const active = updated
        .filter(s => s.availability !== 'absent')
        .sort((a, b) => (a.batting_order ?? 0) - (b.batting_order ?? 0))
      return [...active, ...updated.filter(s => s.availability === 'absent')]
    })

    // Persist
    await Promise.all(updates.map(u =>
      supabase.from('lineup_slots').update({
        batting_order: u.batting_order,
        inning_positions: u.inning_positions,
      }).eq('id', u.id)
    ))

    setCopying(false)
    setShowCopyPicker(false)
  }

  // ── ASSIGN POSITION (shared by both modes) ─────────────────
  async function assignPosition(slotId: string, inningIndex: number, newPos: string | null) {
    const slot = slots.find(s => s.id === slotId)
    if (!slot) return

    if (newPos && newPos !== 'Bench' && restrictedSet.has(`${slot.player_id}::${newPos}`)) {
      const name = slot.player?.first_name ?? 'This player'
      setDcWarning(`${name} is marked "should not play" at ${newPos} in the Depth Chart.`)
    }

    setSlots(prev => {
      const next = prev.map(s => ({ ...s, inning_positions: [...s.inning_positions] }))
      if (newPos && newPos !== 'Bench') {
        const holder = next.find(s => s.id !== slotId && s.inning_positions[inningIndex] === newPos)
        if (holder) holder.inning_positions[inningIndex] = 'Bench'
      }
      const me = next.find(s => s.id === slotId)
      if (me) me.inning_positions[inningIndex] = newPos
      return next
    })

    const updatedPositions = [...slot.inning_positions]
    updatedPositions[inningIndex] = newPos
    await supabase.from('lineup_slots').update({ inning_positions: updatedPositions }).eq('id', slotId)

    if (newPos && newPos !== 'Bench') {
      const holder = slots.find(s => s.id !== slotId && s.inning_positions[inningIndex] === newPos)
      if (holder) {
        const holderUpdated = [...holder.inning_positions]
        holderUpdated[inningIndex] = 'Bench'
        await supabase.from('lineup_slots').update({ inning_positions: holderUpdated }).eq('id', holder.id)
      }
    }
  }

  // ── PAINT CELL (paint mode: toggle active position) ────────
  function paintCell(slotId: string, inningIndex: number) {
    const slot = slots.find(s => s.id === slotId)
    if (!slot) return
    const currentPos = slot.inning_positions[inningIndex]
    const newPos: string | null = currentPos === activePosition ? null : activePosition
    return assignPosition(slotId, inningIndex, newPos)
  }

  function getInningCounts(inningIndex: number) {
    const counts: Record<string, number> = {}
    for (const slot of slots) {
      if (slot.availability === 'absent') continue
      const pos = slot.inning_positions[inningIndex]
      if (pos) counts[pos] = (counts[pos] || 0) + 1
    }
    return counts
  }

  function getInningStatus(inningIndex: number): 'complete' | 'duplicate' | number {
    const active = slots.filter(s => s.availability !== 'absent')
    const counts = getInningCounts(inningIndex)
    const hasDupe = Object.entries(counts).some(([pos, v]) => pos !== 'Bench' && v > 1)
    if (hasDupe) return 'duplicate'
    const unassigned = active.filter(s => !(s.inning_positions ?? [])[inningIndex]).length
    if (unassigned > 0) return unassigned
    return 'complete'
  }

  if (loading) return (
    <main style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--fg)',
      fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading...
    </main>
  )

  const activeSlots = slots.filter(s => s.availability !== 'absent')
  const absentSlots = slots.filter(s => s.availability === 'absent')
  const inningCount = game?.innings_played ?? 6
  const innings = Array.from({ length: inningCount }, (_, i) => i)

  function isPositionComplete(pos: string) {
    if (pos === 'Bench') return false
    return innings.every(i => activeSlots.some(s => s.inning_positions[i] === pos))
  }
  const COL_NUM = 28
  const COL_NAME = 110
  const COL_INN = 42
  const COL_STATUS = 24
  const reorderWidth = reorderMode ? 56 : 0

  return (
    <>
      <style>{`
        .print-sheet { display: none; }
        @media print {
          .screen-only { display: none !important; }
          .print-sheet { display: block !important; }
          @page { size: letter portrait; margin: 0.3in 0.35in; }
          body { background: white !important; }
        }
      `}</style>

      {/* Print sheet */}
      <div className="print-sheet">
        <PrintLineupCard
          game={game}
          activeSlots={activeSlots}
          innings={innings}
          teamName={teamName}
        />
      </div>

      <main className="screen-only" style={{
        minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
        fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto', paddingBottom: '6rem',
      }}>

        {/* ── HEADER ── */}
        <div style={{ padding: '1rem 1rem 0' }}>
          <Link href="/games" style={{
            fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`,
            textDecoration: 'none', display: 'block', marginBottom: '0.75rem',
          }}>
            ‹ All games
          </Link>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div>
              <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>
                vs {game?.opponent}
              </h1>
              {game?.game_date && (
                <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.45)`, marginTop: '2px' }}>
                  {new Date(game.game_date + 'T12:00:00').toLocaleDateString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric',
                  })}
                </div>
              )}
            </div>
            <Link href="/games" style={{
              padding: '8px 16px', borderRadius: '6px',
              background: 'var(--accent)', color: 'var(--accent-text)',
              fontSize: '13px', fontWeight: 700, textDecoration: 'none',
            }}>
              Done
            </Link>
          </div>

          {/* Status + score row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
            <select
              value={game?.status ?? 'scheduled'}
              onChange={e => !statusSaving && saveStatus(e.target.value)}
              disabled={statusSaving}
              style={{
                padding: '5px 8px', borderRadius: '5px', fontSize: '12px', fontWeight: 700,
                border: '0.5px solid var(--border-md)', background: 'var(--bg-input)',
                color: 'var(--fg)', cursor: 'pointer',
              }}
            >
              <option value="scheduled">Scheduled</option>
              <option value="lineup_ready">Lineup Ready</option>
              <option value="final">Final</option>
            </select>

            {game?.status === 'final' && !showScoreEdit && (
              <button
                onClick={() => {
                  setScoreUs(gameScore ? String(gameScore.us) : '')
                  setScoreThem(gameScore ? String(gameScore.them) : '')
                  setShowScoreEdit(true)
                }}
                style={{
                  fontSize: '13px', fontWeight: gameScore ? 700 : 400, padding: '5px 10px',
                  borderRadius: '5px', border: '0.5px solid var(--border-md)',
                  background: 'var(--bg-input)', color: gameScore ? '#6DB875' : `rgba(var(--fg-rgb), 0.4)`,
                  cursor: 'pointer',
                }}
              >
                {gameScore ? `${gameScore.us}–${gameScore.them}` : '+ Score'}
              </button>
            )}
            {game?.status === 'final' && showScoreEdit && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <input
                  type="text" inputMode="numeric" value={scoreUs}
                  onChange={e => setScoreUs(e.target.value.replace(/\D/g, ''))}
                  placeholder="Us"
                  style={{
                    width: '40px', padding: '5px 4px', textAlign: 'center', fontWeight: 700,
                    fontSize: '14px', borderRadius: '5px', border: '0.5px solid var(--border-md)',
                    background: 'var(--bg-input)', color: 'var(--fg)',
                  }}
                />
                <span style={{ color: `rgba(var(--fg-rgb), 0.4)`, fontSize: '12px' }}>–</span>
                <input
                  type="text" inputMode="numeric" value={scoreThem}
                  onChange={e => setScoreThem(e.target.value.replace(/\D/g, ''))}
                  placeholder="Them"
                  style={{
                    width: '40px', padding: '5px 4px', textAlign: 'center', fontWeight: 700,
                    fontSize: '14px', borderRadius: '5px', border: '0.5px solid var(--border-md)',
                    background: 'var(--bg-input)', color: 'var(--fg)',
                  }}
                />
                <button onClick={saveScore} style={{
                  padding: '5px 10px', borderRadius: '5px', border: 'none',
                  background: '#6DB875', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                }}>Save</button>
                <button onClick={() => setShowScoreEdit(false)} style={{
                  padding: '5px 8px', borderRadius: '5px',
                  border: '0.5px solid var(--border-md)', background: 'transparent',
                  color: `rgba(var(--fg-rgb), 0.5)`, fontSize: '12px', cursor: 'pointer',
                }}>✕</button>
              </div>
            )}

            <button onClick={() => setShowHelp(true)} style={{
              width: '22px', height: '22px', borderRadius: '50%',
              border: '0.5px solid var(--border-md)', background: 'var(--bg-input)',
              color: `rgba(var(--fg-rgb), 0.5)`, fontSize: '12px', fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0, marginLeft: 'auto',
            }}>?</button>
          </div>

          {/* Save error banner */}
          {saveError && (
            <div style={{
              background: 'rgba(232,112,96,0.12)', border: '0.5px solid rgba(232,112,96,0.5)',
              borderRadius: '8px', padding: '10px 12px', marginBottom: '10px',
              fontSize: '13px', color: '#E87060', lineHeight: 1.5,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
            }}>
              <span>{saveError}</span>
              <button onClick={() => setSaveError(null)} style={{
                background: 'none', border: 'none', color: '#E87060', cursor: 'pointer',
                fontSize: '16px', lineHeight: 1, padding: '0 2px', flexShrink: 0,
              }}>×</button>
            </div>
          )}

          {/* Depth chart restriction warning */}
          {dcWarning && (
            <div style={{
              background: 'rgba(232,160,32,0.12)', border: '0.5px solid rgba(232,160,32,0.4)',
              borderRadius: '8px', padding: '10px 12px', marginBottom: '10px',
              fontSize: '13px', color: '#E8A020', lineHeight: 1.5,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
            }}>
              <span>⚠ {dcWarning}</span>
              <button onClick={() => setDcWarning(null)} style={{
                background: 'none', border: 'none', color: '#E8A020', cursor: 'pointer',
                fontSize: '16px', lineHeight: 1, padding: '0 2px', flexShrink: 0,
              }}>×</button>
            </div>
          )}

          {/* Toolbar */}
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
            {/* Mode toggle */}
            <div style={{ display: 'flex', border: '0.5px solid var(--border-strong)',
              borderRadius: '4px', overflow: 'hidden' }}>
              {(['paint', 'pick'] as const).map(mode => (
                <button key={mode} onClick={() => setEditorMode(mode)} style={{
                  fontSize: '11px', padding: '5px 11px', border: 'none', cursor: 'pointer',
                  background: editorMode === mode ? 'rgba(59,109,177,0.2)' : 'transparent',
                  color: editorMode === mode ? '#80B0E8' : `rgba(var(--fg-rgb), 0.5)`,
                  fontWeight: editorMode === mode ? 700 : 500,
                }}>
                  {mode === 'paint' ? '🖌 Paint' : '☝ Pick'}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setReorderMode(m => !m) }}
              style={{
                fontSize: '11px', padding: '5px 10px', borderRadius: '4px',
                border: '0.5px solid var(--border-strong)',
                background: reorderMode ? 'rgba(59,109,177,0.2)' : 'transparent',
                color: reorderMode ? '#80B0E8' : `rgba(var(--fg-rgb), 0.5)`,
                cursor: 'pointer',
              }}>
              {reorderMode ? '✓ Done reordering' : '↕ Batting order'}
            </button>
            <button
              onClick={() => setShowClearConfirm(true)}
              style={{
                fontSize: '11px', padding: '5px 10px', borderRadius: '4px',
                border: '0.5px solid rgba(192,57,43,0.3)', background: 'transparent',
                color: 'rgba(232,100,80,0.7)', cursor: 'pointer',
              }}>
              Clear
            </button>
            <div style={{ display: 'flex', alignItems: 'center',
              border: '0.5px solid var(--border-strong)', borderRadius: '4px', overflow: 'hidden' }}>
              <button onClick={() => changeInnings(-1)} disabled={(game?.innings_played ?? 6) <= 6}
                style={{ fontSize: '13px', padding: '4px 8px', border: 'none',
                  background: 'transparent', color: `rgba(var(--fg-rgb), 0.5)`, cursor: 'pointer',
                  opacity: (game?.innings_played ?? 6) <= 6 ? 0.3 : 1 }}>−</button>
              <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.6)`,
                padding: '0 4px', userSelect: 'none' }}>{inningCount} inn</span>
              <button onClick={() => changeInnings(1)} disabled={(game?.innings_played ?? 6) >= 9}
                style={{ fontSize: '13px', padding: '4px 8px', border: 'none',
                  background: 'transparent', color: `rgba(var(--fg-rgb), 0.5)`, cursor: 'pointer',
                  opacity: (game?.innings_played ?? 6) >= 9 ? 0.3 : 1 }}>+</button>
            </div>
            <button
              onClick={openCopyPicker}
              style={{
                fontSize: '11px', padding: '5px 10px', borderRadius: '4px',
                border: '0.5px solid var(--border-strong)', background: 'transparent',
                color: `rgba(var(--fg-rgb), 0.5)`, cursor: 'pointer',
              }}>
              ⎘ Copy previous
            </button>
            <button
              onClick={() => window.print()}
              style={{
                fontSize: '11px', padding: '5px 10px', borderRadius: '4px',
                border: '0.5px solid var(--border-strong)', background: 'transparent',
                color: `rgba(var(--fg-rgb), 0.5)`, cursor: 'pointer',
              }}>
              🖨 Print
            </button>
            <div style={{ display: 'flex', borderRadius: '4px', border: '0.5px solid var(--border-strong)', overflow: 'hidden', marginLeft: 'auto' }}>
              {(['grid', 'field'] as const).map(mode => (
                <button key={mode} onClick={() => setViewMode(mode)} style={{
                  fontSize: '11px', padding: '5px 10px', border: 'none', cursor: 'pointer',
                  background: viewMode === mode ? 'rgba(59,109,177,0.2)' : 'transparent',
                  color: viewMode === mode ? '#80B0E8' : `rgba(var(--fg-rgb), 0.5)`,
                  fontWeight: viewMode === mode ? 700 : 500,
                }}>
                  {mode === 'grid' ? '▦ Grid' : '⚾ Field'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── POSITION PALETTE (sticky, paint mode only) ── */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 20,
          display: editorMode === 'paint' && viewMode === 'grid' ? 'flex' : 'none',
          background: 'var(--bg)',
          borderBottom: '0.5px solid var(--border-subtle)',
          padding: '8px 1rem 10px',
          gap: '6px', overflowX: 'auto',
        }}>
          {teamPositions.map(pos => {
            const c = POSITION_COLORS[pos] ?? POSITION_COLORS.Bench
            const isActive = activePosition === pos
            const complete = isPositionComplete(pos)
            return (
              <button key={pos} onClick={() => setActivePosition(pos)} style={{
                flexShrink: 0,
                padding: '8px 11px', borderRadius: '6px', cursor: 'pointer',
                background: isActive ? c.bg : complete ? 'transparent' : `${c.bg.replace('0.25', '0.12')}`,
                border: isActive
                  ? `1.5px solid ${c.color}`
                  : complete
                    ? '0.5px solid var(--border-subtle)'
                    : `0.5px solid ${c.color}88`,
                color: isActive ? c.color : complete ? `rgba(var(--fg-rgb), 0.3)` : c.color,
                fontSize: '11px', fontWeight: isActive ? 700 : 600,
                transition: 'all 0.1s',
                gap: '3px', display: 'flex', alignItems: 'center',
              }}>
                {pos === 'Bench' ? 'Bench' : pos}
                {complete && (
                  <span style={{ fontSize: '9px', color: isActive ? c.color : '#6DB875' }}>✓</span>
                )}
              </button>
            )
          })}
        </div>

        {/* ── FIELD VIEW ── */}
        {viewMode === 'field' && (
          <FieldView
            slots={slots}
            inningCount={inningCount}
            teamPositions={teamPositions}
            readOnly={false}
            onAssign={assignPosition}
          />
        )}

        {/* ── GRID ── */}
        <div style={{ display: viewMode === 'grid' ? 'block' : 'none' }}>
        <div style={{ padding: '8px 1rem 1.5rem', overflowX: 'auto' }}>

          {/* Column headers */}
          <div style={{
            display: 'flex', alignItems: 'center', marginBottom: '4px',
            minWidth: `${reorderWidth + COL_NUM + COL_NAME + COL_INN * inningCount + COL_STATUS}px`,
          }}>
            {reorderMode && <div style={{ width: reorderWidth, flexShrink: 0 }} />}
            <div style={{ width: COL_NUM, flexShrink: 0 }} />
            <div style={{ width: COL_NAME, flexShrink: 0, fontSize: '10px',
              color: `rgba(var(--fg-rgb), 0.35)`, paddingLeft: '4px' }}>Player</div>
            {innings.map(i => (
              <div key={i} style={{ width: COL_INN, flexShrink: 0, textAlign: 'center',
                fontSize: '10px', color: `rgba(var(--fg-rgb), 0.35)` }}>
                {i + 1}
              </div>
            ))}
            <div style={{ width: COL_STATUS, flexShrink: 0 }} />
          </div>

          {/* Player rows */}
          {activeSlots.map((slot, rowIdx) => {
            const player = slot.player as any
            const isDragging = dragSlotId === slot.id
            const isDragOver = dragOverSlotId === slot.id

            // Playing time indicators
            const positions = slot.inning_positions ?? []
            const fieldInn = innings.filter(i => positions[i] && positions[i] !== 'Bench').length
            const benchInn = innings.filter(i => positions[i] === 'Bench').length
            const filledInn = fieldInn + benchInn
            const remainingInn = inningCount - filledInn
            const target = player?.innings_target ?? 0

            // Consecutive bench alert (3+ bench in a row)
            let maxConsec = 0, cur = 0
            for (const i of innings) {
              if (positions[i] === 'Bench') { cur++; maxConsec = Math.max(maxConsec, cur) }
              else if (positions[i] != null) cur = 0
            }
            const consecAlert = maxConsec >= 3

            // Target shortfall: can't reach target even if all remaining innings are field
            const targetAlert = target > 0 && (fieldInn + remainingInn) < target

            return (
              <div
                key={slot.id}
                draggable={reorderMode}
                onDragStart={() => setDragSlotId(slot.id)}
                onDragOver={e => { e.preventDefault(); setDragOverSlotId(slot.id) }}
                onDrop={e => handleDrop(e, slot.id)}
                onDragEnd={() => { setDragSlotId(null); setDragOverSlotId(null) }}
                style={{
                  display: 'flex', alignItems: 'center',
                  minWidth: `${reorderWidth + COL_NUM + COL_NAME + COL_INN * inningCount + COL_STATUS}px`,
                  background: isDragOver ? 'rgba(232,160,32,0.12)'
                    : rowIdx % 2 === 0 ? 'var(--bg-card-alt)' : 'transparent',
                  borderRadius: '4px', marginBottom: '2px',
                  opacity: isDragging ? 0.4 : 1,
                  border: isDragOver ? '0.5px solid rgba(232,160,32,0.4)' : 'none',
                  cursor: reorderMode ? 'grab' : 'default',
                }}>

                {/* Reorder controls */}
                {reorderMode && (
                  <div style={{ width: reorderWidth, flexShrink: 0, display: 'flex',
                    alignItems: 'center', gap: '2px', paddingLeft: '4px' }}>
                    <button onClick={() => moveBattingOrder(slot.id, 'up')}
                      style={{ width: '22px', height: '22px', borderRadius: '3px',
                        border: '0.5px solid var(--border-md)', background: 'transparent',
                        color: `rgba(var(--fg-rgb), 0.5)`, fontSize: '12px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↑</button>
                    <button onClick={() => moveBattingOrder(slot.id, 'down')}
                      style={{ width: '22px', height: '22px', borderRadius: '3px',
                        border: '0.5px solid var(--border-md)', background: 'transparent',
                        color: `rgba(var(--fg-rgb), 0.5)`, fontSize: '12px', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↓</button>
                  </div>
                )}

                <div style={{ width: COL_NUM, flexShrink: 0, fontSize: '11px',
                  color: `rgba(var(--fg-rgb), 0.3)`, paddingLeft: '4px' }}>
                  {player?.jersey_number}
                </div>

                {/* Player name + absent button */}
                <div style={{ width: COL_NAME, flexShrink: 0, display: 'flex',
                  alignItems: 'center', gap: '4px', paddingLeft: '4px' }}>
                  <span style={{ fontSize: '13px', color: 'var(--fg)', whiteSpace: 'nowrap', flex: 1 }}>
                    {player?.first_name[0]}. {player?.last_name}
                  </span>
                  {consecAlert && (
                    <span title={`${maxConsec} bench innings in a row`}
                      style={{ fontSize: '9px', color: '#E8A020', lineHeight: 1, flexShrink: 0 }}>●</span>
                  )}
                  {targetAlert && (
                    <span title={`Will miss ${target}-inning target`}
                      style={{ fontSize: '9px', color: '#E87060', lineHeight: 1, flexShrink: 0 }}>▲</span>
                  )}
                  <button
                    onClick={() => toggleAvailability(slot.id)}
                    title="Remove from lineup"
                    style={{
                      width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                      border: '0.5px solid var(--border-strong)', background: 'transparent',
                      color: `rgba(var(--fg-rgb), 0.25)`, fontSize: '9px', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>–</button>
                </div>

                {/* Inning cells */}
                {innings.map(i => {
                  const pos = slot.inning_positions[i]
                  const c = pos ? (POSITION_COLORS[pos] ?? POSITION_COLORS.Bench) : null
                  const isActivePosHere = editorMode === 'paint' && pos === activePosition
                  const isPickSelected = editorMode === 'pick'
                    && pickTarget?.slotId === slot.id && pickTarget?.inningIndex === i
                  return (
                    <div key={i} style={{ width: COL_INN, flexShrink: 0,
                      display: 'flex', justifyContent: 'center', padding: '3px 0' }}>
                      <button
                        onClick={() => {
                          if (editorMode === 'pick') {
                            setPickTarget({ slotId: slot.id, inningIndex: i })
                          } else {
                            paintCell(slot.id, i)
                          }
                        }}
                        style={{
                          width: '36px', height: '32px', borderRadius: '4px',
                          border: isPickSelected
                            ? '1.5px solid #80B0E8'
                            : isActivePosHere
                              ? `1.5px solid ${c!.color}`
                              : pos ? `0.5px solid ${c!.color}55` : '0.5px dashed var(--border-md)',
                          background: isPickSelected ? 'rgba(59,109,177,0.2)' : pos ? c!.bg : 'transparent',
                          color: isPickSelected ? '#80B0E8' : pos ? c!.color : `rgba(var(--fg-rgb), 0.15)`,
                          fontSize: '10px', fontWeight: 700,
                          cursor: 'pointer', padding: 0,
                          transition: 'all 0.08s',
                        }}>
                        {pos === 'Bench' ? 'B' : (pos ?? '·')}
                      </button>
                    </div>
                  )
                })}

                {/* Per-player status */}
                {(() => {
                  const allFilled = innings.every(i => slot.inning_positions[i] != null)
                  return (
                    <div style={{ width: COL_STATUS, flexShrink: 0, textAlign: 'center',
                      fontSize: '13px', color: allFilled ? '#6DB875' : 'transparent',
                      userSelect: 'none' }}>
                      ✓
                    </div>
                  )
                })()}
              </div>
            )
          })}

          {/* Absent players */}
          {absentSlots.length > 0 && (
            <div style={{ marginTop: '16px', borderTop: '0.5px solid var(--border-subtle)', paddingTop: '10px' }}>
              <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)`, marginBottom: '6px',
                paddingLeft: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Out of lineup
              </div>
              {absentSlots.map(slot => {
                const player = slot.player as any
                return (
                  <div key={slot.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '5px 8px',
                    background: 'rgba(192,57,43,0.06)',
                    border: '0.5px solid rgba(192,57,43,0.15)',
                    borderRadius: '4px', marginBottom: '2px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.25)`, width: COL_NUM }}>
                        {player?.jersey_number}
                      </span>
                      <span style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.4)`,
                        textDecoration: 'line-through' }}>
                        {player?.first_name[0]}. {player?.last_name}
                      </span>
                    </div>
                    <button onClick={() => toggleAvailability(slot.id)}
                      style={{ fontSize: '10px', padding: '2px 8px', borderRadius: '3px',
                        border: '0.5px solid var(--border-md)', background: 'transparent',
                        color: `rgba(var(--fg-rgb), 0.4)`, cursor: 'pointer' }}>
                      restore
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Validation row */}
          <div style={{
            display: 'flex', alignItems: 'center', marginTop: '8px',
            minWidth: `${reorderWidth + COL_NUM + COL_NAME + COL_INN * inningCount + COL_STATUS}px`,
            borderTop: '0.5px solid var(--border-subtle)', paddingTop: '6px',
          }}>
            {reorderMode && <div style={{ width: reorderWidth, flexShrink: 0 }} />}
            <div style={{ width: COL_NUM, flexShrink: 0 }} />
            <div style={{ width: COL_NAME, flexShrink: 0, fontSize: '10px',
              color: `rgba(var(--fg-rgb), 0.3)`, paddingLeft: '4px' }}></div>
            {innings.map(i => {
              const status = getInningStatus(i)
              return (
                <div key={i} style={{ width: COL_INN, flexShrink: 0, textAlign: 'center',
                  fontSize: status === 'complete' ? '13px' : '11px',
                  fontWeight: status === 'complete' ? 700 : 600,
                  color: status === 'duplicate' ? '#E87060'
                    : status === 'complete' ? '#6DB875'
                    : `rgba(var(--fg-rgb), 0.4)` }}>
                  {status === 'duplicate' ? '⚠' : status === 'complete' ? '✓' : status}
                </div>
              )
            })}
            <div style={{ width: COL_STATUS, flexShrink: 0 }} />
          </div>
        </div>
        </div>{/* end grid wrapper */}

        {/* ── COPY PREVIOUS GAME ── */}
        {showCopyPicker && (
          <div onClick={() => setShowCopyPicker(false)} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200,
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'var(--bg2)', borderRadius: '16px 16px 0 0',
              padding: '1.25rem 1rem 2rem', width: '100%', maxWidth: '480px',
              border: '0.5px solid var(--border)', maxHeight: '90vh', overflowY: 'auto',
            }}>
              <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>Copy previous game</div>
              <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '1.25rem' }}>
                Players not on the current roster will be skipped.
              </div>

              {copyGames.length === 0 ? (
                <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '1.25rem' }}>
                  No previous games found for this season.
                </div>
              ) : (
                <>
                  {/* Game picker */}
                  <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '6px' }}>Game</div>
                  <select
                    value={copyGameId}
                    onChange={e => setCopyGameId(e.target.value)}
                    style={{
                      width: '100%', padding: '9px 10px', borderRadius: '6px',
                      border: '0.5px solid var(--border-md)',
                      background: 'var(--bg-input)', color: 'var(--fg)',
                      fontSize: '14px', marginBottom: '1.25rem',
                    }}
                  >
                    {copyGames.map(g => {
                      const date = new Date(g.game_date + 'T12:00:00').toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })
                      return (
                        <option key={g.id} value={g.id}>vs {g.opponent} · {date}</option>
                      )
                    })}
                  </select>

                  {/* Copy mode */}
                  <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '8px' }}>What to copy</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '1.5rem' }}>
                    {([
                      { value: 'full',  label: 'Full lineup',    desc: 'Batting order + all position assignments' },
                      { value: 'order', label: 'Batting order only', desc: 'Keep the same batting order, clear all positions' },
                    ] as const).map(opt => (
                      <button key={opt.value} onClick={() => setCopyMode(opt.value)} style={{
                        display: 'flex', alignItems: 'flex-start', gap: '10px',
                        padding: '10px 12px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left',
                        border: copyMode === opt.value ? '1.5px solid var(--accent)' : '0.5px solid var(--border-md)',
                        background: copyMode === opt.value ? 'rgba(59,109,177,0.1)' : 'transparent',
                      }}>
                        <div style={{
                          width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0, marginTop: '1px',
                          border: copyMode === opt.value ? '4px solid var(--accent)' : '1.5px solid var(--border-strong)',
                          background: 'transparent',
                        }} />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)' }}>{opt.label}</div>
                          <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.45)`, marginTop: '2px' }}>{opt.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setShowCopyPicker(false)} style={{
                  flex: 1, padding: '11px', borderRadius: '6px',
                  border: '0.5px solid var(--border-strong)', background: 'transparent',
                  color: `rgba(var(--fg-rgb), 0.6)`, fontSize: '13px', cursor: 'pointer',
                }}>Cancel</button>
                {copyGames.length > 0 && (
                  <button onClick={doCopy} disabled={copying} style={{
                    flex: 2, padding: '11px', borderRadius: '6px', border: 'none',
                    background: 'var(--accent)', color: 'var(--accent-text)',
                    fontSize: '13px', fontWeight: 700,
                    cursor: copying ? 'not-allowed' : 'pointer', opacity: copying ? 0.7 : 1,
                  }}>{copying ? 'Copying…' : 'Apply'}</button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── POSITION PICKER (pick mode) ── */}
        {pickTarget && (
          <div onClick={() => setPickTarget(null)} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200,
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'var(--bg2)', borderRadius: '16px 16px 0 0',
              padding: '1.25rem 1rem 2rem', width: '100%', maxWidth: '480px',
              border: '0.5px solid var(--border)',
            }}>
              <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '14px' }}>
                Pick position
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                {teamPositions.filter(p => p !== 'Bench').map(pos => {
                  const c = POSITION_COLORS[pos] ?? POSITION_COLORS.Bench
                  const currentPos = slots.find(s => s.id === pickTarget.slotId)?.inning_positions[pickTarget.inningIndex]
                  const isCurrent = currentPos === pos
                  return (
                    <button key={pos} onClick={() => {
                      assignPosition(pickTarget.slotId, pickTarget.inningIndex, isCurrent ? null : pos)
                      setPickTarget(null)
                    }} style={{
                      padding: '9px 16px', borderRadius: '8px', cursor: 'pointer',
                      border: isCurrent ? `1.5px solid ${c.color}` : `0.5px solid ${c.color}55`,
                      background: isCurrent ? c.bg : 'transparent',
                      color: c.color, fontSize: '14px', fontWeight: 700,
                    }}>
                      {pos}
                    </button>
                  )
                })}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => {
                  assignPosition(pickTarget.slotId, pickTarget.inningIndex, 'Bench')
                  setPickTarget(null)
                }} style={{
                  flex: 1, padding: '10px', borderRadius: '6px', cursor: 'pointer',
                  border: '0.5px solid var(--border-md)', background: POSITION_COLORS.Bench.bg,
                  color: `rgba(var(--fg-rgb), 0.5)`, fontSize: '13px',
                }}>
                  Bench
                </button>
                <button onClick={() => {
                  assignPosition(pickTarget.slotId, pickTarget.inningIndex, null)
                  setPickTarget(null)
                }} style={{
                  flex: 1, padding: '10px', borderRadius: '6px', cursor: 'pointer',
                  border: '0.5px solid rgba(192,57,43,0.3)', background: 'transparent',
                  color: 'rgba(232,100,80,0.7)', fontSize: '13px',
                }}>
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── CLEAR CONFIRM ── */}
        {showClearConfirm && (
          <div onClick={() => setShowClearConfirm(false)} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'var(--bg2)', borderRadius: '12px', padding: '1.5rem',
              width: '280px', border: '0.5px solid rgba(192,57,43,0.3)',
            }}>
              <div style={{ fontSize: '16px', fontWeight: 600, marginBottom: '8px' }}>Clear lineup?</div>
              <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.5)`, marginBottom: '1.5rem' }}>
                All position assignments will be removed.
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setShowClearConfirm(false)} style={{
                  flex: 1, padding: '10px', borderRadius: '6px',
                  border: '0.5px solid var(--border-strong)', background: 'transparent',
                  color: `rgba(var(--fg-rgb), 0.6)`, fontSize: '13px', cursor: 'pointer',
                }}>Cancel</button>
                <button onClick={clearGame} disabled={clearing} style={{
                  flex: 1, padding: '10px', borderRadius: '6px', border: 'none',
                  background: '#C0392B', color: 'white', fontSize: '13px', fontWeight: 600,
                  cursor: clearing ? 'not-allowed' : 'pointer', opacity: clearing ? 0.7 : 1,
                }}>{clearing ? 'Clearing…' : 'Clear'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ── HELP SHEET ── */}
        {showHelp && (
          <div onClick={() => setShowHelp(false)} style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200,
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'var(--bg2)', borderRadius: '16px 16px 0 0',
              padding: '1.5rem 1.25rem 2.5rem', width: '100%', maxWidth: '480px',
              border: '0.5px solid var(--border)',
            }}>
              <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '1.25rem' }}>
                How the lineup builder works
              </div>

              {[
                {
                  title: 'Paint mode',
                  body: 'Select a position from the palette at the bottom, then tap any cell in the grid to assign it. Tap the same cell again to clear it. This is the fastest way to fill a lineup.',
                },
                {
                  title: 'Pick mode',
                  body: 'Tap any cell to open a position picker. More precise than paint mode — useful when you need to see all options at once.',
                },
                {
                  title: 'Batting order',
                  body: 'Tap "Reorder" in the toolbar to rearrange players up and down the batting lineup. On desktop you can also drag and drop rows.',
                },
                {
                  title: 'Marking a player absent',
                  body: 'Tap a player\'s name in the lineup to toggle them absent. Absent players are moved out of the lineup and won\'t count toward playing time.',
                },
                {
                  title: 'Inning validity',
                  body: 'A green ✓ appears above an inning when every position is filled with exactly one player. Red means a position is missing or doubled up.',
                },
              ].map(item => (
                <div key={item.title} style={{ marginBottom: '14px' }}>
                  <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '3px', color: 'var(--accent)' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.6)`, lineHeight: 1.5 }}>
                    {item.body}
                  </div>
                </div>
              ))}

              <button onClick={() => setShowHelp(false)} style={{
                width: '100%', marginTop: '4px', padding: '12px', borderRadius: '8px', border: 'none',
                background: 'var(--accent)', color: 'var(--accent-text)',
                fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              }}>
                Got it
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  )
}
