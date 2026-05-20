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
  ageGroup:            string        // "8U", "10U", etc. — normalized
  preferredTryoutDate: string | null // ISO "YYYY-MM-DD" — which session date they selected

  // Contact
  parentEmail: string | null
  parentPhone: string | null

  // Guardian
  guardianFirstName: string | null
  guardianLastName:  string | null

  // Address
  address: string | null
  city:    string | null
  state:   string | null
  zip:     string | null

  // Background
  dob:                 string | null   // ISO: "YYYY-MM-DD" or null
  grade:               string | null
  school:              string | null
  priorOrg:            string | null
  priorTeam:           string | null
  registrationDate:    string | null   // ISO: "YYYY-MM-DD" or null

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
  firstName:   ['First Name', 'First', 'Player First Name', 'Athlete First Name', 'Child First Name', 'Player First', 'Athlete First'],
  lastName:    ['Last Name', 'Last', 'Player Last Name', 'Athlete Last Name', 'Child Last Name', 'Player Last', 'Athlete Last'],
  // "Full Name" is used when there's no separate First/Last
  // (handled specially below)
  ageGroup:             ['Tryout Age Group', 'Age Group', 'Division', 'Age Division'],
  preferredTryoutDate:  ['Which tryout date will you attend?', 'Tryout Date', 'Preferred Tryout Date', 'Session Date', 'Preferred Session Date'],
  parentEmail:          ['Account Email', 'Email', 'Parent Email', 'Guardian Email'],
  parentPhone:          ['Guardian Phone', 'Parent Phone', 'Phone', 'Mobile'],
  guardianFirstName:    ['Guardian 1 First Name', 'Guardian First Name', 'Parent First Name', 'Primary Contact First Name', 'Account Holder First Name', 'Parent/Guardian First Name', 'Guardian/Parent First Name', 'Account First Name', 'Parent 1 First Name', 'Contact First Name'],
  guardianLastName:     ['Guardian 1 Last Name', 'Guardian Last Name', 'Parent Last Name', 'Primary Contact Last Name', 'Account Holder Last Name', 'Parent/Guardian Last Name', 'Guardian/Parent Last Name', 'Account Last Name', 'Parent 1 Last Name', 'Contact Last Name'],
  address:              ['Address', 'Street Address', 'Home Address'],
  city:                 ['City', 'Home City'],
  state:                ['State', 'Home State'],
  zip:                  ['Zip', 'Zip Code', 'Postal Code', 'ZIP'],
  dob:                  ['Date of Birth', 'DOB', 'Birth Date', 'Birthday'],
  grade:                ['Grade', 'Grade Level', 'School Grade'],
  school:               ['School Attending in Fall 2025?', 'School Attending in Fall 2026?', 'School Attending in Fall 2027?', 'School', 'School Name'],
  priorOrg:             ['2025 Organization', '2024 Organization', 'Prior Organization', 'Previous Organization', 'Organization'],
  priorTeam:            ['2026 Season Team / League Name?', '2026 Season Team', '2025 Team', '2024 Team', 'Prior Team', 'Previous Team'],
  registrationDate:     ['Registration Date', 'Date Registered', 'Registered', 'Submitted', 'Order Date', 'Date Submitted', 'Created', 'Created At', 'Entry Date', 'Transaction Date', 'Paid Date'],
}

const FULL_NAME_COLS = ['Full Name', 'Player Name', 'Name', 'Athlete Name']
const GUARDIAN_FULL_NAME_COLS = ['Guardian Name', 'Parent Name', 'Primary Contact Name', 'Account Holder Name', 'Parent/Guardian Name', 'Guardian Full Name', 'Parent Full Name', 'Parent/Guardian Full Name', 'Guardian/Parent Name', 'Account Name', 'Contact Name']

