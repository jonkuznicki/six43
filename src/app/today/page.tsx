import { redirect } from 'next/navigation'
import { createServerClient } from '../../lib/supabase-server'

// Redirects to the next upcoming (non-final) game for the user's active season.
// Used by the PWA home screen shortcut so coaches can jump straight to game day.
export default async function TodayPage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().split('T')[0]

  // Respect the selected_team cookie if present
  const { data: allTeams } = await supabase
    .from('teams')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)

  const teamIds = (allTeams ?? []).map((t: any) => t.id)
  if (!teamIds.length) redirect('/games')

  // Active season for the team(s)
  const { data: seasons } = await supabase
    .from('seasons')
    .select('id')
    .in('team_id', teamIds)
    .eq('is_active', true)
    .limit(1)

  const seasonId = seasons?.[0]?.id
  if (!seasonId) redirect('/games')

  // Next non-final game on or after today
  const { data: games } = await supabase
    .from('games')
    .select('id')
    .eq('season_id', seasonId)
    .neq('status', 'final')
    .gte('game_date', today)
    .order('game_date', { ascending: true })
    .limit(1)

  const game = games?.[0]
  if (!game) redirect('/games')

  redirect(`/games/${game.id}`)
}
