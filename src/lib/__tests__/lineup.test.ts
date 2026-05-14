import { describe, it, expect } from 'vitest'
import { buildCopyUpdates, isBeforeGame, selectPrevGame } from '../lineup'

// ── Pure helpers extracted from the lineup editor ─────────────────────────────
// These are copied from lineup/desktop/page.tsx and lineup/page.tsx so they
// can be tested without React. If you change the originals, update these too.

const BLANK: (string | null)[] = [null,null,null,null,null,null,null,null,null]

function benchInnings(slot: { inning_positions?: (string|null)[] }, inningCount: number): number {
  return (slot.inning_positions ?? []).slice(0, inningCount)
    .filter(p => p === 'Bench').length
}

function assignedInnings(slot: { inning_positions?: (string|null)[] }, inningCount: number): number {
  return (slot.inning_positions ?? []).slice(0, inningCount)
    .filter(p => p !== null).length
}

// Bench slots per inning: active players minus fielding positions
function benchSlotsPerInning(activeCount: number, fieldPositionCount: number): number {
  return Math.max(0, activeCount - fieldPositionCount)
}

// Inning validation logic (mirrors getInningStatus in mobile page)
function getInningStatus(
  slots: Array<{ availability: string; inning_positions?: (string|null)[] }>,
  inningIndex: number,
): 'complete' | 'duplicate' | number {
  const active = slots.filter(s => s.availability !== 'absent')
  const counts: Record<string, number> = {}
  for (const slot of active) {
    const pos = (slot.inning_positions ?? [])[inningIndex]
    if (pos) counts[pos] = (counts[pos] || 0) + 1
  }
  const hasDupe = Object.entries(counts).some(([pos, v]) => pos !== 'Bench' && v > 1)
  if (hasDupe) return 'duplicate'
  const unassigned = active.filter(s => !(slot => (slot.inning_positions ?? [])[inningIndex])(s)).length
  if (unassigned > 0) return unassigned
  return 'complete'
}

function makeSlot(id: string, positions: (string|null)[], availability = 'available') {
  return { id, availability, inning_positions: [...positions] }
}

// ── benchInnings ──────────────────────────────────────────────────────────────

describe('benchInnings', () => {
  it('returns 0 for blank slot', () => {
    expect(benchInnings({ inning_positions: [...BLANK] }, 6)).toBe(0)
  })

  it('counts Bench positions within inningCount', () => {
    const slot = { inning_positions: ['P', 'Bench', 'Bench', null, null, null, null, null, null] }
    expect(benchInnings(slot, 6)).toBe(2)
  })

  it('ignores Bench positions beyond inningCount', () => {
    const slot = { inning_positions: ['P','P','P','P','P','P','Bench','Bench','Bench'] }
    expect(benchInnings(slot, 6)).toBe(0)
    expect(benchInnings(slot, 7)).toBe(1)
    expect(benchInnings(slot, 9)).toBe(3)
  })

  it('handles missing inning_positions', () => {
    expect(benchInnings({}, 6)).toBe(0)
  })
})

// ── assignedInnings ───────────────────────────────────────────────────────────

describe('assignedInnings', () => {
  it('returns 0 for blank slot', () => {
    expect(assignedInnings({ inning_positions: [...BLANK] }, 6)).toBe(0)
  })

  it('counts all non-null positions including Bench', () => {
    // ['P', 'Bench', null, '1B', null, 'CF', null, null, null]
    // inningCount=6: P, Bench, null, 1B, null, CF → 4 assigned
    // inningCount=9: same 4 (no more non-null beyond index 5)
    const slot = { inning_positions: ['P', 'Bench', null, '1B', null, 'CF', null, null, null] }
    expect(assignedInnings(slot, 6)).toBe(4)
    expect(assignedInnings(slot, 9)).toBe(4)
  })
})

// ── benchSlotsPerInning ───────────────────────────────────────────────────────

describe('benchSlotsPerInning', () => {
  it('returns 0 when roster exactly fills field (9 players, 9 positions)', () => {
    expect(benchSlotsPerInning(9, 9)).toBe(0)
  })

  it('returns correct count for standard roster sizes', () => {
    expect(benchSlotsPerInning(10, 9)).toBe(1)
    expect(benchSlotsPerInning(12, 9)).toBe(3)
    expect(benchSlotsPerInning(13, 9)).toBe(4)
  })

  it('never goes negative when fewer than field positions', () => {
    expect(benchSlotsPerInning(7, 9)).toBe(0)
    expect(benchSlotsPerInning(0, 9)).toBe(0)
  })

  it('works with custom field count (e.g. 4-player team has some open positions)', () => {
    expect(benchSlotsPerInning(11, 10)).toBe(1)
  })
})

