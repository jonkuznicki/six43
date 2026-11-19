import { describe, expect, it } from 'vitest'
import {
  applyCellEdits, benchPerInning, clearAll, copyInning, duplicatePositions, editMessage, setAbsent, swapInInning,
  type LineupSlot,
} from '../rules'

const TEAM = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'Bench']
const pad = (p: (string | null)[]) => [...p, ...Array(9 - p.length).fill(null)]
const slot = (id: string, p: (string | null)[], availability = 'available'): LineupSlot =>
  ({ id, availability, inning_positions: pad(p) })

/** 11 active players → 2 on the bench each inning. Inning 1 is complete. */
function eleven(): LineupSlot[] {
  const first = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'Bench', 'Bench']
  return first.map((p, i) => slot(`s${i}`, [p]))
}
const at = (slots: LineupSlot[], id: string, inning = 0) => slots.find(s => s.id === id)!.inning_positions![inning]

describe('occupied position (swap rule)', () => {
  it('previous holder becomes unassigned, not benched; both rows are reported changed', () => {
    const r = applyCellEdits(eleven(), [{ slotId: 's9', inning: 0, position: 'P' }], TEAM)
    expect(at(r.slots, 's9')).toBe('P')
    expect(at(r.slots, 's0')).toBeNull()
    expect(r.changedIds.sort()).toEqual(['s0', 's9'])
    expect(r.displaced).toEqual([{ slotId: 's0', inning: 0, position: 'P' }])
    expect(duplicatePositions(r.slots, 1)).toEqual([])
  })

  it('does not mutate the input slots', () => {
    const input = eleven()
    const snapshot = JSON.stringify(input)
    applyCellEdits(input, [{ slotId: 's9', inning: 0, position: 'P' }], TEAM)
    expect(JSON.stringify(input)).toBe(snapshot)
  })

  it('assigning the position a player already has changes nothing', () => {
    const input = eleven()
    const r = applyCellEdits(input, [{ slotId: 's0', inning: 0, position: 'P' }], TEAM)
    expect(r.changedIds).toEqual([])
    expect(r.slots).toBe(input)
  })

  it('a player moving between field positions leaves their old position open', () => {
    const r = applyCellEdits(eleven(), [{ slotId: 's0', inning: 0, position: 'SS' }], TEAM)
    expect(at(r.slots, 's0')).toBe('SS')
    expect(at(r.slots, 's4')).toBeNull()                  // previous SS unassigned
    expect(r.slots.some(s => s.inning_positions![0] === 'P')).toBe(false) // nobody pitches now
  })

  it('never assigns absent players', () => {
    const slots = [...eleven(), slot('away', [null], 'absent')]
    const r = applyCellEdits(slots, [{ slotId: 'away', inning: 0, position: 'P' }], TEAM)
    expect(r.changedIds).toEqual([])
    expect(at(r.slots, 's0')).toBe('P')
  })
})

describe('bench limit', () => {
  it('is active players minus field positions', () => {
    expect(benchPerInning(eleven(), TEAM)).toBe(2)
    expect(benchPerInning([...eleven(), slot('x', [], 'absent')], TEAM)).toBe(2)
    expect(benchPerInning(eleven().slice(0, 9), TEAM)).toBe(0)
  })

  it('blocks a bench assignment when the inning is full', () => {
    const r = applyCellEdits(eleven(), [{ slotId: 's0', inning: 0, position: 'Bench' }], TEAM)
    expect(r.changedIds).toEqual([])
    expect(at(r.slots, 's0')).toBe('P')
    expect(r.benchBlockedInnings).toEqual([0])
    expect(editMessage(r, 2)).toMatch(/bench is already full in the 1st inning \(2 per inning\)/i)
  })

  it('allows bench up to the limit within one bulk edit, then blocks the rest', () => {
    const slots = eleven().map(s => ({ ...s, inning_positions: pad([]) })) // inning 1 empty
    const r = applyCellEdits(slots, ['s0', 's1', 's2', 's3'].map(id => ({ slotId: id, inning: 0, position: 'Bench' })), TEAM)
    expect(r.slots.filter(s => s.inning_positions![0] === 'Bench').length).toBe(2)
    expect(r.benchBlockedCount).toBe(2)
    expect(r.changedIds.sort()).toEqual(['s0', 's1'])
  })

  it('has no bench spots when the roster only fills the field', () => {
    const nine = eleven().slice(0, 9).map(s => ({ ...s, inning_positions: pad([]) }))
    const r = applyCellEdits(nine, [{ slotId: 's0', inning: 0, position: 'Bench' }], TEAM)
    expect(r.changedIds).toEqual([])
    expect(editMessage(r, 0)).toMatch(/no bench spots/)
  })
})

