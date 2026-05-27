/**
 * Name normalization utilities for tryout identity resolution.
 *
 * The core problem: the same player appears as "Timmy Aqua" in one
 * spreadsheet and "Timothy Aqua" in another. We need to catch that.
 *
 * Strategy:
 *   1. Trim + collapse whitespace + lowercase
 *   2. Strip generational suffixes (Jr., Sr., II, III, IV)
 *   3. Expand known nicknames to canonical form
 *   4. After expansion, fuzzy-match against the canonical player list
 */

// ── Punctuation normalization helpers ────────────────────────────────────────

// Various Unicode apostrophe/quote variants that appear in names (O'Brien, D'Angelo)
const APOSTROPHE_RE = /[‘’‚‛′ʼʹ]/g

// Unicode dashes that appear in hyphenated names (Jean-Paul, Mary-Beth)
const UNICODE_DASH_RE = /[‐‑‒–—―−﹘﹣－]/g

// Non-printing / non-standard whitespace that trim() misses
const HIDDEN_WS_RE = /[ ​‌‍­﻿   　]/g

// ── Nickname → canonical first name map ─────────────────────────────────────
// Keep this in a single place so the resolver and any UI can share it.
export const NICKNAME_MAP: Record<string, string> = {
  // Timothy
  'tim': 'timothy', 'timmy': 'timothy',
  // Benjamin
  'ben': 'benjamin', 'benny': 'benjamin', 'benji': 'benjamin',
  // William
  'will': 'william', 'billy': 'william', 'bill': 'william', 'liam': 'william',
  // Jacob
  'jake': 'jacob', 'jakey': 'jacob',
  // Alexander
  'alex': 'alexander', 'al': 'alexander', 'alec': 'alexander',
  // Andrew
  'andy': 'andrew', 'drew': 'andrew',
  // Matthew
  'matt': 'matthew', 'matty': 'matthew',
  // Christopher
  'chris': 'christopher', 'topher': 'christopher',
  // Michael
  'mike': 'michael', 'mikey': 'michael', 'micky': 'michael',
  // Joseph
  'joe': 'joseph', 'joey': 'joseph',
  // Nicholas
  'nick': 'nicholas', 'nicky': 'nicholas', 'nico': 'nicholas',
  // Anthony
  'tony': 'anthony', 'ant': 'anthony',
  // Zachary
  'zach': 'zachary', 'zack': 'zachary', 'zak': 'zachary',
  // Cameron
  'cam': 'cameron',
  // Bradley
  'brad': 'bradley',
  // Robert
  'rob': 'robert', 'bob': 'robert', 'bobby': 'robert',
  // Thomas
  'tom': 'thomas', 'tommy': 'thomas',
  // James
  'jim': 'james', 'jimmy': 'james', 'jamie': 'james',
  // Richard
  'rich': 'richard', 'rick': 'richard', 'ricky': 'richard', 'dick': 'richard',
  // Daniel
  'dan': 'daniel', 'danny': 'daniel',
  // David
  'dave': 'david', 'davey': 'david',
  // Patrick
  'pat': 'patrick', 'paddy': 'patrick',
  // Jonathan
  'jon': 'jonathan', 'johnny': 'jonathan',
  // Nathaniel / Nathan
  'nate': 'nathaniel', 'nat': 'nathaniel',
  // Samuel
  'sam': 'samuel', 'sammy': 'samuel',
  // Charles
  'charlie': 'charles', 'chuck': 'charles',
  // Joshua
  'josh': 'joshua',
  // Brandon
  'bran': 'brandon',
  // Dominic
  'dom': 'dominic',
  // Everett
  'ev': 'everett',
  // Theodore
  'theo': 'theodore', 'ted': 'theodore', 'teddy': 'theodore',
  // Maxwell
  'max': 'maxwell',
  // Henry — keep as-is (Henry stays Henry, but "hank" → henry)
  'hank': 'henry',
  // Edward
  'ed': 'edward', 'eddie': 'edward', 'ned': 'edward',
  // Vincent
  'vince': 'vincent',
  // Gabriel
  'gabe': 'gabriel',
  // Tobias
  'toby': 'tobias',
}

// Generational suffixes — also handles ", Jr." (comma before suffix)
const SUFFIX_RE = /\s*,?\s*(jr\.?|sr\.?|ii|iii|iv)\s*$/i

/**
 * Normalize a raw name string to a consistent lowercase form.
 * Does NOT expand nicknames — do that separately so you can use
 * the normalized (but unexpanded) form for exact matching first.
 *
 * Normalization pipeline:
 *   1. Replace hidden/non-breaking whitespace with a regular space
 *   2. Collapse multiple spaces
 *   3. Strip generational suffixes (Jr., Sr., II, III, IV — with or without comma)
 *   4. Remove apostrophes (all Unicode variants): O'Brien → OBrien, D'Angelo → DAngelo
 *   5. Normalize hyphens/dashes → space: Jean-Paul → Jean Paul
 *   6. Remove periods: middle initials (J.), titles (Dr.), abbreviations
 *   7. Lowercase
 *   8. Strip anything remaining that's non-alpha, non-space
 *   9. Re-collapse spaces (dashes/removed chars may have left doubles)
 */
export function normalizeName(raw: string): string {
  return raw
    .replace(HIDDEN_WS_RE, ' ')              // hidden whitespace → regular space
    .trim()
    .replace(/\s+/g, ' ')                    // collapse spaces
    .replace(SUFFIX_RE, '')                  // strip Jr., Sr., II, etc.
    .replace(APOSTROPHE_RE, '')              // remove all apostrophe variants
    .replace(UNICODE_DASH_RE, ' ')           // Unicode dashes → space
    .replace(/-/g, ' ')                      // ASCII hyphen → space
    .replace(/\./g, '')                      // remove periods (initials, titles)
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')               // strip non-alpha-space characters
    .replace(/\s+/g, ' ')                   // collapse spaces again
    .trim()
}

/**
 * Normalize AND expand nickname in the first name portion.
 * Returns the expanded canonical form for fuzzy matching.
 *
 * e.g. "Timmy Aqua" → "timothy aqua"
 *      "Jake Smith Jr." → "jacob smith"
 */
export function expandName(raw: string): string {
  const normalized = normalizeName(raw)
  const parts = normalized.split(' ')
  if (parts.length === 0) return normalized
  const first = parts[0]
  const expanded = NICKNAME_MAP[first] ?? first
  return [expanded, ...parts.slice(1)].join(' ')
}

/**
 * Parse a raw "Full Name" string into { firstName, lastName }.
 * Handles "First Last", "Last, First", and single-word names.
 */
export function splitName(raw: string): { firstName: string; lastName: string } {
  const trimmed = raw.trim().replace(/\s+/g, ' ')

  // "Last, First" format
  if (trimmed.includes(',')) {
    const [last, first] = trimmed.split(',').map(s => s.trim())
    return { firstName: first ?? '', lastName: last ?? '' }
  }

  const parts = trimmed.split(' ')
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  if (parts.length === 2) return { firstName: parts[0], lastName: parts[1] }

  // 3+ parts: first word = first name, last word = last name, middle ignored
  return {
    firstName: parts[0],
    lastName: parts[parts.length - 1],
  }
}

/**
 * Build a display-safe full name from parts.
 */
export function fullName(firstName: string, lastName: string): string {
  return [firstName, lastName].filter(Boolean).join(' ')
}
