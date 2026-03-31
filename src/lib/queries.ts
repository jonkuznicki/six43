// ============================================================
// Six43 – Data access layer
// ============================================================
// All Supabase queries live here. Components never query the
// database directly — they call these functions.
//
// Why? If the database schema changes, you fix it in one place
// instead of hunting through 20 component files.
// ============================================================

import { createClient } from './supabase'
import type {
  Team, Player, Season, Game, LineupSlot,
  SeasonPositionStats, GameInningValidation,
  CreatePlayerForm, CreateGameForm,
  FairnessRow, InningPositions, Position,
  getBenchStatus, formatBenchPct
} from '../types'

import {
  getBenchStatus as _getBenchStatus,
  formatBenchPct as _formatBenchPct
} from '../types'

// ----------------------------------------------------------------
// TEAMS
// ----------------------------------------------------------------

export async function getTeam(): Promise<Team | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('teams')
    .select('*')
    .single()  // MVP: one team per user
  return data
}

export async function createTeam(name: string, ageGroup?: string): Promise<Team> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('teams')
    .insert({ name, age_group: ageGroup ?? null })
    .select()
    .single()
  if (error) throw error
  return data
}

// ----------------------------------------------------------------
// PLAYERS
// ----------------------------------------------------------------

// Get all active players for the current team, sorted for lineup display
export async function getPlayers(teamId: string): Promise<Player[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('team_id', teamId)
    .eq('status', 'active')
    .order('batting_pref_order', { ascending: true, nullsFirst: false })
    .order('last_name')
  if (error) throw error
  return data ?? []
}

// Get players who can play a specific position (primary or secondary)
export async function getPlayersForPosition(
  teamId: string,
  position: Position
): Promise<Player[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('team_id', teamId)
    .eq('status', 'active')
    .or(`primary_position.eq.${position},secondary_positions.cs.{${position}}`)
    .order('last_name')
  if (error) throw error
  return data ?? []
}

export async function createPlayer(
  teamId: string,
  form: CreatePlayerForm
): Promise<Player> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('players')
    .insert({ team_id: teamId, ...form })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updatePlayer(
  playerId: string,
  updates: Partial<CreatePlayerForm>
): Promise<Player> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('players')
    .update(updates)
    .eq('id', playerId)
    .select()
    .single()
  if (error) throw error
  return data
}

// ----------------------------------------------------------------
// SEASONS
// ----------------------------------------------------------------

export async function getActiveSeason(teamId: string): Promise<Season | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('seasons')
    .select('*')
    .eq('team_id', teamId)
    .eq('is_active', true)
    .single()
  return data
}

export async function createSeason(
  teamId: string,
  name: string,
  inningsPerGame: number = 6
): Promise<Season> {
  const supabase = createClient()
  // Deactivate any existing active season first
  await supabase
    .from('seasons')
    .update({ is_active: false })
    .eq('team_id', teamId)
    .eq('is_active', true)

  const { data, error } = await supabase
    .from('seasons')
    .insert({ team_id: teamId, name, innings_per_game: inningsPerGame })
    .select()
    .single()
  if (error) throw error
  return data
}

// ----------------------------------------------------------------
// GAMES
// ----------------------------------------------------------------

