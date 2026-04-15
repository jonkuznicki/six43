/**
 * Roster file parser.
 *
 * Expects a CSV or XLSX with columns:
 *   First Name | Last Name | DOB | Team | Jersey # (optional)
 *
 * Column headers are detected case-insensitively. DOB can be in any common
 * format (MM/DD/YYYY, YYYY-MM-DD, or an Excel serial date number).
 */

import * as XLSX from 'xlsx'

export interface RosterRow {
  rowIndex:     number
  firstName:    string
  lastName:     string
  dob:          string | null   // YYYY-MM-DD
  teamName:     string
  jerseyNumber: string | null
}

export interface RosterParseResult {
  rows:   RosterRow[]
  errors: string[]
}

function findCol(headers: string[], candidates: string[]): number {
  const lower = headers.map(h => String(h ?? '').toLowerCase().trim())
  for (const c of candidates) {
    const idx = lower.findIndex(h => h.includes(c))
    if (idx >= 0) return idx
  }
  return -1
}

function parseDob(raw: any): string | null {
  if (raw == null || raw === '') return null
  const s = String(raw).trim()

  // Excel date serial number (e.g. 44927)
  if (/^\d{4,6}$/.test(s) && Number(s) > 1000) {
    try {
      const parsed = XLSX.SSF.parse_date_code(Number(s))
      if (parsed && parsed.y > 1900) {
        return `${parsed.y}-${String(parsed.m).padStart(2,'0')}-${String(parsed.d).padStart(2,'0')}`
      }
    } catch { /* ignore */ }
  }

  // MM/DD/YYYY or M/D/YY or M/D/YYYY
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/)
  if (slash) {
    const [, m, d, y] = slash
    const year = y.length === 2 ? (parseInt(y) > 30 ? `19${y}` : `20${y}`) : y
    return `${year}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }

  // YYYY-MM-DD already
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // MM-DD-YYYY
  const dash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (dash) {
    const [, m, d, y] = dash
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`
  }

  return null
}

export function parseRosterFile(buffer: ArrayBuffer): RosterParseResult {
  const wb     = XLSX.read(buffer, { type: 'array', cellDates: false })
  const ws     = wb.Sheets[wb.SheetNames[0]]
  const raw    = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, defval: null }) as any[][]
  const errors: string[] = []
  const rows:   RosterRow[] = []

  // Find the header row (first row containing first/last/name)
  let headerIdx = -1
  for (let i = 0; i < Math.min(6, raw.length); i++) {
    const cells = (raw[i] ?? []).map((c: any) => String(c ?? '').toLowerCase())
    if (cells.some(c => c.includes('last') || c.includes('first') || c === 'name')) {
      headerIdx = i
      break
    }
  }

  if (headerIdx === -1) {
    errors.push('Could not find header row. Expected columns: First Name, Last Name, DOB, Team, Jersey #')
    return { rows, errors }
  }

  const headers = (raw[headerIdx] ?? []).map((h: any) => String(h ?? ''))
  const col = {
    first:  findCol(headers, ['first name', 'firstname', 'first']),
    last:   findCol(headers, ['last name', 'lastname', 'last']),
    dob:    findCol(headers, ['dob', 'date of birth', 'birth date', 'birthday', 'born']),
    team:   findCol(headers, ['current team', 'team', 'squad']),
    jersey: findCol(headers, ['jersey', 'uniform', '# ', '#']),
  }

  if (col.first === -1 || col.last === -1) {
    errors.push('Missing required columns: First Name and Last Name')
    return { rows, errors }
  }
  if (col.team === -1) {
    errors.push('Missing required column: Team (or "Current Team")')
    return { rows, errors }
  }

  for (let i = headerIdx + 1; i < raw.length; i++) {
    const row = raw[i] ?? []
    const firstName = String(row[col.first] ?? '').trim()
    const lastName  = String(row[col.last]  ?? '').trim()
    const teamName  = String(row[col.team]  ?? '').trim()

    // Skip blank rows
    if (!firstName && !lastName) continue
    if (!firstName || !lastName) { errors.push(`Row ${i + 1}: missing first or last name — skipped`); continue }
    if (!teamName)               { errors.push(`Row ${i + 1}: ${firstName} ${lastName} has no team — skipped`); continue }

    const rawDob    = col.dob    >= 0 ? row[col.dob]    : null
    const rawJersey = col.jersey >= 0 ? row[col.jersey] : null

    rows.push({
      rowIndex:     i,
      firstName,
      lastName,
      dob:          parseDob(rawDob),
      teamName,
      jerseyNumber: rawJersey != null && String(rawJersey).trim() !== '' ? String(rawJersey).trim() : null,
    })
  }

  if (rows.length === 0) errors.push('No player rows found in the file.')
  return { rows, errors }
}
