/**
 * Tryout score import parser.
 *
 * Handles the combined tryout results file:
 *   Sheet: "2026 - Tryout Results" (or "2025 - Tryout Results")
 *   Row 0 = data header
 *   Rows 1+ = data
 *
 * One row = one player's scores from one tryout session / evaluator.
 * Multiple evaluators → multiple rows per player (averaged later).
 *
 * Also handles the legacy multi-evaluator column format where each
 * evaluator has their own column block (e.g., "Eval 1 GB Hands",
 * "Eval 2 GB Hands"). In that case we flatten into one row per evaluator.
 */

import * as XLSX from 'xlsx'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParsedTryoutScoreRow {
  // Identity
  rawName:   string
  ageGroup:  string

  // Session info
  sessionDate:   string | null   // ISO: YYYY-MM-DD
  sessionLabel:  string | null   // "Week 1 / Day 1" if present
  evaluatorName: string | null

  // Scores (1–5 scale, null if not scored)
  scores: {
    speed_60yd:        number | null
    gb_hands:          number | null
    gb_range:          number | null
    gb_arm:            number | null
    fb_judging:        number | null
    fb_catching:       number | null
    fb_arm:            number | null
    hit_contact:       number | null
    hit_power:         number | null
    pitch_velo:        number | null   // null if player didn't pitch
    pitch_control:     number | null
    catcher_receiving: number | null   // null if not a catcher candidate
    catcher_arm:       number | null
  }

  // Pre-calculated tryout score from spreadsheet (stored for audit)
  tryoutScore: number | null

  comments:  string | null
  rowIndex:  number
}

export interface ParseTryoutScoresResult {
  rows:    ParsedTryoutScoreRow[]
  errors:  Array<{ rowIndex: number; message: string }>
  headers: string[]
}

// ── Column name aliases ───────────────────────────────────────────────────────

const SCORE_ALIASES: Record<keyof ParsedTryoutScoreRow['scores'], string[]> = {
  speed_60yd:        ['Speed-60yds', 'Speed 60yds', '60yd', '60 yd', 'Speed', '60 Yard Dash'],
  gb_hands:          ['GB Hands', 'Ground Ball Hands', 'GB - Hands'],
  gb_range:          ['GB Range', 'Ground Ball Range', 'GB - Range'],
  gb_arm:            ['GB Arm', 'Ground Ball Arm', 'GB - Arm'],
  fb_judging:        ['FB Judging', 'Fly Ball Judging', 'FB - Judging'],
  fb_catching:       ['FB Catching', 'Fly Ball Catching', 'FB - Catching'],
  fb_arm:            ['FB Arm', 'Fly Ball Arm', 'FB - Arm'],
  hit_contact:       ['Hit-Contact', 'Hit Contact', 'Hitting Contact', 'Contact'],
  hit_power:         ['Hit-Power', 'Hit Power', 'Hitting Power', 'Power'],
  pitch_velo:        ['Pitch-Velo', 'Pitch Velo', 'Pitching Velo', 'Velocity', 'Velo'],
  pitch_control:     ['Pitch-Control', 'Pitch Control', 'Pitching Control', 'Control'],
  catcher_receiving: ['Catcher-Receiving', 'Catcher Receiving', 'C-Receiving', 'Receiving'],
  catcher_arm:       ['Catcher-Arm', 'Catcher Arm', 'C-Arm'],
}

const META_ALIASES = {
  playerName:    ['Player Name', 'Name', 'Player', 'Athlete'],
  ageGroup:      ['Age Group', 'Division', 'Age Division', 'Tryout Age Group'],
  sessionDate:   ['Tryout Date', 'Date', 'Session Date', 'Event Date'],
  sessionLabel:  ['Session', 'Session Label', 'Tryout Session', 'Week/Day'],
  evaluatorName: ['Evaluator', 'Evaluator Name', 'Scorer', 'Scout'],
  tryoutScore:   ['Tryout Score', 'Total Score', 'Score', 'Overall Score'],
  comments:      ['Evaluator Comments', 'Comments', 'Notes', 'Evaluator Notes'],
}

// ── Parser ───────────────────────────────────────────────────────────────────

