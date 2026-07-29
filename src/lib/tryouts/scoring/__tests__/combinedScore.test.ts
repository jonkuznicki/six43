import { describe, it, expect } from 'vitest'
import {
  computeCombinedScore,
  computeCoachEvalScore,
  computeIntangiblesScore,
  averagePresent,
  denseRank,
  DEFAULT_SEASON_WEIGHTS,
  type EvalConfigField,
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
