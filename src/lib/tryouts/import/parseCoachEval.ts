/**
 * Coach eval import parser.
 *
 * Handles two file formats from Hudson Baseball:
 *
 * Format A — Individual team file (coaches emailed separately):
 *   Sheet: "2025 Coach Eval"
 *   Cell B1 = team name, B2 = coach name
 *   Header row at index 8, data starts at index 9
 *
 * Format B — Combined file (preferred going forward):
 *   Sheet: "2026 - Coach Evaluations"
 *   Row 0 = data header, data starts at row 1
 *   Has "Team" and "Coach Name" columns
 *
 * Both formats produce the same ParsedCoachEvalRow output shape.
 */

import * as XLSX from 'xlsx'
import { splitName } from '../nameNormalization'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ParsedCoachEvalRow {
  // Identity (needs resolution against tryout_players)
  rawName:            string
  teamLabel:          string
  coachName:          string

  // Scores (all 1–5, null if not applicable / left blank)
  scores: {
    fielding_ground_balls:     number | null
    catching_fly_balls:        number | null
    receiving_throws:          number | null
    range_footwork:            number | null
    throwing:                  number | null
    hitting:                   number | null
    speed:                     number | null
    athleticism:               number | null
    pitching:                  number | null   // optional
    catching:                  number | null   // optional
    in_game_decision_making:   number | null
    coachability:              number | null
    attitude:                  number | null
    composure:                 number | null
    commitment:                number | null
    leadership:                number | null
  }

  // Pre-calculated (from spreadsheet; we recalculate anyway but store for audit)
  coachEvalScore:    number | null
  coachEvalRank:     number | null
  intangiblesScore:  number | null
  intangiblesRank:   number | null

  comments:   string | null
  rowIndex:   number
  sourceFormat: 'individual' | 'combined'
}

export interface ParseCoachEvalResult {
  rows:         ParsedCoachEvalRow[]
  errors:       Array<{ rowIndex: number; message: string }>
  headers:      string[]
  sourceFormat: 'individual' | 'combined'
  teamLabel?:   string   // only for Format A (from cell B1)
  coachName?:   string   // only for Format A (from cell B2)
}

// ── Column name aliases ───────────────────────────────────────────────────────

// Maps our field keys to every column header variant we've seen
const SCORE_COL_ALIASES: Record<keyof ParsedCoachEvalRow['scores'], string[]> = {
  fielding_ground_balls:   ['Fielding Ground Balls', 'Ground Balls', 'GB'],
  catching_fly_balls:      ['Catching Fly Balls', 'Fly Balls', 'FB'],
  receiving_throws:        ['Receiving Throws', 'Receiving'],
  range_footwork:          ['Range/Footwork', 'Range Footwork', 'Range & Footwork', 'Range'],
  throwing:                ['Throwing', 'Throw', 'Arm Strength'],
  hitting:                 ['Hitting', 'Hit'],
  speed:                   ['Speed', 'Athleticism/Speed'],
  athleticism:             ['Athleticism', 'Athletic Ability'],
  pitching:                ['Pitching', 'Pitch'],
  catching:                ['Catching', 'Catcher'],
  in_game_decision_making: ['In Game Decision Making', 'In-Game Decision Making', 'Game IQ', 'Decision Making'],
  coachability:            ['Coachability', 'Coachable'],
  attitude:                ['Attitude', 'Attitude/Effort'],
  composure:               ['Composure', 'Poise'],
  commitment:              ['Commitement', 'Commitment', 'Committed'],  // note: typo in original
  leadership:              ['Leadership', 'Leader'],
}

const META_COL_ALIASES = {
  playerName:       ['Player Name', 'Player', 'Name', 'Athlete'],
  team:             ['Team', 'Team Name'],
  coachName:        ['Coach Name', 'Coach', 'Head Coach'],
  coachEvalScore:   ['Coach Evaluation Score', 'Coach Eval Score', 'Eval Score'],
  coachEvalRank:    ['Coach Eval Rank on Team', 'Eval Rank', 'Team Rank'],
  intangiblesScore: ['Intangibles Score', 'Intangibles'],
  intangiblesRank:  ['Intangibles Rank on Team', 'Intangibles Rank'],
  comments:         ['Comments & Needs to Improve', 'Comments', 'Notes', 'Coach Comments'],
}

