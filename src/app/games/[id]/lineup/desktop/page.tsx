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
  const [prevGameId, setPrevGameId]     = useState<string | null>(null)
  const [nextGameId, setNextGameId]     = useState<string | null>(null)
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
  const [pitchingHistory, setPitchingHistory] = useState<Record<string, {lastDate:string,lastInnings:number,daysSince:number}>>({})
  // selectedCells: Set of "si-ii" keys. Click = select only; palette/key = fill.
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set())
  const [confirmClear, setConfirmClear] = useState(false)
  const [readOnly, setReadOnly]         = useState(false)
  const [locked, setLocked]             = useState(false)
  const [isOwner, setIsOwner]           = useState(false)
  const [showBattingOrderModal, setShowBattingOrderModal] = useState(false)
  const [prevGameForBatting, setPrevGameForBatting] = useState<{id:string,opponent:string,game_date:string}|null>(null)
  const [restrictedSet, setRestrictedSet] = useState<Set<string>>(new Set())
  const [dcWarning, setDcWarning]       = useState<string | null>(null)
  const [showPlayerNotes, setShowPlayerNotes] = useState(false)
  const [playerNoteInputs, setPlayerNoteInputs] = useState<Record<string, string>>({})
  const [savingPlayerNotes, setSavingPlayerNotes] = useState(false)
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
      .select('*, season:seasons(innings_per_game, team_id, team:teams(name, positions))')
      .eq('id', params.id).single()
    setGame(gameData)

    // Adjacent-game navigation
    if ((gameData as any)?.season_id) {
      const { data: seasonGames } = await supabase
        .from('games')
        .select('id, game_date')
        .eq('season_id', (gameData as any).season_id)
        .not('game_date', 'is', null)
        .order('game_date', { ascending: true })
      if (seasonGames?.length) {
        const idx = seasonGames.findIndex((g: any) => g.id === params.id)
        setPrevGameId(idx > 0 ? seasonGames[idx - 1].id : null)
        setNextGameId(idx < seasonGames.length - 1 ? seasonGames[idx + 1].id : null)
      }
    }

    const rawNotes = (gameData as any)?.notes ?? null
    notesRawRef.current = rawNotes
    try { setGameNotes(JSON.parse(rawNotes ?? '{}')._notes ?? '') } catch { setGameNotes('') }

    const team = (gameData as any)?.season?.team
    const positions: string[] = team?.positions?.length
      ? team.positions
      : ['P','C','1B','2B','SS','3B','LF','CF','RF','Bench']
    setTeamPositions(positions)
    setActivePos(positions[0] ?? 'P')

    // Check membership: read_only flag, owner role, and locked status
    const { data: { user } } = await supabase.auth.getUser()
    if (user && (gameData as any)?.season?.team_id) {
      const { data: membership } = await supabase
        .from('team_members')
        .select('read_only, role')
        .eq('team_id', (gameData as any).season.team_id)
        .eq('user_id', user.id)
        .maybeSingle()
      const ownerRole = membership?.role === 'owner'
      setIsOwner(ownerRole)
      if (membership?.read_only) setReadOnly(true)
      const isLocked = (gameData as any)?.locked ?? false
      setLocked(isLocked)
      if (isLocked && !ownerRole) setReadOnly(true)
    }

    // Load position history (runs before slot check so it's available after batting order modal)
    if (gameData?.season_id) {
      const currentDate = (gameData as any)?.game_date ?? null
      const defaultInn  = (gameData as any)?.season?.innings_per_game ?? 6

      const { data: statsData } = await supabase
        .from('season_position_stats')
        .select('player_id, innings_p, innings_c, innings_1b, innings_2b, innings_ss, innings_3b, innings_lf, innings_cf, innings_rf, innings_bench')
        .eq('season_id', gameData.season_id)

      const ph: Record<string, Record<string, number>> = {}
      for (const row of statsData ?? []) {
        ph[row.player_id] = {
          P: row.innings_p ?? 0, C: row.innings_c ?? 0,
          '1B': row.innings_1b ?? 0, '2B': row.innings_2b ?? 0,
          SS: row.innings_ss ?? 0, '3B': row.innings_3b ?? 0,
          LF: row.innings_lf ?? 0, CF: row.innings_cf ?? 0,
          RF: row.innings_rf ?? 0, Bench: row.innings_bench ?? 0,
        }
      }

      let nonFinalQuery = supabase
        .from('games')
        .select('id, innings_played, game_date')
        .eq('season_id', (gameData as any).season_id)
        .neq('id', params.id)
        .neq('status', 'final')
      if (currentDate) nonFinalQuery = (nonFinalQuery as any).lt('game_date', currentDate)

      const { data: nonFinalGames } = await nonFinalQuery
      if (nonFinalGames?.length) {
        const { data: nonFinalSlots } = await supabase
          .from('lineup_slots')
          .select('player_id, inning_positions, availability, game_id')
          .in('game_id', nonFinalGames.map((g: any) => g.id))

        for (const slot of nonFinalSlots ?? []) {
          if (slot.availability === 'absent') continue
          const game = nonFinalGames.find((g: any) => g.id === slot.game_id)
          const maxInn = game?.innings_played ?? defaultInn
          const pos = (slot.inning_positions ?? []).slice(0, maxInn) as (string|null)[]
          if (!ph[slot.player_id]) {
            ph[slot.player_id] = { P:0, C:0, '1B':0, '2B':0, SS:0, '3B':0, LF:0, CF:0, RF:0, Bench:0 }
          }
          const r = ph[slot.player_id]
          r.P     += pos.filter(p => p === 'P').length
          r.C     += pos.filter(p => p === 'C').length
          r['1B'] += pos.filter(p => p === '1B').length
          r['2B'] += pos.filter(p => p === '2B').length
          r.SS    += pos.filter(p => p === 'SS').length
          r['3B'] += pos.filter(p => p === '3B').length
          r.LF    += pos.filter(p => p === 'LF').length
          r.CF    += pos.filter(p => p === 'CF').length
          r.RF    += pos.filter(p => p === 'RF').length
          r.Bench += pos.filter(p => p === 'Bench').length
        }
      }

      if (Object.keys(ph).length) setPlayerPositionHistory(ph)

      // Last game breakdown for right panel context
      const { data: otherGames } = await supabase
        .from('games')
        .select('id, innings_played, game_date, status')
        .eq('season_id', gameData.season_id)
        .neq('id', params.id)
        .order('created_at', { ascending: false })

      const sorted = (otherGames ?? [])
        .filter(g => g.game_date)
        .sort((a, b) => new Date(b.game_date).getTime() - new Date(a.game_date).getTime())
      const prevGame =
        sorted.find(g => !currentDate || g.game_date < currentDate) ??
        sorted[0] ??
        (otherGames ?? [])[0]
      if (prevGame) {
        const { data: prevSlots } = await supabase
          .from('lineup_slots')
          .select('player_id, inning_positions, availability')
          .eq('game_id', prevGame.id)
        if (prevSlots) {
          const prevInn = prevGame.innings_played ?? (gameData as any).season?.innings_per_game ?? 6
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

      // Pitching history for rest-days widget
      let prevGamesQuery = supabase
        .from('games')
        .select('id, game_date, innings_played')
        .eq('season_id', (gameData as any).season_id)
        .neq('id', params.id)
        .not('game_date', 'is', null)
        .order('game_date', { ascending: false })
        .limit(20)
      if (currentDate) prevGamesQuery = (prevGamesQuery as any).lt('game_date', currentDate)

      const { data: prevGamesForPitching } = await prevGamesQuery
      if (prevGamesForPitching?.length) {
        const { data: pitchSlots } = await supabase
          .from('lineup_slots')
          .select('player_id, inning_positions, game_id')
          .in('game_id', prevGamesForPitching.map((g: any) => g.id))

        const pitchHist: Record<string, {lastDate:string,lastInnings:number,daysSince:number}> = {}
        for (const game of prevGamesForPitching) {
          const gameSlots = (pitchSlots ?? []).filter((s: any) => s.game_id === game.id)
          const gameInn = game.innings_played ?? defaultInn
          for (const slot of gameSlots) {
            if (pitchHist[slot.player_id]) continue
            const pCount = (slot.inning_positions ?? []).slice(0, gameInn)
              .filter((p: string|null) => p === 'P').length
            if (pCount > 0) {
              const referenceDate = currentDate
                ? new Date(currentDate + 'T12:00:00').getTime()
                : Date.now()
              const daysSince = Math.floor(
                (referenceDate - new Date(game.game_date + 'T12:00:00').getTime()) / 86400000
              )
              pitchHist[slot.player_id] = { lastDate: game.game_date, lastInnings: pCount, daysSince }
            }
          }
        }
        setPitchingHistory(pitchHist)
      }
    }

    // Depth chart restrictions
    if (gameData?.season_id) {
      const { data: dcRows } = await supabase
        .from('depth_chart')
        .select('player_id, position')
        .eq('season_id', gameData.season_id)
        .eq('restricted', true)
      setRestrictedSet(new Set((dcRows ?? []).map((r: any) => `${r.player_id}::${r.position}`)))
    }

    // Fetch existing slots
    let { data: slotData } = await supabase
      .from('lineup_slots')
      .select('*, player:players(first_name, last_name, jersey_number, innings_target)')
      .eq('game_id', params.id)
      .order('batting_order', { ascending: true, nullsFirst: false })

    // If no slots exist yet, offer batting order choice if a previous game has slots
    if (!slotData?.length && gameData?.season_id) {
      const { data: recentGames } = await supabase
        .from('games')
        .select('id, opponent, game_date')
        .eq('season_id', gameData.season_id)
        .neq('id', params.id)
        .not('game_date', 'is', null)
        .order('game_date', { ascending: false })
        .limit(5)

      let prevWithSlots: { id: string; opponent: string; game_date: string } | null = null
      for (const pg of recentGames ?? []) {
        const { count } = await supabase
          .from('lineup_slots')
          .select('id', { count: 'exact', head: true })
          .eq('game_id', pg.id)
        if ((count ?? 0) > 0) { prevWithSlots = pg; break }
      }

      if (prevWithSlots) {
        setPrevGameForBatting(prevWithSlots)
        setShowBattingOrderModal(true)
        setLoading(false)
        return
      }

      // No previous game with slots — auto-create from roster batting order
      const { data: players } = await supabase
        .from('players')
        .select('id, first_name, last_name, jersey_number, batting_pref_order, innings_target')
        .eq('season_id', gameData.season_id)
        .eq('status', 'active')
        .order('batting_pref_order', { ascending: true, nullsFirst: false })
      if (players?.length) {
        await supabase.from('lineup_slots').insert(
          players.map((p, i) => ({
            game_id: params.id, player_id: p.id,
            batting_order: i + 1, availability: 'available',
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
    setLoading(false)
  }

  async function handleBattingOrderChoice(choice: 'last' | 'roster') {
    if (!game?.season_id) return
    setShowBattingOrderModal(false)
    setLoading(true)

    if (choice === 'last' && prevGameForBatting) {
      const { data: lastSlots } = await supabase
        .from('lineup_slots')
        .select('player_id, batting_order')
        .eq('game_id', prevGameForBatting.id)
        .order('batting_order', { ascending: true, nullsFirst: false })

      const { data: activePlayers } = await supabase
        .from('players')
        .select('id, batting_pref_order')
        .eq('season_id', game.season_id)
        .eq('status', 'active')

      const lastOrderMap = new Map((lastSlots ?? []).map((s: any) => [s.player_id, s.batting_order]))
      const sorted = (activePlayers ?? []).sort((a: any, b: any) => {
        const ao = lastOrderMap.get(a.id) ?? 999
        const bo = lastOrderMap.get(b.id) ?? 999
        if (ao !== bo) return ao - bo
        return (a.batting_pref_order ?? 99) - (b.batting_pref_order ?? 99)
      })
      await supabase.from('lineup_slots').insert(
        sorted.map((p: any, i: number) => ({
          game_id: params.id, player_id: p.id,
          batting_order: i + 1, availability: 'available',
          inning_positions: [...BLANK],
        }))
      )
    } else {
      const { data: rosterPlayers } = await supabase
        .from('players')
        .select('id, batting_pref_order')
        .eq('season_id', game.season_id)
        .eq('status', 'active')
        .order('batting_pref_order', { ascending: true, nullsFirst: false })
      if (rosterPlayers?.length) {
        await supabase.from('lineup_slots').insert(
          rosterPlayers.map((p: any, i: number) => ({
            game_id: params.id, player_id: p.id,
            batting_order: i + 1, availability: 'available',
            inning_positions: [...BLANK],
          }))
        )
      }
    }

    const { data: fresh } = await supabase
      .from('lineup_slots')
      .select('*, player:players(first_name, last_name, jersey_number, innings_target)')
      .eq('game_id', params.id)
      .order('batting_order', { ascending: true, nullsFirst: false })
    setSlots(fresh ?? [])
    setLoading(false)
  }

  async function toggleLock() {
    const newLocked = !locked
    setLocked(newLocked)
    await supabase.from('games').update({ locked: newLocked }).eq('id', params.id)
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
    if (newPos && newPos !== 'Bench') {
      const slot = slotsRef.current.find(s => s.id === slotId)
      if (slot && restrictedSet.has(`${slot.player_id}::${newPos}`)) {
        const name = slot.player?.first_name ?? 'This player'
        setDcWarning(`${name} is marked "should not play" at ${newPos} in the Depth Chart.`)
      }
    }
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
    if (readOnly) return
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
    if (readOnly) return
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
    await supabase.from('lineup_slots').update({ batting_order: swap + 1 }).eq('id', reordered[swap].id)
    await supabase.from('lineup_slots').update({ batting_order: idx + 1 }).eq('id', reordered[idx].id)
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
    if (newStatus === 'final') {
      setPlayerNoteInputs({})
      setShowPlayerNotes(true)
    }
  }

  async function savePlayerNotes() {
    const seasonId = game?.season_id
    if (!seasonId) return
    const entries = Object.entries(playerNoteInputs).filter(([, v]) => v.trim())
    if (!entries.length) { setShowPlayerNotes(false); return }
    setSavingPlayerNotes(true)
    const today = new Date().toISOString().split('T')[0]
    await Promise.all(entries.map(([playerId, body]) =>
      supabase.from('player_eval_notes').insert({
        player_id: playerId,
        season_id: seasonId,
        note_date: today,
        body: body.trim(),
      })
    ))
    setSavingPlayerNotes(false)
    setShowPlayerNotes(false)
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
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
          {prevGameId ? (
            <a href={`/games/${prevGameId}/lineup/desktop`}
              title="Previous game"
              style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 18, lineHeight: 1, flexShrink: 0, padding: '0 2px' }}>
              ‹
            </a>
          ) : (
            <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 18, lineHeight: 1, flexShrink: 0, padding: '0 2px' }}>‹</span>
          )}
          <div style={{ minWidth: 0, flex: 1 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>
              vs {game?.opponent}
            </span>
            <span style={{ color: 'rgba(255,255,255,0.38)', fontSize: 12, marginLeft: 10 }}>
              {gameDate}{game?.game_time ? ` · ${formatTime(game.game_time)}` : ''}
            </span>
            {readOnly && (
              <span style={{
                marginLeft: 10, fontSize: 10, fontWeight: 700, padding: '2px 7px',
                borderRadius: 4, background: 'rgba(232,160,32,0.15)',
                color: '#E8A020', border: '1px solid rgba(232,160,32,0.3)',
                letterSpacing: '0.04em',
              }}>{locked && !isOwner ? '🔒 LOCKED' : 'VIEW ONLY'}</span>
            )}
          </div>
          {nextGameId ? (
            <a href={`/games/${nextGameId}/lineup/desktop`}
              title="Next game"
              style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none', fontSize: 18, lineHeight: 1, flexShrink: 0, padding: '0 2px' }}>
              ›
            </a>
          ) : (
            <span style={{ color: 'rgba(255,255,255,0.15)', fontSize: 18, lineHeight: 1, flexShrink: 0, padding: '0 2px' }}>›</span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
          {!readOnly && (<>
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
            ↩
          </button>
          <button onClick={redo} disabled={!future.length} title="Redo (⌘⇧Z)" style={topBtn(!!future.length)}>
            ↪
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
          {isOwner && (
            <button
              onClick={toggleLock}
              title={locked ? 'Unlock lineup for editing by all staff' : 'Lock lineup to prevent changes by staff'}
              style={{
                ...topBtn(true),
                color: locked ? '#E87060' : 'rgba(255,255,255,0.55)',
                border: locked ? '1px solid rgba(232,112,96,0.4)' : 'none',
              }}
            >
              {locked ? '🔒 Locked' : '🔓 Lock'}
            </button>
          )}
          </>)}
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
          {!readOnly && (<>
          <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />
          {/* Status dropdown */}
          {(() => {
            const status = game?.status ?? 'scheduled'
            const statusStyles: Record<string, { color: string; border: string }> = {
              scheduled:    { color: 'rgba(255,255,255,0.7)', border: 'rgba(255,255,255,0.25)' },
              lineup_ready: { color: '#80B0E8',               border: '#80B0E8' },
              final:        { color: '#6DB875',               border: '#6DB875' },
            }
            const s = statusStyles[status] ?? statusStyles.scheduled
            return (
              <select
                value={status}
                onChange={e => !statusSaving && saveStatus(e.target.value)}
                disabled={statusSaving}
                style={{
                  padding: '5px 8px', borderRadius: 5,
                  border: `1px solid ${s.border}`,
                  background: '#0d2240',
                  color: s.color,
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  opacity: statusSaving ? 0.6 : 1, flexShrink: 0,
                }}
              >
                <option value="scheduled">Scheduled</option>
                <option value="lineup_ready">Lineup Ready</option>
                <option value="final">Final</option>
              </select>
            )
          })()}
          </>)}
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

      {/* ─── DEPTH CHART RESTRICTION WARNING ─── */}
      {dcWarning && (
        <div style={{
          background: 'rgba(232,160,32,0.09)', borderBottom: '1px solid rgba(232,160,32,0.3)',
          padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, color: GOLD }}>⚠ {dcWarning}</span>
          <div style={{ flex: 1 }} />
          <button onClick={() => setDcWarning(null)} style={{
            background: 'none', border: 'none', color: GOLD, cursor: 'pointer',
            fontSize: 16, lineHeight: 1, padding: '0 4px', flexShrink: 0,
          }}>×</button>
        </div>
      )}

      {/* ─── TWO PANELS ─── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── CENTER: Grid + Palette ── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflow: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: '100%' }}>
            <colgroup>
              <col style={{ width: 24 }} />
              <col style={{ width: 220 }} />
              {innings.map(i => <col key={i} style={{ width: 54 }} />)}
              <col style={{ width: 62 }} />
            </colgroup>
            <thead>
              <tr>
                <th style={gHdr}>#</th>
                <th style={{ ...gHdr, textAlign: 'left', paddingLeft: 8 }}>Player <span style={{ fontSize: 7, opacity: 0.4, fontWeight: 400 }}>drag to reorder</span></th>
                {innings.map(ii => {
                  // Per-inning validation indicators
                  const counts: Record<string, number> = {}
                  for (const s of activeSlots) {
                    const p = (s.inning_positions ?? [])[ii]
                    if (p) counts[p] = (counts[p] ?? 0) + 1
                  }
                  const hasDupe = Object.entries(counts).some(([pos, v]) => pos !== 'Bench' && v > 1)
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
                  style={{ ...gHdr, fontSize: 9, position: 'sticky', right: 0, zIndex: 2, borderLeft: '1px solid var(--border)' }}
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
                // Inline inning summary counts
                const slotPos = (slot.inning_positions ?? []).slice(0, inningCount) as (string|null)[]
                const pIn     = slotPos.filter(p => p === 'P').length
                const cIn     = slotPos.filter(p => p === 'C').length
                const ifIn    = slotPos.filter(p => IF_POS.has(p ?? '')).length
                const ofIn    = slotPos.filter(p => OF_POS.has(p ?? '')).length
                const benchIn = slotPos.filter(p => p === 'Bench').length
                const allFilled = innings.every(i => (slot.inning_positions ?? [])[i] != null)
                // Color based on whether this player has benched more/less than their fair share
                const bpColor = bi === 0
                  ? `rgba(var(--fg-rgb),0.18)`
                  : bi > expectedBenchInnings + 1.0 ? '#E87060'
                  : bi > expectedBenchInnings + 0.5 ? '#E8A020'
                  : '#6DB875'
                return (
                  <tr
                    key={slot.id}
                    draggable
                    onDragStart={() => setDragId(slot.id)}
                    onDragOver={e => { e.preventDefault(); setDragOverId(slot.id) }}
                    onDragLeave={() => setDragOverId(null)}
                    onDrop={() => handleDrop(slot.id)}
                    onDragEnd={() => { setDragId(null); setDragOverId(null) }}
                    style={{
                      background: dragOverId === slot.id
                        ? 'rgba(59,109,177,0.07)'
                        : si % 2 === 0 ? 'transparent' : 'rgba(var(--fg-rgb),0.018)',
                      opacity: dragId === slot.id ? 0.35 : 1,
                      borderTop: dragOverId === slot.id ? '2px solid rgba(59,109,177,0.6)' : '2px solid transparent',
                      transition: 'background 0.08s',
                    }}
                  >
                    <td style={{ ...gCell, textAlign: 'center', color: `rgba(var(--fg-rgb),0.22)`, fontSize: 10, cursor: 'grab' }}>
                      {si + 1}
                    </td>
                    <td style={{
                      ...gCell, paddingLeft: 5, fontWeight: 600, fontSize: 12,
                      position: 'sticky', left: 0, zIndex: 1,
                      background: 'var(--bg)',
                      borderRight: '1px solid var(--border)',
                      maxWidth: 0, overflow: 'hidden',
                      cursor: 'grab',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 2, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
                          <button onClick={e => { e.stopPropagation(); nudgeBattingOrder(slot.id, 'up') }} style={nudge}>▴</button>
                          <button onClick={e => { e.stopPropagation(); nudgeBattingOrder(slot.id, 'down') }} style={nudge}>▾</button>
                        </div>
                        <span style={{ fontSize: 10, color: `rgba(var(--fg-rgb),0.28)`, marginRight: 2, flexShrink: 0 }}>
                          #{slot.player?.jersey_number}
                        </span>
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', minWidth: 0 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 30, fontSize: 12, fontWeight: 600 }}>
                            {slot.player?.first_name?.[0]}. {slot.player?.last_name}
                          </span>
                          {(pIn > 0 || cIn > 0 || ifIn > 0 || ofIn > 0 || benchIn > 0) && (
                            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                              {pIn > 0 && <span style={{ fontSize: 10, color: POS_COLOR.P?.color, fontWeight: 700 }}>P·{pIn}</span>}
                              {cIn > 0 && <span style={{ fontSize: 10, color: POS_COLOR.C?.color, fontWeight: 700 }}>C·{cIn}</span>}
                              {ifIn > 0 && <span style={{ fontSize: 10, color: POS_COLOR['1B']?.color, fontWeight: 700 }}>IF·{ifIn}</span>}
                              {ofIn > 0 && <span style={{ fontSize: 10, color: POS_COLOR.LF?.color, fontWeight: 700 }}>OF·{ofIn}</span>}
                              {benchIn > 0 && <span style={{ fontSize: 10, color: POS_COLOR.Bench?.color, fontWeight: 700 }}>B·{benchIn}</span>}
                            </div>
                          )}
                        </div>
                        {allFilled && (
                          <span style={{ fontSize: 9, color: '#6DB875', flexShrink: 0, marginRight: 2 }} title="All innings assigned">✓</span>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); toggleAbsent(slot.id) }}
                          title="Mark absent"
                          style={{
                            flexShrink: 0, width: 14, height: 14, borderRadius: 3,
                            border: '1px solid var(--border-md)', background: 'transparent',
                            cursor: 'pointer', fontSize: 8, padding: 0,
                            color: `rgba(var(--fg-rgb),0.28)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginRight: 3,
                          }}
                        >✕</button>
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
                      style={{
                        ...gCell, textAlign: 'center',
                        position: 'sticky', right: 0, zIndex: 1,
                        background: si % 2 === 0 ? 'var(--bg)' : 'color-mix(in srgb, var(--bg) 97%, var(--fg) 3%)',
                        borderLeft: '1px solid var(--border)',
                      }}
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
              {/* Absent rows */}
              {absentSlots.map(slot => (
                <tr key={slot.id} style={{ opacity: 0.35 }}>
                  <td style={{ ...gCell, textAlign: 'center', color: `rgba(var(--fg-rgb),0.22)`, fontSize: 10 }}>—</td>
                  <td style={{
                    ...gCell, paddingLeft: 5, fontSize: 12,
                    position: 'sticky', left: 0, zIndex: 1,
                    background: 'var(--bg)', borderRight: '1px solid var(--border)',
                    maxWidth: 0, overflow: 'hidden',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, overflow: 'hidden' }}>
                      <span style={{ fontSize: 10, color: `rgba(var(--fg-rgb),0.28)`, marginRight: 3, flexShrink: 0 }}>
                        #{slot.player?.jersey_number}
                      </span>
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, textDecoration: 'line-through' }}>
                        {slot.player?.first_name?.[0]}. {slot.player?.last_name}
                      </span>
                      <button
                        onClick={() => toggleAbsent(slot.id)}
                        title="Mark present"
                        style={{
                          flexShrink: 0, width: 14, height: 14, borderRadius: 3,
                          border: '1px solid rgba(109,184,117,0.45)', background: 'rgba(109,184,117,0.1)',
                          cursor: 'pointer', fontSize: 8, padding: 0, color: '#6DB875',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          marginRight: 3,
                        }}
                      >↩</button>
                    </div>
                  </td>
                  {innings.map(ii => <td key={ii} style={{ ...gCell }} />)}
                  <td style={{ ...gCell, position: 'sticky', right: 0, background: 'var(--bg)', borderLeft: '1px solid var(--border)' }} />
                </tr>
              ))}
            </tbody>
          </table>
          </div>

          {/* Position palette — below the grid */}
          {!readOnly && (
            <div style={{
              padding: '8px 14px 10px', borderTop: '1px solid var(--border)',
              background: 'var(--bg-card)', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
            }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: `rgba(var(--fg-rgb),0.5)`, flexShrink: 0 }}>
                {selectedCells.size > 0
                  ? `Fill ${selectedCells.size} cell${selectedCells.size > 1 ? 's' : ''}:`
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
          )}
        </div>

        {/* ── RIGHT: Context ── */}
        <div style={{
          width: 186, flexShrink: 0, borderLeft: '1px solid var(--border)',
          overflowY: 'auto', padding: 12,
        }}>
          {/* Game notes */}
          <div style={{ marginBottom: 10, padding: '7px 9px', borderRadius: 6,
            background: 'var(--bg-card)', border: '0.5px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                color: `rgba(var(--fg-rgb),0.3)`, textTransform: 'uppercase' }}>Notes</span>
              {!notesSaved && <span style={{ fontSize: 9, color: `rgba(var(--fg-rgb),0.3)` }}>saving…</span>}
            </div>
            <textarea
              value={gameNotes}
              onChange={e => handleNotesChange(e.target.value)}
              placeholder="e.g. Connor hurt his arm…"
              rows={3}
              style={{
                width: '100%', padding: '5px 7px', borderRadius: 5,
                border: '0.5px solid var(--border-md)',
                background: 'var(--bg-input)', color: 'var(--fg)',
                fontSize: 11, resize: 'vertical', boxSizing: 'border-box',
                fontFamily: 'inherit', lineHeight: 1.5,
              }}
            />
          </div>
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
                  {focusedSlot.player?.first_name?.[0]}. {focusedSlot.player?.last_name} · prior games
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
                  Previous game
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

          {/* This game breakdown — shown when a cell is focused */}
          {focused && (() => {
            const focusedSlot = activeSlots[focused.si]
            if (!focusedSlot) return null
            const pos = (focusedSlot.inning_positions ?? []).slice(0, inningCount) as (string|null)[]
            const tgP     = pos.filter(p => p === 'P').length
            const tgC     = pos.filter(p => p === 'C').length
            const tgIF    = pos.filter(p => IF_POS.has(p ?? '')).length
            const tgOF    = pos.filter(p => OF_POS.has(p ?? '')).length
            const tgBench = pos.filter(p => p === 'Bench').length
            return (
              <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 6,
                background: 'var(--bg-card)', border: '0.5px solid var(--border)' }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                  color: `rgba(var(--fg-rgb),0.3)`, textTransform: 'uppercase', marginBottom: 6 }}>
                  This game
                </div>
                {([
                  ['Pitcher',  tgP,     POS_COLOR.P],
                  ['Catcher',  tgC,     POS_COLOR.C],
                  ['Infield',  tgIF,    POS_COLOR['1B']],
                  ['Outfield', tgOF,    POS_COLOR.LF],
                  ['Bench',    tgBench, POS_COLOR.Bench],
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

          {/* Pitching rest — shown when a cell is focused */}
          {focused && (() => {
            const focusedSlot = activeSlots[focused.si]
            if (!focusedSlot) return null
            const ph = pitchingHistory[focusedSlot.player_id]
            const thisGameP = (focusedSlot.inning_positions ?? []).slice(0, inningCount)
              .filter((p: string|null) => p === 'P').length
            if (!ph && thisGameP === 0) return null
            const shortRest = ph && ph.daysSince < 3
            return (
              <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 6,
                background: shortRest ? 'rgba(232,112,96,0.08)' : 'var(--bg-card)',
                border: `0.5px solid ${shortRest ? 'rgba(232,112,96,0.35)' : 'var(--border)'}` }}>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
                  color: shortRest ? '#E87060' : `rgba(var(--fg-rgb),0.3)`,
                  textTransform: 'uppercase', marginBottom: 6 }}>
                  Pitching rest{shortRest ? ' · ⚠ Short rest' : ''}
                </div>
                {ph && (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: `rgba(var(--fg-rgb),0.5)` }}>Last pitched</span>
                      <span style={{ fontSize: 10, fontWeight: 700,
                        color: shortRest ? '#E87060' : `rgba(var(--fg-rgb),0.7)` }}>
                        {new Date(ph.lastDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <span style={{ fontSize: 10, color: `rgba(var(--fg-rgb),0.5)` }}>Innings pitched</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: POS_COLOR.P?.color }}>
                        {ph.lastInnings} inn
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      marginBottom: thisGameP > 0 ? 6 : 0 }}>
                      <span style={{ fontSize: 10, color: `rgba(var(--fg-rgb),0.5)` }}>Days rest</span>
                      <span style={{ fontSize: 10, fontWeight: 700,
                        color: shortRest ? '#E87060' : ph.daysSince >= 4 ? '#6DB875' : `rgba(var(--fg-rgb),0.7)` }}>
                        {ph.daysSince}d
                      </span>
                    </div>
                  </>
                )}
                {thisGameP > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    paddingTop: ph ? 4 : 0, borderTop: ph ? '0.5px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize: 10, color: `rgba(var(--fg-rgb),0.5)` }}>This game</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: POS_COLOR.P?.color }}>
                      {thisGameP} inn
                    </span>
                  </div>
                )}
              </div>
            )
          })()}

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

      {/* ─── Batting order choice modal ─── */}
      {showBattingOrderModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: 'var(--bg2)', borderRadius: 12, padding: '1.5rem',
            width: 360, border: '0.5px solid var(--border)',
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Starting batting order</div>
            <div style={{ fontSize: 12, color: `rgba(var(--fg-rgb),0.45)`, marginBottom: '1.25rem', lineHeight: 1.5 }}>
              How should the initial batting order be set?
              {prevGameForBatting && (
                <span style={{ display: 'block', marginTop: 4, color: `rgba(var(--fg-rgb),0.6)`, fontStyle: 'italic' }}>
                  Last game: vs {prevGameForBatting.opponent} · {new Date(prevGameForBatting.game_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => handleBattingOrderChoice('last')}
                style={{
                  flex: 1, padding: '14px 8px', borderRadius: 8, cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, textAlign: 'center',
                  border: '1.5px solid var(--border-md)', background: 'transparent',
                  color: `rgba(var(--fg-rgb),0.8)`,
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 5 }}>↩</div>
                Last game order
              </button>
              <button
                onClick={() => handleBattingOrderChoice('roster')}
                style={{
                  flex: 1, padding: '14px 8px', borderRadius: 8, cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, textAlign: 'center',
                  border: '1.5px solid var(--border-md)', background: 'transparent',
                  color: `rgba(var(--fg-rgb),0.8)`,
                }}
              >
                <div style={{ fontSize: 20, marginBottom: 5 }}>📋</div>
                Roster order
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* ── POST-GAME PLAYER NOTES ── */}
      {showPlayerNotes && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300,
        }}>
          <div style={{
            background: 'var(--bg2)', borderRadius: '14px', padding: '1.5rem',
            width: '460px', maxWidth: '95vw', border: '0.5px solid var(--border)',
            maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          }}>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>Game notes</div>
              <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb),0.45)` }}>
                Jot a quick note on any player from today's game. All fields are optional.
              </div>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '1rem' }}>
              {slots
                .filter(s => s.availability !== 'absent')
                .sort((a, b) => (a.batting_order ?? 99) - (b.batting_order ?? 99))
                .map(slot => {
                  const p = slot.player
                  if (!p) return null
                  return (
                    <div key={slot.player_id}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: `rgba(var(--fg-rgb),0.5)`, marginBottom: '4px' }}>
                        #{p.jersey_number} {p.first_name} {p.last_name}
                      </div>
                      <textarea
                        value={playerNoteInputs[slot.player_id] ?? ''}
                        onChange={e => setPlayerNoteInputs(prev => ({ ...prev, [slot.player_id]: e.target.value }))}
                        placeholder="Quick observation…"
                        rows={2}
                        style={{
                          width: '100%', padding: '8px 10px', borderRadius: '6px',
                          border: '0.5px solid var(--border-md)',
                          background: 'var(--bg-input)', color: 'var(--fg)',
                          fontSize: '13px', boxSizing: 'border-box', resize: 'vertical',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>
                  )
                })}
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => setShowPlayerNotes(false)} style={{
                flex: 1, padding: '10px', borderRadius: '7px',
                border: '0.5px solid var(--border-strong)', background: 'transparent',
                color: `rgba(var(--fg-rgb),0.6)`, fontSize: '13px', cursor: 'pointer',
              }}>Skip</button>
              <button onClick={savePlayerNotes} disabled={savingPlayerNotes} style={{
                flex: 2, padding: '10px', borderRadius: '7px', border: 'none',
                background: 'var(--accent)', color: 'var(--accent-text)',
                fontSize: '13px', fontWeight: 700,
                cursor: savingPlayerNotes ? 'not-allowed' : 'pointer',
                opacity: savingPlayerNotes ? 0.7 : 1,
              }}>{savingPlayerNotes ? 'Saving…' : 'Save notes'}</button>
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
