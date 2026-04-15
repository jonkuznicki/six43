/**
 * GameChanger stats export parser.
 *
 * GC exports CSVs in a few formats depending on what you export:
 *   - Batting stats: Player, #, G, PA, AB, R, H, 1B, 2B, 3B, HR, RBI, BB, SO, AVG, OBP, SLG, OPS ...
 *   - Pitching stats: Player, #, G, GS, IP, W, L, SV, ERA, WHIP, SO, BB ...
 *   - Combined: both sections in one file, separated by a blank row and a new header row
 *
 * The file may have 1-3 metadata rows at the top before the actual header row.
 * We detect the header by finding the first row that contains "Player" or "Name".
 */

import * as XLSX from 'xlsx'

export interface GcStatsRow {
  rowIndex:     number
  rawName:      string
  jerseyNumber: string | null
  teamLabel:    string | null
  type:         'batting' | 'pitching' | 'unknown'
  stats: {
    // Batting
    g?:       number
    pa?:      number
    ab?:      number
    avg?:     number
    obp?:     number
    slg?:     number
    ops?:     number
    h?:       number
    doubles?: number
    triples?: number
    hr?:      number
    rbi?:     number
    r?:       number
    bb?:      number
    so?:      number
    sb?:      number
    hbp?:     number
    sac?:     number
    tb?:      number
    // Pitching
    ip?:      number
    gs?:      number
    w?:       number
    l?:       number
    sv?:      number
    era?:     number
    whip?:    number
    k_bb?:    number
    strike_pct?: number
  }
}

export interface GcParseResult {
  rows:   GcStatsRow[]
  errors: string[]
  teamLabel: string | null
  detectedType: 'batting' | 'pitching' | 'combined' | 'unknown'
}

// ── Column name aliases ──────────────────────────────────────────────────────

const NAME_COLS    = ['player', 'name', 'player name', 'full name', 'athlete']
const JERSEY_COLS  = ['#', 'no', 'no.', 'num', 'number', 'jersey', 'jersey #', 'jersey no']

const BATTING_MAP: Record<string, string> = {
  'g': 'g', 'gp': 'g', 'games': 'g',
  'pa': 'pa', 'plate appearances': 'pa',
  'ab': 'ab', 'at bats': 'ab', 'at-bats': 'ab',
  'avg': 'avg', 'ba': 'avg', 'batting avg': 'avg', 'batting average': 'avg',
  'obp': 'obp', 'on base': 'obp', 'on-base': 'obp', 'on base %': 'obp', 'on-base %': 'obp',
  'slg': 'slg', 'slg%': 'slg', 'slugging': 'slg', 'slugging %': 'slg',
  'ops': 'ops',
  'h': 'h', 'hits': 'h',
  '2b': 'doubles', 'doubles': 'doubles',
  '3b': 'triples', 'triples': 'triples',
  'hr': 'hr', 'home runs': 'hr', 'homeruns': 'hr',
  'rbi': 'rbi', 'rbi\'s': 'rbi', 'rbis': 'rbi',
  'r': 'r', 'runs': 'r',
  'bb': 'bb', 'walks': 'bb', 'bases on balls': 'bb',
  'so': 'so', 'k': 'so', 'strikeouts': 'so', 'strike outs': 'so',
  'sb': 'sb', 'stolen bases': 'sb',
  'hbp': 'hbp', 'hit by pitch': 'hbp',
  'sac': 'sac', 'sf': 'sac', 'sacrifice': 'sac',
  'tb': 'tb', 'total bases': 'tb',
}

const PITCHING_MAP: Record<string, string> = {
  'g': 'g', 'gp': 'g', 'games': 'g', 'app': 'g', 'appearances': 'g',
  'gs': 'gs', 'games started': 'gs',
  'ip': 'ip', 'innings': 'ip', 'innings pitched': 'ip',
  'w': 'w', 'wins': 'w',
  'l': 'l', 'losses': 'l',
  'sv': 'sv', 'saves': 'sv',
  'era': 'era', 'earned run avg': 'era', 'earned run average': 'era',
  'whip': 'whip',
  'so': 'so', 'k': 'so', 'strikeouts': 'so',
  'bb': 'bb', 'walks': 'bb',
  'h': 'h', 'hits': 'h', 'hits allowed': 'h',
  'er': 'er', 'earned runs': 'er',
  'strike%': 'strike_pct', 'strike %': 'strike_pct', 'strike pct': 'strike_pct',
  'k/bb': 'k_bb', 'k bb': 'k_bb',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseNum(val: unknown): number | undefined {
  if (val == null || val === '' || val === '-' || val === '--') return undefined
  const str = String(val).replace(/[%,]/g, '').trim()
  // Handle leading dot (.333 → 0.333)
  const normalized = str.startsWith('.') ? '0' + str : str
  const n = parseFloat(normalized)
  return isNaN(n) ? undefined : n
}

function parseIp(val: unknown): number | undefined {
  // Baseball innings: "4.2" means 4 full innings + 2 outs = 4.667 real innings
  const n = parseNum(val)
  if (n == null) return undefined
  const full = Math.floor(n)
  const outs = Math.round((n - full) * 10)
  return full + outs / 3
}

function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9% /]/g, '').trim()
}

