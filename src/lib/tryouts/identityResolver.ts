/**
 * Identity resolver for tryout imports.
 *
 * Given a raw name (and optional age group, DOB, email) from an import
 * source, finds the best matching player(s) from the canonical player list.
 *
 * Confidence thresholds (per spec):
 *   ≥ 0.90  → auto-match  (no human review needed)
 *   0.70–0.89 → suggest   (1-click confirm in review queue)
 *   < 0.70  → unresolved  (manual selection required)
 *
 * Returns top-N candidates sorted by confidence descending.
 */

import { normalizeName, expandName, fullName } from './nameNormalization'
import { bestSimilarity } from './levenshtein'

// ── Types ────────────────────────────────────────────────────────────────────

export interface CandidatePlayer {
  id: string
  firstName: string
  lastName: string
  dob: string | null
  ageGroup: string | null
  parentEmail: string | null
}

export interface MatchCandidate {
  player: CandidatePlayer
  confidence: number
  matchReason: string   // human-readable explanation for the review UI
}

export type MatchStatus = 'auto' | 'suggested' | 'unresolved'

export interface ResolveResult {
  status: MatchStatus
  topMatch: MatchCandidate | null
  candidates: MatchCandidate[]  // top 3, sorted by confidence desc
}

// ── Constants ────────────────────────────────────────────────────────────────

export const CONFIDENCE = {
  AUTO:    0.90,   // auto-match threshold
  SUGGEST: 0.70,   // suggest (needs 1-click confirm) threshold
} as const

// ── Core resolver ────────────────────────────────────────────────────────────

/**
 * Resolve a single raw name to a canonical player.
 *
 * @param rawName  - name as it appeared in the source file
 * @param ageGroup - tryout age group from the source row (8U, 10U, etc.)
 * @param dob      - date of birth string if available (YYYY-MM-DD)
 * @param email    - parent email if available
 * @param candidates - full player list for this org (pre-filtered to org scope)
 * @param maxResults - how many candidates to return (default 3)
 */
export function resolvePlayer(
  rawName:    string,
  ageGroup:   string | null,
  dob:        string | null,
  email:      string | null,
  candidates: CandidatePlayer[],
  maxResults = 3,
): ResolveResult {
  if (!rawName.trim()) {
    return { status: 'unresolved', topMatch: null, candidates: [] }
  }

  const normalizedRaw  = normalizeName(rawName)
  const expandedRaw    = expandName(rawName)

  // Pre-filter: if ageGroup is provided, only match within that age group
  // (unless that filter leaves no candidates — fall back to all)
  let pool = candidates
  if (ageGroup) {
    const filtered = candidates.filter(c => c.ageGroup === ageGroup)
    if (filtered.length > 0) pool = filtered
  }

  const scored: MatchCandidate[] = pool.map(player => {
    const canonicalNorm     = normalizeName(fullName(player.firstName, player.lastName))
    const canonicalExpanded = expandName(fullName(player.firstName, player.lastName))

    let confidence  = 0
    let matchReason = 'fuzzy name match'

    // ── Tier 1: Exact normalized match ──────────────────────────────
    if (normalizedRaw === canonicalNorm) {
      confidence  = 1.0
      matchReason = 'exact name match'
    }

    // ── Tier 2: DOB match + any name similarity ──────────────────────
    else if (dob && player.dob && dob === player.dob) {
      const nameSim = Math.max(
        bestSimilarity(normalizedRaw, canonicalNorm),
        bestSimilarity(expandedRaw,   canonicalExpanded),
      )
      confidence  = 0.90 + nameSim * 0.05   // 0.90–0.95 range
      matchReason = 'DOB match + name similarity'
    }

    // ── Tier 3: Parent email match ───────────────────────────────────
    else if (
      email && player.parentEmail &&
      email.toLowerCase().trim() === player.parentEmail.toLowerCase().trim()
    ) {
      const nameSim = Math.max(
        bestSimilarity(normalizedRaw, canonicalNorm),
        bestSimilarity(expandedRaw,   canonicalExpanded),
      )
      confidence  = 0.90 + nameSim * 0.05
      matchReason = 'parent email match + name similarity'
    }

    // ── Tier 4: Nickname expansion match ────────────────────────────
    else if (expandedRaw === canonicalExpanded && expandedRaw !== normalizedRaw) {
      confidence  = 0.88
      matchReason = 'nickname expansion match'
    }

    // ── Tier 5: Fuzzy name similarity (Levenshtein + trigrams) ───────
    else {
      // Score both normalized and nickname-expanded versions, take the better one
      const sim1 = bestSimilarity(normalizedRaw, canonicalNorm)
      const sim2 = bestSimilarity(expandedRaw,   canonicalExpanded)
      const sim3 = bestSimilarity(firstNameOnly(normalizedRaw), firstNameOnly(canonicalNorm))
        * 0.4 + bestSimilarity(lastNameOnly(normalizedRaw), lastNameOnly(canonicalNorm)) * 0.6

      const bestSim = Math.max(sim1, sim2, sim3)

      // Scale fuzzy matches to 0.50–0.85 range
      confidence  = 0.50 + bestSim * 0.35
      matchReason = `fuzzy match (${Math.round(bestSim * 100)}% name similarity)`
    }

    // Small penalty for different age group (should rarely happen after filtering)
    if (ageGroup && player.ageGroup && ageGroup !== player.ageGroup) {
      confidence *= 0.85
      matchReason += ', different age group'
    }

    return { player, confidence, matchReason }
  })

  // Sort by confidence descending, take top N
  const topCandidates = scored
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, maxResults)
    .filter(c => c.confidence >= 0.30)   // discard obvious non-matches

  if (topCandidates.length === 0) {
    return { status: 'unresolved', topMatch: null, candidates: [] }
  }

  const top = topCandidates[0]

  const status: MatchStatus =
    top.confidence >= CONFIDENCE.AUTO    ? 'auto' :
    top.confidence >= CONFIDENCE.SUGGEST ? 'suggested' :
                                           'unresolved'

  return {
    status,
    topMatch:   top,
    candidates: topCandidates,
  }
}

/**
 * Resolve a batch of rows.
 * Returns one result per input row, in the same order.
 */
export function resolveBatch(
  rows: Array<{
    rawName:  string
    ageGroup: string | null
    dob:      string | null
    email:    string | null
  }>,
  candidates: CandidatePlayer[],
): ResolveResult[] {
  return rows.map(row =>
    resolvePlayer(row.rawName, row.ageGroup, row.dob, row.email, candidates)
  )
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function firstNameOnly(fullNormalized: string): string {
  return fullNormalized.split(' ')[0] ?? ''
}

function lastNameOnly(fullNormalized: string): string {
  const parts = fullNormalized.split(' ')
  return parts[parts.length - 1] ?? ''
}