// ── Bench limit enforcement (unit-level, mirrors assignPosition in desktop) ───

describe('bench assignment constraints', () => {
  it('allows bench when slots are available', () => {
    // 10 active players, 9 fielding positions → 1 bench slot per inning
    const bpi = benchSlotsPerInning(10, 9)
    expect(bpi).toBe(1)
    // 0 currently benched → can add
    const currentBench = 0
    expect(currentBench < bpi).toBe(true)
  })

  it('blocks bench when all bench slots filled', () => {
    const bpi = benchSlotsPerInning(10, 9)
    const currentBench = 1  // already one on bench
    expect(currentBench >= bpi).toBe(true)  // should block
  })

  it('blocks bench entirely when roster exactly fills field', () => {
    const bpi = benchSlotsPerInning(9, 9)
    expect(bpi).toBe(0)
    // Any bench attempt should block
    expect(0 >= bpi).toBe(true)
  })
})

// ── Position deduplication (mirrors assignPosition swap logic) ────────────────

describe('position swap on assignment', () => {
  it('clears the previous holder of a position when a new player is assigned', () => {
    const slots = [
      makeSlot('s1', ['P', null, null, null, null, null, null, null, null]),
      makeSlot('s2', [null, null, null, null, null, null, null, null, null]),
    ]
    const ii = 0
    const newPos = 'P'
    const slotId = 's2'

    // Simulate the swap logic from assignPosition
    const next = slots.map(s => ({ ...s, inning_positions: [...(s.inning_positions ?? [...BLANK])] }))
    const holder = next.find(s => s.id !== slotId && s.inning_positions[ii] === newPos)
    if (holder) holder.inning_positions[ii] = null
    const target = next.find(s => s.id === slotId)
    if (target) target.inning_positions[ii] = newPos

    expect(next.find(s => s.id === 's1')!.inning_positions[0]).toBeNull()
    expect(next.find(s => s.id === 's2')!.inning_positions[0]).toBe('P')
  })

  it('does not clear holder when assigning Bench', () => {
    const slots = [
      makeSlot('s1', ['P', null, null, null, null, null, null, null, null]),
      makeSlot('s2', [null, null, null, null, null, null, null, null, null]),
    ]
    const ii = 0
    const slotId = 's2'
    const newPos = 'Bench'

    const next = slots.map(s => ({ ...s, inning_positions: [...(s.inning_positions ?? [...BLANK])] }))
    // Bench assignment does not swap/clear
    if (newPos !== 'Bench') {
      const holder = next.find(s => s.id !== slotId && s.inning_positions[ii] === newPos)
      if (holder) holder.inning_positions[ii] = null
    }
    const target = next.find(s => s.id === slotId)
    if (target) target.inning_positions[ii] = newPos

    // s1 keeps 'P'; s2 gets 'Bench'
    expect(next.find(s => s.id === 's1')!.inning_positions[0]).toBe('P')
    expect(next.find(s => s.id === 's2')!.inning_positions[0]).toBe('Bench')
  })
})

// ── Absent player position restore ───────────────────────────────────────────

describe('absent player position restore', () => {
  it('restores saved positions when un-absenting', () => {
    const savedPositionsRef: Record<string, (string|null)[]> = {}
    const BLANK_ARR = [null,null,null,null,null,null,null,null,null]

    // Step 1: mark absent — save positions before clearing
    const current = ['P', 'Bench', '1B', null, null, null, null, null, null]
    savedPositionsRef['s1'] = [...current]
    const absentPositions = BLANK_ARR

    expect(absentPositions.every(p => p === null)).toBe(true)

    // Step 2: restore — use saved snapshot
    const restored = savedPositionsRef['s1'] ?? BLANK_ARR
    delete savedPositionsRef['s1']

    expect(restored).toEqual(['P', 'Bench', '1B', null, null, null, null, null, null])
    expect(savedPositionsRef['s1']).toBeUndefined()
  })

  it('restores to blank when player had no positions before being absent', () => {
    const savedPositionsRef: Record<string, (string|null)[]> = {}
    const BLANK_ARR = [null,null,null,null,null,null,null,null,null]

    // Player had no positions, so nothing was saved
    const current = [...BLANK_ARR]
    if (current.some(p => p !== null)) savedPositionsRef['s1'] = [...current]
    // Snapshot not saved because all positions were null

    const restored = savedPositionsRef['s1'] ?? BLANK_ARR
    expect(restored).toEqual(BLANK_ARR)
  })
})

