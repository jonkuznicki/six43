/**
 * Lineup-editing rules shared by the desktop and mobile lineup builders.
 *
 * Pure functions: given the current slots and an edit, return the next slots
 * plus exactly which rows changed. The builders persist `changedIds` through
 * the save queue (./saveQueue.ts), so every affected player row is saved in
 * the same atomic write.
 *
 * Rules (the same on every screen):
 *  - A field position can be held by only one active player per inning.
 *    Assigning a position someone else holds leaves that previous holder
 *    UNASSIGNED (null) for the inning — never moved to the bench.
 *  - The bench holds at most (active players − field positions) per inning.
 *    Bench assignments beyond that are blocked, not silently dropped.
 *  - One edit may not put the same field position on several players in the
 *    same inning (that would blank all but one of them); it is rejected whole.
 *  - Absent players are never assigned.
 */

export type Position = string // 'P', 'C', '1B', …, 'Bench'
export const BENCH = 'Bench'
export const INNING_SLOTS = 9 // inning_positions is a 9-element array in the DB

export interface LineupSlot {
  id: string
  availability?: string | null
  inning_positions: (Position | null)[] | null
  [key: string]: unknown
}

export interface CellEdit {
  slotId: string
  inning: number // 0-based
  position: Position | null // null clears the cell
}

export interface Displacement {
  slotId: string
  inning: number
  position: Position
}

export interface EditResult<S extends LineupSlot = LineupSlot> {
  slots: S[]
  /** Rows whose inning_positions (or availability) changed — persist all of them together. */
  changedIds: string[]
  /** Players who lost a field position to another player (now unassigned). */
  displaced: Displacement[]
  /** Innings where a bench assignment was blocked by the bench limit. */
  benchBlockedInnings: number[]
  /** Number of cells left unchanged because the bench was full. */
  benchBlockedCount: number
  /** Set when the whole edit was refused; `slots` is then the input unchanged. */
  rejected: null | { reason: 'duplicate_in_inning'; position: Position; inning: number }
}

export const isAbsent = (s: LineupSlot) => s.availability === 'absent'
export const isFieldPosition = (p: Position | null): p is Position => !!p && p !== BENCH

/** Field positions this team uses (team position list without Bench). */
export function fieldPositions(teamPositions: Position[]): Position[] {
  return teamPositions.filter(p => p !== BENCH)
}

/** How many active players sit on the bench each inning. */
export function benchPerInning(slots: LineupSlot[], teamPositions: Position[]): number {
  const active = slots.filter(s => !isAbsent(s)).length
  return Math.max(0, active - fieldPositions(teamPositions).length)
}

function positions(s: LineupSlot): (Position | null)[] {
  const p = [...(s.inning_positions ?? [])]
  while (p.length < INNING_SLOTS) p.push(null)
  return p
}

function cloneSlots<S extends LineupSlot>(slots: S[]): S[] {
  return slots.map(s => ({ ...s, inning_positions: positions(s) }))
}

function result<S extends LineupSlot>(slots: S[], partial: Partial<EditResult<S>> = {}): EditResult<S> {
  return {
    slots, changedIds: [], displaced: [], benchBlockedInnings: [], benchBlockedCount: 0, rejected: null,
    ...partial,
  }
}

/**
 * Apply a batch of cell edits (single assignment, bulk fill, paste or clear).
 * Edits are applied in order; each sees the effect of the previous ones.
 */
export function applyCellEdits<S extends LineupSlot>(
  slots: S[],
  edits: CellEdit[],
  teamPositions: Position[],
): EditResult<S> {
  // Refuse the same field position for several players in one inning.
  const seen = new Map<string, number>()
  for (const e of edits) {
    if (!isFieldPosition(e.position)) continue
    const k = `${e.inning}:${e.position}`
    const n = (seen.get(k) ?? 0) + 1
    seen.set(k, n)
    if (n > 1) {
      return result(slots, { rejected: { reason: 'duplicate_in_inning', position: e.position, inning: e.inning } })
    }
  }

  const next = cloneSlots(slots)
  const byId = new Map(next.map(s => [s.id, s]))
  const limit = benchPerInning(next, teamPositions)
  const changed = new Set<string>()
  const displaced: Displacement[] = []
  const blockedInnings = new Set<number>()
  let blockedCount = 0

  for (const e of edits) {
    const target = byId.get(e.slotId)
    if (!target || isAbsent(target)) continue
    const row = target.inning_positions as (Position | null)[]
    if (e.inning < 0 || e.inning >= INNING_SLOTS) continue
    if (row[e.inning] === e.position) continue

    if (e.position === BENCH) {
      const onBench = next.filter(s => s.id !== target.id && !isAbsent(s) && (s.inning_positions as (Position | null)[])[e.inning] === BENCH).length
      if (limit === 0 || onBench >= limit) {
        blockedInnings.add(e.inning)
        blockedCount++
        continue
      }
    } else if (isFieldPosition(e.position)) {
      for (const other of next) {
        if (other.id === target.id) continue
        const op = other.inning_positions as (Position | null)[]
        if (op[e.inning] === e.position) {
          op[e.inning] = null // previous holder becomes unassigned
          changed.add(other.id)
          displaced.push({ slotId: other.id, inning: e.inning, position: e.position })
        }
      }
    }

    row[e.inning] = e.position
    changed.add(target.id)
  }

  if (changed.size === 0) {
    return result(slots, { benchBlockedInnings: Array.from(blockedInnings), benchBlockedCount: blockedCount })
  }
  return result(next, {
    changedIds: Array.from(changed),
    displaced,
    benchBlockedInnings: Array.from(blockedInnings),
    benchBlockedCount: blockedCount,
  })
}

