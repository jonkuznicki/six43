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
import { formatTime } from '../../../lib/formatTime'

const POSITION_COLORS: Record<string, { bg: string; color: string }> = {
  P:     { bg: 'rgba(232,160,32,0.2)',    color: '#E8C060' },
  C:     { bg: 'rgba(192,80,120,0.2)',    color: '#E090B0' },
  '1B':  { bg: 'rgba(59,109,177,0.2)',    color: '#80B0E8' },
  '2B':  { bg: 'rgba(59,109,177,0.2)',    color: '#80B0E8' },
  SS:    { bg: 'rgba(59,109,177,0.2)',    color: '#80B0E8' },
  '3B':  { bg: 'rgba(59,109,177,0.2)',    color: '#80B0E8' },
  LF:    { bg: 'rgba(45,106,53,0.2)',     color: '#6DB875' },
  CF:    { bg: 'rgba(45,106,53,0.2)',     color: '#6DB875' },
  LC:    { bg: 'rgba(45,106,53,0.2)',     color: '#6DB875' },
  RC:    { bg: 'rgba(45,106,53,0.2)',     color: '#6DB875' },
  RF:    { bg: 'rgba(45,106,53,0.2)',     color: '#6DB875' },
  Bench: { bg: 'var(--bg-card)',           color: `rgba(var(--fg-rgb), 0.4)` },
}

function PositionChip({ position }: { position: string | null }) {
  if (!position) return (
    <span style={{
      fontSize: '10px', padding: '2px 6px', borderRadius: '3px',
      background: 'var(--bg-card)', color: `rgba(var(--fg-rgb), 0.2)`,
      border: '0.5px dashed var(--border-md)',
    }}>—</span>
  )
  const c = POSITION_COLORS[position] ?? POSITION_COLORS.Bench
  return (
    <span style={{
      fontSize: '10px', fontWeight: 600, padding: '2px 6px', borderRadius: '3px',
      background: c.bg, color: c.color, minWidth: '28px',
      textAlign: 'center', display: 'inline-block',
    }}>
      {position === 'Bench' ? 'B' : position}
    </span>
  )
}

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

  const { data: slots } = await supabase
    .from('lineup_slots')
    .select('*, player:players(first_name, last_name, jersey_number)')
    .eq('game_id', params.id)
    .order('batting_order', { ascending: true, nullsFirst: false })

  const date = new Date(game.game_date + 'T12:00:00')
  const formatted = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  const inningCount = game.innings_played ?? 6
  const innings = Array.from({ length: inningCount }, (_, i) => i)
  const activeSlots = (slots ?? []).filter((s: any) => s.availability !== 'absent')
  const hasLineup = activeSlots.length > 0
  const hasPositions = activeSlots.some((s: any) =>
    (s.inning_positions ?? []).some((p: string | null) => p !== null)
  )
  // Always go through attendance unless positions are already set (editing existing lineup)
  const lineupHref = hasPositions
    ? `/games/${game.id}/lineup`
    : `/games/${game.id}/attendance`

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

        <Link href="/games" style={{
          fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`,
          textDecoration: 'none', display: 'block', marginBottom: '1rem',
        }}>‹ Games</Link>

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
            <>
              {/* Inning header */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: `24px 1fr repeat(${inningCount}, 32px)`,
                gap: '4px', padding: '0 8px', marginBottom: '6px',
              }}>
                <span style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)` }}>#</span>
                <span style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)` }}>Player</span>
                {innings.map(i => (
                  <span key={i} style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.3)`, textAlign: 'center' }}>
                    {i + 1}
                  </span>
                ))}
              </div>

              {activeSlots.map((slot: any) => (
                <div key={slot.id} style={{
                  display: 'grid',
                  gridTemplateColumns: `24px 1fr repeat(${inningCount}, 32px)`,
                  gap: '4px', padding: '8px',
                  background: 'var(--bg-card)',
                  border: '0.5px solid var(--border-subtle)',
                  borderRadius: '6px', marginBottom: '4px', alignItems: 'center',
                }}>
                  <span style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.3)` }}>
                    {(slot.player as any)?.jersey_number}
                  </span>
                  <span style={{ fontSize: '13px' }}>
                    {(slot.player as any)?.first_name[0]}. {(slot.player as any)?.last_name}
                  </span>
                  {innings.map(i => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
                      <PositionChip position={slot.inning_positions[i]} />
                    </div>
                  ))}
                </div>
              ))}
            </>
          ) : (
            <div style={{ textAlign: 'center', color: `rgba(var(--fg-rgb), 0.35)`,
              marginTop: '2rem', fontSize: '14px' }}>
              No lineup built yet.
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
            <div style={{ display: 'flex', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <PrintButton />
              </div>
              <Link
                href={`/games/${game.id}/exchange-card`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none', flex: 1 }}
              >
                <div style={{
                  fontSize: '13px', padding: '10px 16px', borderRadius: '8px',
                  border: '0.5px solid var(--border-strong)', background: 'transparent',
                  color: `rgba(var(--fg-rgb), 0.55)`, cursor: 'pointer',
                  textAlign: 'center',
                }}>
                  🤝 Exchange card
                </div>
              </Link>
            </div>
          )}
          <ShareButton gameId={game.id} initialToken={(game as any).share_token ?? null} />
        </div>

      </main>
    </>
  )
}