// ── Copy-from-game: batting order merging ────────────────────────────────────

describe('copy from previous game', () => {
  it('maps source batting orders onto current game players', () => {
    const sourceSlots = [
      { player_id: 'p1', batting_order: 1, inning_positions: ['P','P','P',null,null,null,null,null,null] },
      { player_id: 'p2', batting_order: 2, inning_positions: ['C','C','C',null,null,null,null,null,null] },
    ]
    const currentSlots = [
      { id: 'cs1', player_id: 'p1', batting_order: 2, availability: 'available', inning_positions: [...BLANK] },
      { id: 'cs2', player_id: 'p2', batting_order: 1, availability: 'available', inning_positions: [...BLANK] },
      { id: 'cs3', player_id: 'p3', batting_order: 3, availability: 'available', inning_positions: [...BLANK] },
    ]

    const byPlayer = new Map(sourceSlots.map(s => [s.player_id, s]))

    const updates = currentSlots
      .filter(s => s.availability !== 'absent' && byPlayer.has(s.player_id))
      .map(s => {
        const src = byPlayer.get(s.player_id)!
        return { id: s.id, batting_order: src.batting_order, inning_positions: src.inning_positions }
      })

    // p1 should get order 1, p2 should get order 2
    const p1update = updates.find(u => u.id === 'cs1')
    const p2update = updates.find(u => u.id === 'cs2')
    const p3update = updates.find(u => u.id === 'cs3')

    expect(p1update?.batting_order).toBe(1)
    expect(p2update?.batting_order).toBe(2)
    expect(p3update).toBeUndefined() // p3 not in source → not updated
  })

  it('copies positions in full mode', () => {
    const src = { player_id: 'p1', batting_order: 1, inning_positions: ['P','P','1B',null,null,null,null,null,null] }
    const curr = { id: 'cs1', player_id: 'p1', batting_order: 1, availability: 'available', inning_positions: [...BLANK] }

    const copyMode = 'full'
    const result = copyMode === 'full' ? src.inning_positions : [...BLANK]
    expect(result).toEqual(['P','P','1B',null,null,null,null,null,null])
  })

  it('blanks positions in order-only mode', () => {
    function applyMode(mode: 'full' | 'order', positions: (string|null)[]) {
      return mode === 'full' ? positions : [...BLANK]
    }
    const src = { inning_positions: ['P','P','1B',null,null,null,null,null,null] as (string|null)[] }
    expect(applyMode('order', src.inning_positions)).toEqual([...BLANK])
    expect(applyMode('full',  src.inning_positions)).toEqual(src.inning_positions)
  })

  it('skips absent players', () => {
    const sourceSlots = [
      { player_id: 'p1', batting_order: 1, inning_positions: [...BLANK] },
    ]
    const currentSlots = [
      { id: 'cs1', player_id: 'p1', batting_order: 1, availability: 'absent', inning_positions: [...BLANK] },
    ]
    const byPlayer = new Map(sourceSlots.map(s => [s.player_id, s]))
    const updates = currentSlots.filter(s => s.availability !== 'absent' && byPlayer.has(s.player_id))
    expect(updates).toHaveLength(0)
  })
})

// ── Edge cases: roster sizes ──────────────────────────────────────────────────

describe('roster size edge cases', () => {
  it('9-player roster: zero bench slots, all must play every inning', () => {
    expect(benchSlotsPerInning(9, 9)).toBe(0)
  })

  it('13-player roster: 4 bench slots per inning with 9 field positions', () => {
    expect(benchSlotsPerInning(13, 9)).toBe(4)
  })

  it('8-player roster: cannot fill 9 positions, should still show 0 bench', () => {
    expect(benchSlotsPerInning(8, 9)).toBe(0)
  })

  it('assigned innings correctly counts for 9-inning game', () => {
    const slot = { inning_positions: ['P','C','1B','2B','SS','3B','LF','CF','RF'] }
    expect(assignedInnings(slot, 9)).toBe(9)
    expect(benchInnings(slot, 9)).toBe(0)
  })

  it('bench innings within range only', () => {
    const slot = { inning_positions: ['Bench','Bench','Bench',null,null,null,null,null,null] }
    expect(benchInnings(slot, 3)).toBe(3)
    expect(benchInnings(slot, 6)).toBe(3)
  })
})

