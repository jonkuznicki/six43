import { createServerClient } from '../../../lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import SwapButton from './SwapButton'
import AddSlotButtons from './AddSlotButtons'
import HowItWorks from './HowItWorks'
import DeleteTournamentButton from './DeleteTournamentButton'
import { formatTime } from '../../../lib/formatTime'

export const dynamic = 'force-dynamic'

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function formatDateRange(start: string, end: string) {
  if (start === end) return formatDate(start)
  const s = new Date(start + 'T12:00:00')
  const e = new Date(end   + 'T12:00:00')
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
  return `${s.toLocaleDateString('en-US', opts)} – ${e.toLocaleDateString('en-US', { ...opts, year: 'numeric' })}`
}

export default async function TournamentPage({ params }: { params: { id: string } }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*, season:seasons(id, innings_per_game, team:teams(name))')
    .eq('id', params.id)
    .single()

  if (!tournament) redirect('/games')

  const { data: games } = await supabase
    .from('games')
    .select('*')
    .eq('tournament_id', params.id)
    .order('game_type', { ascending: false, nullsFirst: false })
    .order('game_date', { ascending: true })
    .order('game_time', { ascending: true, nullsFirst: false })

  const today       = new Date().toISOString().split('T')[0]
  const seasonId    = (tournament.season as any)?.id ?? tournament.season_id
  const inningsPG   = (tournament.season as any)?.innings_per_game ?? 6
  const poolGames   = (games ?? []).filter((g: any) => g.game_type === 'pool_play')
  const bracketGames = (games ?? []).filter((g: any) => g.game_type === 'bracket')

  function GameRow({ game }: { game: any }) {
    const isPlaceholder = game.is_placeholder
    const isStale = isPlaceholder && game.game_date < today
    const isFinal = game.status === 'final'

    return (
      <div style={{
        background: 'var(--bg-card)',
        border: isPlaceholder
          ? `1px dashed ${isStale ? 'rgba(232,112,96,0.45)' : 'rgba(var(--fg-rgb), 0.18)'}`
          : '0.5px solid var(--border)',
        borderRadius: '10px', padding: '14px 16px', marginBottom: '8px',
        opacity: isFinal ? 0.7 : 1,
      }}>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
          marginBottom: isPlaceholder ? '10px' : 0 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '15px', fontWeight: 600 }}>
                {isPlaceholder ? game.opponent : `vs ${game.opponent}`}
              </span>
              {isPlaceholder && (
                <span style={{
                  fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '20px',
                  background: isStale ? 'rgba(232,112,96,0.1)' : 'rgba(var(--fg-rgb),0.06)',
                  color: isStale ? '#E87060' : `rgba(var(--fg-rgb), 0.4)`,
                  border: `0.5px solid ${isStale ? 'rgba(232,112,96,0.3)' : 'rgba(var(--fg-rgb), 0.15)'}`,
                }}>
                  {isStale ? 'Needs swap' : 'TBD'}
                </span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.45)` }}>
              {formatDate(game.game_date)}
              {game.game_time ? ` · ${formatTime(game.game_time)}` : ''}
              {game.location ? ` · ${game.location}` : ''}
            </div>
          </div>
          {isPlaceholder ? (
            <Link href={`/games/${game.id}`} style={{
              fontSize: '12px', color: `rgba(var(--fg-rgb), 0.5)`, textDecoration: 'none',
              padding: '4px 10px', borderRadius: '6px',
              border: '0.5px solid var(--border-md)',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              Lineup →
            </Link>
          ) : (
            <Link href={`/games/${game.id}`} style={{
              fontSize: '12px', color: 'var(--accent)', textDecoration: 'none',
              padding: '4px 10px', borderRadius: '6px',
              border: '0.5px solid rgba(232,160,32,0.3)',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              View →
            </Link>
          )}
        </div>

        {isPlaceholder && <SwapButton placeholder={game} seasonId={seasonId} />}
      </div>
    )
  }

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '480px', margin: '0 auto',
      padding: '1.5rem 1.5rem 6rem',
    }}>
      <Link href="/games" style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`,
        textDecoration: 'none', display: 'block', marginBottom: '1rem' }}>‹ Games</Link>

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em',
          textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '4px' }}>
          Tournament
        </div>
        <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>{tournament.name}</h1>
        <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)` }}>
          {formatDateRange(tournament.start_date, tournament.end_date)}
          {(tournament.season as any)?.team?.name ? ` · ${(tournament.season as any).team.name}` : ''}
        </div>
      </div>

      <HowItWorks />

      {/* Pool play section */}
      {poolGames.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: '#80B0E8', marginBottom: '10px' }}>
            Pool Play
          </div>
          {poolGames.map((g: any) => <GameRow key={g.id} game={g} />)}
        </div>
      )}

      {/* Bracket section */}
      {bracketGames.length > 0 && (
        <div style={{ marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '10px' }}>
            Bracket
          </div>
          {bracketGames.map((g: any) => <GameRow key={g.id} game={g} />)}
        </div>
      )}

      {(games ?? []).length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem 0',
          color: `rgba(var(--fg-rgb), 0.4)`, fontSize: '14px' }}>
          No game slots yet. Add pool play or bracket games below.
        </div>
      )}

      <AddSlotButtons
        tournamentId={params.id}
        seasonId={seasonId}
        inningsPerGame={inningsPG}
        startDate={tournament.start_date}
        endDate={tournament.end_date}
        poolCount={poolGames.length}
        bracketCount={bracketGames.length}
      />

      <div style={{ marginTop: '2.5rem', paddingTop: '1.5rem', borderTop: '0.5px solid var(--border)' }}>
        <DeleteTournamentButton tournamentId={params.id} />
      </div>
    </main>
  )
}
