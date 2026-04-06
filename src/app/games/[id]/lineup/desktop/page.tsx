'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '../../../../../lib/supabase'
import { formatTime } from '../../../../../lib/formatTime'

// ── Constants ─────────────────────────────────────────────────────────────────

const NAVY = '#0B1F3A'
const GOLD  = '#E8A020'
const BLANK: (string | null)[] = [null,null,null,null,null,null,null,null,null]

// Position category sets for summary table
const IF_POS = new Set(['1B','2B','SS','3B'])
const OF_POS = new Set(['LF','CF','RF','LC','RC'])

// Keyboard shortcut → position name
const KEY_POS: Record<string, string> = {
  p: 'P', c: 'C', '1': '1B', '2': '2B', s: 'SS', '3': '3B',
  l: 'LF', m: 'CF', r: 'RF', b: 'Bench',
}
// Position → shortcut label for palette
const POS_KEY: Record<string, string> = {
  P: 'p', C: 'c', '1B': '1', '2B': '2', SS: 's', '3B': '3',
  LF: 'l', CF: 'm', RF: 'r', Bench: 'b',
}
const POS_COLOR: Record<string, { bg: string; color: string }> = {
  P:    { bg: 'rgba(232,160,32,0.22)',  color: '#E8C060' },
  C:    { bg: 'rgba(192,80,120,0.22)', color: '#E090B0' },
  '1B': { bg: 'rgba(59,109,177,0.22)', color: '#80B0E8' },
  '2B': { bg: 'rgba(59,109,177,0.22)', color: '#80B0E8' },
  SS:   { bg: 'rgba(59,109,177,0.22)', color: '#80B0E8' },
  '3B': { bg: 'rgba(59,109,177,0.22)', color: '#80B0E8' },
  LF:   { bg: 'rgba(45,106,53,0.22)',  color: '#6DB875' },
  CF:   { bg: 'rgba(45,106,53,0.22)',  color: '#6DB875' },
  LC:   { bg: 'rgba(45,106,53,0.22)',  color: '#6DB875' },
  RC:   { bg: 'rgba(45,106,53,0.22)',  color: '#6DB875' },
  RF:   { bg: 'rgba(45,106,53,0.22)',  color: '#6DB875' },
  Bench:{ bg: 'rgba(120,120,120,0.1)', color: 'rgba(160,160,160,0.75)' },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function benchInnings(slot: any, inningCount: number): number {
  return (slot.inning_positions ?? []).slice(0, inningCount)
    .filter((p: string | null) => p === 'Bench').length
}

function assignedInnings(slot: any, inningCount: number): number {
  return (slot.inning_positions ?? []).slice(0, inningCount)
    .filter((p: string | null) => p !== null).length
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DesktopLineupEditor({ params }: { params: { id: string } }) {
  const supabase = createClient()

  const [loading, setLoading]           = useState(true)
  const [game, setGame]                 = useState<any>(null)
  const [slots, setSlots]               = useState<any[]>([])
  const [teamPositions, setTeamPositions] = useState<string[]>(
    ['P','C','1B','2B','SS','3B','LF','CF','RF','Bench']
  )
  const [activePos, setActivePos]       = useState('P')
  const [focused, setFocused]           = useState<{ si: number; ii: number } | null>(null)
  const [dragId, setDragId]             = useState<string | null>(null)
  const [dragOverId, setDragOverId]     = useState<string | null>(null)
  const [history, setHistory]           = useState<any[][]>([])
  const [future, setFuture]             = useState<any[][]>([])
  const [statusSaving, setStatusSaving] = useState(false)
  const [copyOpen, setCopyOpen]         = useState(false)
  const [copyGames, setCopyGames]       = useState<any[]>([])
  const [copyGameId, setCopyGameId]     = useState('')
  const [copyMode, setCopyMode]         = useState<'full' | 'order'>('full')
  const [copying, setCopying]           = useState(false)
  const [showTip, setShowTip]           = useState(true)
  const [showShortcuts, setShowShortcuts] = useState(false)
  const [playerPositionHistory, setPlayerPositionHistory] = useState<Record<string, Record<string, number>>>({})
  const [lastGameHistory, setLastGameHistory] = useState<Record<string, {P:number,C:number,IF:number,OF:number,Bench:number}>>({})
  // selectedCells: Set of "si-ii" keys. Click = select only; palette/key = fill.
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())
  const [confirmClear, setConfirmClear] = useState(false)
  const [gameNotes, setGameNotes]       = useState('')
  const [notesSaved, setNotesSaved]     = useState(true)
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const notesRawRef = useRef<string | null>(null)

  // Always-current references so async callbacks see latest state
  const slotsRef = useRef(slots)
  useEffect(() => { slotsRef.current = slots }, [slots])
  const selectedCellsRef = useRef(selectedCells)
  // Snapshot of inning_positions before a player is marked absent (for restore on un-absent)
  const savedPositionsRef = useRef<Record<string, (string|null)[]>>({})
  // Anchor for shift-selection: the cell where selection started (stays fixed while shift-arrowing)
  const anchorRef = useRef<{ si: number; ii: number } | null>(null)
  useEffect(() => { selectedCellsRef.current = selectedCells }, [selectedCells])
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { loadData() }, [])

  // ── Data loading ──────────────────────────────────────────────────────────

  async function loadData() {
    const { data: gameData } = await supabase
      .from('games')
      .select('*, season:seasons(innings_per_game, team:teams(name, positions))')
      .eq('id', params.id).single()
    setGame(gameData)
    const rawNotes = (gameData as any)?.notes ?? null
    notesRawRef.current = rawNotes
    try { setGameNotes(JSON.parse(rawNotes ?? '{}')._notes ?? '') } catch { setGameNotes('') }

    const team = (gameData as any)?.season?.team
    const positions: string[] = team?.positions?.length
      ? team.positions
      : ['P','C','1B','2B','SS','3B','LF','CF','RF','Bench']
    setTeamPositions(positions)
    setActivePos(positions[0] ?? 'P')

    let { data: slotData } = await supabase
      .from('lineup_slots')
      .select('*, player:players(first_name, last_name, jersey_number, innings_target)')
      .eq('game_id', params.id)
      .order('batting_order', { ascending: true, nullsFirst: false })

    // If no slots exist yet (first time opening the lineup), auto-create from roster
    if (!slotData?.length && gameData?.season_id) {
      const { data: players } = await supabase
        .from('players')
        .select('id, first_name, last_name, jersey_number, batting_pref_order, innings_target')
        .eq('season_id', gameData.season_id)
        .eq('status', 'active')
        .order('batting_pref_order', { ascending: true, nullsFirst: false })
      if (players?.length) {
        await supabase.from('lineup_slots').insert(
          players.map((p, i) => ({
            game_id: params.id,
            player_id: p.id,
            batting_order: i + 1,
            availability: 'available',
            inning_positions: [...BLANK],
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

    // Load season-to-date position history for all players
    if (gameData?.season_id) {
      const { data: statsData } = await supabase
        .from('season_position_stats')
        .select('player_id, innings_p, innings_c, innings_1b, innings_2b, innings_ss, innings_3b, innings_lf, innings_cf, innings_rf, innings_bench')
        .eq('season_id', gameData.season_id)
      if (statsData?.length) {
        const ph: Record<string, Record<string, number>> = {}
        for (const row of statsData) {
          ph[row.player_id] = {
            P: row.innings_p ?? 0, C: row.innings_c ?? 0,
            '1B': row.innings_1b ?? 0, '2B': row.innings_2b ?? 0,
            SS: row.innings_ss ?? 0, '3B': row.innings_3b ?? 0,
            LF: row.innings_lf ?? 0, CF: row.innings_cf ?? 0,
            RF: row.innings_rf ?? 0, Bench: row.innings_bench ?? 0,
          }
        }
        setPlayerPositionHistory(ph)
      }
    }

    // Load most recent previous game's slot positions for last-game context in right panel
    if (gameData?.season_id) {
      // Get all other games in this season, most recent first
      const { data: otherGames } = await supabase
        .from('games')
        .select('id, innings_played, game_date')
        .eq('season_id', gameData.season_id)
        .neq('id', params.id)
        .order('created_at', { ascending: false })

      // Pick the most recently dated game, or fall back to the most recently created
      const dated = (otherGames ?? []).filter(g => g.game_date).sort(
        (a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime()
      )
      const prevGame = dated[0] ?? otherGames?.[0]
      if (prevGame) {
        const { data: prevSlots } = await supabase
          .from('lineup_slots')
          .select('player_id, inning_positions, availability')
          .eq('game_id', prevGame.id)
        if (prevSlots) {
          const prevInn = prevGame.innings_played ?? gameData.season?.innings_per_game ?? 6
          const lgh: Record<string, {P:number,C:number,IF:number,OF:number,Bench:number}> = {}
          for (const s of prevSlots) {
            if (s.availability === 'absent') continue
            const pos = (s.inning_positions ?? []).slice(0, prevInn) as (string|null)[]
            lgh[s.player_id] = {
              P:     pos.filter(p => p === 'P').length,
              C:     pos.filter(p => p === 'C').length,
              IF:    pos.filter(p => IF_POS.has(p ?? '')).length,
              OF:    pos.filter(p => OF_POS.has(p ?? '')).length,
              Bench: pos.filter(p => p === 'Bench').length,
            }
          }
          setLastGameHistory(lgh)
        }
      }
    }

    setLoading(false)
  }

  // ── Position assignment ───────────────────────────────────────────────────

  function commit(newSlots: any[], changedIds: string[]) {
    setHistory(h => [...h.slice(-49), slotsRef.current])
    setFuture([])
    setSlots(newSlots)
    // Debounced save
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      await Promise.all(
        newSlots
          .filter(s => changedIds.includes(s.id))
          .map(s => supabase.from('lineup_slots').update({
            inning_positions: s.inning_positions,
          }).eq('id', s.id))
      )
    }, 500)
  }

  function assignPosition(slotId: string, ii: number, newPos: string | null) {
    const next = slotsRef.current.map(s => ({
      ...s, inning_positions: [...(s.inning_positions ?? [...BLANK])],
    }))
    const changedIds = [slotId]
    // Swap: if assigning a non-bench position, clear the current holder (go blank, not bench)
    if (newPos && newPos !== 'Bench') {
      const holder = next.find(s => s.id !== slotId && s.inning_positions[ii] === newPos)
      if (holder) { holder.inning_positions[ii] = null; changedIds.push(holder.id) }
    }
    const target = next.find(s => s.id === slotId)
    if (target) target.inning_positions[ii] = newPos
    commit(next, changedIds)
  }

  // Fill all currently selected cells with a position (called from palette or key shortcut)
  function fillSelected(pos: string) {
    const sel = selectedCellsRef.current
    if (sel.size === 0) return
    const active = slotsRef.current.filter(s => s.availability !== 'absent')
    const next = slotsRef.current.map(s => ({
      ...s, inning_positions: [...(s.inning_positions ?? [...BLANK])],
    }))
    const changedIds = new Set<string>()
    for (const key of Array.from(sel)) {
      const [siStr, iiStr] = key.split('-')
      const si = parseInt(siStr), ii = parseInt(iiStr)
      const slot = active[si]
      if (!slot) continue
      if (pos && pos !== 'Bench') {
        const holder = next.find(s => s.id !== slot.id && s.inning_positions[ii] === pos)
        if (holder) { holder.inning_positions[ii] = null; changedIds.add(holder.id) }
      }
      const target = next.find(s => s.id === slot.id)
      if (target) { target.inning_positions[ii] = pos; changedIds.add(target.id) }
    }
    if (changedIds.size) commit(next, Array.from(changedIds))
  }

  // ── Undo / Redo ───────────────────────────────────────────────────────────

  const undo = useCallback(() => {
    setHistory(h => {
      if (!h.length) return h
      const prev = h[h.length - 1]
      setFuture(f => [slotsRef.current, ...f.slice(0, 49)])
      setSlots(prev)
      slotsRef.current = prev
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        await Promise.all(prev.map((s: any) =>
          supabase.from('lineup_slots').update({ inning_positions: s.inning_positions }).eq('id', s.id)
        ))
      }, 300)
      return h.slice(0, -1)
    })
  }, [])

  const redo = useCallback(() => {
    setFuture(f => {
      if (!f.length) return f
      const next = f[0]
      setHistory(h => [...h.slice(-49), slotsRef.current])
      setSlots(next)
      slotsRef.current = next
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(async () => {
        await Promise.all(next.map((s: any) =>
          supabase.from('lineup_slots').update({ inning_positions: s.inning_positions }).eq('id', s.id)
        ))
      }, 300)
      return f.slice(1)
    })
  }, [])

  // ── Attendance ────────────────────────────────────────────────────────────

  function toggleAbsent(slotId: string) {
    const slot = slotsRef.current.find(s => s.id === slotId)
    if (!slot) return
    const newAvail = slot.availability === 'absent' ? 'available' : 'absent'

    let newPos: (string|null)[]
    if (newAvail === 'absent') {
      // Snapshot positions before clearing so we can restore on un-absent
      const current = slot.inning_positions ?? [...BLANK]
      if (current.some((p: string|null) => p !== null)) savedPositionsRef.current[slotId] = [...current]
      newPos = [...BLANK]
    } else {
      // Restore saved snapshot if available, otherwise keep whatever is in the slot
      newPos = savedPositionsRef.current[slotId] ?? slot.inning_positions ?? [...BLANK]
      delete savedPositionsRef.current[slotId]
    }
    const next = slotsRef.current.map(s =>
      s.id === slotId ? { ...s, availability: newAvail, inning_positions: newPos } : s
    )
    setSlots(next)
    setSelectedCells(new Set())
    setFocused(null)
    supabase.from('lineup_slots').update({ availability: newAvail, inning_positions: newPos }).eq('id', slotId).then(() => {})
  }

  // ── Batting order ─────────────────────────────────────────────────────────

  async function nudgeBattingOrder(slotId: string, dir: 'up' | 'down') {
    const active = slotsRef.current.filter(s => s.availability !== 'absent')
    const idx = active.findIndex(s => s.id === slotId)
    if (dir === 'up' && idx === 0) return
    if (dir === 'down' && idx === active.length - 1) return
    const swap = dir === 'up' ? idx - 1 : idx + 1
    const reordered = [...active];
    [reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]]
    const updated = reordered.map((s, i) => ({ ...s, batting_order: i + 1 }))
    const next = [...updated, ...slotsRef.current.filter(s => s.availability === 'absent')]
    setSlots(next)
    await supabase.from('lineup_slots').update({ batting_order: idx + 1 }).eq('id', reordered[swap].id)
    await supabase.from('lineup_slots').update({ batting_order: swap + 1 }).eq('id', reordered[idx].id)
  }

  async function handleDrop(targetId: string) {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return }
    const active = slotsRef.current.filter(s => s.availability !== 'absent')
    const fi = active.findIndex(s => s.id === dragId)
    const ti = active.findIndex(s => s.id === targetId)
    if (fi === -1 || ti === -1) { setDragId(null); setDragOverId(null); return }
    const reordered = [...active]
    const [moved] = reordered.splice(fi, 1)
    reordered.splice(ti, 0, moved)
    const updated = reordered.map((s, i) => ({ ...s, batting_order: i + 1 }))
    const next = [...updated, ...slotsRef.current.filter(s => s.availability === 'absent')]
    setSlots(next)
    setDragId(null); setDragOverId(null)
    await Promise.all(updated.map(s =>
      supabase.from('lineup_slots').update({ batting_order: s.batting_order }).eq('id', s.id)
    ))
  }

  // ── Copy from game ────────────────────────────────────────────────────────

  async function openCopy() {
    if (!game?.season_id) return
    const { data } = await supabase
      .from('games').select('id, opponent, game_date')
      .eq('season_id', game.season_id).neq('id', params.id)
      .order('game_date', { ascending: false })
    setCopyGames(data ?? [])
    setCopyGameId(data?.[0]?.id ?? '')
    setCopyMode('full')
    setCopyOpen(true)
  }

  async function doCopy() {
    if (!copyGameId) return
    setCopying(true)
    const { data: src } = await supabase
      .from('lineup_slots').select('player_id, batting_order, inning_positions')
      .eq('game_id', copyGameId)
    if (!src?.length) { setCopying(false); return }
    const byPlayer = new Map(src.map((s: any) => [s.player_id, s]))
    const current = slotsRef.current
    const updates = current
      .filter(s => s.availability !== 'absent' && byPlayer.has(s.player_id))
      .map(s => {
        const srcSlot: any = byPlayer.get(s.player_id)
        return {
          id: s.id,
          batting_order: srcSlot.batting_order,
          inning_positions: copyMode === 'full' ? srcSlot.inning_positions : [...BLANK],
        }
      })
    const updateMap = new Map(updates.map(u => [u.id, u]))
    const merged = current.map(s => updateMap.has(s.id) ? { ...s, ...updateMap.get(s.id) } : s)
    const active = merged.filter(s => s.availability !== 'absent').sort((a: any, b: any) => (a.batting_order ?? 0) - (b.batting_order ?? 0))
    const next = [...active, ...merged.filter(s => s.availability === 'absent')]
    setSlots(next)
    await Promise.all(updates.map(u =>
      supabase.from('lineup_slots').update({ batting_order: u.batting_order, inning_positions: u.inning_positions }).eq('id', u.id)
    ))
    setCopying(false); setCopyOpen(false)
  }

  // ── Game status ───────────────────────────────────────────────────────────

  async function saveStatus(newStatus: string) {
    setStatusSaving(true)
    setGame((g: any) => ({ ...g, status: newStatus }))
    await supabase.from('games').update({ status: newStatus }).eq('id', params.id)
    setStatusSaving(false)
  }

  // ── Clear lineup ─────────────────────────────────────────────────────────

  function clearLineup() {
    const next = slotsRef.current.map(s => ({ ...s, inning_positions: [...BLANK] }))
    commit(next, next.map(s => s.id))
    setSelectedCells(new Set())
    setFocused(null)
    setConfirmClear(false)
  }

  // ── Game notes ────────────────────────────────────────────────────────────

  function handleNotesChange(val: string) {
    setGameNotes(val)
    setNotesSaved(false)
    if (notesTimer.current) clearTimeout(notesTimer.current)
    notesTimer.current = setTimeout(async () => {
      let parsed: any = {}
      try { parsed = JSON.parse(notesRawRef.current ?? '{}') } catch {}
      parsed._notes = val
      const newRaw = JSON.stringify(parsed)
      await supabase.from('games').update({ notes: newRaw }).eq('id', params.id)
      notesRawRef.current = newRaw
      setNotesSaved(true)
    }, 800)
  }

  // ── Innings control ───────────────────────────────────────────────────────

  async function changeInnings(delta: number) {
    const cur = game?.innings_played ?? 6
    const next = Math.min(9, Math.max(6, cur + delta))
    if (next === cur) return
    setGame((g: any) => ({ ...g, innings_played: next }))
    await supabase.from('games').update({ innings_played: next }).eq('id', params.id)
  }

  // ── Keyboard handling ─────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Ignore when typing in an input/select
      if (['INPUT','SELECT','TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return

      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z') { e.preventDefault(); undo(); return }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); return }

      if (!focused) return
      const { si, ii } = focused
      const rowCount = slotsRef.current.filter(s => s.availability !== 'absent').length

      // Helper to move focus, reset selection to single cell, and update anchor
      function moveFocus(newSi: number, newIi: number) {
        setFocused({ si: newSi, ii: newIi })
        setSelectedCells(new Set([`${newSi}-${newIi}`]))
        anchorRef.current = { si: newSi, ii: newIi }
      }

      switch (e.key) {
        case 'ArrowRight': case 'Tab': {
          e.preventDefault()
          const newIi = Math.min(ii + 1, inningCount - 1)
          if (e.shiftKey && e.key !== 'Tab') {
            // Move cursor forward; compute full range from anchor to new cursor
            const anchor = anchorRef.current ?? { si, ii }
            setFocused({ si, ii: newIi })
            if (anchor.si === si) {
              const lo = Math.min(anchor.ii, newIi)
              const hi = Math.max(anchor.ii, newIi)
              const next = new Set<string>()
              for (let i = lo; i <= hi; i++) next.add(`${si}-${i}`)
              setSelectedCells(next)
            }
          } else {
            moveFocus(si, newIi)
          }
          return
        }
        case 'ArrowLeft': {
          e.preventDefault()
          const newIi = Math.max(ii - 1, 0)
          if (e.shiftKey) {
            // Move cursor back; compute full range from anchor to new cursor
            const anchor = anchorRef.current ?? { si, ii }
            setFocused({ si, ii: newIi })
            if (anchor.si === si) {
              const lo = Math.min(anchor.ii, newIi)
              const hi = Math.max(anchor.ii, newIi)
              const next = new Set<string>()
              for (let i = lo; i <= hi; i++) next.add(`${si}-${i}`)
              setSelectedCells(next)
            }
          } else {
            moveFocus(si, newIi)
          }
          return
        }
        case 'ArrowDown':
          e.preventDefault(); moveFocus(Math.min(si + 1, rowCount - 1), ii); return
        case 'ArrowUp':
          e.preventDefault(); moveFocus(Math.max(si - 1, 0), ii); return
        case 'Escape': setFocused(null); setSelectedCells(new Set()); return
        case 'Delete': case 'Backspace': {
          e.preventDefault()
          // Clear all selected cells
          const active = slotsRef.current.filter(s => s.availability !== 'absent')
          const next = slotsRef.current.map(s => ({
            ...s, inning_positions: [...(s.inning_positions ?? [...BLANK])],
          }))
          const changedIds = new Set<string>()
          for (const key of Array.from(selectedCellsRef.current)) {
            const [siStr, iiStr] = key.split('-')
            const slot = active[parseInt(siStr)]
            if (!slot) continue
            const t = next.find(s => s.id === slot.id)
            if (t) { t.inning_positions[parseInt(iiStr)] = null; changedIds.add(t.id) }
          }
          if (changedIds.size) commit(next, Array.from(changedIds))
          return
        }
      }

      // Position shortcut keys — fill all selected cells, auto-advance for single selection
      const pos = KEY_POS[e.key.toLowerCase()]
      if (pos && teamPositions.includes(pos)) {
        e.preventDefault()
        setActivePos(pos)
        fillSelected(pos)
        // Auto-advance focus to next inning only when single cell selected
        if (selectedCellsRef.current.size === 1 && ii < inningCount - 1) {
          moveFocus(si, ii + 1)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focused, undo, redo, teamPositions])

  // ── Derived ───────────────────────────────────────────────────────────────

  const inningCount = game?.innings_played ?? 6
  const innings = Array.from({ length: inningCount }, (_, i) => i)
  const activeSlots = slots.filter(s => s.availability !== 'absent')
  const absentSlots  = slots.filter(s => s.availability === 'absent')

  // How many players should sit the bench each inning
  const fieldingPositionCount = teamPositions.filter(p => p !== 'Bench').length
  const benchPerInning = Math.max(0, activeSlots.length - fieldingPositionCount)
  // Expected bench innings per player over the full game
  const expectedBenchInnings = activeSlots.length > 0
    ? (inningCount * benchPerInning) / activeSlots.length
    : 0

  // Show tip banner while lineup is mostly empty
  const totalAssigned = activeSlots.reduce(
    (sum, s) => sum + assignedInnings(s, inningCount), 0
  )
  const tipVisible = showTip && totalAssigned < activeSlots.length

  // Right-panel: position summary for the focused (or first) inning
  const summaryII = focused?.ii ?? 0
  const posSummary: Record<string, string[]> = {}
  for (const p of teamPositions) posSummary[p] = []
  posSummary['_empty'] = []
  for (const s of activeSlots) {
    const p = (s.inning_positions ?? [])[summaryII] ?? null
    if (!p) posSummary['_empty'].push(s.player?.last_name ?? '?')
    else if (posSummary[p] !== undefined) posSummary[p].push(s.player?.last_name ?? '?')
  }

  const gameDate = game?.game_date
    ? new Date(game.game_date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric',
      })
    : ''

  if (loading) {
    return (
      <div style={{ height: '100vh', background: 'var(--bg)', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: `rgba(var(--fg-rgb),0.35)`, fontSize: 14 }}>
        Loading lineup…
      </div>
    )
  }

  // ── JSX ───────────────────────────────────────────────────────────────────

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100vh',
      background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      overflow: 'hidden',
    }}>

      {/* ─── TOP BAR ─── */}
      <div style={{
        background: NAVY, display: 'flex', alignItems: 'center',
        gap: 12, padding: '0 16px', height: 48, flexShrink: 0,
      }}>
        <a href="/games" style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none', fontSize: 13 }}>
          ← Games
        </a>
        <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>
            vs {game?.opponent}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12, marginLeft: 10 }}>
            {gameDate}{game?.game_time ? ` · ${formatTime(game.game_time)}` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {/* Innings control */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <button
              onClick={() => changeInnings(-1)}
              disabled={inningCount <= 6}
              style={topBtn(inningCount > 6)}
              title="Fewer innings"
            >−</button>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', minWidth: 44, textAlign: 'center', fontWeight: 600 }}>
              {inningCount} inn
            </span>
            <button
              onClick={() => changeInnings(1)}
              disabled={inningCount >= 9}
              style={topBtn(inningCount < 9)}
              title="More innings"
            >+</button>
          </div>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
          <button onClick={undo} disabled={!history.length} title="Undo (⌘Z)" style={topBtn(!!history.length)}>
            ↩ Undo
          </button>
          <button onClick={redo} disabled={!future.length} title="Redo (⌘⇧Z)" style={topBtn(!!future.length)}>
            Redo ↪
          </button>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
          {confirmClear ? (
            <>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>Clear all positions?</span>
              <button onClick={clearLineup} style={{ ...topBtn(true), color: '#E87060' }}>Yes, clear</button>
              <button onClick={() => setConfirmClear(false)} style={topBtn(true)}>Cancel</button>
            </>
          ) : (
            <button onClick={() => setConfirmClear(true)} style={topBtn(true)}>Clear lineup</button>
          )}
          <button onClick={openCopy} style={topBtn(true)}>Copy from…</button>
          <a
            href={`/games/${params.id}/print`}
            target="_blank" rel="noopener noreferrer"
            style={{ ...topBtn(true) as any, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            🖨 Print
          </a>
          <a
            href={`/games/${params.id}`}
            style={{ ...topBtn(true) as any, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
          >
            Mobile view
          </a>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
          {/* Status segmented control */}
          {([
            { key: 'scheduled',    label: 'Scheduled',     color: 'rgba(255,255,255,0.55)', activeBg: 'rgba(255,255,255,0.12)', activeBorder: 'rgba(255,255,255,0.3)' },
            { key: 'lineup_ready', label: 'Lineup Ready',  color: '#80B0E8',                activeBg: 'rgba(59,109,177,0.35)',  activeBorder: '#80B0E8' },
            { key: 'final',        label: 'Final',         color: '#6DB875',                activeBg: 'rgba(45,106,53,0.35)',   activeBorder: '#6DB875' },
          ] as const).map(({ key, label, color, activeBg, activeBorder }) => {
            const isActive = (game?.status ?? 'scheduled') === key
            return (
              <button
                key={key}
                onClick={() => !isActive && !statusSaving && saveStatus(key)}
                disabled={statusSaving}
                style={{
                  padding: '5px 11px', borderRadius: 5, border: `1px solid ${isActive ? activeBorder : 'rgba(255,255,255,0.1)'}`,
                  background: isActive ? activeBg : 'transparent',
                  color: isActive ? color : 'rgba(255,255,255,0.3)',
                  fontSize: 12, fontWeight: isActive ? 700 : 500, cursor: isActive ? 'default' : 'pointer',
                  opacity: statusSaving ? 0.6 : 1, transition: 'all 0.15s', flexShrink: 0,
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ─── INSTRUCTION BANNER ─── */}
      {tipVisible && (
        <div style={{
          background: 'rgba(232,160,32,0.09)', borderBottom: '1px solid rgba(232,160,32,0.2)',
          padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 20, flexShrink: 0,
        }}>
          <span style={{ fontSize: 12, color: GOLD, fontWeight: 700, flexShrink: 0 }}>
            How to build a lineup:
          </span>
          {[
            ['1', 'Mark absent players', 'Use the ✕ next to any player who isn\'t at the game'],
            ['2', 'Click cells to select', 'Click a cell to select it — nothing changes yet. Shift+click to select a range in the same row.'],
            ['3', 'Fill with a position', 'Click a position button (or press its shortcut key) to fill all selected cells at once'],
            ['4', 'Set status', 'Click Lineup Ready in the top-right when done, or Final after the game'],
          ].map(([n, label, tip]) => (
            <div key={n} style={{ display: 'flex', alignItems: 'center', gap: 6 }} title={tip}>
              <span style={{
                width: 18, height: 18, borderRadius: '50%', background: GOLD, color: NAVY,
                fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>{n}</span>
              <span style={{ fontSize: 12, color: `rgba(var(--fg-rgb),0.7)` }}>{label}</span>
            </div>
          ))}
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 11, color: `rgba(var(--fg-rgb),0.4)`, fontStyle: 'italic', flexShrink: 0 }}>
            Tip: if a position is already taken, that player goes blank so you know to fill it
          </div>
          <button
            onClick={() => setShowTip(false)}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer',
              color: `rgba(var(--fg-rgb),0.35)`, fontSize: 16, padding: '0 4px', flexShrink: 0 }}
          >×</button>
        </div>
      )}

      {/* ─── THREE PANELS ─── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── LEFT: Roster + Palette ── */}
        <div style={{
          width: 214, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: '1px solid var(--border)', overflow: 'hidden',
        }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>

            {/* Active players */}
            <div style={{ ...secLabel, display: 'flex', justifyContent: 'space-between', paddingRight: 10 }}>
              <span>Batting order · {activeSlots.length}</span>
              <span style={{ fontSize: 9, color: `rgba(var(--fg-rgb),0.22)`, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
                drag to reorder
              </span>
            </div>
            {activeSlots.map((slot, si) => (
              <div
                key={slot.id}
                draggable
                onDragStart={() => setDragId(slot.id)}
                onDragOver={e => { e.preventDefault(); setDragOverId(slot.id) }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={() => handleDrop(slot.id)}
                onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 8px', cursor: 'grab',
                  borderTop: dragOverId === slot.id ? `2px solid rgba(59,109,177,0.6)` : '2px solid transparent',
                  background: dragOverId === slot.id ? 'rgba(59,109,177,0.07)' : 'transparent',
                  opacity: dragId === slot.id ? 0.35 : 1,
                  transition: 'background 0.08s',
                }}
              >
                <span style={{ fontSize: 10, color: `rgba(var(--fg-rgb),0.22)`, width: 14, textAlign: 'right', flexShrink: 0 }}>
                  {si + 1}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                  <button onClick={() => nudgeBattingOrder(slot.id, 'up')} style={nudge}>▴</button>
                  <button onClick={() => nudgeBattingOrder(slot.id, 'down')} style={nudge}>▾</button>
                </div>
                <span style={{ fontSize: 10, color: `rgba(var(--fg-rgb),0.28)`, width: 22, textAlign: 'right', flexShrink: 0 }}>
                  #{slot.player?.jersey_number}
                </span>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {slot.player?.first_name?.[0]}. {slot.player?.last_name}
                </span>
                <button
                  onClick={() => toggleAbsent(slot.id)}
                  title="Mark absent"
                  style={{
                    flexShrink: 0, width: 15, height: 15, borderRadius: 3,
                    border: '1px solid var(--border-md)', background: 'transparent',
                    cursor: 'pointer', fontSize: 8, padding: 0,
                    color: `rgba(var(--fg-rgb),0.28)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >✕</button>
              </div>
            ))}

            {/* Absent players */}
            {absentSlots.length > 0 && (
              <>
                <div style={{ ...secLabel, paddingTop: 12 }}>Absent · {absentSlots.length}</div>
                {absentSlots.map(slot => (
                  <div key={slot.id} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '4px 8px 4px 36px', opacity: 0.38,
                  }}>
                    <span style={{ fontSize: 10, color: `rgba(var(--fg-rgb),0.3)`, width: 22, textAlign: 'right', flexShrink: 0 }}>
                      #{slot.player?.jersey_number}
                    </span>
                    <span style={{ flex: 1, fontSize: 12, textDecoration: 'line-through', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {slot.player?.first_name?.[0]}. {slot.player?.last_name}
                    </span>
                    <button
                      onClick={() => toggleAbsent(slot.id)}
                      title="Mark present"
                      style={{
                        flexShrink: 0, width: 15, height: 15, borderRadius: 3,
                        border: '1px solid rgba(109,184,117,0.45)', background: 'rgba(109,184,117,0.1)',
                        cursor: 'pointer', fontSize: 8, padding: 0, color: '#6DB875',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}
                    >↩</button>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Position palette */}
          <div style={{ padding: '10px 10px 14px', borderTop: '1px solid var(--border)', background: 'var(--bg-card)' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: `rgba(var(--fg-rgb),0.5)`, marginBottom: 8 }}>
              {selectedCells.size > 0
                ? `Fill ${selectedCells.size} selected cell${selectedCells.size > 1 ? 's' : ''}:`
                : 'Select cells, then fill:'}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {teamPositions.map(pos => {
                const isActive = activePos === pos
                const pc = POS_COLOR[pos]
                const sc = POS_KEY[pos]
                return (
                  <button
                    key={pos}
                    onClick={() => { setActivePos(pos); fillSelected(pos) }}
                    style={{
                      padding: '4px 7px', borderRadius: 5, cursor: 'pointer',
                      position: 'relative', minWidth: 34, textAlign: 'center',
                      fontSize: 11, fontWeight: 700,
                      border: `1.5px solid ${isActive ? (pc?.color ?? 'var(--accent)') : 'var(--border-md)'}`,
                      background: isActive ? (pc?.bg ?? 'transparent') : 'transparent',
                      color: isActive ? (pc?.color ?? 'var(--fg)') : `rgba(var(--fg-rgb),0.5)`,
                      boxShadow: isActive ? `0 0 0 2px ${pc?.color ?? 'var(--accent)'}22` : 'none',
                    }}
                  >
                    {pos}
                    {sc && (
                      <span style={{ position: 'absolute', bottom: 0, right: 2, fontSize: 6, opacity: 0.4, fontWeight: 400 }}>
                        {sc}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── CENTER: Grid ── */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: 28 }} />
              <col style={{ width: 150 }} />
              {innings.map(i => <col key={i} style={{ width: 54 }} />)}
              <col style={{ width: 62 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={gHdr}>#</th>
                <th style={{ ...gHdr, textAlign: 'left', paddingLeft: 10 }}>Player</th>
                {innings.map(ii => {
                  // Per-inning validation indicators
                  const counts: Record<string, number> = {}
                  for (const s of activeSlots) {
                    const p = (s.inning_positions ?? [])[ii]
                    if (p) counts[p] = (counts[p] ?? 0) + 1
                  }
                  const hasDupe = Object.values(counts).some(v => v > 1)
                  const allFilled = activeSlots.length > 0 && activeSlots.every(s => (s.inning_positions ?? [])[ii])
                  const hasMissing = teamPositions.filter(p => p !== 'Bench').some(p => !counts[p])
                  const valid = allFilled && !hasDupe && !hasMissing
                  return (
                    <th
                      key={ii}
                      style={{ ...gHdr }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1, gap: 2 }}>
                        <span>{ii + 1}</span>
                        <span style={{ fontSize: 8 }}>
                          {hasDupe ? <span style={{ color: '#E87060' }}>⚠</span> : valid ? <span style={{ color: '#6DB875' }}>✓</span> : null}
                        </span>
                      </div>
                    </th>
                  )
                })}
                <th
                  style={{ ...gHdr, fontSize: 9 }}
                  title={benchPerInning > 0
                    ? `${benchPerInning} player${benchPerInning !== 1 ? 's' : ''} bench each inning. Each player should bench ~${expectedBenchInnings.toFixed(1)} innings.`
                    : 'Everyone plays every inning'}
                >
                  <div style={{ lineHeight: 1.3 }}>
                    <div>Bench</div>
                    {benchPerInning > 0 && (
                      <div style={{ fontSize: 7, opacity: 0.5, fontWeight: 400 }}>
                        ~{expectedBenchInnings.toFixed(1)} exp
                      </div>
                    )}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {activeSlots.map((slot, si) => {
                const bi = benchInnings(slot, inningCount)
                const ai = assignedInnings(slot, inningCount)
                // Color based on whether this player has benched more/less than their fair share
                const bpColor = bi === 0
                  ? `rgba(var(--fg-rgb),0.18)`
                  : bi > expectedBenchInnings + 1.0 ? '#E87060'
                  : bi > expectedBenchInnings + 0.5 ? '#E8A020'
                  : '#6DB875'
                return (
                  <tr
                    key={slot.id}
                    style={{
                      background: si % 2 === 0 ? 'transparent' : 'rgba(var(--fg-rgb),0.018)',
                    }}
                  >
                    <td style={{ ...gCell, textAlign: 'center', color: `rgba(var(--fg-rgb),0.22)`, fontSize: 10 }}>
                      {si + 1}
                    </td>
                    <td style={{
                      ...gCell, paddingLeft: 10, fontWeight: 600, fontSize: 13,
                      position: 'sticky', left: 0, zIndex: 1,
                      background: 'var(--bg)',
                      borderRight: '1px solid var(--border)',
                      maxWidth: 0, overflow: 'hidden',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                        <span style={{ fontSize: 10, color: `rgba(var(--fg-rgb),0.28)`, marginRight: 5, flexShrink: 0 }}>
                          #{slot.player?.jersey_number}
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                          {slot.player?.first_name?.[0]}. {slot.player?.last_name}
                        </span>
                      </div>
                    </td>

                    {innings.map(ii => {
                      const pos = (slot.inning_positions ?? [])[ii] ?? null
                      const pc = pos ? POS_COLOR[pos] : null
                      const cellKey = `${si}-${ii}`
                      const isFoc = focused?.si === si && focused?.ii === ii
                      const isSel = selectedCells.has(cellKey)
                      const isDupe = !!(pos && pos !== 'Bench' &&
                        activeSlots.filter(s => (s.inning_positions ?? [])[ii] === pos).length > 1)

                      return (
                        <td
                          key={ii}
                          onClick={(e) => {
                            if (e.shiftKey && focused !== null && focused.si === si) {
                              // Range-select from anchor to clicked cell
                              const anchor = anchorRef.current ?? focused
                              const lo = Math.min(anchor.ii, ii)
                              const hi = Math.max(anchor.ii, ii)
                              const next = new Set<string>()
                              for (let i = lo; i <= hi; i++) next.add(`${si}-${i}`)
                              setSelectedCells(next)
                              setFocused({ si, ii })
                            } else if (e.metaKey || e.ctrlKey) {
                              // Toggle individual cell
                              setSelectedCells(prev => {
                                const next = new Set(prev)
                                if (next.has(cellKey)) next.delete(cellKey)
                                else next.add(cellKey)
                                return next
                              })
                              setFocused({ si, ii })
                              anchorRef.current = { si, ii }
                            } else {
                              // Single select — sets anchor for future shift-selections
                              setSelectedCells(new Set([cellKey]))
                              setFocused({ si, ii })
                              anchorRef.current = { si, ii }
                            }
                          }}
                          title={pos ? pos : 'Click to select · shift+click to extend · ⌘+click to toggle'}
                          style={{
                            ...gCell,
                            textAlign: 'center', cursor: 'pointer',
                            background: isFoc
                              ? 'rgba(59,109,177,0.3)'
                              : isSel
                                ? 'rgba(59,109,177,0.14)'
                                : pc ? pc.bg : 'transparent',
                            outline: isFoc
                              ? '2px solid rgba(59,109,177,0.85)'
                              : isSel
                                ? '1.5px solid rgba(59,109,177,0.4)'
                                : isDupe
                                  ? '2px solid rgba(232,112,96,0.7)'
                                  : 'none',
                            outlineOffset: -2,
                            transition: 'background 0.05s',
                          }}
                        >
                          <span style={{
                            fontSize: 12, fontWeight: 800,
                            color: isFoc ? '#fff' : isSel ? 'rgba(128,176,232,0.9)' : isDupe ? '#E87060' : (pc?.color ?? `rgba(var(--fg-rgb),0.15)`),
                          }}>
                            {pos === 'Bench' ? 'B' : (pos ?? '·')}
                          </span>
                        </td>
                      )
                    })}

                    <td
                      style={{ ...gCell, textAlign: 'center' }}
                      title={bi > 0
                        ? `${bi} bench inning${bi !== 1 ? 's' : ''} of ${ai} assigned (expected ~${expectedBenchInnings.toFixed(1)})`
                        : ai > 0 ? 'No bench innings yet' : 'No innings assigned'}
                    >
                      {bi > 0 ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: bpColor }}>
                          {bi}
                          <span style={{ fontSize: 8, opacity: 0.6, fontWeight: 400 }}> inn</span>
                        </span>
                      ) : (
                        <span style={{ fontSize: 11, color: `rgba(var(--fg-rgb),0.18)` }}>—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* ── Inning summary ── */}
          <div style={{ borderTop: '1px solid var(--border)', padding: '10px 0 14px' }}>
            <div style={{ ...secLabel, padding: '0 10px 8px' }}>Inning summary</div>
            <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                <col style={{ width: 28 }} />
                <col style={{ width: 150 }} />
                <col style={{ width: 40 }} />
                <col style={{ width: 40 }} />
                <col style={{ width: 40 }} />
                <col style={{ width: 40 }} />
                <col style={{ width: 50 }} />
              </colgroup>
              <thead>
                <tr>
                  <th style={{ ...gHdr, position: 'static' }} />
                  <th style={{ ...gHdr, position: 'static', textAlign: 'left', paddingLeft: 10 }}>Player</th>
                  <th style={{ ...gHdr, position: 'static' }} title="Pitcher innings">P</th>
                  <th style={{ ...gHdr, position: 'static' }} title="Catcher innings">C</th>
                  <th style={{ ...gHdr, position: 'static' }} title="Infield innings (1B 2B SS 3B)">IF</th>
                  <th style={{ ...gHdr, position: 'static' }} title="Outfield innings">OF</th>
                  <th style={{ ...gHdr, position: 'static' }} title="Bench innings">Bench</th>
                </tr>
              </thead>
              <tbody>
                {activeSlots.map((slot, si) => {
                  const pos = (slot.inning_positions ?? []).slice(0, inningCount) as (string|null)[]
                  const pIn    = pos.filter(p => p === 'P').length
                  const cIn    = pos.filter(p => p === 'C').length
                  const ifIn   = pos.filter(p => IF_POS.has(p ?? '')).length
                  const ofIn   = pos.filter(p => OF_POS.has(p ?? '')).length
                  const benchIn = pos.filter(p => p === 'Bench').length
                  const cell = (count: number, pc: typeof POS_COLOR[string] | undefined) => (
                    <td key={count} style={{ ...gCell, textAlign: 'center' }}>
                      {count > 0 ? (
                        <span style={{ fontSize: 11, fontWeight: 700, color: pc?.color ?? 'var(--fg)' }}>{count}</span>
                      ) : (
                        <span style={{ fontSize: 11, color: `rgba(var(--fg-rgb),0.15)` }}>—</span>
                      )}
                    </td>
                  )
                  return (
                    <tr key={slot.id} style={{ background: si % 2 === 0 ? 'transparent' : `rgba(var(--fg-rgb),0.018)` }}>
                      <td style={{ ...gCell, textAlign: 'center', color: `rgba(var(--fg-rgb),0.22)`, fontSize: 10 }}>{si + 1}</td>
                      <td style={{ ...gCell, paddingLeft: 10, fontSize: 12, maxWidth: 0, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                          <span style={{ fontSize: 9, color: `rgba(var(--fg-rgb),0.28)`, marginRight: 4, flexShrink: 0 }}>#{slot.player?.jersey_number}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                            {slot.player?.first_name?.[0]}. {slot.player?.last_name}
                          </span>
                        </div>
                      </td>
                      {cell(pIn,    POS_COLOR.P)}
                      {cell(cIn,    POS_COLOR.C)}
                      {cell(ifIn,   POS_COLOR['1B'])}
                      {cell(ofIn,   POS_COLOR.LF)}
                      {cell(benchIn, POS_COLOR.Bench)}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── RIGHT: Context ── */}
        <div style={{
          width: 186, flexShrink: 0, borderLeft: '1px solid var(--border)',
          overflowY: 'auto', padding: 12,
        }}>
          <div style={{ ...secLabel, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Inning {summaryII + 1}</span>
            {focused && <span style={{ opacity: 0.55, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
              {focused.ii === summaryII ? '' : ''}
            </span>}
          </div>

          {teamPositions.filter(p => p !== 'Bench').map(pos => {
            const players = posSummary[pos] ?? []
            const dupe = players.length > 1
            const empty = players.length === 0
            const pc = POS_COLOR[pos]
            return (
              <div key={pos} style={{
                display: 'flex', alignItems: 'center', gap: 5, padding: '2px 4px',
                borderRadius: 4, marginBottom: 2,
                background: dupe ? 'rgba(232,112,96,0.08)' : 'transparent',
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 800, minWidth: 24, padding: '1px 3px',
                  borderRadius: 3, textAlign: 'center', flexShrink: 0,
                  background: pc?.bg ?? 'transparent', color: pc?.color ?? 'var(--fg)',
                }}>
                  {pos}
                </span>
                <span style={{
                  fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: dupe ? '#E87060' : empty ? `rgba(var(--fg-rgb),0.2)` : 'var(--fg)',
                  fontStyle: empty ? 'italic' : 'normal',
                }}>
                  {empty ? '—' : players.join(', ')}
                </span>
                {dupe && <span style={{ fontSize: 9, color: '#E87060', flexShrink: 0 }}>!</span>}
              </div>
            )
          })}

          {(posSummary['Bench']?.length ?? 0) > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 4px', borderRadius: 4, marginBottom: 2 }}>
              <span style={{ fontSize: 9, fontWeight: 800, minWidth: 24, padding: '1px 3px', borderRadius: 3,
                textAlign: 'center', flexShrink: 0,
                background: 'rgba(120,120,120,0.12)', color: `rgba(var(--fg-rgb),0.4)` }}>
                B
              </span>
              <span style={{ fontSize: 11, color: `rgba(var(--fg-rgb),0.38)`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {posSummary['Bench'].join(', ')}
              </span>
            </div>
          )}

          {(posSummary['_empty']?.length ?? 0) > 0 && (
            <div style={{ marginTop: 6, padding: '5px 7px', borderRadius: 5,
              background: 'rgba(232,160,32,0.08)', border: '0.5px solid rgba(232,160,32,0.25)' }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#E8A020', marginBottom: 3, letterSpacing: '0.06em' }}>
                UNASSIGNED
              </div>
              {posSummary['_empty'].map(n => (
                <div key={n} style={{ fontSize: 11, color: '#E8A020' }}>{n}</div>
              ))}
            </div>
          )}

          {/* Bench context */}
          {activeSlots.length > 0 && (
            <div style={{ marginTop: 10, padding: '7px 9px', borderRadius: 5,
              background: 'var(--bg-card)', border: '0.5px solid var(--border)' }}>
              {benchPerInning > 0 ? (
                <>
                  <div style={{ fontSize: 11, fontWeight: 600, color: `rgba(var(--fg-rgb),0.6)`, marginBottom: 2 }}>
                    {benchPerInning} on bench each inning
                  </div>
                  <div style={{ fontSize: 10, color: `rgba(var(--fg-rgb),0.38)` }}>
                    ~{expectedBenchInnings.toFixed(1)} bench innings per player over {inningCount} innings
                  </div>
                  {absentSlots.length > 0 && (
                    <div style={{ fontSize: 10, color: `rgba(var(--fg-rgb),0.35)`, marginTop: 3 }}>
                      ({absentSlots.length} absent, {activeSlots.length} active)
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 11, color: `rgba(var(--fg-rgb),0.45)` }}>
                  All {activeSlots.length} players field every inning
                </div>
              )}
            </div>
          )}

          {/* Player position history — shown when a cell is focused */}
          {focused && (() => {
            const focusedSlot = activeSlots[focused.si]
            if (!focusedSlot) return null
            const ph = playerPositionHistory[focusedSlot.player_id] ?? {}
            const hasHistory = Object.values(ph).some(v => v > 0)
            const maxVal = Math.max(1, ...Object.values(ph))
            return (
              <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6,
                background: 'var(--bg-card)', border: '0.5px solid var(--border)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                  color: `rgba(var(--fg-rgb),0.3)`, textTransform: 'uppercase', marginBottom: 7 }}>
                  {focusedSlot.player?.first_name?.[0]}. {focusedSlot.player?.last_name} · this season
                </div>
                {!hasHistory ? (
                  <div style={{ fontSize: 10, color: `rgba(var(--fg-rgb),0.3)`, fontStyle: 'italic' }}>
                    No final games yet
                  </div>
                ) : teamPositions.map(pos => {
                  const count = ph[pos] ?? 0
                  const isActive = activePos === pos
                  const pc = POS_COLOR[pos]
                  const barPct = Math.round((count / maxVal) * 100)
                  return (
                    <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                      <span style={{
                        fontSize: 8, fontWeight: 800, minWidth: 22, textAlign: 'center',
                        padding: '1px 2px', borderRadius: 2, flexShrink: 0,
                        background: isActive ? (pc?.bg ?? 'transparent') : 'transparent',
                        color: isActive ? (pc?.color ?? 'var(--fg)') : `rgba(var(--fg-rgb),0.35)`,
                      }}>
                        {pos === 'Bench' ? 'B' : pos}
                      </span>
                      <div style={{ flex: 1, height: 4, borderRadius: 2,
                        background: `rgba(var(--fg-rgb),0.07)`, overflow: 'hidden' }}>
                        {count > 0 && (
                          <div style={{
                            width: `${barPct}%`, height: '100%', borderRadius: 2,
                            background: isActive ? (pc?.color ?? 'var(--accent)') : `rgba(var(--fg-rgb),0.18)`,
                          }} />
                        )}
                      </div>
                      <span style={{
                        fontSize: 9, minWidth: 14, textAlign: 'right', flexShrink: 0,
                        color: isActive ? (pc?.color ?? 'var(--fg)') : `rgba(var(--fg-rgb),0.3)`,
                        fontWeight: isActive ? 700 : 400,
                      }}>
                        {count}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* Last game breakdown — shown when a cell is focused */}
          {focused && (() => {
            const focusedSlot = activeSlots[focused.si]
            if (!focusedSlot) return null
            const lg = lastGameHistory[focusedSlot.player_id]
            const histKeys = Object.keys(lastGameHistory)
            return (
              <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 6,
                background: 'var(--bg-card)', border: '0.5px solid var(--border)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                  color: `rgba(var(--fg-rgb),0.3)`, textTransform: 'uppercase', marginBottom: 6 }}>
                  Last game
                </div>
                {!lg ? (
                  <div style={{ fontSize: 10, color: `rgba(var(--fg-rgb),0.35)`, fontStyle: 'italic' }}>
                    {histKeys.length === 0
                      ? 'No previous game found'
                      : 'Not in previous game'}
                  </div>
                ) : ([
                  ['Pitcher',  lg.P,     POS_COLOR.P],
                  ['Catcher',  lg.C,     POS_COLOR.C],
                  ['Infield',  lg.IF,    POS_COLOR['1B']],
                  ['Outfield', lg.OF,    POS_COLOR.LF],
                  ['Bench',    lg.Bench, POS_COLOR.Bench],
                ] as [string, number, typeof POS_COLOR[string] | undefined][]).map(([label, count, pc]) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: count > 0 ? (pc?.color ?? `rgba(var(--fg-rgb),0.55)`) : `rgba(var(--fg-rgb),0.25)` }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: count > 0 ? 700 : 400,
                      color: count > 0 ? (pc?.color ?? 'var(--fg)') : `rgba(var(--fg-rgb),0.2)` }}>
                      {count > 0 ? `${count} inn` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )
          })()}

          {/* Game notes */}
          <div style={{ marginTop: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ ...secLabel, padding: 0 }}>Notes</span>
              {!notesSaved && <span style={{ fontSize: 9, color: `rgba(var(--fg-rgb),0.3)` }}>saving…</span>}
            </div>
            <textarea
              value={gameNotes}
              onChange={e => handleNotesChange(e.target.value)}
              placeholder="e.g. Connor hurt his arm — no pitching"
              rows={3}
              style={{
                width: '100%', padding: '7px 9px', borderRadius: 6,
                border: '0.5px solid var(--border-md)',
                background: 'var(--bg-input)', color: 'var(--fg)',
                fontSize: 11, resize: 'vertical', boxSizing: 'border-box',
                fontFamily: 'inherit', lineHeight: 1.5,
              }}
            />
          </div>

          {/* Keyboard shortcuts — collapsible */}
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => setShowShortcuts(s => !s)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                fontSize: 10, color: `rgba(var(--fg-rgb),0.35)`, display: 'flex',
                alignItems: 'center', gap: 4 }}
            >
              <span style={{ fontSize: 8 }}>{showShortcuts ? '▾' : '▸'}</span>
              Keyboard shortcuts
            </button>
            {showShortcuts && (
              <div style={{ marginTop: 7, padding: '8px 10px', borderRadius: 6,
                background: 'var(--bg-card)', border: '0.5px solid var(--border)' }}>
                {([
                  ['click', 'Select cell'],
                  ['shift+← →', 'Extend selection (same row)'],
                  ['shift+click', 'Extend selection (same row)'],
                  ['⌘+click', 'Toggle cell'],
                  ['←↑↓→ / Tab', 'Move selection'],
                  ['p c 1 2 s 3', 'Fill: P C 1B 2B SS 3B'],
                  ['l  m  r  b', 'Fill: LF CF RF Bench'],
                  ['Del', 'Clear selected cells'],
                  ['⌘Z / ⌘⇧Z', 'Undo / Redo'],
                ] as [string, string][]).map(([k, d]) => (
                  <div key={k} style={{ display: 'flex', gap: 5, marginBottom: 3, alignItems: 'center' }}>
                    <code style={{
                      fontSize: 9, background: 'var(--bg)', padding: '1px 4px',
                      borderRadius: 3, border: '0.5px solid var(--border-md)',
                      color: `rgba(var(--fg-rgb),0.55)`, flexShrink: 0,
                      fontFamily: 'ui-monospace, monospace',
                    }}>
                      {k}
                    </code>
                    <span style={{ fontSize: 10, color: `rgba(var(--fg-rgb),0.38)` }}>{d}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Copy modal ─── */}
      {copyOpen && (
        <div
          onClick={() => setCopyOpen(false)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg2)', borderRadius: 12, padding: '1.5rem',
            width: 380, border: '0.5px solid var(--border)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Copy from another game</div>
            <div style={{ fontSize: 12, color: `rgba(var(--fg-rgb),0.4)`, marginBottom: '1.25rem' }}>
              Import batting order and/or positions from a previous game.
            </div>
            <select value={copyGameId} onChange={e => setCopyGameId(e.target.value)} style={{
              width: '100%', padding: '9px 12px', borderRadius: 8,
              border: '0.5px solid var(--border-md)', background: 'var(--bg-card)',
              color: 'var(--fg)', fontSize: 13, marginBottom: 10, boxSizing: 'border-box',
            }}>
              <option value=''>— select a game —</option>
              {copyGames.map(g => (
                <option key={g.id} value={g.id}>
                  vs {g.opponent} · {new Date(g.game_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem' }}>
              {(['full', 'order'] as const).map(m => (
                <button key={m} onClick={() => setCopyMode(m)} style={{
                  flex: 1, padding: '8px', borderRadius: 8, cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  border: `1.5px solid ${copyMode === m ? 'var(--accent)' : 'var(--border-md)'}`,
                  background: copyMode === m ? 'rgba(59,109,177,0.1)' : 'transparent',
                  color: copyMode === m ? 'var(--accent)' : `rgba(var(--fg-rgb),0.55)`,
                }}>
                  {m === 'full' ? 'Full lineup' : 'Batting order only'}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setCopyOpen(false)} style={{
                flex: 1, padding: 10, borderRadius: 8, fontSize: 13,
                border: '0.5px solid var(--border-strong)', background: 'transparent',
                color: `rgba(var(--fg-rgb),0.6)`, cursor: 'pointer',
              }}>Cancel</button>
              <button onClick={doCopy} disabled={!copyGameId || copying} style={{
                flex: 2, padding: 10, borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700,
                background: 'var(--accent)', color: 'var(--accent-text)',
                cursor: copyGameId && !copying ? 'pointer' : 'not-allowed',
                opacity: copyGameId && !copying ? 1 : 0.6,
              }}>
                {copying ? 'Copying…' : 'Copy lineup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Style constants ───────────────────────────────────────────────────────────

function topBtn(active: boolean): React.CSSProperties {
  return {
    padding: '5px 10px', borderRadius: 5, border: 'none',
    cursor: active ? 'pointer' : 'not-allowed',
    background: 'rgba(255,255,255,0.08)',
    color: active ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.2)',
    fontSize: 12, fontWeight: 500, flexShrink: 0,
  }
}

const secLabel: React.CSSProperties = {
  padding: '0 10px 6px',
  fontSize: 9, fontWeight: 700, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: `rgba(var(--fg-rgb),0.26)`,
}

const nudge: React.CSSProperties = {
  width: 12, height: 9, border: 'none', background: 'transparent',
  cursor: 'pointer', padding: 0, fontSize: 8, lineHeight: 1,
  color: `rgba(var(--fg-rgb),0.28)`,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}

const gHdr: React.CSSProperties = {
  padding: '6px 3px', textAlign: 'center',
  fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
  color: `rgba(var(--fg-rgb),0.32)`,
  background: 'var(--bg-card)',
  borderBottom: '1px solid var(--border)',
  position: 'sticky', top: 0, zIndex: 10,
  whiteSpace: 'nowrap',
}

const gCell: React.CSSProperties = {
  padding: '0 3px', height: 34,
  borderBottom: '0.5px solid var(--border-subtle)',
  borderRight: '0.5px solid var(--border-subtle)',
  boxSizing: 'border-box',
}