describe('bulk fill and paste', () => {
  it('refuses one field position for several players in the same inning — nothing changes', () => {
    const input = eleven()
    const r = applyCellEdits(input, ['s0', 's1', 's2'].map(id => ({ slotId: id, inning: 0, position: 'LF' })), TEAM)
    expect(r.rejected).toEqual({ reason: 'duplicate_in_inning', position: 'LF', inning: 0 })
    expect(r.slots).toBe(input)
    expect(editMessage(r, 2)).toMatch(/LF can only be played by one player per inning/)
  })

  it('allows one position for one player across several innings', () => {
    const r = applyCellEdits(eleven(), [0, 1, 2].map(i => ({ slotId: 's0', inning: i, position: 'P' })), TEAM)
    expect(r.rejected).toBeNull()
    expect([0, 1, 2].map(i => at(r.slots, 's0', i))).toEqual(['P', 'P', 'P'])
  })

  it('paste-style edits apply the swap rule, so no duplicates are created', () => {
    const r = applyCellEdits(eleven(), [
      { slotId: 's9', inning: 0, position: 'C' },
      { slotId: 's10', inning: 0, position: '1B' },
    ], TEAM)
    expect(duplicatePositions(r.slots, 1)).toEqual([])
    expect(at(r.slots, 's1')).toBeNull()
    expect(at(r.slots, 's2')).toBeNull()
  })

  it('clearing cells (Delete) sets them to unassigned', () => {
    const r = applyCellEdits(eleven(), [{ slotId: 's0', inning: 0, position: null }], TEAM)
    expect(at(r.slots, 's0')).toBeNull()
    expect(r.changedIds).toEqual(['s0'])
  })
})

describe('other edits', () => {
  it('swapInInning exchanges two players’ positions', () => {
    const r = swapInInning(eleven(), 's0', 's1', 0)
    expect([at(r.slots, 's0'), at(r.slots, 's1')]).toEqual(['C', 'P'])
    expect(r.changedIds).toEqual(['s0', 's1'])
  })

  it('copyInning copies an inning for active players only', () => {
    const slots = [...eleven(), slot('away', [null, 'P'], 'absent')]
    const r = copyInning(slots, 0, [1, 2])
    expect(at(r.slots, 's0', 2)).toBe('P')
    expect(at(r.slots, 'away', 1)).toBe('P') // absent row untouched
    expect(r.changedIds).not.toContain('away')
  })

  it('clearAll reports only rows that had positions', () => {
    const slots = [...eleven(), slot('empty', [])]
    const r = clearAll(slots)
    expect(r.changedIds).not.toContain('empty')
    expect(r.slots.every(s => s.inning_positions!.every(p => p === null))).toBe(true)
  })

  it('setAbsent clears positions and changes availability in the same row; restore puts them back', () => {
    const absent = setAbsent(eleven(), 's0', true)
    const row = absent.slots.find(s => s.id === 's0')!
    expect(row.availability).toBe('absent')
    expect(row.inning_positions!.every(p => p === null)).toBe(true)
    const back = setAbsent(absent.slots, 's0', false, pad(['P']))
    expect(back.slots.find(s => s.id === 's0')!.availability).toBe('available')
    expect(at(back.slots, 's0')).toBe('P')
  })

  it('duplicatePositions finds field positions held twice in an inning', () => {
    const slots = [slot('a', ['SS']), slot('b', ['SS']), slot('c', ['Bench']), slot('d', ['Bench'])]
    expect(duplicatePositions(slots, 1)).toEqual([{ inning: 0, position: 'SS' }])
  })
})
