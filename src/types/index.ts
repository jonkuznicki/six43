// ============================================================
// Six43 – TypeScript Types
// ============================================================
// These types mirror the database schema exactly.
// Use them everywhere in the app so TypeScript catches mistakes
// before they become bugs.
//
// Rule: if the database changes, update this file too.
// ============================================================

// ----------------------------------------------------------------
// Primitives used across multiple types
// ----------------------------------------------------------------

export type ThrowsOrBats = 'R' | 'L' | 'S'
export type PlayerStatus = 'active' | 'inactive' | 'injured'
export type GameStatus = 'scheduled' | 'in_progress' | 'final'
export type GameLocation = 'Home' | 'Away' | 'Neutral'
export type Availability = 'available' | 'absent' | 'late' | 'injured'

// All valid position strings in the app.
// 'Bench' is a position assignment, not a physical position.
export type Position =
  | 'P' | 'C' | '1B' | '2B' | 'SS' | '3B'
  | 'LF' | 'CF' | 'RF'
  | 'Bench'

// 9-element array. Index 0 = inning 1, index 8 = inning 9.
// null means the player didn't play that inning.
export type InningPositions = (Position | null)[]

// ----------------------------------------------------------------
// Database row types
// These match column names exactly so they work directly with
// Supabase query results.
// ----------------------------------------------------------------

export interface Team {
  id: string
  user_id: string
  name: string
  age_group: string | null
  positions: Position[]
  created_at: string
}

export interface Player {
  id: string
  team_id: string
  first_name: string
  last_name: string
  jersey_number: number
  primary_position: Position | null
  secondary_positions: Position[]
  throws: ThrowsOrBats | null
  bats: ThrowsOrBats | null
  status: PlayerStatus
  batting_pref_order: number | null
  notes: string | null
  created_at: string
}

export interface Season {
  id: string
  team_id: string
  name: string
  start_date: string | null
  end_date: string | null
  innings_per_game: number
  is_active: boolean
  created_at: string
}

export interface Game {
  id: string
  season_id: string
  game_number: number | null
  opponent: string
  game_date: string        // ISO date string "2025-04-05"
  game_time: string | null // "18:00:00"
  location: GameLocation | null
  status: GameStatus
  innings_played: number | null
  notes: string | null
  created_at: string
}

export interface LineupSlot {
  id: string
  game_id: string
  player_id: string
  batting_order: number | null
  inning_positions: InningPositions
  planned_positions: InningPositions | null
  availability: Availability
  created_at: string
  updated_at: string
}

export interface PitcherPlan {
  id: string
  game_id: string
  player_id: string
  pitcher_slot: 1 | 2 | 3 | 4
  is_planned: boolean
  notes: string | null
  created_at: string
}

// ----------------------------------------------------------------
// View types (computed, read-only)
// ----------------------------------------------------------------

// Matches the season_position_stats view
export interface SeasonPositionStats {
  player_id: string
  season_id: string
  first_name: string
  last_name: string
  jersey_number: number
  innings_p: number
  innings_c: number
  innings_1b: number
  innings_2b: number
  innings_ss: number
  innings_3b: number
  innings_lf: number
  innings_cf: number
  innings_rf: number
  innings_bench: number
  innings_infield: number
  innings_outfield: number
  innings_total: number  // field innings only
  innings_all: number    // field + bench
  bench_pct: number      // 0.0 to 1.0, e.g. 0.6667 = 66.67%
}

// Matches the game_inning_validation view
export interface GameInningValidation {
  game_id: string
  inning_num: number
  position: Position
  player_count: number
}

// ----------------------------------------------------------------
// App-level composite types
// Used when we need related data joined together
// ----------------------------------------------------------------

// A player with their slot in a specific game
export interface PlayerWithSlot extends Player {
  slot: LineupSlot | null
}

// A game with its full lineup loaded
export interface GameWithLineup extends Game {
  lineup: PlayerWithSlot[]
}

// A player row in the fairness dashboard
// bench_pct_display is bench_pct formatted as "66.7%"
export interface FairnessRow extends SeasonPositionStats {
  bench_pct_display: string
  bench_status: 'good' | 'warn' | 'bad'  // good < 33%, warn 33-50%, bad > 50%
}

// ----------------------------------------------------------------
// Form types
// Used for creating/editing records
// ----------------------------------------------------------------

export interface CreatePlayerForm {
  first_name: string
  last_name: string
  jersey_number: number
  primary_position: Position | null
  secondary_positions: Position[]
  throws: ThrowsOrBats | null
  bats: ThrowsOrBats | null
  batting_pref_order: number | null
  notes: string
}

export interface CreateGameForm {
  opponent: string
  game_date: string
  game_time: string
  location: GameLocation
  innings: number
  copy_from_game_id: string | null
}

// ----------------------------------------------------------------
// Constants
// ----------------------------------------------------------------

// All fielding positions (excludes Bench)
export const FIELDING_POSITIONS: Position[] = [
  'P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF'
]

// All position options including Bench
export const ALL_POSITIONS: Position[] = [
  ...FIELDING_POSITIONS, 'Bench'
]

// Infield positions (for stats grouping)
export const INFIELD_POSITIONS: Position[] = [
  'P', 'C', '1B', '2B', 'SS', '3B'
]

// Outfield positions (for stats grouping)
export const OUTFIELD_POSITIONS: Position[] = [
  'LF', 'CF', 'RF'
]

// Bench percentage thresholds for colour coding
// Matches the fairness dashboard colours
export const BENCH_PCT_WARN = 0.33  // above this = yellow
export const BENCH_PCT_BAD  = 0.50  // above this = red

// ----------------------------------------------------------------
// Utility helpers
// ----------------------------------------------------------------

// Get a player's display name: "L. Smith (#24)"
export function playerDisplayName(player: Pick<Player, 'first_name' | 'last_name' | 'jersey_number'>): string {
  return `${player.first_name[0]}. ${player.last_name} (#${player.jersey_number})`
}

// Get bench status for colour coding
export function getBenchStatus(bench_pct: number): FairnessRow['bench_status'] {
  if (bench_pct > BENCH_PCT_BAD)  return 'bad'
  if (bench_pct > BENCH_PCT_WARN) return 'warn'
  return 'good'
}

// Format bench_pct as display string: 0.6667 → "66.7%"
export function formatBenchPct(bench_pct: number): string {
  return `${(bench_pct * 100).toFixed(1)}%`
}

// Count how many fielding positions are filled in an inning
// Returns object with position → player count
export function validateInning(
  slots: LineupSlot[],
  inningIndex: number  // 0-based
): Record<Position, number> {
  const counts: Record<string, number> = {}
  for (const slot of slots) {
    const pos = slot.inning_positions[inningIndex]
    if (pos) {
      counts[pos] = (counts[pos] || 0) + 1
    }
  }
  return counts as Record<Position, number>
}

// Check if an inning is valid (each fielding position has exactly 1 player)
export function isInningValid(counts: Record<Position, number>): boolean {
  for (const pos of FIELDING_POSITIONS) {
    if ((counts[pos] || 0) !== 1) return false
  }
  return true
}
