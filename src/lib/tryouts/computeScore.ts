/**
 * Compute a tryout_score from subcategory scores + config.
 *
 * - Tiebreaker categories (e.g. speed) are excluded from the formula entirely.
 *   Their values are stored but don't affect tryout_score.
 * - Optional categories (pitching, catching) are excluded when all their
 *   subcategories are null/missing.
 * - Categories with weight = 0 don't contribute to the score.
 */

export interface ScoringSubcategory {
  key:    string
  label:  string
  weight: number
}

export interface ScoringCategory {
  category:      string
  label:         string
  weight:        number
  is_optional:   boolean
  is_tiebreaker: boolean
  subcategories: ScoringSubcategory[]
}

export function computeTryoutScore(
  scores: Record<string, number | null | undefined>,
  categories: ScoringCategory[],
): number | null {
  const components: [number, number][] = []

  for (const cat of categories) {
    // Tiebreaker categories (speed) don't contribute to the score
    if (cat.is_tiebreaker) continue

    const subs = cat.subcategories
    if (subs.length === 0) continue

    const subVals = subs.map(s => scores[s.key]).filter((v): v is number => v != null && !isNaN(v))

    // Skip optional category when all subcategories are blank
    if (cat.is_optional && subVals.length === 0) continue
    if (subVals.length === 0) continue

    // Weighted average of subcategory scores (fall back to simple avg if weights missing)
    const subTotal = subs.reduce((sum, s) => sum + (s.weight || 0), 0)
    let catScore: number
    if (subTotal > 0 && subVals.length === subs.length) {
      // All filled — use configured weights
      catScore = subs.reduce((sum, s) => {
        const v = scores[s.key]
        return sum + (v != null && !isNaN(v) ? v * (s.weight / subTotal) : 0)
      }, 0)
    } else {
      // Partial fill — simple average of whatever is entered
      catScore = subVals.reduce((a, b) => a + b, 0) / subVals.length
    }

    components.push([catScore, cat.weight])
  }

  if (components.length === 0) return null

  const totalW = components.reduce((sum, [, w]) => sum + w, 0) || 1
  return components.reduce((sum, [v, w]) => sum + v * (w / totalW), 0)
}
