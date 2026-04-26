import { createServerClient } from '../../../lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import GameStatusToggle from './GameStatusToggle'
import GameEditButton from './GameEditButton'
import BoxScoreInput from './BoxScoreInput'
import GamePrintSection from './GamePrintSection'
import PrintButton from './PrintButton'
import GameNotes from './GameNotes'
import ShareButton from './ShareButton'
import DuplicateGameButton from './DuplicateGameButton'
import LineupWithNotes from './LineupWithNotes'
import { formatTime } from '../../../lib/formatTime'

export default async function GamePage({ params }: { params: { id: string } }) {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: game } = await supabase
    .from('games')
    .select('*, season:seasons(team:teams(name, positions))')
    .eq('id', params.id)
    .single()

  if (!game) redirect('/games')

  const teamName: string = (game as any)?.season?.team?.name ?? 'Us'

  // Adjacent games for prev/next navigation
  const { data: seasonGames } = await supabase
    .from('games')
    .select('id, opponent, game_date')
    .eq('season_id', game.season_id)
    .order('game_date', { ascending: true })

  const gameIndex = (seasonGames ?? []).findIndex((g: any) => g.id === params.id)
  const prevGame = gameIndex > 0 ? (seasonGames ?? [])[gameIndex - 1] : null
  const nextGame = gameIndex < (seasonGames ?? []).length - 1 ? (seasonGames ?? [])[gameIndex + 1] : null

  const { data: slots } = await supabase
    .from('lineup_slots')
    .select('*, player:players(first_name, last_name, jersey_number)')
    .eq('game_id', params.id)
    .order('batting_order', { ascending: true, nullsFirst: false })

  const date = new Date(game.game_date + 'T12:00:00')
  const formatted = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const inningCount = game.innings_played ?? 6
  const activeSlots = (slots ?? []).filter((s: any) => s.availability !== 'absent')
  const hasLineup = activeSlots.length > 0
  const hasPositions = activeSlots.some((s: any) =>
    (s.inning_positions ?? []).some((p: string | null) => p !== null)
  )
  const lineupHref = `/games/${game.id}/lineup`

  return (
    <>
      {/* Print sheet lives OUTSIDE <main> so @media print can show it
          while hiding .game-screen-only */}
      {hasLineup && (
        <GamePrintSection game={game} slots={slots!} teamName={teamName} />
      )}

      <main className="game-screen-only" style={{
        minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
        fontFamily: 'sans-serif', padding: '1.5rem 1.5rem 6rem',
        maxWidth: '480px', margin: '0 auto',
      }}>

        {/* Navigation row: prev / back to list / next */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '1rem',
        }}>
          {prevGame ? (
            <Link href={`/games/${prevGame.id}`} style={{
              fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`,
              textDecoration: 'none', maxWidth: '38%', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>‹ vs {prevGame.opponent}</Link>
          ) : (
            <span />
          )}
          <Link href="/games" style={{
            fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`,
            textDecoration: 'none', flexShrink: 0,
          }}>All games</Link>
          {nextGame ? (
            <Link href={`/games/${nextGame.id}`} style={{
              fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`,
              textDecoration: 'none', maxWidth: '38%', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'right',
            }}>vs {nextGame.opponent} ›</Link>
          ) : (
            <span />
          )}
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between',
          alignItems: 'flex-start', marginBottom: '4px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700 }}>vs {game.opponent}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <GameStatusToggle gameId={game.id} initialStatus={game.status} />
            <GameEditButton game={game} />
          </div>
        </div>
        <p style={{ color: `rgba(var(--fg-rgb), 0.45)`, fontSize: '13px', marginBottom: '1.5rem' }}>
          {formatted}{game.location ? ` · ${game.location}` : ''}
          {game.game_time ? ` · ${formatTime(game.game_time)}` : ''}
        </p>

        {/* Box score */}
        <BoxScoreInput
          gameId={game.id}
          notes={game.notes}
          inningCount={inningCount}
          teamName={teamName}
          opponent={game.opponent}
        />

        {/* Notes */}
        <GameNotes gameId={game.id} notes={game.notes} />

        {/* Lineup */}
        <div style={{ marginTop: '1.5rem' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '8px' }}>
            Lineup
          </div>

          {hasLineup ? (
            <LineupWithNotes
              slots={activeSlots}
              inningCount={inningCount}
              seasonId={game.season_id}
              gameDate={game.game_date}
            />
          ) : (
            <div style={{ textAlign: 'center', marginTop: '2rem', padding: '1rem 0' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>📋</div>
              <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.4)`, lineHeight: 1.5 }}>
                No lineup built yet.<br />
                <span style={{ fontSize: '12px' }}>Tap "Build lineup" below to start.</span>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <Link href={lineupHref} style={{ textDecoration: 'none' }}>
            <div style={{
              background: 'var(--accent)', color: 'var(--accent-text)', borderRadius: '8px',
              padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '14px',
            }}>
              {hasPositions ? 'Edit lineup' : 'Build lineup'}
            </div>
          </Link>

          {game.status === 'lineup_ready' && (
            <div style={{
              background: 'rgba(59,109,177,0.12)', border: '0.5px solid rgba(59,109,177,0.3)',
              color: '#80B0E8', borderRadius: '8px', padding: '12px 16px',
              textAlign: 'center', fontSize: '13px',
            }}>
              Lineup Ready
            </div>
          )}
          {game.status === 'final' && (
            <div style={{
              background: 'rgba(45,106,53,0.15)', border: '0.5px solid rgba(45,106,53,0.3)',
              color: '#6DB875', borderRadius: '8px', padding: '12px 16px',
              textAlign: 'center', fontSize: '13px',
            }}>
              Final
            </div>
          )}

          <DuplicateGameButton game={{
            id: game.id,
            season_id: game.season_id,
            opponent: game.opponent,
            location: game.location ?? null,
            innings_played: game.innings_played,
            game_time: game.game_time ?? null,
          }} />
          {hasLineup && (
            <Link
              href={`/games/${game.id}/print`}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: 'none' }}
            >
              <div style={{
                fontSize: '13px', padding: '10px 16px', borderRadius: '8px',
                border: '0.5px solid var(--border-strong)', background: 'transparent',
                color: `rgba(var(--fg-rgb), 0.55)`, cursor: 'pointer',
                textAlign: 'center',
              }}>
                🖨 Print lineup + exchange card
              </div>
            </Link>
          )}
          <ShareButton gameId={game.id} initialToken={(game as any).share_token ?? null} />
          <Link href="/pitching" style={{ textDecoration: 'none' }}>
            <div style={{
              fontSize: '13px', padding: '10px 16px', borderRadius: '8px',
              border: '0.5px solid var(--border-strong)', background: 'transparent',
              color: `rgba(var(--fg-rgb), 0.55)`, textAlign: 'center',
            }}>
              🎯 Pitcher planner
            </div>
          </Link>
        </div>

      </main>
    </>
  )
}
