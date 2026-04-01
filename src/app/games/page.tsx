import { createServerClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import TeamSelect from './TeamSelect'

export default async function GamesPage({
  searchParams,
}: {
  searchParams: { teamId?: string }
}) {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch only active teams for this user
  const { data: allTeams } = await supabase
    .from('teams')
    .select('id, name, is_active')
    .order('created_at')

  const teams = (allTeams ?? []).filter(t => t.is_active !== false)

  // Resolve selected team from URL param, or default to first
  const selectedTeamId = (searchParams.teamId && teams.find(t => t.id === searchParams.teamId))
    ? searchParams.teamId
    : teams[0]?.id ?? null

  const selectedTeam = teams.find(t => t.id === selectedTeamId) ?? null

  // Get active season scoped to the selected team
  const { data: season } = selectedTeamId ? await supabase
    .from('seasons')
    .select('id, name, innings_per_game')
    .eq('team_id', selectedTeamId)
    .eq('is_active', true)
    .maybeSingle() : { data: null }

  // Get all games for this season
  const { data: games } = season ? await supabase
    .from('games')
    .select('*')
    .eq('season_id', season.id)
    .order('game_date', { ascending: true }) : { data: [] }

  const upcoming = (games ?? []).filter(g =>
    g.status === 'scheduled' || g.status === 'in_progress'
  )
  const recent = (games ?? []).filter(g => g.status === 'final')

  function statusChip(status: string) {
    const styles: Record<string, { background: string; color: string; label: string }> = {
      scheduled:   { background: 'var(--bg-card)', color: `rgba(var(--fg-rgb), 0.5)`, label: 'Scheduled' },
      in_progress: { background: 'rgba(232,160,32,0.2)',   color: '#E8A020',           label: 'Live' },
      final:       { background: 'rgba(45,106,53,0.2)',    color: '#6DB875',           label: 'Final' },
    }
    const s = styles[status] ?? styles.scheduled
    return (
      <span style={{
        fontSize: '11px', fontWeight: 500, padding: '2px 8px',
        borderRadius: '4px', background: s.background, color: s.color,
      }}>
        {s.label}
      </span>
    )
  }

  function GameCard({ game }: { game: any }) {
    const date = new Date(game.game_date + 'T12:00:00')
    const formatted = date.toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    })
    return (
      <Link href={`/games/${game.id}`} style={{ textDecoration: 'none' }}>
        <div style={{
          background: 'var(--bg-card)', border: '0.5px solid var(--border)',
          borderRadius: '10px', padding: '14px 16px', marginBottom: '8px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--fg)', marginBottom: '4px' }}>
              vs {game.opponent}
            </div>
            <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.45)` }}>
              {formatted} · {game.location ?? 'TBD'}
              {game.game_time && ` · ${game.game_time.slice(0, 5)}`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {statusChip(game.status)}
            <span style={{ color: `rgba(var(--fg-rgb), 0.25)`, fontSize: '16px' }}>›</span>
          </div>
        </div>
      </Link>
    )
  }

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', padding: '1.5rem 1.5rem 6rem',
      maxWidth: '480px', margin: '0 auto',
    }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700 }}>
          Six<span style={{ color: 'var(--accent)' }}>43</span>
        </h1>
        {season && (
          <span style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)` }}>
            {season.name}
          </span>
        )}
      </div>

      {/* Team switcher dropdown — only shown when multiple active teams */}
      <TeamSelect teams={teams} selectedTeamId={selectedTeamId} />

      {teams.length === 1 && (
        <p style={{ color: `rgba(var(--fg-rgb), 0.45)`, fontSize: '13px', marginBottom: '1.5rem' }}>
          {selectedTeam?.name} · {games?.length ?? 0} games
        </p>
      )}

      {/* No teams */}
      {teams.length === 0 && (
        <div style={{ textAlign: 'center', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '4rem', fontSize: '14px' }}>
          No teams yet.{' '}
          <Link href="/settings" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
            Set one up in Settings →
          </Link>
        </div>
      )}

      {teams.length > 0 && (
        <>
          {/* No active season for this team */}
          {!season && (
            <div style={{
              fontSize: '13px', color: '#E87060', background: 'rgba(192,57,43,0.10)',
              border: '0.5px solid rgba(192,57,43,0.25)', borderRadius: '8px',
              padding: '12px 14px', marginBottom: '1.25rem',
            }}>
              No active season for {selectedTeam?.name}.{' '}
              <Link href="/settings" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                Set one up in Settings →
              </Link>
            </div>
          )}

          {/* New game + Playing time buttons */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '1.5rem' }}>
            <Link
              href={`/games/new${selectedTeamId ? `?teamId=${selectedTeamId}` : ''}`}
              style={{ textDecoration: 'none', flex: 1 }}
            >
              <div style={{
                background: 'var(--accent)', color: 'var(--accent-text)', borderRadius: '8px',
                padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '14px',
              }}>+ New game</div>
            </Link>
            <Link href="/fairness" style={{ textDecoration: 'none' }}>
              <div style={{
                background: 'var(--bg-card)', color: `rgba(var(--fg-rgb), 0.7)`,
                borderRadius: '8px', padding: '12px 16px', textAlign: 'center',
                fontSize: '13px', border: '0.5px solid var(--border-md)', whiteSpace: 'nowrap',
              }}>Playing time</div>
            </Link>
          </div>

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <>
              <div style={{
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '8px',
              }}>
                Upcoming
              </div>
              {upcoming.map(g => <GameCard key={g.id} game={g} />)}
              <div style={{ marginBottom: '1.5rem' }} />
            </>
          )}

          {/* Recent */}
          {recent.length > 0 && (
            <>
              <div style={{
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
                textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '8px',
              }}>
                Recent
              </div>
              {recent.map(g => <GameCard key={g.id} game={g} />)}
            </>
          )}

          {season && games?.length === 0 && (
            <div style={{ textAlign: 'center', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '4rem', fontSize: '14px' }}>
              No games yet — create your first one above.
            </div>
          )}
        </>
      )}
    </main>
  )
}
