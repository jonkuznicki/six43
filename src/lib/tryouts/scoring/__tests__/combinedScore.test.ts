import { describe, it, expect } from 'vitest'
import {
  computeCombinedScore,
  computeCoachEvalScore,
  computeIntangiblesScore,
  averagePresent,
  denseRank,
  selectActiveSeasonCoachEvals,
  selectActiveSeasonEvalConfig,
  DEFAULT_SEASON_WEIGHTS,
  type EvalConfigField,
  type SeasonScopedCoachEval,
} from '../combinedScore'

// Validation for the "Rankings, Data Hub, and team roster page must produce
// the same score" requirement — since all three now import these exact
// functions, correctness here is correctness everywhere they're used.

describe('computeCombinedScore — weight redistribution', () => {
  const weights = DEFAULT_SEASON_WEIGHTS // tryout .4 / coachEval .4 / intangibles .1 / priorStats .1

  it('player with all four sources: full weighted blend', () => {
    const result = computeCombinedScore(
      { tryoutScore: 4.0, coachEvalScore: 3.5, intangiblesScore: 4.5, priorStatScore: 3.0 },
      weights,
    )
    expect(result).toBe(3.75)
  })

  it('player missing GameChanger stats: redistributes prior-stats weight across the other three', () => {
    const result = computeCombinedScore(
      { tryoutScore: 4.0, coachEvalScore: 3.5, intangiblesScore: 4.5, priorStatScore: null },
      weights,
    )
    expect(result).toBe(3.83)
  })

  it('player missing Coach Eval (and therefore Intangibles, since both derive from the same eval row)', () => {
    const result = computeCombinedScore(
      { tryoutScore: 4.0, coachEvalScore: null, intangiblesScore: null, priorStatScore: 3.0 },
      weights,
    )
    expect(result).toBe(3.8)
  })

  it('player missing Tryout Scores: redistributes tryout weight across the rest', () => {
    const result = computeCombinedScore(
      { tryoutScore: null, coachEvalScore: 3.5, intangiblesScore: 4.5, priorStatScore: 3.0 },
      weights,
    )
    expect(result).toBe(3.58)
  })

  it('player with only one source: combined score equals that source exactly', () => {
    const result = computeCombinedScore(
      { tryoutScore: 4.0, coachEvalScore: null, intangiblesScore: null, priorStatScore: null },
      weights,
    )
    expect(result).toBe(4.0)
  })

  it('player with only two sources: weighted between just those two', () => {
    const result = computeCombinedScore(
      { tryoutScore: 4.0, coachEvalScore: 3.0, intangiblesScore: null, priorStatScore: null },
      weights,
    )
    // (4*0.4 + 3*0.4) / 0.8 = 3.5
    expect(result).toBe(3.5)
  })

  it('player with everything missing: null, never zero', () => {
    const result = computeCombinedScore(
      { tryoutScore: null, coachEvalScore: null, intangiblesScore: null, priorStatScore: null },
      weights,
    )
    expect(result).toBeNull()
  })

  it('falls back to a simple average when every present component has zero configured weight', () => {
    const zeroWeights = { tryoutWeight: 0, coachEvalWeight: 0, intangiblesWeight: 0, priorStatsWeight: 0 }
    const result = computeCombinedScore(
      { tryoutScore: 4.0, coachEvalScore: 3.0, intangiblesScore: null, priorStatScore: null },
      zeroWeights,
    )
    expect(result).toBe(3.5)
  })

  it('uses DEFAULT_SEASON_WEIGHTS when no weights are supplied', () => {
    const result = computeCombinedScore({ tryoutScore: 4.0, coachEvalScore: null, intangiblesScore: null, priorStatScore: null })
    expect(result).toBe(4.0)
  })
})

describe('computeCoachEvalScore / computeIntangiblesScore — no double-counting', () => {
  // Mirrors a realistic org rubric: fielding/hitting + pitching/catching
  // (weight 0, optional) + intangibles, matching Hudson Baseball's seed data.
  const config: EvalConfigField[] = [
    { field_key: 'fielding_ground_balls', section: 'fielding_hitting', weight: 1 },
    { field_key: 'hitting',               section: 'fielding_hitting', weight: 1 },
    { field_key: 'pitching',              section: 'pitching_catching', weight: 0 },
    { field_key: 'coachability',          section: 'intangibles',      weight: 1 },
    { field_key: 'attitude',              section: 'intangibles',      weight: 1 },
  ]

  const scores = {
    fielding_ground_balls: 4,
    hitting: 3,
    pitching: 5, // weight 0 — excluded from both
    coachability: 5,
    attitude: 4,
  }

  it('coachEvalScore only averages non-intangibles fields with weight > 0', () => {
    expect(computeCoachEvalScore(scores, config)).toBe(3.5) // (4 + 3) / 2
  })

  it('intangiblesScore only averages intangibles fields, independent of coachEvalScore', () => {
    expect(computeIntangiblesScore(scores, config)).toBe(4.5) // (5 + 4) / 2
  })

  it('a weight-0 field (pitching, not applicable) never appears in either score', () => {
    const coach = computeCoachEvalScore(scores, config)!
    const intang = computeIntangiblesScore(scores, config)!
    // If pitching (5) leaked into either average it would pull the result up;
    // confirm both stay exactly at their expected values.
    expect(coach).toBe(3.5)
    expect(intang).toBe(4.5)
  })

  it('returns null when no scores are recorded', () => {
    expect(computeCoachEvalScore(null, config)).toBeNull()
    expect(computeIntangiblesScore({}, config)).toBeNull()
  })

  it('returns null when config is empty', () => {
    expect(computeCoachEvalScore(scores, [])).toBeNull()
  })
})

