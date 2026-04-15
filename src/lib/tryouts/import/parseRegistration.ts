/**
 * Registration import parser.
 *
 * Parses the registration export from the external registration platform
 * (Bonzi, SportsConnect, etc.) and returns a normalized array of player rows.
 *
 * Format notes (from Hudson Baseball's actual exports):
 *   - Row 0: date header (e.g. "Exported: 4/14/2026") — skip
 *   - Row 1: actual column headers
 *   - Rows 2+: data
 *   - Column names vary slightly by export year — all handled below
 *
 * This is the identity SOURCE OF RECORD. Every player in this file
 * becomes a canonical tryout_player record. All subsequent imports
 * (coach evals, tryout scores, GC stats) are matched against this list.
 */

import * as XLSX from 'xlsx'
import { splitName, normalizeName } from '../nameNormalization'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParsedRegistrationRow {
  // Identity
  firstName:   string
  lastName:    string
  rawFullName: string   // preserved for alias creation

  // Tryout
  ageGroup:    string   // "8U", "10U", etc. — normalized

  // Contact
  parentEmail: string | null
  parentPhone: string | null

  // Background
  dob:         string | null   // ISO: "YYYY-MM-DD" or null
  grade:       string | null
  school:      string | null
  priorOrg:    string | null
  priorTeam:   string | null

  // Source row number for error reporting
  rowIndex:    number
}

export interface ParseRegistrationResult {
  rows:   ParsedRegistrationRow[]
  errors: Array<{ rowIndex: number; message: string }>
  headers: string[]   // actual headers found, for debugging
}

// ── Column name aliases ───────────────────────────────────────────────────────
// Each key is our internal field; the array is all known column-name variants.
// Case-insensitive matching applied at parse time.

const COL_MAP: Record<keyof Omit<ParsedRegistrationRow, 'rawFullName' | 'rowIndex'>, string[]> = {
  firstName:   ['First Name', 'First'],
  lastName:    ['Last Name', 'Last'],
  // "Full Name" is used when there's no separate First/Last
  // (handled specially below)
  ageGroup:    ['Tryout Age Group', 'Age Group', 'Division', 'Age Division'],
  parentEmail: ['Account Email', 'Email', 'Parent Email', 'Guardian Email'],
  parentPhone: ['Guardian Phone', 'Parent Phone', 'Phone', 'Mobile'],
  dob:         ['Date of Birth', 'DOB', 'Birth Date', 'Birthday'],
  grade:       ['Grade', 'Grade Level', 'School Grade'],
  school:      ['School Attending in Fall 2025?', 'School Attending in Fall 2026?', 'School', 'School Name'],
  priorOrg:    ['2025 Organization', '2024 Organization', 'Prior Organization', 'Previous Organization', 'Organization'],
  priorTeam:   ['2025 Team', '2024 Team', 'Prior Team', 'Previous Team'],
}

const FULL_NAME_COLS = ['Full Name', 'Player Name', 'Name', 'Athlete Name']

// ── Parser ───────────────────────────────────────────────────────────────────

/**
 * Parse a registration file (Excel .xlsx or .csv) from a Buffer or ArrayBuffer.
 * Returns normalized rows ready for upsert into tryout_players.
 */
