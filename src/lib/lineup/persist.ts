/**
 * Atomic persistence for lineup rows.
 *
 * Every affected player row is written in ONE request: a multi-row upsert on
 * the primary key, which PostgREST executes as a single INSERT … ON CONFLICT
 * (id) DO UPDATE statement — all rows change together or none do (verified
 * against local Supabase by tests/rls/l1-lineup-writes.test.ts).
 *
 * Rows always carry their current game_id/player_id (required NOT NULL
 * columns), so the statement only ever updates existing rows. RLS is
 * unchanged: the existing lineup_slots policy decides who may write.
 *
 * Limits (by design for Milestone 1): no server-side check for duplicate
 * positions or the bench limit (the client rules enforce them), and no
 * conflict detection between two coaches editing the same game.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export interface SlotRow {
  id: string
  game_id: string
  player_id: string
  inning_positions: (string | null)[]
  availability: string
  batting_order: number | null
}

export interface WriteError {
  message: string
  code?: string
}

/** The columns the builders persist, taken from a slot as currently shown. */
export function toSlotRow(slot: Record<string, any>): SlotRow {
  return {
    id: slot.id,
    game_id: slot.game_id,
    player_id: slot.player_id,
    inning_positions: [...(slot.inning_positions ?? [])],
    availability: slot.availability ?? 'available',
    batting_order: slot.batting_order ?? null,
  }
}

/** Write all rows in one atomic statement. Resolves with the error, if any. */
export async function writeLineupRows(
  client: Pick<SupabaseClient, 'from'>,
  rows: SlotRow[],
): Promise<{ error: WriteError | null }> {
  if (!rows.length) return { error: null }
  const { error } = await client.from('lineup_slots').upsert(rows, { onConflict: 'id' })
  return { error: error ? { message: error.message, code: (error as any).code } : null }
}

/** Plain-language save error for coaches. */
export function describeWriteError(err: WriteError): string {
  const permission = err.code === '42501' || /row-level security|permission/i.test(err.message)
  return permission
    ? 'You don’t have permission to edit this lineup, so your last change wasn’t saved.'
    : 'Your last change wasn’t saved. Check your connection and try again.'
}
