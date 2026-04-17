/**
 * Computes a 1–5 GC score for each player within their age group.
 *
 * Algorithm:
 *   1. For each included stat, rank the player among peers in the same age group.
 *   2. Convert rank → percentile (0–1). Invert for lower-is-better stats.
 *   3. Scale percentile → 1–5.
 *   4. Weighted average across all scored stats.
 *
 * Players with no scorable stats get null.
 * Age groups with only one player with a given stat get 3.0 (midpoint).
 */

import { GC_STAT_DEF_MAP } from './gcStatDefs'

export interface GcPlayerStat {
  player_id: string
  age_group: string | null
  // Nullable stat columns (all optional — only populate what you have)
  avg?:         number | null
  obp?:         number | null
  slg?:         number | null
  ops?:         number | null
  rbi?:         number | null
  r?:           number | null
  hr?:          number | null
  sb?:          number | null
  bb?:          number | null
  so?:          number | null
  hbp?:         number | null
  sac?:         number | null
  tb?:          number | null
  era?:         number | null
  whip?:        number | null
  ip?:          number | null
  k_bb?:        number | null
  strike_pct?:  number | null
  w?:           number | null
  sv?:          number | null
}

export interface GcScoringConfigRow {
  age_group: string
  stat_key:  string
  included:  boolean
  weight:    number
}

/** Map of playerId → computed score (1–5, null if no data) */
export function computeGcScores(
  stats:  GcPlayerStat[],
  config: GcScoringConfigRow[],
): Map<string, number | null> {
  const result = new Map<string, number | null>()

  // Index config: age_group → stat_key → { included, weight }
  const cfgMap = new Map<string, Map<string, { included: boolean; weight: number }>>()
  for (const row of config) {
    if (!cfgMap.has(row.age_group)) cfgMap.set(row.age_group, new Map())
    cfgMap.get(row.age_group)!.set(row.stat_key, { included: row.included, weight: row.weight })
  }

  // Group stats by age group
  const byGroup = new Map<string, GcPlayerStat[]>()
  for (const s of stats) {
    const g = s.age_group ?? '__unknown__'
    if (!byGroup.has(g)) byGroup.set(g, [])
    byGroup.get(g)!.push(s)
  }

  for (const [ageGroup, groupStats] of Array.from(byGroup)) {
    const statCfg = cfgMap.get(ageGroup)
    if (!statCfg) {
      // No config for this age group — no scores
      for (const s of groupStats) result.set(s.player_id, null)
      continue
    }

    // For each player, accumulate weighted stat scores
    const playerWeightedSums = new Map<string, number>()
    const playerWeightTotals = new Map<string, number>()
    for (const s of groupStats) {
      playerWeightedSums.set(s.player_id, 0)
      playerWeightTotals.set(s.player_id, 0)
    }

    for (const [statKey, { included, weight }] of Array.from(statCfg)) {
      if (!included || weight <= 0) continue

      const def = GC_STAT_DEF_MAP[statKey]
      if (!def) continue

      // Collect (playerId, value) pairs where value is not null
      const pairs: { playerId: string; val: number }[] = []
      for (const s of groupStats) {
        const val = (s as any)[statKey]
        if (val != null && isFinite(val)) {
          pairs.push({ playerId: s.player_id, val })
        }
      }

      if (pairs.length === 0) continue

      // Sort ascending for ranking
      pairs.sort((a, b) => a.val - b.val)
      const n = pairs.length

      for (let i = 0; i < n; i++) {
        const { playerId } = pairs[i]

        let percentile: number
        if (n === 1) {
          percentile = 0.5  // Only one data point → midpoint
        } else {
          // Handle ties: average rank of all tied players
          // Find range of indices with same value
          const v = pairs[i].val
          let lo = i, hi = i
          while (lo > 0 && pairs[lo - 1].val === v) lo--
          while (hi < n - 1 && pairs[hi + 1].val === v) hi++
          const avgRank = (lo + hi) / 2
          percentile = avgRank / (n - 1)
        }

        // Invert for lower-is-better stats
        if (!def.higherBetter) percentile = 1 - percentile

        const statScore = 1 + percentile * 4  // 1–5

        playerWeightedSums.set(playerId, (playerWeightedSums.get(playerId) ?? 0) + statScore * weight)
        playerWeightTotals.set(playerId, (playerWeightTotals.get(playerId) ?? 0) + weight)
      }
    }

    for (const s of groupStats) {
      const total = playerWeightTotals.get(s.player_id) ?? 0
      if (total === 0) {
        result.set(s.player_id, null)
      } else {
        const raw = (playerWeightedSums.get(s.player_id) ?? 0) / total
        result.set(s.player_id, Math.round(raw * 100) / 100)
      }
    }
  }

  return result
}