export function parseRegistrationFile(
  fileBuffer: ArrayBuffer | Buffer,
): ParseRegistrationResult {
  const wb = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true })
  const sheetName = wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]

  // Convert to array-of-arrays so we can handle the row-0 date header
  const raw: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  if (raw.length < 2) {
    return { rows: [], errors: [{ rowIndex: 0, message: 'File appears to be empty.' }], headers: [] }
  }

  // Detect header row: row 0 might be a date export header, row 1 might be columns.
  // Heuristic: the real header row has "Name" or "Email" or "Age" in it.
  let headerRowIndex = 0
  for (let i = 0; i < Math.min(3, raw.length); i++) {
    const row = raw[i] as string[]
    const asStr = row.map(c => String(c).toLowerCase())
    if (asStr.some(c => c.includes('name') || c.includes('email') || c.includes('age'))) {
      headerRowIndex = i
      break
    }
  }

  const headerRow = (raw[headerRowIndex] as string[]).map(c => String(c).trim())
  const dataRows  = raw.slice(headerRowIndex + 1)

  // Build a column-name → index map (case-insensitive)
  const colIndex: Record<string, number> = {}
  headerRow.forEach((h, i) => { colIndex[h.toLowerCase()] = i })

  const getCol = (aliases: string[]): number => {
    for (const alias of aliases) {
      const idx = colIndex[alias.toLowerCase()]
      if (idx !== undefined) return idx
    }
    return -1
  }

  // Resolve column indices for all fields
  const firstNameIdx   = getCol(COL_MAP.firstName)
  const lastNameIdx    = getCol(COL_MAP.lastName)
  const fullNameIdx    = getCol(FULL_NAME_COLS)
  const ageGroupIdx    = getCol(COL_MAP.ageGroup)
  const emailIdx       = getCol(COL_MAP.parentEmail)
  const phoneIdx       = getCol(COL_MAP.parentPhone)
  const dobIdx         = getCol(COL_MAP.dob)
  const gradeIdx       = getCol(COL_MAP.grade)
  const schoolIdx      = getCol(COL_MAP.school)
  const priorOrgIdx    = getCol(COL_MAP.priorOrg)
  const priorTeamIdx   = getCol(COL_MAP.priorTeam)

  const rows:   ParsedRegistrationRow[] = []
  const errors: Array<{ rowIndex: number; message: string }> = []

  dataRows.forEach((rawRow, idx) => {
    const row = rawRow as unknown[]
    const rowIndex = headerRowIndex + 1 + idx

    const getString = (colIdx: number): string =>
      colIdx >= 0 ? String(row[colIdx] as string | null ?? '').trim() : ''

    // ── Name resolution ─────────────────────────────────────────────
    let firstName = getString(firstNameIdx)
    let lastName  = getString(lastNameIdx)
    let rawFullName = ''

    if (!firstName && !lastName && fullNameIdx >= 0) {
      // Fall back to "Full Name" column
      rawFullName = getString(fullNameIdx)
      const split = splitName(rawFullName)
      firstName = split.firstName
      lastName  = split.lastName
    } else {
      rawFullName = [firstName, lastName].filter(Boolean).join(' ')
    }

    // Skip completely blank rows
    if (!firstName && !lastName) return

    // ── Age group normalization ──────────────────────────────────────
    const rawAgeGroup = getString(ageGroupIdx)
    const ageGroup    = normalizeAgeGroup(rawAgeGroup)

    if (!ageGroup) {
      errors.push({ rowIndex, message: `Row ${rowIndex}: could not parse age group from "${rawAgeGroup}" for player "${rawFullName || firstName + ' ' + lastName}"` })
    }

    // ── DOB ──────────────────────────────────────────────────────────
    let dob: string | null = null
    if (dobIdx >= 0) {
      const raw = row[dobIdx]
      if (raw != null && typeof raw === 'object' && raw instanceof Date) {
        dob = (raw as Date).toISOString().split('T')[0]
      } else if (typeof raw === 'string' && raw.trim()) {
        dob = parseDateString(raw.trim())
      } else if (typeof raw === 'number') {
        // Excel serial date
        const d = XLSX.SSF.parse_date_code(raw)
        if (d) dob = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
      }
    }

    rows.push({
      firstName:   capitalize(firstName),
      lastName:    capitalize(lastName),
      rawFullName: rawFullName || `${firstName} ${lastName}`,
      ageGroup:    ageGroup || rawAgeGroup,
      parentEmail: getString(emailIdx) || null,
      parentPhone: getString(phoneIdx) || null,
      dob,
      grade:       getString(gradeIdx) || null,
      school:      getString(schoolIdx) || null,
      priorOrg:    getString(priorOrgIdx) || null,
      priorTeam:   getString(priorTeamIdx) || null,
      rowIndex,
    })
  })

  return { rows, errors, headers: headerRow }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalize age group strings to the standard "NU" format.
 * Input variants: "10U", "10u", "10-under", "10 U", "10 and under"
 */
function normalizeAgeGroup(raw: string): string {
  if (!raw) return ''
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '')
  // Already in "10U" format
  if (/^\d{1,2}U$/.test(cleaned)) return cleaned
  // "10-UNDER", "10-U"
  const m = cleaned.match(/^(\d{1,2})(?:U|UNDER|AND UNDER|-U|-UNDER)?$/)
  if (m) return `${m[1]}U`
  return raw.trim()
}

/**
 * Parse common date string formats to ISO YYYY-MM-DD.
 * Handles: "4/14/2015", "April 14, 2015", "2015-04-14"
 */
function parseDateString(s: string): string | null {
  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // M/D/YYYY or MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) {
    return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`
  }

  // Try native Date parse as fallback
  const d = new Date(s)
  if (!isNaN(d.getTime())) {
    return d.toISOString().split('T')[0]
  }

  return null
}

function capitalize(s: string): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}