export function parseTryoutScoresFile(
  fileBuffer: ArrayBuffer | Buffer,
): ParseTryoutScoresResult {
  const wb = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true })

  const sheetName = detectSheet(wb.SheetNames, [
    '2026 - Tryout Results',
    '2025 - Tryout Results',
    '2026 Tryout Results',
    '2025 Tryout Results',
    'Tryout Results',
    'Tryout Scores',
    'Results',
  ]) ?? wb.SheetNames[0]

  const ws = wb.Sheets[sheetName]
  const rawAll: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  if (rawAll.length < 2) {
    return { rows: [], errors: [{ rowIndex: 0, message: 'Sheet appears empty.' }], headers: [] }
  }

  // Find header row
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(4, rawAll.length); i++) {
    const row = (rawAll[i] as string[]).map(c => String(c).toLowerCase())
    if (row.some(c => c.includes('player') || c.includes('name') || c.includes('age'))) {
      headerRowIdx = i
      break
    }
  }

  const headerRow = (rawAll[headerRowIdx] as string[]).map(c => String(c).trim())
  const dataRows  = rawAll.slice(headerRowIdx + 1)

  // Detect multi-evaluator column format
  // Heuristic: header contains "Eval 1" or "Evaluator 1" or repeated score column names
  const isMultiEval = detectMultiEvalFormat(headerRow)

  return isMultiEval
    ? parseMultiEvalFormat(headerRow, dataRows)
    : parseSingleEvalFormat(headerRow, dataRows)
}

// ── Single evaluator per row ──────────────────────────────────────────────────

function parseSingleEvalFormat(
  headerRow: string[],
  dataRows:  unknown[][],
): ParseTryoutScoresResult {
  const colIndex: Record<string, number> = {}
  headerRow.forEach((h, i) => { colIndex[h.toLowerCase().trim()] = i })

  const getIdx = (aliases: string[]) => {
    for (const a of aliases) {
      const idx = colIndex[a.toLowerCase()]
      if (idx !== undefined) return idx
    }
    return -1
  }

  const playerNameIdx   = getIdx(META_ALIASES.playerName)
  const ageGroupIdx     = getIdx(META_ALIASES.ageGroup)
  const sessionDateIdx  = getIdx(META_ALIASES.sessionDate)
  const sessionLabelIdx = getIdx(META_ALIASES.sessionLabel)
  const evaluatorIdx    = getIdx(META_ALIASES.evaluatorName)
  const tryoutScoreIdx  = getIdx(META_ALIASES.tryoutScore)
  const commentsIdx     = getIdx(META_ALIASES.comments)

  const scoreIndices = {} as Record<keyof ParsedTryoutScoreRow['scores'], number>
  for (const [key, aliases] of Object.entries(SCORE_ALIASES)) {
    scoreIndices[key as keyof ParsedTryoutScoreRow['scores']] = getIdx(aliases)
  }

  const rows:   ParsedTryoutScoreRow[] = []
  const errors: Array<{ rowIndex: number; message: string }> = []

  dataRows.forEach((rawRow, idx) => {
    const row      = rawRow as unknown[]
    const rowIndex = headerRow.length + 1 + idx  // approximate

    const getString = (i: number) => i >= 0 ? String(row[i] ?? '').trim() : ''
    const getNum    = (i: number): number | null => {
      if (i < 0) return null
      const v = row[i]
      if (v === null || v === undefined || v === '') return null
      const n = parseFloat(String(v))
      return isNaN(n) ? null : n
    }

    const rawName  = getString(playerNameIdx)
    const ageGroup = getString(ageGroupIdx)
    if (!rawName) return  // blank row

    let sessionDate: string | null = null
    if (sessionDateIdx >= 0) {
      const v = row[sessionDateIdx]
      if (v instanceof Date) {
        sessionDate = v.toISOString().split('T')[0]
      } else if (typeof v === 'string' && v.trim()) {
        sessionDate = parseDateString(v.trim())
      } else if (typeof v === 'number') {
        const d = XLSX.SSF.parse_date_code(v)
        if (d) sessionDate = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
      }
    }

    rows.push({
      rawName,
      ageGroup:     normalizeAgeGroup(ageGroup),
      sessionDate,
      sessionLabel: getString(sessionLabelIdx) || null,
      evaluatorName: getString(evaluatorIdx) || null,
      scores: {
        speed_60yd:        getNum(scoreIndices.speed_60yd),
        gb_hands:          getNum(scoreIndices.gb_hands),
        gb_range:          getNum(scoreIndices.gb_range),
        gb_arm:            getNum(scoreIndices.gb_arm),
        fb_judging:        getNum(scoreIndices.fb_judging),
        fb_catching:       getNum(scoreIndices.fb_catching),
        fb_arm:            getNum(scoreIndices.fb_arm),
        hit_contact:       getNum(scoreIndices.hit_contact),
        hit_power:         getNum(scoreIndices.hit_power),
        pitch_velo:        getNum(scoreIndices.pitch_velo),
        pitch_control:     getNum(scoreIndices.pitch_control),
        catcher_receiving: getNum(scoreIndices.catcher_receiving),
        catcher_arm:       getNum(scoreIndices.catcher_arm),
      },
      tryoutScore:   getNum(tryoutScoreIdx),
      comments:      getString(commentsIdx) || null,
      rowIndex,
    })
  })

  return { rows, errors, headers: headerRow }
}