// ── Parser ───────────────────────────────────────────────────────────────────

export function parseCoachEvalFile(
  fileBuffer: ArrayBuffer | Buffer,
): ParseCoachEvalResult {
  const wb = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true })

  // Detect which sheet to use
  const sheetName = detectSheet(wb.SheetNames, [
    '2026 - Coach Evaluations',
    '2025 - Coach Evaluations',
    '2026 Coach Evaluations',
    '2025 Coach Eval',
    'Coach Evaluations',
    'Coach Eval',
  ]) ?? wb.SheetNames[0]

  const ws = wb.Sheets[sheetName]

  // Detect format by checking whether B1/B2 look like team/coach name
  // (Format A) vs. having a "Team" column header in row 0 (Format B)
  const rawAll: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

  // Format A detection: cell B1 non-empty AND row 8 has typical eval column headers
  const isFormatA = detectFormatA(rawAll)

  return isFormatA
    ? parseFormatA(rawAll)
    : parseFormatB(rawAll)
}

// ── Format A (individual team file) ──────────────────────────────────────────

function parseFormatA(rawAll: unknown[][]): ParseCoachEvalResult {
  const teamLabel = String((rawAll[0] as string[])?.[1] ?? '').trim()
  const coachName = String((rawAll[1] as string[])?.[1] ?? '').trim()

  const headerRow = (rawAll[8] as string[]).map(c => String(c).trim())
  const dataRows  = rawAll.slice(9)

  return parseRows({
    headerRow,
    dataRows,
    defaultTeam:  teamLabel,
    defaultCoach: coachName,
    sourceFormat: 'individual',
    teamLabel,
    coachName,
  })
}

// ── Format B (combined file) ──────────────────────────────────────────────────

function parseFormatB(rawAll: unknown[][]): ParseCoachEvalResult {
  // Find the header row — the first row that contains "Player Name" or "Name"
  let headerRowIdx = 0
  for (let i = 0; i < Math.min(5, rawAll.length); i++) {
    const row = (rawAll[i] as string[]).map(c => String(c).toLowerCase())
    if (row.some(c => c.includes('player') || c.includes('name'))) {
      headerRowIdx = i
      break
    }
  }

  const headerRow = (rawAll[headerRowIdx] as string[]).map(c => String(c).trim())
  const dataRows  = rawAll.slice(headerRowIdx + 1)

  return parseRows({
    headerRow,
    dataRows,
    defaultTeam:  '',
    defaultCoach: '',
    sourceFormat: 'combined',
  })
}

// ── Shared row parser ─────────────────────────────────────────────────────────