// ── buildCopyUpdates ──────────────────────────────────────────────────────────

function slot(id: string, player_id: string, batting_order: number | null, availability = 'available', positions?: (string|null)[]) {
  return { id, player_id, batting_order, availability, inning_positions: positions ?? [...BLANK] }
}

function src(batting_order: number | null, positions?: (string|null)[]) {
  return { batting_order, inning_positions: positions ?? [...BLANK] }
}

describe('buildCopyUpdates', () => {
  it('assigns clean 1..N batting orders to all matched active slots', () => {
    const current = [slot('s1','p1',3), slot('s2','p2',1), slot('s3','p3',2)]
    const source = new Map([['p1', src(1)], ['p2', src(2)], ['p3', src(3)]])
    const updates = buildCopyUpdates(current, source, 'order')
    const orders = updates.map(u => u.batting_order).sort((a,b) => a-b)
    expect(orders).toEqual([1,2,3])
  })

  it('sorts matched players by source batting_order', () => {
    const current = [slot('s1','p1',3), slot('s2','p2',1), slot('s3','p3',2)]
    const source = new Map([['p1', src(3)], ['p2', src(1)], ['p3', src(2)]])
    const updates = buildCopyUpdates(current, source, 'order')
    // p2(src=1) → batting 1, p3(src=2) → batting 2, p1(src=3) → batting 3
    expect(updates.find(u => u.id === 's2')!.batting_order).toBe(1)
    expect(updates.find(u => u.id === 's3')!.batting_order).toBe(2)
    expect(updates.find(u => u.id === 's1')!.batting_order).toBe(3)
  })

  it('appends unmatched players after matched, preserving their relative order', () => {
    const current = [
      slot('s1','p1',2),  // matched
      slot('s2','p_new1',1),  // unmatched — currently batting 1st
      slot('s3','p_new2',3),  // unmatched — currently batting 3rd
    ]
    const source = new Map([['p1', src(1)]])
    const updates = buildCopyUpdates(current, source, 'order')
    // p1 matched (src order 1) → position 1
    // p_new1 (current 1) → position 2, p_new2 (current 3) → position 3
    expect(updates.find(u => u.id === 's1')!.batting_order).toBe(1)
    expect(updates.find(u => u.id === 's2')!.batting_order).toBe(2)
    expect(updates.find(u => u.id === 's3')!.batting_order).toBe(3)
  })

  it('returns updates for ALL active players, not just matched', () => {
    const current = [slot('s1','p1',1), slot('s2','p_new',2)]
    const source = new Map([['p1', src(1)]])
    const updates = buildCopyUpdates(current, source, 'order')
    expect(updates).toHaveLength(2)
    expect(updates.find(u => u.id === 's2')).toBeDefined()
  })

  it('skips absent players entirely', () => {
    const current = [
      slot('s1','p1',1,'available'),
      slot('s2','p2',2,'absent'),
    ]
    const source = new Map([['p1', src(1)], ['p2', src(2)]])
    const updates = buildCopyUpdates(current, source, 'order')
    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe('s1')
    expect(updates[0].batting_order).toBe(1)
  })

  it('copies positions from source in full mode', () => {
    const positions: (string|null)[] = ['P','C','1B',null,null,null,null,null,null]
    const current = [slot('s1','p1',1)]
    const source = new Map([['p1', src(1, positions)]])
    const updates = buildCopyUpdates(current, source, 'full')
    expect(updates[0].inning_positions).toEqual(positions)
  })

  it('clears positions in order mode for matched players', () => {
    const positions: (string|null)[] = ['P','C','1B',null,null,null,null,null,null]
    const current = [slot('s1','p1',1)]
    const source = new Map([['p1', src(1, positions)]])
    const updates = buildCopyUpdates(current, source, 'order')
    expect(updates[0].inning_positions).toEqual([...BLANK])
  })

  it('preserves unmatched player positions regardless of copy mode', () => {
    const existing: (string|null)[] = ['LF','LF',null,null,null,null,null,null,null]
    const current = [slot('s1','p1',1), slot('s2','p_new',2,'available', existing)]
    const source = new Map([['p1', src(1)]])
    const fullUpdates = buildCopyUpdates(current, source, 'full')
    const orderUpdates = buildCopyUpdates(current, source, 'order')
    expect(fullUpdates.find(u => u.id === 's2')!.inning_positions).toEqual(existing)
    expect(orderUpdates.find(u => u.id === 's2')!.inning_positions).toEqual(existing)
  })

  it('handles source with null batting_order (nulls sort last)', () => {
    const current = [slot('s1','p1',1), slot('s2','p2',2)]
    const source = new Map([['p1', src(null)], ['p2', src(1)]])
    const updates = buildCopyUpdates(current, source, 'order')
    // p2 has src order 1, p1 has src order null → p2 first
    expect(updates[0].id).toBe('s2')
    expect(updates[1].id).toBe('s1')
  })

  it('produces duplicate-free batting orders even when source had gaps', () => {
    const current = [slot('s1','p1',1), slot('s2','p2',2), slot('s3','p3',3)]
    // Source gaps: 1, 5, 10
    const source = new Map([['p1', src(1)], ['p2', src(5)], ['p3', src(10)]])
    const updates = buildCopyUpdates(current, source, 'order')
    const orders = updates.map(u => u.batting_order).sort((a,b) => a-b)
    expect(orders).toEqual([1,2,3])
  })
})

