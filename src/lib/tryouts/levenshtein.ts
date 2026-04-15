/**
 * Levenshtein distance between two strings.
 * Used as the fallback in identity resolution when exact and
 * nickname-expansion matching both fail.
 *
 * Returns the edit distance (lower = more similar).
 * For matching purposes, we convert this to a 0–1 similarity score.
 */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  // Use two rows to keep memory O(min(m,n))
  const m = a.length
  const n = b.length

  // Ensure a is the shorter string for the row-optimization
  if (m > n) return levenshtein(b, a)

  let prev = Array.from({ length: m + 1 }, (_, i) => i)
  let curr = new Array(m + 1).fill(0)

  for (let j = 1; j <= n; j++) {
    curr[0] = j
    for (let i = 1; i <= m; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[i] = Math.min(
        curr[i - 1] + 1,          // insertion
        prev[i] + 1,               // deletion
        prev[i - 1] + cost,        // substitution
      )
    }
    ;[prev, curr] = [curr, prev]
  }

  return prev[m]
}

/**
 * Similarity score derived from Levenshtein distance.
 * Returns a value between 0.0 (completely different) and 1.0 (identical).
 *
 * Uses the longer string's length as the denominator so short strings
 * don't inflate similarity: "jon" vs "john" = 0.75 not 1.0.
 */
export function similarity(a: string, b: string): number {
  if (a === b) return 1.0
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return 1.0
  return 1 - levenshtein(a, b) / maxLen
}

/**
 * Trigram-based similarity as an alternative to Levenshtein.
 * Better for long names and transposition errors ("Drew" vs "Dre w").
 * Returns 0.0–1.0.
 */
export function trigramSimilarity(a: string, b: string): number {
  if (a === b) return 1.0
  if (a.length < 2 || b.length < 2) return a === b ? 1.0 : 0.0

  const trigramsA = new Set(trigrams(a))
  const trigramsB = new Set(trigrams(b))

  let intersection = 0
  for (const t of Array.from(trigramsA)) {
    if (trigramsB.has(t)) intersection++
  }

  return (2 * intersection) / (trigramsA.size + trigramsB.size)
}

function trigrams(s: string): string[] {
  const padded = `  ${s}  `
  const result: string[] = []
  for (let i = 0; i < padded.length - 2; i++) {
    result.push(padded.slice(i, i + 3))
  }
  return result
}

/**
 * Best similarity score: max of Levenshtein and trigram approaches.
 * Catches both character-level edits and transpositions well.
 */
export function bestSimilarity(a: string, b: string): number {
  return Math.max(similarity(a, b), trigramSimilarity(a, b))
}
