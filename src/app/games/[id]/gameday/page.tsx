import { createServerClient } from '../../../../lib/supabase-server'
import { redirect } from 'next/navigation'
import GameDayView from './GameDayView'

export default async function GameDayPage({ params }: { params: { id: string } }) {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: game } = await supabase
    .from('games')
    .select('*, season:seasons(team:teams(name))')
    .eq('id', params.id)
    .single()

  if (!game) redirect('/games')

  const { data: slots } = await supabase
    .from('lineup_slots')
    .select('*, player:players(first_name, last_name, jersey_number)')
    .eq('game_id', params.id)
    .order('batting_order', { ascending: true, nullsFirst: false })

  const inningCount = game.innings_played ?? 6
  const teamName = (game as any)?.season?.team?.name ?? 'Us'
  const activeSlots = (slots ?? []).filter((s: any) => s.availability !== 'absent')

  return (
    <GameDayView
      game={game}
      slots={activeSlots}
      inningCount={inningCount}
      teamName={teamName}
    />
  )
}