// When the team column contains "Other", the actual team name is in a separate write-in column.
// Both single- and double-quote variants appear in real exports.
const PRIOR_OTHER_TEAM_COLS = [
  "If 2026 Team is 'Other', please provide team name",
  'If 2026 Team is "Other", please provide team name',
  "If 2025 Team is 'Other', please provide team name",
  'If 2025 Team is "Other", please provide team name',
]

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

  // Strip BOM from the first cell. Three forms seen in the wild:
  //   U+FEFF        — actual Unicode BOM character (charCode 65279)
  //   ï»¿           — UTF-8 BOM bytes (EF BB BF) decoded as Latin-1
  //   ﻿        — literal 6-char text written by some export tools (\ u F E F F)
  const stripBom = (s: string) => {
    if (s.charCodeAt(0) === 0xFEFF) return s.slice(1)
    if (s.charCodeAt(0) === 0xEF && s.charCodeAt(1) === 0xBB && s.charCodeAt(2) === 0xBF) return s.slice(3)
    if (s.startsWith('\\uFEFF')) return s.slice(6)
    return s
  }
  const headerRow = (raw[headerRowIndex] as string[]).map(c => stripBom(String(c).trim()))
  const dataRows  = raw.slice(headerRowIndex + 1)

  // Diagnostic: log the raw first cell and first few header values
  const rawFirst = String((raw[headerRowIndex] as string[])[0] ?? '')
  console.log('[parseRegistration] raw first cell charCodes:', Array.from(rawFirst.slice(0, 15)).map(c => c.charCodeAt(0)))
  console.log('[parseRegistration] headerRow[0..2]:', headerRow.slice(0, 3))
  console.log('[parseRegistration] dataRows[0][0..2]:', (dataRows[0] as unknown[])?.slice(0, 3))

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
  const firstNameIdx           = getCol(COL_MAP.firstName)
  const lastNameIdx            = getCol(COL_MAP.lastName)
  const fullNameIdx            = getCol(FULL_NAME_COLS)
  const ageGroupIdx            = getCol(COL_MAP.ageGroup)
  const preferredTryoutDateIdx = getCol(COL_MAP.preferredTryoutDate)
  const emailIdx               = getCol(COL_MAP.parentEmail)
  const phoneIdx               = getCol(COL_MAP.parentPhone)
  const guardianFirstNameIdx   = getCol(COL_MAP.guardianFirstName)
  const guardianLastNameIdx    = getCol(COL_MAP.guardianLastName)
  const guardianFullNameIdx    = getCol(GUARDIAN_FULL_NAME_COLS)
  const addressIdx             = getCol(COL_MAP.address)
  const cityIdx                = getCol(COL_MAP.city)
  const stateIdx               = getCol(COL_MAP.state)
  const zipIdx                 = getCol(COL_MAP.zip)
  const dobIdx                 = getCol(COL_MAP.dob)
  const gradeIdx               = getCol(COL_MAP.grade)
  const schoolIdx              = getCol(COL_MAP.school)
  const priorOrgIdx            = getCol(COL_MAP.priorOrg)
  const priorTeamIdx           = getCol(COL_MAP.priorTeam)
  const priorOtherTeamIdx      = getCol(PRIOR_OTHER_TEAM_COLS)
  const registrationDateIdx    = getCol(COL_MAP.registrationDate)

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

    // ── Preferred tryout date ────────────────────────────────────────
    let preferredTryoutDate: string | null = null
    if (preferredTryoutDateIdx >= 0) {
      const raw = row[preferredTryoutDateIdx]
      if (raw != null && typeof raw === 'object' && raw instanceof Date) {
        preferredTryoutDate = (raw as Date).toISOString().split('T')[0]
      } else if (typeof raw === 'string' && raw.trim()) {
        preferredTryoutDate = parseDateString(raw.trim())
      } else if (typeof raw === 'number') {
        const d = XLSX.SSF.parse_date_code(raw)
        if (d) preferredTryoutDate = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
      }
    }

    // ── Guardian name resolution ─────────────────────────────────────────────
    let guardianFirstName = getString(guardianFirstNameIdx)
    let guardianLastName  = getString(guardianLastNameIdx)
    if (!guardianFirstName && !guardianLastName && guardianFullNameIdx >= 0) {
      const fullGuardian = getString(guardianFullNameIdx)
      if (fullGuardian) {
        const split = splitName(fullGuardian)
        guardianFirstName = split.firstName
        guardianLastName  = split.lastName
      }
    }

    // ── Registration date ────────────────────────────────────────────
    let registrationDate: string | null = null
    if (registrationDateIdx >= 0) {
      const raw = row[registrationDateIdx]
      if (raw != null && typeof raw === 'object' && raw instanceof Date) {
        registrationDate = (raw as Date).toISOString().split('T')[0]
      } else if (typeof raw === 'string' && raw.trim()) {
        registrationDate = parseDateString(raw.trim())
      } else if (typeof raw === 'number') {
        const d = XLSX.SSF.parse_date_code(raw)
        if (d) registrationDate = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
      }
    }

    rows.push({
      firstName:           capitalize(firstName),
      lastName:            capitalize(lastName),
      rawFullName:         rawFullName || `${firstName} ${lastName}`,
      ageGroup:            ageGroup || rawAgeGroup,
      preferredTryoutDate,
      parentEmail:         getString(emailIdx) || null,
      parentPhone:         getString(phoneIdx) || null,
      guardianFirstName:   guardianFirstName || null,
      guardianLastName:    guardianLastName || null,
      address:             getString(addressIdx) || null,
      city:                getString(cityIdx) || null,
      state:               getString(stateIdx) || null,
      zip:                 getString(zipIdx) || null,
      dob,
      grade:               getString(gradeIdx) || null,
      school:              getString(schoolIdx) || null,
      priorOrg:            getString(priorOrgIdx) || null,
      priorTeam:           (() => {
        const raw = getString(priorTeamIdx)
        if (raw.toLowerCase() === 'other') return getString(priorOtherTeamIdx) || null
        return raw || null
      })(),
      registrationDate,
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

function parseDateString(s: string): string | null {
  // Strip leading/trailing whitespace
  s = s.trim()
  // Strip time portion if present (e.g. "4/25/2026 10:30 AM" → "4/25/2026")
  // Also handles "05/14/2026, 12:57pm EDT" — comma before time, timezone suffix
  s = s.replace(/,?\s+\d{1,2}:\d{2}(:\d{2})?(\s*[AP]M)?(\s+[A-Z]{2,5})?$/i, '').trim()

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // M/D/YYYY or MM/DD/YYYY (4-digit year)
  const mdy4 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy4) {
    return `${mdy4[3]}-${mdy4[1].padStart(2,'0')}-${mdy4[2].padStart(2,'0')}`
  }

  // M/D/YY (2-digit year: < 70 → 2000s, ≥ 70 → 1900s)
  const mdy2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/)
  if (mdy2) {
    const yy   = parseInt(mdy2[3])
    const year = yy < 70 ? 2000 + yy : 1900 + yy
    return `${year}-${mdy2[1].padStart(2,'0')}-${mdy2[2].padStart(2,'0')}`
  }

  // D-Mon or D-Mon-YY (e.g. "7-Jul", "14-Jul", "7-Jul-26")
  // Year-less form uses current year — these are always upcoming tryout dates
  const MONTHS: Record<string, string> = {
    jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
    jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
  }
  const dmon = s.match(/^(\d{1,2})-([A-Za-z]{3})(?:-(\d{2,4}))?$/)
  if (dmon) {
    const mm = MONTHS[dmon[2].toLowerCase()]
    if (mm) {
      let year = new Date().getFullYear()
      if (dmon[3]) {
        const yy = parseInt(dmon[3])
        year = yy < 100 ? (yy < 70 ? 2000 + yy : 1900 + yy) : yy
      }
      return `${year}-${mm}-${dmon[1].padStart(2,'0')}`
    }
  }

  // Try native Date parse as fallback — parse as local noon to avoid UTC day offset
  const d = new Date(s + ' 12:00:00')
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  }

  return null
}

function capitalize(s: string): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}