// ── Notes JSON helpers (mirrors BoxScoreInput / InGameView) ───────────────────

function readScores(notes: string | null, count: number): [(number|null)[], (number|null)[]] {
  const empty = () => Array(count).fill(null)
  try {
    const parsed = JSON.parse(notes ?? '{}')
    const us   = parsed._box?.us   ?? empty()
    const them = parsed._box?.them ?? empty()
    return [us, them]
  } catch { return [empty(), empty()] }
}

function writeScores(notes: string | null, us: (number|null)[], them: (number|null)[]): string {
  try {
    const parsed = JSON.parse(notes ?? '{}')
    parsed._box = { us, them }
    return JSON.stringify(parsed)
  } catch { return JSON.stringify({ _box: { us, them } }) }
}

describe('box score notes helpers', () => {
  it('reads scores from _box', () => {
    const notes = JSON.stringify({ _box: { us: [3, 2, 0], them: [1, 1, 2] } })
    const [us, them] = readScores(notes, 3)
    expect(us).toEqual([3, 2, 0])
    expect(them).toEqual([1, 1, 2])
  })

  it('returns nulls for missing _box', () => {
    const [us, them] = readScores('{}', 6)
    expect(us).toHaveLength(6)
    expect(us.every(v => v === null)).toBe(true)
    expect(them.every(v => v === null)).toBe(true)
  })

  it('returns nulls for null notes', () => {
    const [us, them] = readScores(null, 6)
    expect(us.every(v => v === null)).toBe(true)
    expect(them.every(v => v === null)).toBe(true)
  })

  it('preserves other keys when writing scores', () => {
    const notes = JSON.stringify({ _notes: 'great game', _other: 42 })
    const newNotes = writeScores(notes, [3, 2], [1, 4])
    const parsed = JSON.parse(newNotes)
    expect(parsed._notes).toBe('great game')
    expect(parsed._other).toBe(42)
    expect(parsed._box.us).toEqual([3, 2])
    expect(parsed._box.them).toEqual([1, 4])
  })

  it('overwrites previous _box on subsequent writes', () => {
    const notes = JSON.stringify({ _box: { us: [1], them: [2] } })
    const newNotes = writeScores(notes, [5], [0])
    const parsed = JSON.parse(newNotes)
    expect(parsed._box.us).toEqual([5])
    expect(parsed._box.them).toEqual([0])
  })

  it('handles invalid JSON gracefully', () => {
    const [us, them] = readScores('INVALID', 3)
    expect(us.every(v => v === null)).toBe(true)
    expect(them.every(v => v === null)).toBe(true)
  })

  it('writeScores on null base creates fresh object', () => {
    const result = writeScores(null, [1, 2], [0, 1])
    expect(JSON.parse(result)._box.us).toEqual([1, 2])
  })

  it('internal ref pattern: second save reads from updated ref, not original prop', () => {
    // Simulate the BoxScoreInput notesRef fix
    let notesRef = JSON.stringify({ _notes: 'pre-existing note' })

    // First save: score entered
    const save1 = writeScores(notesRef, [3], [1])
    notesRef = save1  // ref updated after save

    // Second save: more score data, reads from ref (not original prop)
    const save2 = writeScores(notesRef, [3, 2], [1, 0])
    const result = JSON.parse(save2)

    // _notes should still be present from the original base
    expect(result._notes).toBe('pre-existing note')
    expect(result._box.us).toEqual([3, 2])
  })
})