// Get all games for a season, newest first for dashboard display
export async function getGames(seasonId: string): Promise<Game[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('season_id', seasonId)
    .order('game_date', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getGame(gameId: string): Promise<Game | null> {
  const supabase = createClient()
  const { data } = await supabase
    .from('games')
    .select('*')
    .eq('id', gameId)
    .single()
  return data
}

export async function createGame(
  seasonId: string,
  form: CreateGameForm
): Promise<Game> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('games')
    .insert({
      season_id:    seasonId,
      opponent:     form.opponent,
      game_date:    form.game_date,
      game_time:    form.game_time || null,
      location:     form.location,
      status:       'scheduled',
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// Mark a game as final — triggers stats update automatically
// (the view recalculates on next query)
export async function finalizeGame(gameId: string): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('games')
    .update({ status: 'final' })
    .eq('id', gameId)
  if (error) throw error
}

export async function updateGameStatus(
  gameId: string,
  status: Game['status'],
  inningsPlayed?: number
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('games')
    .update({
      status,
      innings_played: inningsPlayed ?? null
    })
    .eq('id', gameId)
  if (error) throw error
}

// ----------------------------------------------------------------
// LINEUP SLOTS
// ----------------------------------------------------------------

// Get all slots for a game with player data joined
export async function getLineup(gameId: string): Promise<(LineupSlot & { player: Player })[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('lineup_slots')
    .select('*, player:players(*)')
    .eq('game_id', gameId)
    .order('batting_order', { ascending: true, nullsFirst: false })
  if (error) throw error
  return (data ?? []) as (LineupSlot & { player: Player })[]
}

// Save the full lineup for a game (upsert = insert or update)
export async function saveLineup(
  gameId: string,
  slots: Array<{
    player_id: string
    batting_order: number
    inning_positions: InningPositions
  }>
): Promise<void> {
  const supabase = createClient()

  const rows = slots.map(slot => ({
    game_id:          gameId,
    player_id:        slot.player_id,
    batting_order:    slot.batting_order,
    inning_positions: slot.inning_positions,
    // Set planned_positions on first save only.
    // We use a DB function for this — see below.
    planned_positions: slot.inning_positions,
  }))

  const { error } = await supabase
    .from('lineup_slots')
    .upsert(rows, { onConflict: 'game_id,player_id' })
  if (error) throw error
}

// Update a single player's position for one inning
// This is the hot path during a live game
export async function updateInningPosition(
  slotId: string,
  inningIndex: number,           // 0-based
  position: Position | null
): Promise<void> {
  const supabase = createClient()

  // Fetch current positions first
  const { data: current, error: fetchError } = await supabase
    .from('lineup_slots')
    .select('inning_positions')
    .eq('id', slotId)
    .single()
  if (fetchError) throw fetchError

  // Update just the one inning
  const updated = [...(current.inning_positions as InningPositions)]
  updated[inningIndex] = position

  const { error } = await supabase
    .from('lineup_slots')
    .update({ inning_positions: updated })
    .eq('id', slotId)
  if (error) throw error
}

// Mark a player as absent for a game (clears all their inning positions)
export async function markPlayerAbsent(
  gameId: string,
  playerId: string
): Promise<void> {
  const supabase = createClient()
  const { error } = await supabase
    .from('lineup_slots')
    .update({
      availability: 'absent',
      inning_positions: [null,null,null,null,null,null,null,null,null]
    })
    .eq('game_id', gameId)
    .eq('player_id', playerId)
  if (error) throw error
}

// ----------------------------------------------------------------
// SEASON STATS (the Positions sheet replacement)
// ----------------------------------------------------------------

// Get the full fairness dashboard for a season
export async function getSeasonStats(seasonId: string): Promise<FairnessRow[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('season_position_stats')
    .select('*')
    .eq('season_id', seasonId)
    .order('bench_pct', { ascending: false })  // worst bench % first

  if (error) throw error

  return (data ?? []).map(row => ({
    ...row,
    bench_pct_display: _formatBenchPct(row.bench_pct),
    bench_status: _getBenchStatus(row.bench_pct),
  })) as FairnessRow[]
}

// ----------------------------------------------------------------
// VALIDATION
// ----------------------------------------------------------------

// Check all innings in a game for position errors
// Returns innings that have problems (missing or doubled-up positions)
export async function getLineupValidation(
  gameId: string
): Promise<GameInningValidation[]> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('game_inning_validation')
    .select('*')
    .eq('game_id', gameId)
    .order('inning_num')
  if (error) throw error
  return data ?? []
}
