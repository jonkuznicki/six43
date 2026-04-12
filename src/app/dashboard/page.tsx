import { createServerClient } from '../../lib/supabase-server'
import { createServiceClient } from '../../lib/supabase-service'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { formatTime } from '../../lib/formatTime'
import TeamSelect from '../games/TeamSelect'

export const dynamic = 'force-dynamic'

function parseRecord(games: any[]): { w: number; l: number } {
  let w = 0, l = 0
  for (const game of games) {
    if (game.status !== 'final') continue
    try {
      const box = JSON.parse(game.notes ?? '{}')._box
      if (!box) continue
      const us   = (box.us   ?? []).reduce((a: number, v: number | null) => a + (v ?? 0), 0)
      const them = (box.them ?? []).reduce((a: number, v: number | null) => a + (v ?? 0), 0)
      if (us > them) w++
      else if (them > us) l++
    } catch {}
  }
  return { w, l }
}

function getBoxScore(game: any): { us: number; them: number } | null {
  try {
    const box = JSON.parse(game.notes ?? '{}')._box
    if (!box) return null
    return {
      us:   (box.us   ?? []).reduce((a: number, v: number | null) => a + (v ?? 0), 0),
      them: (box.them ?? []).reduce((a: number, v: number | null) => a + (v ?? 0), 0),
    }
  } catch { return null }
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: { teamId?: string }
}) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Auto-accept any pending email invites for this user.
  // Runs on every dashboard load so existing users who were invited
  // after their last sign-in get accepted without needing to sign out/in.
  if (user.email) {
    const service = createServiceClient()
    const { data: pending } = await service
      .from('team_members')
      .select('id')
      .eq('invite_email', user.email)
      .is('accepted_at', null)
    if (pending && pending.length > 0) {
      await service.from('team_members').update({
        user_id: user.id,
        accepted_at: new Date().toISOString(),
        email: user.email,
      }).in('id', pending.map((r: any) => r.id))
    }
  }

  const { data: allTeams } = await supabase
    .from('teams')
    .select('id, name, is_active')
    .order('created_at')

  const teams = (allTeams ?? []).filter((t: any) => t.is_active !== false)

  const cookieStore = await cookies()
  const cookieTeamId = cookieStore.get('selected_team_id')?.value ?? null

  const selectedTeamId =
    (searchParams.teamId && teams.find((t: any) => t.id === searchParams.teamId))
      ? searchParams.teamId
      : (cookieTeamId && teams.find((t: any) => t.id === cookieTeamId))
        ? cookieTeamId
        : teams[0]?.id ?? null

  const selectedTeam = teams.find((t: any) => t.id === selectedTeamId) ?? null

  let seasonQuery = supabase
    .from('seasons')
    .select('id, name, innings_per_game')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)

  if (selectedTeamId) seasonQuery = (seasonQuery as any).eq('team_id', selectedTeamId)

  const { data: season } = await seasonQuery.maybeSingle()

  const { data: games } = season ? await supabase
    .from('games')
    .select('id, opponent, game_date, game_time, location, status, notes')
    .eq('season_id', season.id)
    .order('game_date', { ascending: true }) : { data: [] }

  const today = new Date().toISOString().split('T')[0]
  const nextGame = (games ?? []).find((g: any) => (g.status === 'scheduled' || g.status === 'lineup_ready') && g.game_date >= today)
  const recentGames = [...(games ?? [])].filter((g: any) => g.status === 'final').reverse().slice(0, 3)
  const record = parseRecord(games ?? [])
  const upcomingCount = (games ?? []).filter((g: any) => g.status === 'scheduled').length

  const { count: rosterCount } = season ? await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', season.id)
    .eq('status', 'active') : { count: 0 }

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '480px', margin: '0 auto',
      padding: '1.5rem 1.5rem 6rem',
    }}>

      {/* Header */}
      <div style={{ marginBottom: '0.25rem' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.5px', marginBottom: '2px' }}>
          Six<span style={{ color: 'var(--accent)' }}>43</span>
        </h1>
        {season && (
          <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`, marginBottom: '1rem' }}>
            {season.name}
          </div>
        )}
      </div>

      {/* Team selector (only shown when multiple teams) */}
      <TeamSelect teams={teams} selectedTeamId={selectedTeamId} basePath="/dashboard" />

      {!season && teams.length > 0 && (
        <Link href="/settings" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>
          No active season — set one up in Team Settings →
        </Link>
      )}

      {!season && teams.length === 0 && (
        <Link href="/settings" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>
          Get started — set up your team →
        </Link>
      )}

      {/* Next game */}
      {nextGame ? (
        <Link href={`/games/${nextGame.id}`} style={{ textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(232,160,32,0.14), rgba(232,160,32,0.04))',
            border: '0.5px solid rgba(232,160,32,0.35)',
            borderRadius: '14px', padding: '16px 18px',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '6px' }}>
              Next game
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px', letterSpacing: '-0.5px' }}>
              vs {nextGame.opponent}
            </div>
            <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.55)` }}>
              {formatDate(nextGame.game_date)}
              {nextGame.location ? ` · ${nextGame.location}` : ''}
              {nextGame.game_time ? ` · ${formatTime(nextGame.game_time)}` : ''}
            </div>
          </div>
        </Link>
      ) : season ? (
        <Link href={`/games/new${selectedTeamId ? `?teamId=${selectedTeamId}` : ''}`} style={{ textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>
          <div style={{
            background: 'var(--bg-card)', border: '0.5px dashed var(--border-strong)',
            borderRadius: '14px', padding: '20px 18px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '6px' }}>
              No upcoming games
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent)' }}>
              + Schedule a game
            </div>
          </div>
        </Link>
      ) : null}

      {/* Stats row */}
      {season && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem' }}>
          {[
            { label: 'Record',   value: `${record.w}–${record.l}` },
            { label: 'Upcoming', value: upcomingCount },
            { label: 'Players',  value: rosterCount ?? 0 },
          ].map(s => (
            <div key={s.label} style={{
              flex: 1, background: 'var(--bg-card)', border: '0.5px solid var(--border)',
              borderRadius: '10px', padding: '12px 14px',
            }}>
              <div style={{ fontSize: '20px', fontWeight: 800 }}>{s.value}</div>
              <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '2px',
                textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '1.5rem' }}>
        {[
          { href: `/games/new${selectedTeamId ? `?teamId=${selectedTeamId}` : ''}`, label: '+ New game',       sub: 'Schedule a game' },
          { href: `/roster${season ? `?seasonId=${season.id}` : ''}`,               label: '👥 Roster',        sub: `${rosterCount ?? 0} active players` },
          { href: '/fairness',                                                        label: '📊 Playing time',  sub: 'Season fairness' },
          { href: '/settings',                                                        label: '⚙️ Team Settings', sub: 'Team & season' },
        ].map(a => (
          <a key={a.href} href={a.href} style={{
            textDecoration: 'none', background: 'var(--bg-card)',
            border: '0.5px solid var(--border)', borderRadius: '10px',
            padding: '12px 14px', display: 'block',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)', marginBottom: '2px' }}>{a.label}</div>
            <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)` }}>{a.sub}</div>
          </a>
        ))}
      </div>

      {/* Recent results */}
      {recentGames.length > 0 && (
        <>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '8px' }}>
            Recent results
          </div>
          {recentGames.map((game: any) => {
            const score = getBoxScore(game)
            const won = score ? score.us > score.them : null
            return (
              <Link key={game.id} href={`/games/${game.id}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'var(--bg-card)', border: '0.5px solid var(--border)',
                  borderRadius: '10px', padding: '12px 14px', marginBottom: '6px',
                }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '2px' }}>
                      vs {game.opponent}
                    </div>
                    <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)` }}>
                      {formatDate(game.game_date)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {score ? (
                      <>
                        <div style={{ fontSize: '16px', fontWeight: 800,
                          color: won ? '#6DB875' : '#E87060' }}>
                          {score.us}–{score.them}
                        </div>
                        <div style={{ fontSize: '10px', fontWeight: 700,
                          color: won ? '#6DB875' : '#E87060' }}>
                          {won ? 'W' : score.us === score.them ? 'T' : 'L'}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.3)` }}>Final</div>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </>
      )}
    </main>
  )
}