// ── isBeforeGame ──────────────────────────────────────────────────────────────

describe('isBeforeGame', () => {
  it('returns true when candidate date is earlier', () => {
    expect(isBeforeGame({ game_date: '2026-05-12', game_time: null }, '2026-05-14', null)).toBe(true)
  })

  it('returns false when candidate date is later', () => {
    expect(isBeforeGame({ game_date: '2026-05-15', game_time: null }, '2026-05-14', null)).toBe(false)
  })

  it('returns false for same date when current game has no time', () => {
    expect(isBeforeGame({ game_date: '2026-05-14', game_time: '10:00:00' }, '2026-05-14', null)).toBe(false)
  })

  it('returns false for same date when candidate has no time', () => {
    expect(isBeforeGame({ game_date: '2026-05-14', game_time: null }, '2026-05-14', '12:00:00')).toBe(false)
  })

  it('returns true for same date when candidate time is earlier', () => {
    expect(isBeforeGame({ game_date: '2026-05-14', game_time: '09:00:00' }, '2026-05-14', '12:00:00')).toBe(true)
  })

  it('returns false for same date when candidate time equals current time', () => {
    expect(isBeforeGame({ game_date: '2026-05-14', game_time: '12:00:00' }, '2026-05-14', '12:00:00')).toBe(false)
  })

  it('returns false for same date when candidate time is later', () => {
    expect(isBeforeGame({ game_date: '2026-05-14', game_time: '14:00:00' }, '2026-05-14', '12:00:00')).toBe(false)
  })
})

// ── selectPrevGame ────────────────────────────────────────────────────────────

function g(id: string, date: string, time: string | null = null) {
  return { id, game_date: date, game_time: time }
}

describe('selectPrevGame', () => {
  it('picks the most recent game before the current date', () => {
    const games = [g('a', '2026-05-10'), g('b', '2026-05-12'), g('c', '2026-05-13')]
    const result = selectPrevGame(games, '2026-05-14', null)
    expect(result?.id).toBe('c')
  })

  it('returns null when no games predate the current game', () => {
    const games = [g('a', '2026-05-15'), g('b', '2026-05-16')]
    expect(selectPrevGame(games, '2026-05-14', null)).toBeNull()
  })

  it('excludes the same-day game when neither side has a time', () => {
    const games = [g('a', '2026-05-14'), g('b', '2026-05-12')]
    const result = selectPrevGame(games, '2026-05-14', null)
    expect(result?.id).toBe('b')
  })

  it('selects a same-day game with an earlier time over a game two days prior', () => {
    const games = [
      g('earlier-today', '2026-05-14', '09:00:00'),
      g('two-days-ago',  '2026-05-12', '12:00:00'),
    ]
    const result = selectPrevGame(games, '2026-05-14', '13:00:00')
    expect(result?.id).toBe('earlier-today')
  })

  it('skips a same-day game with a later time', () => {
    const games = [
      g('later-today', '2026-05-14', '15:00:00'),
      g('yesterday',   '2026-05-13', '12:00:00'),
    ]
    const result = selectPrevGame(games, '2026-05-14', '13:00:00')
    expect(result?.id).toBe('yesterday')
  })

  it('never selects the current game (it is excluded by the caller)', () => {
    // Simulates caller pre-filtering with .neq('id', currentId)
    const games = [g('other', '2026-05-12')]
    const result = selectPrevGame(games, '2026-05-14', null)
    expect(result?.id).toBe('other')
  })

  it('falls back to most recent game when currentDate is null', () => {
    const games = [g('a', '2026-05-10'), g('b', '2026-05-13'), g('c', '2026-05-12')]
    const result = selectPrevGame(games, null, null)
    expect(result?.id).toBe('b')
  })

  it('returns null for empty list', () => {
    expect(selectPrevGame([], '2026-05-14', null)).toBeNull()
  })

  it('picks the latest among multiple same-day earlier games', () => {
    const games = [
      g('first',  '2026-05-14', '08:00:00'),
      g('second', '2026-05-14', '11:00:00'),
      g('third',  '2026-05-14', '13:00:00'),
    ]
    const result = selectPrevGame(games, '2026-05-14', '14:00:00')
    expect(result?.id).toBe('third')
  })
})