describe('averagePresent', () => {
  it('averages only non-null values', () => {
    expect(averagePresent([4, null, 2, undefined, 6])).toBe(4)
  })
  it('returns null when nothing is present', () => {
    expect(averagePresent([null, undefined])).toBeNull()
    expect(averagePresent([])).toBeNull()
  })
})

describe('selectActiveSeasonCoachEvals — season isolation (season-rollover fixes)', () => {
  const SEASON_2027 = 'season-2027-uuid'
  const SEASON_2028 = 'season-2028-uuid'

  interface Row extends SeasonScopedCoachEval {
    scores: Record<string, number>
  }

  it('player has a 2027 eval AND a 2028 eval — the active 2028 season uses only the 2028 row', () => {
    const rows: Row[] = [
      { player_id: 'john', season_id: SEASON_2027, season_year: '2027', scores: { hitting: 2 } },
      { player_id: 'john', season_id: SEASON_2028, season_year: '2028', scores: { hitting: 5 } },
    ]
    const map = selectActiveSeasonCoachEvals(rows, SEASON_2028)
    expect(map.get('john')?.scores.hitting).toBe(5)
    expect(map.size).toBe(1)
  })

  it('player has a 2027 eval but NO 2028 eval — the active 2028 season gets no Coach Eval row at all, never falls back to 2027', () => {
    const rows: Row[] = [
      { player_id: 'john', season_id: SEASON_2027, season_year: '2027', scores: { hitting: 2 } },
    ]
    const map = selectActiveSeasonCoachEvals(rows, SEASON_2028)
    expect(map.has('john')).toBe(false)
    // Downstream: no eval row means computeCoachEvalScore receives null scores.
    const evalRow = map.get('john') ?? null
    expect(computeCoachEvalScore(evalRow?.scores ?? null, [
      { field_key: 'hitting', section: 'fielding_hitting', weight: 1 },
    ])).toBeNull()
  })

  it('viewing the 2027 season (switched back to as the active season) still uses the 2027 evaluation, even though a newer 2028 row exists', () => {
    const rows: Row[] = [
      { player_id: 'john', season_id: SEASON_2027, season_year: '2027', scores: { hitting: 2 } },
      { player_id: 'john', season_id: SEASON_2028, season_year: '2028', scores: { hitting: 5 } },
    ]
    const map = selectActiveSeasonCoachEvals(rows, SEASON_2027)
    expect(map.get('john')?.scores.hitting).toBe(2)
  })

  it('a player with only an eval from an unrelated season (neither active nor adjacent) gets nothing', () => {
    const rows: Row[] = [
      { player_id: 'john', season_id: 'season-2019-uuid', season_year: '2019', scores: { hitting: 9 } },
    ]
    const map = selectActiveSeasonCoachEvals(rows, SEASON_2028)
    expect(map.has('john')).toBe(false)
  })
})

describe('selectActiveSeasonEvalConfig — season isolation', () => {
  const SEASON_2027 = 'season-2027-uuid'
  const SEASON_2028 = 'season-2028-uuid'

  it('2028 cannot accidentally use 2027 config rows, even when both are fetched org-wide in one query', () => {
    const rows = [
      { season_id: SEASON_2027, field_key: 'hitting', section: 'fielding_hitting', weight: 1 },
      { season_id: SEASON_2027, field_key: 'legacy_field', section: 'fielding_hitting', weight: 1 },
      { season_id: SEASON_2028, field_key: 'hitting', section: 'fielding_hitting', weight: 2 },
    ]
    const scoped = selectActiveSeasonEvalConfig(rows, SEASON_2028)
    expect(scoped).toHaveLength(1)
    expect(scoped[0]).toEqual({ season_id: SEASON_2028, field_key: 'hitting', section: 'fielding_hitting', weight: 2 })
  })

  it('an org-wide (unscoped) rubric fetch would blend two different seasons\' fields into one wrong average — scoping fixes it', () => {
    // The rubric changed between years: 2027 weighted "speed", 2028 dropped
    // it and weighted "hitting" instead.
    const rows2027 = [{ season_id: SEASON_2027, field_key: 'speed',   section: 'fielding_hitting', weight: 1 }]
    const rows2028 = [{ season_id: SEASON_2028, field_key: 'hitting', section: 'fielding_hitting', weight: 1 }]
    const unscoped = [...rows2027, ...rows2028]
    const scoresJson = { hitting: 4, speed: 2 }

    // Unscoped would incorrectly average hitting AND 2027's speed field together.
    expect(computeCoachEvalScore(scoresJson, unscoped)).toBe(3)

    // Correctly scoped to 2028: only "hitting" counts.
    const scopedTo2028 = selectActiveSeasonEvalConfig(unscoped, SEASON_2028)
    expect(computeCoachEvalScore(scoresJson, scopedTo2028)).toBe(4)
  })
})

describe('denseRank', () => {
  it('ranks highest value first; ties share a rank (standard competition ranking — a tie for 1st is followed by 3rd, not 2nd)', () => {
    const ranks = denseRank([
      { id: 'a', v: 5 },
      { id: 'b', v: 5 },
      { id: 'c', v: 3 },
      { id: 'd', v: null },
    ])
    expect(ranks.get('a')).toBe(1)
    expect(ranks.get('b')).toBe(1)
    expect(ranks.get('c')).toBe(3)
    expect(ranks.has('d')).toBe(false) // players with no score are unranked, not last
  })
})
