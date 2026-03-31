import { createServerClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function GamesPage() {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get the active season
  const { data: team } = await supabase
    .from('teams')
    .select('id, name')
    .single()

  const { data: season } = await supabase
    .from('seasons')
    .select('id, name, innings_per_game')
    .eq('team_id', team?.id)
    .eq('is_active', true)
    .single()

  // Get all games for this season
  const { data: games } = await supabase
    .from('games')
    .select('*')
    .eq('season_id', season?.id)
    .order('game_date', { ascending: true })

  const today = new Date().toISOString().split('T')[0]

  const upcoming = games?.filter(g =>
    g.status === 'scheduled' || g.status === 'in_progress'
  ) ?? []

  const recent = games?.filter(g =>
    g.status === 'final'
  ) ?? []

  function statusChip(status: string) {
    const styles: Record<string, { background: string; color: string; label: string }> = {
      scheduled:   { background: 'rgba(245,242,235,0.08)', color: 'rgba(245,242,235,0.5)', label: 'Scheduled' },
      in_progress: { background: 'rgba(232,160,32,0.2)',   color: '#E8A020',               label: 'Live' },
      final:       { background: 'rgba(45,106,53,0.2)',    color: '#6DB875',               label: 'Final' },
    }
    const s = styles[status] ?? styles.scheduled
    return (
      <span style={{
        fontSize: '11px',
        fontWeight: 500,
        padding: '2px 8px',
        borderRadius: '4px',
        background: s.background,
        color: s.color,
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
          background: 'rgba(255,255,255,0.04)',
          border: '0.5px solid rgba(245,242,235,0.1)',
          borderRadius: '10px',
          padding: '14px 16px',
          marginBottom: '8px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
        }}>
          <div>
            <div style={{
              fontSize: '15px',
              fontWeight: 500,
              color: '#F5F2EB',
              marginBottom: '4px',
            }}>
              vs {game.opponent}
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(245,242,235,0.45)' }}>
              {formatted} · {game.location ?? 'TBD'}
              {game.game_time && ` · ${game.game_time.slice(0,5)}`}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {statusChip(game.status)}
            <span style={{ color: 'rgba(245,242,235,0.25)', fontSize: '16px' }}>›</span>
          </div>
        </div>
      </Link>
    )
  }

  return (
    <main style={{
      minHeight: '100vh',
      background: '#0B1F3A',
      color: '#F5F2EB',
      fontFamily: 'sans-serif',
      padding: '1.5rem',
      maxWidth: '480px',
      margin: '0 auto',
    }}>

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.25rem',
      }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700 }}>
          Six<span style={{ color: '#E8A020' }}>43</span>
        </h1>
        <Link href="/dashboard" style={{
          fontSize: '13px',
          color: 'rgba(245,242,235,0.45)',
          textDecoration: 'none',
        }}>
          {team?.name}
        </Link>
      </div>
      <p style={{
        color: 'rgba(245,242,235,0.45)',
        fontSize: '13px',
        marginBottom: '1.5rem',
      }}>
        {season?.name} · {games?.length ?? 0} games
      </p>

      {/* New game button */}
      <Link href="/games/new" style={{ textDecoration: 'none' }}>
        <div style={{
          background: '#E8A020',
          color: '#0B1F3A',
          borderRadius: '8px',
          padding: '12px 16px',
          textAlign: 'center',
          fontWeight: 700,
          fontSize: '14px',
          marginBottom: '1.5rem',
          cursor: 'pointer',
        }}>
          + New game
        </div>
      </Link>

      {/* Upcoming games */}
      {upcoming.length > 0 && (
        <>
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(245,242,235,0.35)',
            marginBottom: '8px',
          }}>
            Upcoming
          </div>
          {upcoming.map(g => <GameCard key={g.id} game={g} />)}
          <div style={{ marginBottom: '1.5rem' }} />
        </>
      )}

      {/* Recent games */}
      {recent.length > 0 && (
        <>
          <div style={{
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(245,242,235,0.35)',
            marginBottom: '8px',
          }}>
            Recent
          </div>
          {recent.map(g => <GameCard key={g.id} game={g} />)}
        </>
      )}

      {/* Empty state */}
      {games?.length === 0 && (
        <div style={{
          textAlign: 'center',
          color: 'rgba(245,242,235,0.35)',
          marginTop: '4rem',
          fontSize: '14px',
        }}>
          No games yet — create your first one above.
        </div>
      )}

    </main>
  )
}