import { createServerClient } from '../../../../lib/supabase-server'
import { redirect } from 'next/navigation'
import InGameView from './InGameView'

export default async function InGamePage({ params }: { params: { id: string } }) {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: game } = await supabase
    .from('games')
    .select('*, season:seasons(innings_per_game, team_id, team:teams(name, positions, user_id))')
    .eq('id', params.id)
    .single()

  if (!game) redirect('/games')

  const { data: slots } = await supabase
    .from('lineup_slots')
    .select('*, player:players(first_name, last_name, jersey_number)')
    .eq('game_id', params.id)
    .order('batting_order', { ascending: true, nullsFirst: false })

  // Check if this user is an owner/editor or read-only
  let isOwner = false
  const team = (game as any)?.season?.team
  if (team?.user_id === user.id) {
    isOwner = true
  } else if ((game as any)?.season?.team_id) {
    const { data: membership } = await supabase
      .from('team_members')
      .select('role')
      .eq('team_id', (game as any).season.team_id)
      .eq('user_id', user.id)
      .maybeSingle()
    if (membership?.role === 'owner') isOwner = true
  }

  const inningCount = (game as any).innings_played ?? (game as any).season?.innings_per_game ?? 6
  const teamName = team?.name ?? 'Us'
  const activeSlots = (slots ?? []).filter((s: any) => s.availability !== 'absent')

  return (
    <InGameView
      game={game}
      slots={activeSlots}
      inningCount={inningCount}
      teamName={teamName}
      isOwner={isOwner}
    />
  )
}
