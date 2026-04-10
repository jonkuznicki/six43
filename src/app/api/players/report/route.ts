import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '../../../../lib/supabase-service'
import { createServerClient } from '../../../../lib/supabase-server'

const anthropic = new Anthropic()

export async function POST(req: Request) {
  // Auth check
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const { playerId, seasonId } = await req.json()
  if (!playerId || !seasonId) return NextResponse.json({ error: 'Missing playerId or seasonId' }, { status: 400 })

  const service = createServiceClient()

  // Verify the user has access to this player
  const { data: player } = await service
    .from('players')
    .select('id, first_name, last_name, jersey_number, primary_position, season_id, seasons(name, innings_per_game, team_id, teams(name))')
    .eq('id', playerId)
    .eq('season_id', seasonId)
    .single()

  if (!player) return NextResponse.json({ error: 'Player not found' }, { status: 404 })

  const season = (player as any).seasons
  const team = season?.teams

  // Verify user owns or is a member of this team
  const teamId = season?.team_id
  const { data: ownedTeam } = await service.from('teams').select('id').eq('id', teamId).eq('user_id', user.id).maybeSingle()
  const { data: membership } = await service.from('team_members').select('id').eq('team_id', teamId).eq('user_id', user.id).not('accepted_at', 'is', null).maybeSingle()
  if (!ownedTeam && !membership) return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  // Fetch coach notes for this player this season
  const { data: notes } = await service
    .from('player_eval_notes')
    .select('note_date, body')
    .eq('player_id', playerId)
    .eq('season_id', seasonId)
    .order('note_date', { ascending: true })

  // Fetch season game stats from lineup slots
  const { data: slots } = await service
    .from('lineup_slots')
    .select('inning_positions, availability, game:games(game_date, status, innings_played)')
    .eq('player_id', playerId)
    .eq('season_id', seasonId)

  // Compute stats
  const inningCount = season?.innings_per_game ?? 6
  const finalSlots = (slots ?? []).filter((s: any) => s.game?.status === 'final')
  const gamesPlayed = finalSlots.filter((s: any) => s.availability !== 'absent').length
  const totalGames = finalSlots.length

  const positionCounts: Record<string, number> = {}
  let totalInningsPlayed = 0
  let totalInningsBenched = 0
  let pitchingAppearances = 0

  for (const slot of finalSlots) {
    if (slot.availability === 'absent') continue
    const positions: (string | null)[] = slot.inning_positions ?? []
    const gameInnings = (slot.game as any)?.innings_played ?? inningCount
    const relevant = positions.slice(0, gameInnings)
    let pitchedThisGame = false
    for (const pos of relevant) {
      if (!pos) continue
      if (pos === 'Bench') {
        totalInningsBenched++
      } else {
        totalInningsPlayed++
        positionCounts[pos] = (positionCounts[pos] ?? 0) + 1
        if (pos === 'P') pitchedThisGame = true
      }
    }
    if (pitchedThisGame) pitchingAppearances++
  }

  const topPositions = Object.entries(positionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([pos, count]) => `${pos} (${count} inn)`)
    .join(', ')

  // Build the prompt
  const statsBlock = [
    `Team: ${team?.name ?? 'Unknown'}`,
    `Season: ${season?.name ?? 'Unknown'}`,
    `Games played: ${gamesPlayed} of ${totalGames}`,
    `Innings played: ${totalInningsPlayed}`,
    `Innings benched: ${totalInningsBenched}`,
    topPositions ? `Positions: ${topPositions}` : null,
    pitchingAppearances > 0 ? `Pitching appearances: ${pitchingAppearances}` : null,
  ].filter(Boolean).join('\n')

  const notesBlock = notes?.length
    ? notes.map((n: any) => `- ${n.note_date}: ${n.body}`).join('\n')
    : 'No notes recorded this season.'

  const prompt = `You are helping a youth baseball coach write a warm, encouraging end-of-season player evaluation to share with a player's family.

Player: ${player.first_name} ${player.last_name}, #${player.jersey_number}${player.primary_position ? `, primary position: ${player.primary_position}` : ''}

Season statistics:
${statsBlock}

Coach's notes from the season:
${notesBlock}

Write a 2–3 paragraph player evaluation suitable for sharing with the player's parents. Be encouraging, honest, and specific. Reference the actual stats and notes where relevant. Focus on what the player did well, areas where they grew or can continue to develop, and something that makes this player stand out as an individual. Use a warm, personal tone appropriate for youth sports. Do not use bullet points — write in flowing paragraphs.`

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-6',
    max_tokens: 600,
    messages: [{ role: 'user', content: prompt }],
  })

  const report = (message.content[0] as any).text

  return NextResponse.json({ report })
}
