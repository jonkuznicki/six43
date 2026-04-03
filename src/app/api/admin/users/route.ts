import { NextResponse } from 'next/server'
import { createServerClient } from '../../../../lib/supabase-server'
import { createServiceClient } from '../../../../lib/supabase-service'

export async function GET() {
  // Verify admin
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail || !user || user.email !== adminEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const service = createServiceClient()

  // Fetch all auth users
  const { data: authData, error: authError } = await service.auth.admin.listUsers({ perPage: 1000 })
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  // Fetch all user_plans
  const { data: plans } = await service.from('user_plans').select('*')
  const planMap: Record<string, any> = {}
  for (const p of plans ?? []) planMap[p.user_id] = p

  // Fetch all teams → seasons → game counts in bulk
  const { data: allTeams } = await service.from('teams').select('id, user_id')
  const { data: allSeasons } = await service.from('seasons').select('id, team_id')
  const { data: allGames } = await service.from('games').select('id, season_id')

  // Build season_id → team_id → user_id maps
  const seasonToTeam: Record<string, string> = {}
  for (const s of allSeasons ?? []) seasonToTeam[s.id] = s.team_id

  const teamToUser: Record<string, string> = {}
  for (const t of allTeams ?? []) teamToUser[t.id] = t.user_id

  // Count games per user
  const gameCountMap: Record<string, number> = {}
  for (const g of allGames ?? []) {
    const teamId = seasonToTeam[g.season_id]
    const userId = teamId ? teamToUser[teamId] : null
    if (userId) gameCountMap[userId] = (gameCountMap[userId] ?? 0) + 1
  }

  const users = authData.users.map(u => ({
    id: u.id,
    email: u.email ?? '',
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
    plan: planMap[u.id]?.plan ?? 'free',
    plan_updated_at: planMap[u.id]?.updated_at ?? null,
    plan_notes: planMap[u.id]?.notes ?? null,
    game_count: gameCountMap[u.id] ?? 0,
  }))

  // Sort: at-limit free users first (hottest leads), then pro, then rest by join date
  users.sort((a, b) => {
    const aAtLimit = a.plan === 'free' && a.game_count >= 3
    const bAtLimit = b.plan === 'free' && b.game_count >= 3
    if (aAtLimit !== bAtLimit) return aAtLimit ? -1 : 1
    if (a.plan !== b.plan) return a.plan === 'pro' ? -1 : 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return NextResponse.json({ users })
}
