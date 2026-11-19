/**
 * L1: the lineup builders save every affected player row with ONE multi-row
 * upsert (src/lib/lineup/persist.ts). These tests prove, against the LOCAL
 * Supabase stack, that the write is atomic, keeps today's permissions, and
 * reads back exactly what was written (no duplicate positions after a swap).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addAcceptedCoach, anonClient, createTeamWithGame, createUser, deleteUsers, serviceClient, type TeamFixture, type TestUser } from './helpers'
import { toSlotRow, writeLineupRows } from '../../src/lib/lineup/persist'
import { applyCellEdits, duplicatePositions } from '../../src/lib/lineup/rules'

let owner: TestUser, coach: TestUser, otherOwner: TestUser, outsider: TestUser
let team: TeamFixture, otherTeam: TeamFixture

const TEAM_POSITIONS = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'Bench']

async function slotsOf(gameId: string) {
  const { data, error } = await serviceClient()
    .from('lineup_slots')
    .select('id, game_id, player_id, inning_positions, availability, batting_order, planned_positions, created_at, updated_at')
    .eq('game_id', gameId)
    .order('player_id')
  if (error) throw new Error(error.message)
  return data!
}

/** Put the fixture back to a known state before each scenario. */
async function reset(gameId: string) {
  const svc = serviceClient()
  const rows = await slotsOf(gameId)
  await svc.from('lineup_slots').update({ inning_positions: ['P', 'SS', 'Bench', null, null, null, null, null, null], availability: 'available', batting_order: 1 }).eq('id', rows[0].id)
  await svc.from('lineup_slots').update({ inning_positions: ['C', 'Bench', 'CF', null, null, null, null, null, null], availability: 'available', batting_order: 2 }).eq('id', rows[1].id)
  return slotsOf(gameId)
}

beforeAll(async () => {
  owner = await createUser('l1-owner')
  coach = await createUser('l1-coach')
  otherOwner = await createUser('l1-other')
  outsider = await createUser('l1-outsider')
  team = await createTeamWithGame(owner.id, 'L1-Hawks')
  otherTeam = await createTeamWithGame(otherOwner.id, 'L1-Owls')
  await addAcceptedCoach(team.teamId, owner.id, coach)
})

afterAll(async () => {
  await deleteUsers([owner, coach, otherOwner, outsider])
})

describe('L1 atomic multi-row lineup writes', () => {
  it('a swap saves both players in one write and reads back with no duplicates', async () => {
    const before = await reset(team.gameId)
    // Player 2 takes P in the 1st inning, which player 1 holds → player 1 becomes unassigned.
    const r = applyCellEdits(before as any[], [{ slotId: before[1].id, inning: 0, position: 'P' }], TEAM_POSITIONS)
    expect(r.changedIds.sort()).toEqual([before[0].id, before[1].id].sort())

    const rows = r.slots.filter(s => r.changedIds.includes(s.id)).map(toSlotRow)
    const { error } = await writeLineupRows(owner.client, rows)
    expect(error).toBeNull()

    const after = await slotsOf(team.gameId)
    expect(after[0].inning_positions[0]).toBeNull()
    expect(after[1].inning_positions[0]).toBe('P')
    expect(duplicatePositions(after as any[], 3)).toEqual([])
    // Columns the builders don't send are untouched.
    expect(after.map(a => a.planned_positions)).toEqual(before.map(b => b.planned_positions))
    expect(after.map(a => a.created_at)).toEqual(before.map(b => b.created_at))
  })

  it('is atomic: if any row is invalid, no row changes', async () => {
    const before = await reset(team.gameId)
    const good = { ...toSlotRow(before[0]), inning_positions: ['LF', 'LF', 'LF', null, null, null, null, null, null] }
    const bad = { ...toSlotRow(before[1]), availability: 'not-a-valid-value' } // violates the CHECK constraint
    const { error } = await writeLineupRows(owner.client, [good, bad])
    expect(error).not.toBeNull()
    const after = await slotsOf(team.gameId)
    expect(after.map(a => a.inning_positions)).toEqual(before.map(b => b.inning_positions))
    expect(after.map(a => a.availability)).toEqual(before.map(b => b.availability))
  })

  it('saves availability together with positions (mark absent)', async () => {
    const before = await reset(team.gameId)
    const row = { ...toSlotRow(before[0]), availability: 'absent', inning_positions: Array(9).fill(null) }
    expect((await writeLineupRows(owner.client, [row])).error).toBeNull()
    const after = await slotsOf(team.gameId)
    expect(after[0].availability).toBe('absent')
    expect(after[0].inning_positions.every((p: string | null) => p === null)).toBe(true)
    expect(after[0].batting_order).toBe(before[0].batting_order)
  })

  it('an accepted coach can save the lineup', async () => {
    const before = await reset(team.gameId)
    const row = { ...toSlotRow(before[0]), inning_positions: ['1B', 'SS', 'Bench', null, null, null, null, null, null] }
    expect((await writeLineupRows(coach.client, [row])).error).toBeNull()
    expect((await slotsOf(team.gameId))[0].inning_positions[0]).toBe('1B')
  })

  it('a signed-in user from no team cannot write, and nothing changes', async () => {
    const before = await reset(team.gameId)
    const row = { ...toSlotRow(before[0]), inning_positions: ['RF', 'RF', 'RF', null, null, null, null, null, null] }
    const { error } = await writeLineupRows(outsider.client, [row])
    expect(error).not.toBeNull()
    expect((await slotsOf(team.gameId)).map(a => a.inning_positions)).toEqual(before.map(b => b.inning_positions))
  })

  it('another team’s owner cannot write, and nothing changes', async () => {
    const before = await reset(team.gameId)
    const row = { ...toSlotRow(before[0]), inning_positions: ['RF', 'RF', 'RF', null, null, null, null, null, null] }
    const { error } = await writeLineupRows(otherOwner.client, [row])
    expect(error).not.toBeNull()
    expect((await slotsOf(team.gameId)).map(a => a.inning_positions)).toEqual(before.map(b => b.inning_positions))
  })

  it('a batch mixing my row with another team’s row is rejected whole', async () => {
    const before = await reset(team.gameId)
    const theirs = await slotsOf(otherTeam.gameId)
    const mine = { ...toSlotRow(before[0]), inning_positions: ['3B', '3B', '3B', null, null, null, null, null, null] }
    const foreign = { ...toSlotRow(theirs[0]), inning_positions: ['3B', '3B', '3B', null, null, null, null, null, null] }
    const { error } = await writeLineupRows(owner.client, [mine, foreign])
    expect(error).not.toBeNull()
    expect((await slotsOf(team.gameId)).map(a => a.inning_positions)).toEqual(before.map(b => b.inning_positions))
    expect((await slotsOf(otherTeam.gameId)).map(a => a.inning_positions)).toEqual(theirs.map(t => t.inning_positions))
  })

  it('anonymous visitors cannot write', async () => {
    const before = await reset(team.gameId)
    const { error } = await writeLineupRows(anonClient(), [toSlotRow(before[0])])
    expect(error).not.toBeNull()
  })
})