function isNameCol(h: string): boolean {
  return NAME_COLS.includes(normalizeHeader(h))
}

function isJerseyCol(h: string): boolean {
  return JERSEY_COLS.includes(normalizeHeader(h))
}

function isHeaderRow(row: string[]): boolean {
  const lower = row.map(c => normalizeHeader(c))
  return lower.some(c => ['player', 'name', 'athlete'].includes(c))
}

function isPitchingHeader(cols: string[]): boolean {
  const lower = cols.map(normalizeHeader)
  return lower.includes('ip') || lower.includes('innings pitched') || lower.includes('era')
}

function extractTeamLabel(rows: string[][]): string | null {
  // Team name is usually in the first non-empty cell of row 0 or 1
  for (const row of rows.slice(0, 3)) {
    const val = (row[0] ?? '').trim()
    if (val && !isHeaderRow(row) && val.length > 2) return val
  }
  return null
}

// ── Main parse function ──────────────────────────────────────────────────────

export function parseGcStatsFile(buffer: ArrayBuffer): GcParseResult {
  const wb   = XLSX.read(buffer, { type: 'array' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })

  const rows   = raw.map(r => r.map(c => String(c ?? '')))
  const errors: string[] = []

  // Extract team label from top metadata rows
  const teamLabel = extractTeamLabel(rows)

  // Find header row(s) — may be multiple sections (batting then pitching)
  const sections: Array<{ headerIdx: number; type: 'batting' | 'pitching' }> = []

  for (let i = 0; i < rows.length; i++) {
    if (isHeaderRow(rows[i])) {
      const type = isPitchingHeader(rows[i]) ? 'pitching' : 'batting'
      // Don't double-count if we already found a header very close to this one
      const lastIdx = sections[sections.length - 1]?.headerIdx ?? -5
      if (i - lastIdx > 2) sections.push({ headerIdx: i, type })
    }
  }

  if (sections.length === 0) {
    errors.push('Could not find a header row with "Player" or "Name" column.')
    return { rows: [], errors, teamLabel, detectedType: 'unknown' }
  }

  const detectedType: GcParseResult['detectedType'] =
    sections.length > 1          ? 'combined' :
    sections[0].type === 'pitching' ? 'pitching' : 'batting'

  const result: GcStatsRow[] = []

  for (const section of sections) {
    const headers = rows[section.headerIdx].map(normalizeHeader)

    // Find name and jersey column indices
    const nameIdx   = headers.findIndex(isNameCol)
    const jerseyIdx = headers.findIndex(isJerseyCol)

    if (nameIdx === -1) {
      errors.push(`Section at row ${section.headerIdx + 1}: couldn't find Player/Name column.`)
      continue
    }

    // Build column mapping for stats
    const statMap: Record<number, string> = {}
    const colDict = section.type === 'pitching' ? PITCHING_MAP : BATTING_MAP

    for (let ci = 0; ci < headers.length; ci++) {
      if (ci === nameIdx || ci === jerseyIdx) continue
      const mapped = colDict[headers[ci]]
      if (mapped) statMap[ci] = mapped
    }

    // Determine where this section's data ends (blank row or next header)
    let endIdx = rows.length
    for (let i = section.headerIdx + 1; i < rows.length; i++) {
      const rowIsEmpty = rows[i].every(c => c.trim() === '')
      const rowIsHeader = i !== section.headerIdx && isHeaderRow(rows[i])
      if (rowIsEmpty || rowIsHeader) { endIdx = i; break }
    }

    // Parse data rows
    for (let ri = section.headerIdx + 1; ri < endIdx; ri++) {
      const row = rows[ri]
      const rawName = row[nameIdx]?.trim()
      if (!rawName || rawName.toLowerCase() === 'total' || rawName.toLowerCase() === 'totals') continue

      const jerseyNumber = jerseyIdx >= 0 ? (row[jerseyIdx]?.trim() || null) : null

      const stats: GcStatsRow['stats'] = {}
      for (const [ci, key] of Object.entries(statMap)) {
        const val = row[Number(ci)]
        const parsed = key === 'ip' ? parseIp(val) : parseNum(val)
        if (parsed != null) (stats as any)[key] = parsed
      }

      // Merge into existing row if same player appears in batting + pitching sections
      const existing = result.find(r =>
        r.rawName.toLowerCase() === rawName.toLowerCase() &&
        (jerseyNumber == null || r.jerseyNumber == null || r.jerseyNumber === jerseyNumber)
      )

      if (existing) {
        Object.assign(existing.stats, stats)
        if (existing.type === 'batting' && section.type === 'pitching') existing.type = 'unknown'
      } else {
        result.push({
          rowIndex:     ri,
          rawName,
          jerseyNumber,
          teamLabel,
          type:         section.type,
          stats,
        })
      }
    }
  }

  if (result.length === 0) {
    errors.push('No player rows found after header.')
  }

  return { rows: result, errors, teamLabel, detectedType }
}
