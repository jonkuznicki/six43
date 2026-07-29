/**
 * Centralized combined-score logic for the Tryouts module.
 *
 * Previously Rankings and the per-team roster page each hardcoded their own
 * blend (33% tryout / 67% coach eval, and 60% / 40% respectively) and never
 * read the season's configured weights or folded GameChanger stats in at
 * all, despite `tryout_seasons` having a `prior_stats_weight` column for
 * exactly that. This module is the one place that formula lives now.
 *
 * It also centralizes the coach-eval decomposition: `tryout_coach_evals`
 * already stores `coach_eval_score` (fielding/hitting + pitching/catching
 * only) and `intangibles_score` (intangibles section only) as two
 * *separate* server-computed values — see migration 077. Rankings was
 * previously blending ALL fields (including intangibles) into one
 * "Coach Eval" figure and then ALSO applying a separate intangibles
 * weight on top of it, double-counting intangibles in the combined score.
 * The functions below recompute both figures live from the raw `scores`
 * JSON + the *current* eval config (so edits to Scoring Setup take effect
 * immediately, matching Rankings' existing "always live" behavior) —
 * they just do it per-section instead of blending everything together.
 */

export interface SeasonWeights {
  tryoutWeight: number
  coachEvalWeight: number
  intangiblesWeight: number
  priorStatsWeight: number
}

// Matches the tryout_seasons column defaults (migration 030).
export const DEFAULT_SEASON_WEIGHTS: SeasonWeights = {
  tryoutWeight: 0.4,
  coachEvalWeight: 0.4,
  intangiblesWeight: 0.1,
  priorStatsWeight: 0.1,
}

export interface EvalConfigField {
  field_key: string
  section: string
  weight: number
}

/** Dense rank within a group (ties share a rank, no gaps). Highest value = rank 1. */
export function denseRank(items: Array<{ id: string; v: number | null }>): Map<string, number> {
  const sorted = items.filter(x => x.v != null).sort((a, b) => b.v! - a.v!)
  const map = new Map<string, number>()
  let rank = 1
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i].v === sorted[i - 1].v) {
      map.set(sorted[i].id, map.get(sorted[i - 1].id)!)
    } else {
      map.set(sorted[i].id, rank)
    }
    rank++
  }
  return map
}

/** Simple mean of whichever values are present (nulls/undefined ignored). */
export function averagePresent(values: Array<number | null | undefined>): number | null {
  const present = values.filter((v): v is number => v != null)
  if (present.length === 0) return null
  return present.reduce((a, b) => a + b, 0) / present.length
}

/**
 * Weighted average of coach-eval fields, EXCLUDING the intangibles section.
 * Mirrors the server-side `coach_eval_score` computation in migration 077.
 */
export function computeCoachEvalScore(
  scores: Record<string, number> | null,
  config: EvalConfigField[],
): number | null {
  if (!scores || config.length === 0) return null
  const active = config.filter(c => c.section !== 'intangibles' && c.weight > 0 && typeof scores[c.field_key] === 'number')
  if (active.length === 0) return null
  const totalWeight = active.reduce((s, c) => s + c.weight, 0)
  if (totalWeight === 0) return null
  const weighted = active.reduce((s, c) => s + scores[c.field_key] * c.weight, 0)
  return Math.round((weighted / totalWeight) * 100) / 100
}

/**
 * Weighted average of the intangibles section only. Mirrors the
 * server-side `intangibles_score` computation in migration 077 — this
 * replaces an unweighted plain mean that ignored per-field weight config.
 */
export function computeIntangiblesScore(
  scores: Record<string, number> | null,
  config: EvalConfigField[],
): number | null {
  if (!scores || config.length === 0) return null
  const active = config.filter(c => c.section === 'intangibles' && c.weight > 0 && typeof scores[c.field_key] === 'number')
  if (active.length === 0) return null
  const totalWeight = active.reduce((s, c) => s + c.weight, 0)
  if (totalWeight === 0) return null
  const weighted = active.reduce((s, c) => s + scores[c.field_key] * c.weight, 0)
  return Math.round((weighted / totalWeight) * 100) / 100
}

export interface CombinedScoreComponents {
  tryoutScore: number | null
  coachEvalScore: number | null
  intangiblesScore: number | null
  priorStatScore: number | null
}

/**
 * The one combined-score formula for the whole module.
 *
 * Behavior for missing components: this generalizes what BOTH prior
 * implementations already did independently for their two components —
 * redistribute weight proportionally across whichever components are
 * actually present, rather than penalizing a player for a source that
 * simply hasn't come in yet (no tryout session scored them, no coach
 * eval submitted, no GC stats imported, etc). A player with nothing at
 * all gets null, not zero.
 */
export function computeCombinedScore(
  components: CombinedScoreComponents,
  weights: SeasonWeights = DEFAULT_SEASON_WEIGHTS,
): number | null {
  const parts: Array<[number, number]> = []
  if (components.tryoutScore != null)      parts.push([components.tryoutScore, weights.tryoutWeight])
  if (components.coachEvalScore != null)   parts.push([components.coachEvalScore, weights.coachEvalWeight])
  if (components.intangiblesScore != null) parts.push([components.intangiblesScore, weights.intangiblesWeight])
  if (components.priorStatScore != null)   parts.push([components.priorStatScore, weights.priorStatsWeight])

  if (parts.length === 0) return null

  const totalWeight = parts.reduce((s, [, w]) => s + w, 0)
  if (totalWeight <= 0) {
    // Every present component has a configured weight of 0 — fall back to a
    // simple average rather than returning null for players who do have data.
    return Math.round((parts.reduce((s, [v]) => s + v, 0) / parts.length) * 100) / 100
  }

  const weighted = parts.reduce((s, [v, w]) => s + v * w, 0)
  return Math.round((weighted / totalWeight) * 100) / 100
}
