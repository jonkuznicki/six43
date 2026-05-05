const BLANK: (string | null)[] = [null,null,null,null,null,null,null,null,null]

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
