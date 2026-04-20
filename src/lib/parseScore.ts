/**
 * Parse a final score from a game's notes JSON.
 * Checks `_score` (quick-score entry) first, then falls back to
 * `_box` (full inning-by-inning box score).
 */
export function parseScore(notes: string | null): { us: number; them: number } | null {
  try {
    const p = JSON.parse(notes ?? '{}')

    // Quick score entered via GameCard or game detail page
    if (p._score != null) return p._score

    // Fall back to inning-by-inning box score
    if (p._box) {
      const all = [...(p._box.us ?? []), ...(p._box.them ?? [])]
      if (!all.some((v: number | null) => v !== null)) return null
      return {
        us:   (p._box.us   ?? []).reduce((a: number, v: number | null) => a + (v ?? 0), 0),
        them: (p._box.them ?? []).reduce((a: number, v: number | null) => a + (v ?? 0), 0),
      }
    }
    return null
  } catch { return null }
}

export function gameResult(score: { us: number; them: number }): 'W' | 'L' | 'T' {
  if (score.us > score.them) return 'W'
  if (score.them > score.us) return 'L'
  return 'T'
}
