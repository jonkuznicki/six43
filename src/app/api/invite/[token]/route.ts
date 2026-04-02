import { NextResponse } from 'next/server'
import { createServiceClient } from '../../../../lib/supabase-service'

// GET /api/invite/[token] — returns public invite info (team name)
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const supabase = createServiceClient()

  const { data: invite } = await supabase
    .from('team_members')
    .select('id, team_id, accepted_at, teams(name)')
    .eq('invite_token', params.token)
    .is('accepted_at', null)
    .single()

  if (!invite) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  return NextResponse.json({
    team_name: (invite as any).teams?.name ?? 'Unknown team',
  })
}

// POST /api/invite/[token]/accept — accepts the invite for a logged-in user
// Handled in the sub-route file below
