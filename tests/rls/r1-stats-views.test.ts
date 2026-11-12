/**
 * R1: season_position_stats and game_inning_validation must not leak one team's
 * data to anonymous visitors or to users from another team, while owners and
 * accepted coaches keep full access to their own team.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addAcceptedCoach, anonClient, createTeamWithGame, createUser, deleteUsers,
  type TeamFixture, type TestUser,
} from './helpers'

let ownerA: TestUser, coachA: TestUser, ownerB: TestUser, outsider: TestUser
let teamA: TeamFixture, teamB: TeamFixture

beforeAll(async () => {
  ownerA = await createUser('owner-a')
  coachA = await createUser('coach-a')
  ownerB = await createUser('owner-b')
  outsider = await createUser('outsider')        // signed in, belongs to no team
  teamA = await createTeamWithGame(ownerA.id, 'RLS-Hawks')
  teamB = await createTeamWithGame(ownerB.id, 'RLS-Owls')
  await addAcceptedCoach(teamA.teamId, ownerA.id, coachA)
})

afterAll(async () => {
  await deleteUsers([ownerA, coachA, ownerB, outsider])
})

const stats = (c: TestUser['client'], seasonId: string) =>
  c.from('season_position_stats').select('player_id, first_name, innings_total').eq('season_id', seasonId)
const validation = (c: TestUser['client'], gameId: string) =>
  c.from('game_inning_validation').select('game_id, inning_num, position, player_count').eq('game_id', gameId)

describe('R1 season_position_stats', () => {
  it('owner sees their own team stats', async () => {
    const { data, error } = await stats(ownerA.client, teamA.seasonId)
    expect(error).toBeNull()
    expect(data?.map(r => r.first_name).sort()).toEqual([...teamA.playerNames].sort())
  })

  it('accepted coach sees the team they coach', async () => {
    const { data, error } = await stats(coachA.client, teamA.seasonId)
    expect(error).toBeNull()
    expect(data).toHaveLength(2)
  })

  it("another team's owner cannot see this team's players", async () => {
    const { data } = await stats(ownerB.client, teamA.seasonId)
    expect(data ?? []).toHaveLength(0)
  })

  it('a signed-in user with no team sees nothing', async () => {
    const { data } = await outsider.client.from('season_position_stats').select('player_id')
    expect(data ?? []).toHaveLength(0)
  })

  it('anonymous visitors see nothing (no filter at all)', async () => {
    const { data } = await anonClient().from('season_position_stats').select('player_id, first_name')
    expect(data ?? []).toHaveLength(0)
  })
})

describe('R1 game_inning_validation', () => {
  it('owner sees validation rows for their own game', async () => {
    const { data, error } = await validation(ownerA.client, teamA.gameId)
    expect(error).toBeNull()
    expect((data ?? []).length).toBeGreaterThan(0)
  })

  it('accepted coach sees validation rows for the team they coach', async () => {
    const { data } = await validation(coachA.client, teamA.gameId)
    expect((data ?? []).length).toBeGreaterThan(0)
  })

  it("another team's owner cannot see this team's game", async () => {
    const { data } = await validation(ownerB.client, teamA.gameId)
    expect(data ?? []).toHaveLength(0)
  })

  it('anonymous visitors see nothing', async () => {
    const { data } = await anonClient().from('game_inning_validation').select('game_id')
    expect(data ?? []).toHaveLength(0)
  })
})