// ── Multi-evaluator column format ─────────────────────────────────────────────
// Each row is a player; evaluators have separate column blocks.
// We flatten into one ParsedTryoutScoreRow per evaluator per player.

function parseMultiEvalFormat(
  headerRow: string[],
  dataRows:  unknown[][],
): ParseTryoutScoresResult {
  // Find how many evaluator blocks exist
  // Pattern: "Eval 1 Speed-60yds", "Eval 2 Speed-60yds", etc.
  const evalPattern = /^eval(?:uator)?\s*(\d+)\s+(.+)$/i
  const evalBlocks: Map<number, Record<string, number>> = new Map()

  // Also find non-evaluator columns
  const colIndex: Record<string, number> = {}
  headerRow.forEach((h, i) => {
    const m = h.match(evalPattern)
    if (m) {
      const evalNum = parseInt(m[1])
      const colName = m[2].trim()
      if (!evalBlocks.has(evalNum)) evalBlocks.set(evalNum, {})
      evalBlocks.get(evalNum)![colName.toLowerCase()] = i
    } else {
      colIndex[h.toLowerCase().trim()] = i
    }
  })

  const getMetaIdx = (aliases: string[]) => {
    for (const a of aliases) {
      const idx = colIndex[a.toLowerCase()]
      if (idx !== undefined) return idx
    }
    return -1
  }

  const playerNameIdx  = getMetaIdx(META_ALIASES.playerName)
  const ageGroupIdx    = getMetaIdx(META_ALIASES.ageGroup)
  const sessionDateIdx = getMetaIdx(META_ALIASES.sessionDate)

  const rows:   ParsedTryoutScoreRow[] = []
  const errors: Array<{ rowIndex: number; message: string }> = []

  dataRows.forEach((rawRow, rowIdx) => {
    const row = rawRow as unknown[]
    const rawName  = playerNameIdx >= 0 ? String(row[playerNameIdx] ?? '').trim() : ''
    const ageGroup = ageGroupIdx >= 0   ? String(row[ageGroupIdx] ?? '').trim() : ''
    if (!rawName) return

    let sessionDate: string | null = null
    if (sessionDateIdx >= 0) {
      const v = row[sessionDateIdx]
      if (typeof v === 'string') sessionDate = parseDateString(v)
      else if (typeof v === 'number') {
        const d = XLSX.SSF.parse_date_code(v)
        if (d) sessionDate = `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`
      }
    }

    // One row per evaluator block
    for (const [evalNum, block] of Array.from(evalBlocks.entries())) {
      const getScore = (aliases: string[]): number | null => {
        for (const a of aliases) {
          const idx = block[a.toLowerCase()]
          if (idx !== undefined) {
            const v = row[idx]
            if (v === null || v === undefined || v === '') return null
            const n = parseFloat(String(v))
            return isNaN(n) ? null : n
          }
        }
        return null
      }

      // Skip evaluator block if all scores are null (evaluator didn't score this player)
      const scores = buildScores(getScore)
      if (Object.values(scores).every(v => v === null)) continue

      rows.push({
        rawName,
        ageGroup:     normalizeAgeGroup(ageGroup),
        sessionDate,
        sessionLabel: null,
        evaluatorName: `Evaluator ${evalNum}`,
        scores,
        tryoutScore:   null,
        comments:      null,
        rowIndex:      rowIdx + 2,
      })
    }
  })

  return { rows, errors, headers: headerRow }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildScores(
  getScore: (aliases: string[]) => number | null
): ParsedTryoutScoreRow['scores'] {
  return Object.fromEntries(
    Object.entries(SCORE_ALIASES).map(([key, aliases]) => [key, getScore(aliases)])
  ) as ParsedTryoutScoreRow['scores']
}

function detectMultiEvalFormat(headerRow: string[]): boolean {
  return headerRow.some(h => /^eval(?:uator)?\s*\d+/i.test(h.trim()))
}

function detectSheet(names: string[], preferred: string[]): string | null {
  for (const p of preferred) {
    const found = names.find(n => n.toLowerCase().trim() === p.toLowerCase().trim())
    if (found) return found
  }
  return null
}

function normalizeAgeGroup(raw: string): string {
  if (!raw) return ''
  const cleaned = raw.trim().toUpperCase().replace(/\s+/g, '')
  if (/^\d{1,2}U$/.test(cleaned)) return cleaned
  const m = cleaned.match(/^(\d{1,2})(?:U|UNDER|AND UNDER|-U|-UNDER)?$/)
  if (m) return `${m[1]}U`
  return raw.trim()
}

function parseDateString(s: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2,'0')}-${mdy[2].padStart(2,'0')}`
  const d = new Date(s)
  if (!isNaN(d.getTime())) return d.toISOString().split('T')[0]
  return null
}
