import { describe, it, expect } from 'vitest'
import { parseScore, gameResult } from '../parseScore'

describe('parseScore', () => {
  it('returns null for null input', () => {
    expect(parseScore(null)).toBeNull()
  })

  it('returns null for empty JSON', () => {
    expect(parseScore('{}')).toBeNull()
  })

  it('returns null for invalid JSON', () => {
    expect(parseScore('not json')).toBeNull()
  })

  it('reads _score key', () => {
    const notes = JSON.stringify({ _score: { us: 5, them: 3 } })
    expect(parseScore(notes)).toEqual({ us: 5, them: 3 })
  })

  it('reads _box by summing per-inning arrays', () => {
    const notes = JSON.stringify({ _box: { us: [2, 1, 0, 3], them: [1, 1, 1, 0] } })
    expect(parseScore(notes)).toEqual({ us: 6, them: 3 })
  })

  it('_score takes priority over _box when both present', () => {
    const notes = JSON.stringify({
      _score: { us: 10, them: 1 },
      _box: { us: [2, 1], them: [0, 0] },
    })
    expect(parseScore(notes)).toEqual({ us: 10, them: 1 })
  })

  it('returns null for _box with all nulls (no score entered yet)', () => {
    const notes = JSON.stringify({ _box: { us: [null, null, null], them: [null, null, null] } })
    expect(parseScore(notes)).toBeNull()
  })

  it('handles _box with partial nulls', () => {
    const notes = JSON.stringify({ _box: { us: [3, null, 2], them: [1, null, 1] } })
    expect(parseScore(notes)).toEqual({ us: 5, them: 2 })
  })

  it('handles _box with empty arrays', () => {
    const notes = JSON.stringify({ _box: { us: [], them: [] } })
    expect(parseScore(notes)).toBeNull()
  })

  it('handles _score with zero values', () => {
    const notes = JSON.stringify({ _score: { us: 0, them: 0 } })
    expect(parseScore(notes)).toEqual({ us: 0, them: 0 })
  })
})

describe('gameResult', () => {
  it('returns W when us > them', () => {
    expect(gameResult({ us: 5, them: 3 })).toBe('W')
  })

  it('returns L when us < them', () => {
    expect(gameResult({ us: 2, them: 7 })).toBe('L')
  })

  it('returns T when tied', () => {
    expect(gameResult({ us: 4, them: 4 })).toBe('T')
  })

  it('returns T for 0-0', () => {
    expect(gameResult({ us: 0, them: 0 })).toBe('T')
  })
})
