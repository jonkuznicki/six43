import { NextResponse } from 'next/server'
import { createServerClient } from '../../../../lib/supabase-server'

export async function POST(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { placeholder_id, real_game_id } = await request.json()
  if (!placeholder_id || !real_game_id) {
    return NextResponse.json({ error: 'placeholder_id and real_game_id are required' }, { status: 400 })
  }

  // Load both games (RLS ensures ownership)
  const { data: placeholder } = await supabase
    .from('games')
    .select('id, is_placeholder, tournament_id, game_type, notes, season_id')
    .eq('id', placeholder_id)
    .single()

  if (!placeholder?.is_placeholder) {
    return NextResponse.json({ error: 'Not a placeholder game' }, { status: 400 })
  }

  const { data: realGame } = await supabase
    .from('games')
    .select('id, notes, season_id')
    .eq('id', real_game_id)
    .single()

  if (!realGame) {
    return NextResponse.json({ error: 'Game not found' }, { status: 404 })
  }

  if (placeholder.season_id !== realGame.season_id) {
    return NextResponse.json({ error: 'Games must be in the same season' }, { status: 400 })
  }

  // Merge notes: carry placeholder notes into real game
  let mergedNotes = realGame.notes ?? null
  if (placeholder.notes) {
    try {
      const realObj = JSON.parse(realGame.notes ?? '{}')
      const phObj  = JSON.parse(placeholder.notes ?? '{}')
      // Real game data wins; placeholder data fills in any gaps
      mergedNotes = JSON.stringify({ ...phObj, ...realObj })
    } catch {
      mergedNotes = [realGame.notes, placeholder.notes].filter(Boolean).join('\n') || null
    }
  }

  // 1. Update real game with tournament context + merged notes
  const { error: updateErr } = await supabase
    .from('games')
    .update({
      tournament_id: placeholder.tournament_id,
      game_type:     placeholder.game_type,
      notes:         mergedNotes,
    })
    .eq('id', real_game_id)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // 2. Clear any auto-created empty slots on the real game so re-point won't conflict
  await supabase.from('lineup_slots').delete().eq('game_id', real_game_id)

  // 3. Re-point lineup_slots and pitcher_plans from placeholder → real game
  await supabase.from('lineup_slots').update({ game_id: real_game_id }).eq('game_id', placeholder_id)
  await supabase.from('pitcher_plans').update({ game_id: real_game_id }).eq('game_id', placeholder_id)

  // 4. Delete placeholder (cascades any leftover rows)
  await supabase.from('games').delete().eq('id', placeholder_id)

  return NextResponse.json({ success: true, game_id: real_game_id })
}