function parseRows({
  headerRow, dataRows, defaultTeam, defaultCoach, sourceFormat, teamLabel, coachName,
}: {
  headerRow:    string[]
  dataRows:     unknown[][]
  defaultTeam:  string
  defaultCoach: string
  sourceFormat: 'individual' | 'combined'
  teamLabel?:   string
  coachName?:   string
}): ParseCoachEvalResult {

  const colIndex: Record<string, number> = {}
  headerRow.forEach((h, i) => { colIndex[h.toLowerCase().trim()] = i })

  const getIdx = (aliases: string[]) => {
    for (const a of aliases) {
      const idx = colIndex[a.toLowerCase()]
      if (idx !== undefined) return idx
    }
    return -1
  }

  const playerNameIdx    = getIdx(META_COL_ALIASES.playerName)
  const teamIdx          = getIdx(META_COL_ALIASES.team)
  const coachNameIdx     = getIdx(META_COL_ALIASES.coachName)
  const coachEvalScoreIdx  = getIdx(META_COL_ALIASES.coachEvalScore)
  const coachEvalRankIdx   = getIdx(META_COL_ALIASES.coachEvalRank)
  const intangiblesScoreIdx = getIdx(META_COL_ALIASES.intangiblesScore)
  const intangiblesRankIdx  = getIdx(META_COL_ALIASES.intangiblesRank)
  const commentsIdx      = getIdx(META_COL_ALIASES.comments)

  // Score column indices
  const scoreIndices = {} as Record<keyof ParsedCoachEvalRow['scores'], number>
  for (const [key, aliases] of Object.entries(SCORE_COL_ALIASES)) {
    scoreIndices[key as keyof ParsedCoachEvalRow['scores']] = getIdx(aliases)
  }

  const rows:   ParsedCoachEvalRow[] = []
  const errors: Array<{ rowIndex: number; message: string }> = []

  dataRows.forEach((rawRow, idx) => {
    const row = rawRow as unknown[]
    const rowIndex = (sourceFormat === 'individual' ? 9 : 1) + idx

    const getString = (i: number) => i >= 0 ? String(row[i] ?? '').trim() : ''
    const getNum    = (i: number): number | null => {
      if (i < 0) return null
      const v = row[i]
      if (v === null || v === undefined || v === '') return null
      const n = parseFloat(String(v))
      return isNaN(n) ? null : n
    }

    const rawName = getString(playerNameIdx)
    if (!rawName) return  // blank row

    const team  = getString(teamIdx)  || defaultTeam
    const coach = getString(coachNameIdx) || defaultCoach

    if (!team) {
      errors.push({ rowIndex, message: `Row ${rowIndex}: missing team for "${rawName}"` })
    }

    rows.push({
      rawName,
      teamLabel:  team,
      coachName:  coach,
      scores: {
        fielding_ground_balls:   getNum(scoreIndices.fielding_ground_balls),
        catching_fly_balls:      getNum(scoreIndices.catching_fly_balls),
        receiving_throws:        getNum(scoreIndices.receiving_throws),
        range_footwork:          getNum(scoreIndices.range_footwork),
        throwing:                getNum(scoreIndices.throwing),
        hitting:                 getNum(scoreIndices.hitting),
        speed:                   getNum(scoreIndices.speed),
        athleticism:             getNum(scoreIndices.athleticism),
        pitching:                getNum(scoreIndices.pitching),
        catching:                getNum(scoreIndices.catching),
        in_game_decision_making: getNum(scoreIndices.in_game_decision_making),
        coachability:            getNum(scoreIndices.coachability),
        attitude:                getNum(scoreIndices.attitude),
        composure:               getNum(scoreIndices.composure),
        commitment:              getNum(scoreIndices.commitment),
        leadership:              getNum(scoreIndices.leadership),
      },
      coachEvalScore:    getNum(coachEvalScoreIdx),
      coachEvalRank:     getNum(coachEvalRankIdx),
      intangiblesScore:  getNum(intangiblesScoreIdx),
      intangiblesRank:   getNum(intangiblesRankIdx),
      comments:          getString(commentsIdx) || null,
      rowIndex,
      sourceFormat,
    })
  })

  return { rows, errors, headers: headerRow, sourceFormat, teamLabel, coachName }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function detectSheet(names: string[], preferred: string[]): string | null {
  for (const p of preferred) {
    const found = names.find(n => n.toLowerCase().trim() === p.toLowerCase().trim())
    if (found) return found
  }
  return null
}

function detectFormatA(rawAll: unknown[][]): boolean {
  // Format A: B1 has text (team name) AND the 8th row (index 8) has "Player Name"
  const b1 = String((rawAll[0] as string[])?.[1] ?? '').trim()
  if (!b1) return false

  const row8 = ((rawAll[8] as string[]) ?? []).map(c => String(c).toLowerCase())
  return row8.some(c => c.includes('player') || c.includes('name'))
}

// Re-export splitName so callers don't need a separate import
export { splitName }