/** Swap two players' positions in one inning (field view drag). */
export function swapInInning<S extends LineupSlot>(slots: S[], slotIdA: string, slotIdB: string, inning: number): EditResult<S> {
  const next = cloneSlots(slots)
  const a = next.find(s => s.id === slotIdA)
  const b = next.find(s => s.id === slotIdB)
  if (!a || !b || a.id === b.id) return result(slots)
  const ap = a.inning_positions as (Position | null)[]
  const bp = b.inning_positions as (Position | null)[]
  if (ap[inning] === bp[inning]) return result(slots)
  ;[ap[inning], bp[inning]] = [bp[inning], ap[inning]]
  return result(next, { changedIds: [a.id, b.id] })
}

/** Copy one inning's assignments to other innings for every active player. */
export function copyInning<S extends LineupSlot>(slots: S[], from: number, to: number[]): EditResult<S> {
  const next = cloneSlots(slots)
  const changed: string[] = []
  for (const s of next) {
    if (isAbsent(s)) continue
    const p = s.inning_positions as (Position | null)[]
    let dirty = false
    for (const i of to) {
      if (i === from || p[i] === p[from]) continue
      p[i] = p[from]
      dirty = true
    }
    if (dirty) changed.push(s.id)
  }
  return changed.length ? result(next, { changedIds: changed }) : result(slots)
}

/** Clear every position for every player. */
export function clearAll<S extends LineupSlot>(slots: S[]): EditResult<S> {
  const changed = slots.filter(s => positions(s).some(p => p !== null)).map(s => s.id)
  if (!changed.length) return result(slots)
  const next = slots.map(s => ({ ...s, inning_positions: Array(INNING_SLOTS).fill(null) }))
  return result(next, { changedIds: changed })
}

/**
 * Mark a player absent (positions cleared) or available again. `restore` is
 * the snapshot to put back when they return. Availability is part of the
 * changed row, so it is saved together with the positions.
 */
export function setAbsent<S extends LineupSlot>(
  slots: S[],
  slotId: string,
  absent: boolean,
  restore?: (Position | null)[] | null,
): EditResult<S> {
  const target = slots.find(s => s.id === slotId)
  if (!target || isAbsent(target) === absent) return result(slots)
  const next = slots.map(s => {
    if (s.id !== slotId) return s
    return {
      ...s,
      availability: absent ? 'absent' : 'available',
      inning_positions: absent ? Array(INNING_SLOTS).fill(null) : (restore ? [...restore] : positions(s)),
    }
  })
  return result(next, { changedIds: [slotId] })
}

/** Field positions held by more than one active player, per inning (for checks and audits). */
export function duplicatePositions(slots: LineupSlot[], inningCount: number): Array<{ inning: number; position: Position }> {
  const out: Array<{ inning: number; position: Position }> = []
  for (let i = 0; i < inningCount; i++) {
    const counts = new Map<Position, number>()
    for (const s of slots) {
      if (isAbsent(s)) continue
      const p = positions(s)[i]
      if (isFieldPosition(p)) counts.set(p, (counts.get(p) ?? 0) + 1)
    }
    counts.forEach((n, p) => { if (n > 1) out.push({ inning: i, position: p }) })
  }
  return out
}

/** Plain-language message for a blocked or rejected edit, or null. */
export function editMessage(r: EditResult, benchLimit: number): string | null {
  const ord = (n: number) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`)
  if (r.rejected) {
    return `${r.rejected.position} can only be played by one player per inning. Select one player in inning ${r.rejected.inning + 1}, or use Bench.`
  }
  if (r.benchBlockedCount > 0) {
    if (benchLimit === 0) return 'Your roster size fills every field position, so there are no bench spots.'
    const where = r.benchBlockedInnings.length === 1
      ? `the ${ord(r.benchBlockedInnings[0] + 1)} inning`
      : `${r.benchBlockedInnings.length} innings`
    return r.benchBlockedCount === 1
      ? `The bench is already full in ${where} (${benchLimit} per inning). Move a bench player to the field first.`
      : `The bench is already full in ${where} (${benchLimit} per inning). ${r.benchBlockedCount} cells were left unchanged.`
  }
  return null
}
