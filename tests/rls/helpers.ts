/**
 * Helpers for database security tests.
 *
 * SAFETY: these helpers create and delete users and data. They refuse to run
 * against anything except a local Supabase stack (127.0.0.1 / localhost), so a
 * misconfigured environment can never point them at production.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

export function assertLocal() {
  let host = ''
  try { host = new URL(url).hostname } catch { /* empty */ }
  if (!['127.0.0.1', 'localhost'].includes(host)) {
    throw new Error(
      `RLS tests only run against a LOCAL Supabase stack. NEXT_PUBLIC_SUPABASE_URL host is "${host || '(unset)'}".`,
    )
  }
  if (!anonKey || !serviceKey) throw new Error('Missing local anon/service keys (see README: .env.local).')
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } }

/** Service-role client: bypasses RLS. Used ONLY to build and tear down fixtures. */
export function serviceClient(): SupabaseClient {
  assertLocal()
  return createClient(url, serviceKey, opts)
}

/** Anonymous visitor: public anon key, no session. */
export function anonClient(): SupabaseClient {
  assertLocal()
  return createClient(url, anonKey, opts)
}

const PASSWORD = 'rls-test-password-1'
const RUN = Math.random().toString(36).slice(2, 8)

export interface TestUser { id: string; email: string; client: SupabaseClient }

/** Creates a confirmed synthetic user and returns a client signed in as that user. */
export async function createUser(label: string): Promise<TestUser> {
  const svc = serviceClient()
  const email = `rls-${label}-${RUN}@example.test`
  const { data, error } = await svc.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser ${label}: ${error?.message}`)
  const client = createClient(url, anonKey, opts)
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password: PASSWORD })
  if (signInErr) throw new Error(`signIn ${label}: ${signInErr.message}`)
  return { id: data.user.id, email, client }
}

/** Deletes synthetic users. Their teams, seasons, players, games and lineups cascade. */
export async function deleteUsers(users: (TestUser | undefined)[]) {
  const svc = serviceClient()
  for (const u of users) if (u) await svc.auth.admin.deleteUser(u.id)
}

export interface TeamFixture {
  teamId: string
  seasonId: string
  gameId: string
  playerIds: string[]
  playerNames: string[]
}

/**
 * One team with one season, two players and one FINAL game whose lineup puts the
 * players in the field (so both views return rows). Synthetic data only.
 */
export async function createTeamWithGame(ownerId: string, teamName: string): Promise<TeamFixture> {
  const svc = serviceClient()
  const one = async (q: PromiseLike<{ data: any; error: any }>, what: string) => {
    const { data, error } = await q
    if (error) throw new Error(`${what}: ${error.message}`)
    return data
  }
  const team = await one(svc.from('teams').insert({ user_id: ownerId, name: teamName }).select('id').single(), 'team')
  const season = await one(
    svc.from('seasons').insert({ team_id: team.id, name: `${teamName} 2026`, is_active: true }).select('id').single(),
    'season',
  )
  const names = [`${teamName}-PlayerOne`, `${teamName}-PlayerTwo`]
  const players = await one(
    svc.from('players').insert(
      names.map((first, i) => ({ team_id: team.id, season_id: season.id, first_name: first, last_name: 'Synthetic', jersey_number: 10 + i })),
    ).select('id'),
    'players',
  )
  const game = await one(
    svc.from('games').insert({
      season_id: season.id, opponent: 'Synthetic Opponents', game_date: '2026-05-01', status: 'final', innings_played: 3,
    }).select('id').single(),
    'game',
  )
  await one(
    svc.from('lineup_slots').insert([
      { game_id: game.id, player_id: players[0].id, inning_positions: ['P', 'SS', 'Bench'] },
      { game_id: game.id, player_id: players[1].id, inning_positions: ['C', 'Bench', 'CF'] },
    ]).select('id'),
    'lineup_slots',
  )
  return { teamId: team.id, seasonId: season.id, gameId: game.id, playerIds: players.map((p: any) => p.id), playerNames: names }
}

/** Accepted coach membership (how invited coaches get access to a team). */
export async function addAcceptedCoach(teamId: string, ownerId: string, coach: TestUser) {
  const { error } = await serviceClient().from('team_members').insert({
    team_id: teamId, owner_user_id: ownerId, user_id: coach.id, invite_email: coach.email,
    role: 'coach', accepted_at: new Date().toISOString(),
  })
  if (error) throw new Error(`team_members: ${error.message}`)
}
