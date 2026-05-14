const BLANK: (string | null)[] = [null,null,null,null,null,null,null,null,null]

// ── Previous-game selection helpers ───────────────────────────────────────────

function gameMs(date: string, time: string | null): number {
  return new Date(`${date}T${time ?? '00:00:00'}`).getTime()
}

/**
 * Returns true when game `g` started strictly before (currentDate, currentTime).
 *
 * Rules:
 * - An earlier date is always "before" regardless of time.
 * - Same date: only "before" when both sides have a game_time and g.game_time
 *   is strictly less (string compare works for HH:MM:SS ISO time).
 * - Same date with either side missing a time: ambiguous, returns false.
 */
export function isBeforeGame(
  g: { game_date: string; game_time?: string | null },
  currentDate: string,
  currentTime: string | null,
): boolean {
  if (g.game_date < currentDate) return true
  if (g.game_date > currentDate) return false
  if (!currentTime || !g.game_time) return false
  return g.game_time < currentTime
}

/**
 * From a list of candidate games, return the one that most recently preceded
 * the current game (full datetime-aware: same-day earlier games are preferred
 * over games from prior days when they exist).
 *
 * Falls back to the latest-dated candidate when currentDate is null (no
 * current game date set yet).
 */
export function selectPrevGame<T extends { id: string; game_date: string; game_time?: string | null }>(
  candidates: T[],
  currentDate: string | null,
  currentTime: string | null,
): T | null {
  const withDates = candidates.filter(g => g.game_date)
  if (!withDates.length) return null

  const eligible = currentDate
    ? withDates.filter(g => isBeforeGame(g, currentDate, currentTime))
    : withDates  // no current date — include all, pick most recent

  if (!eligible.length) return null
  return eligible.reduce((best, g) =>
    gameMs(g.game_date, g.game_time ?? null) > gameMs(best.game_date, best.game_time ?? null) ? g : best
  )
}

export interface CopySlotResult {
  id: string
  batting_order: number
  inning_positions: (string | null)[]
}

/**
 * Compute the full set of slot updates after copying from a previous game.
 *
 * Design:
 * - Matched players (present in source) get batting_order from the source, sorted.
 * - Unmatched players (new additions) are appended in their current relative order.
 * - ALL active slots are renumbered 1..N so batting_orders are always contiguous
 *   and duplicate-free, even when rosters differ between games.
 * - Positions: matched players in 'full' mode get source positions; in 'order' mode
 *   their positions are cleared. Unmatched players always keep their current positions.
 */
export function buildCopyUpdates(
  currentSlots: Array<{
    id: string
    player_id: string
    batting_order: number | null
    availability: string
    inning_positions: (string | null)[]
  }>,
  sourceByPlayer: Map<string, { batting_order: number | null; inning_positions: (string | null)[] }>,
  copyMode: 'full' | 'order',
): CopySlotResult[] {
  const active = currentSlots.filter(s => s.availability !== 'absent')

  const matched   = active.filter(s => sourceByPlayer.has(s.player_id))
  const unmatched = active.filter(s => !sourceByPlayer.has(s.player_id))

  // Sort matched by source batting_order (nulls last)
  const matchedSorted = [...matched].sort((a, b) => {
    const ao = sourceByPlayer.get(a.player_id)?.batting_order ?? 999
    const bo = sourceByPlayer.get(b.player_id)?.batting_order ?? 999
    return ao - bo
  })

  // Keep unmatched in their current relative batting_order
  const unmatchedSorted = [...unmatched].sort((a, b) =>
    (a.batting_order ?? 999) - (b.batting_order ?? 999)
  )

  // Combine and assign clean 1..N batting_orders
  return [...matchedSorted, ...unmatchedSorted].map((s, i) => {
    const src = sourceByPlayer.get(s.player_id)
    return {
      id: s.id,
      batting_order: i + 1,
      inning_positions: src
        ? (copyMode === 'full' ? src.inning_positions : [...BLANK])
        : s.inning_positions,  // unmatched: preserve current positions
    }
  })
}
