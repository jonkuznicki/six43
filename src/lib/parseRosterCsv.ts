export type ParsedPlayer = {
  firstName: string
  lastName: string
  jersey: string
  position: string
  error?: string
}

// Column aliases to detect common CSV formats (GameChanger, generic)
const FIRST_ALIASES  = ['first name', 'first', 'firstname', 'given name', 'player first name']
const LAST_ALIASES   = ['last name', 'last', 'lastname', 'family name', 'surname', 'player last name']
const JERSEY_ALIASES = ['jersey', 'jersey number', 'jersey #', 'number', '#', 'no', 'no.', 'num', 'uniform']
const POS_ALIASES    = ['position', 'pos', 'primary position']
// GameChanger sometimes exports a single "Player Name" column "Last, First" or "First Last"
const NAME_ALIASES   = ['player name', 'name', 'player']

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9# ]/g, '')
}

function findCol(headers: string[], aliases: string[]): number {
  return headers.findIndex(h => aliases.includes(normalize(h)))
}

export function parseRosterCsv(raw: string): ParsedPlayer[] {
  // Normalize line endings
  const lines = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  // Parse CSV row (handles quoted fields)
  function parseRow(line: string): string[] {
    const result: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        inQuotes = !inQuotes
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    result.push(current.trim())
    return result
  }

  const headers = parseRow(lines[0])
  const rows    = lines.slice(1).map(parseRow)

  const firstIdx  = findCol(headers, FIRST_ALIASES)
  const lastIdx   = findCol(headers, LAST_ALIASES)
  const jerseyIdx = findCol(headers, JERSEY_ALIASES)
  const posIdx    = findCol(headers, POS_ALIASES)
  const nameIdx   = findCol(headers, NAME_ALIASES)

  const players: ParsedPlayer[] = []

  for (const row of rows) {
    if (row.every(c => !c)) continue // skip blank rows

    let firstName = ''
    let lastName  = ''
    let jersey    = ''
    let position  = ''

    if (firstIdx >= 0 && lastIdx >= 0) {
      firstName = row[firstIdx] ?? ''
      lastName  = row[lastIdx]  ?? ''
    } else if (nameIdx >= 0) {
      // "Last, First" or "First Last"
      const name = row[nameIdx] ?? ''
      if (name.includes(',')) {
        const parts = name.split(',').map(s => s.trim())
        lastName  = parts[0]
        firstName = parts[1] ?? ''
      } else {
        const parts = name.split(' ')
        firstName = parts[0] ?? ''
        lastName  = parts.slice(1).join(' ')
      }
    } else {
      // Positional fallback: assume col 0 = first, col 1 = last
      firstName = row[0] ?? ''
      lastName  = row[1] ?? ''
    }

    if (jerseyIdx >= 0) {
      jersey = row[jerseyIdx] ?? ''
    } else {
      // Try to find a numeric-looking value in the row
      jersey = row.find(c => /^\d{1,2}$/.test(c.trim())) ?? ''
    }

    if (posIdx >= 0) {
      position = row[posIdx] ?? ''
    }

    // Clean jersey — strip #, spaces
    jersey = jersey.replace(/[^0-9]/g, '')

    firstName = firstName.trim()
    lastName  = lastName.trim()

    if (!firstName && !lastName) continue

    players.push({ firstName, lastName, jersey, position })
  }

  return players
}
