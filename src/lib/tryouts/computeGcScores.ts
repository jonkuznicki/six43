/**
 * Computes GC hitting and pitching scores for each player within their age group.
 *
 * Algorithm (applied separately to batting stats and pitching stats):
 *   1. For each included stat in the category, rank the player among peers.
 *   2. Convert rank → percentile (0–1). Invert for lower-is-better stats.
 *   3. Scale percentile → 1–5.
 *   4. Weighted average across all scored stats in the category.
 *
 * A player with no batting data gets null for hitting; no pitching data → null for pitching.
 * A solo player in a stat gets 3.0 (midpoint). Ties share an averaged rank.
 */

import { GC_STAT_DEF_MAP } from './gcStatDefs'

export interface GcPlayerStat {
  player_id: string
  age_group: string | null
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
  k?:           number | null
  bb_allowed?:  number | null
  bf?:          number | null
  baa?:         number | null
  bb_per_inn?:  number | null
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

export interface GcScores {
  hitting:  number | null
  pitching: number | null
}

/** Map of playerId → { hitting, pitching } scores (1–5 each, null if no data) */
export function computeGcScores(
  stats:  GcPlayerStat[],
  config: GcScoringConfigRow[],
): Map<string, GcScores> {
  const result = new Map<string, GcScores>()

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
      for (const s of groupStats) result.set(s.player_id, { hitting: null, pitching: null })
      continue
    }

    // Accumulators per player per category
    const sums:   Record<'batting' | 'pitching', Map<string, number>> = {
      batting:  new Map(), pitching: new Map(),
    }
    const totals: Record<'batting' | 'pitching', Map<string, number>> = {
      batting:  new Map(), pitching: new Map(),
    }
    for (const s of groupStats) {
      sums.batting.set(s.player_id, 0);   totals.batting.set(s.player_id, 0)
      sums.pitching.set(s.player_id, 0);  totals.pitching.set(s.player_id, 0)
    }

    for (const [statKey, { included, weight }] of Array.from(statCfg)) {
      if (!included || weight <= 0) continue

      const def = GC_STAT_DEF_MAP[statKey]
      if (!def) continue

      const cat = def.category  // 'batting' | 'pitching'

      const pairs: { playerId: string; val: number }[] = []
      for (const s of groupStats) {
        const val = (s as any)[statKey]
        if (val != null && isFinite(val)) pairs.push({ playerId: s.player_id, val })
      }
      if (pairs.length === 0) continue

      pairs.sort((a, b) => a.val - b.val)
      const n = pairs.length

      for (let i = 0; i < n; i++) {
        const { playerId } = pairs[i]
        let percentile: number
        if (n === 1) {
          percentile = 0.5
        } else {
          const v = pairs[i].val
          let lo = i, hi = i
          while (lo > 0 && pairs[lo - 1].val === v) lo--
          while (hi < n - 1 && pairs[hi + 1].val === v) hi++
          percentile = ((lo + hi) / 2) / (n - 1)
        }
        if (!def.higherBetter) percentile = 1 - percentile

        const statScore = 1 + percentile * 4
        sums[cat].set(playerId, (sums[cat].get(playerId) ?? 0) + statScore * weight)
        totals[cat].set(playerId, (totals[cat].get(playerId) ?? 0) + weight)
      }
    }

    for (const s of groupStats) {
      const hTotal = totals.batting.get(s.player_id) ?? 0
      const pTotal = totals.pitching.get(s.player_id) ?? 0
      result.set(s.player_id, {
        hitting:  hTotal > 0 ? Math.round(((sums.batting.get(s.player_id)  ?? 0) / hTotal) * 100) / 100 : null,
        pitching: pTotal > 0 ? Math.round(((sums.pitching.get(s.player_id) ?? 0) / pTotal) * 100) / 100 : null,
      })
    }
  }

  return result
}
