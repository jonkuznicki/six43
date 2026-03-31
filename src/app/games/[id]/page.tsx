import { createServerClient } from '../../../lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const POSITION_COLORS: Record<string, { bg: string; color: string }> = {
  P:     { bg: 'rgba(232,160,32,0.2)',  color: '#E8C060' },
  C:     { bg: 'rgba(192,80,120,0.2)',  color: '#E090B0' },
  '1B':  { bg: 'rgba(59,109,177,0.2)',  color: '#80B0E8' },
  '2B':  { bg: 'rgba(59,109,177,0.2)',  color: '#80B0E8' },
  SS:    { bg: 'rgba(59,109,177,0.2)',  color: '#80B0E8' },
  '3B':  { bg: 'rgba(59,109,177,0.2)',  color: '#80B0E8' },
  LF:    { bg: 'rgba(45,106,53,0.2)',   color: '#6DB875' },
  CF:    { bg: 'rgba(45,106,53,0.2)',   color: '#6DB875' },
  RF:    { bg: 'rgba(45,106,53,0.2)',   color: '#6DB875' },
  Bench: { bg: 'rgba(245,242,235,0.06)', color: 'rgba(245,242,235,0.4)' },
}

function PositionChip({ position }: { position: string | null }) {
  if (!position) return (
    <span style={{
      fontSize: '10px',
      padding: '2px 6px',
      borderRadius: '3px',
      background: 'rgba(245,242,235,0.04)',
      color: 'rgba(245,242,235,0.2)',
      border: '0.5px dashed rgba(245,242,235,0.15)',
    }}>—</span>
  )
  const c = POSITION_COLORS[position] ?? POSITION_COLORS.Bench
  return (
    <span style={{
      fontSize: '10px',
      fontWeight: 600,
      padding: '2px 6px',
      borderRadius: '3px',
      background: c.bg,
      color: c.color,
      minWidth: '28px',
      textAlign: 'center',
      display: 'inline-block',
    }}>
      {position}
    </span>
  )
}

export default async function GamePage({ params }: { params: { id: string } }) {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Load the game
  const { data: game } = await supabase
    .from('games')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!game) redirect('/games')

  // Load the lineup with player details
  const { data: slots } = await supabase
    .from('lineup_slots')
    .select('*, player:players(first_name, last_name, jersey_number)')
    .eq('game_id', params.id)
    .order('batting_order', { ascending: true, nullsFirst: false })

  const date = new Date(game.game_date + 'T12:00:00')
  const formatted = date.toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  })

  // Figure out how many innings to show
  const inningCount = game.innings_played ?? 6
  const innings = Array.from({ length: inningCount }, (_, i) => i)

  function statusChip(status: string) {
    const styles: Record<string, { bg: string; color: string; label: string }> = {
      scheduled:   { bg: 'rgba(245,242,235,0.08)', color: 'rgba(245,242,235,0.5)', label: 'Scheduled' },
      in_progress: { bg: 'rgba(232,160,32,0.2)',   color: '#E8A020',               label: 'Live' },
      final:       { bg: 'rgba(45,106,53,0.2)',    color: '#6DB875',               label: 'Final' },
    }
    const s = styles[status] ?? styles.scheduled
    return (
      <span style={{
        fontSize: '11px',
        fontWeight: 500,
        padding: '3px 10px',
        borderRadius: '4px',
        background: s.bg,
        color: s.color,
      }}>
        {s.label}
      </span>
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

      {/* Back link */}
      <Link href="/games" style={{
        fontSize: '13px',
        color: 'rgba(245,242,235,0.45)',
        textDecoration: 'none',
        display: 'block',
        marginBottom: '1rem',
      }}>
        ‹ Games
      </Link>

      {/* Game header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '0.5rem',
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700 }}>
          vs {game.opponent}
        </h1>
        {statusChip(game.status)}
      </div>
      <p style={{ color: 'rgba(245,242,235,0.45)', fontSize: '13px', marginBottom: '1.5rem' }}>
        {formatted} · {game.location ?? 'TBD'}
        {game.game_time && ` · ${game.game_time.slice(0,5)}`}
      </p>

      {/* Lineup table */}
      {slots && slots.length > 0 ? (
        <>
          {/* Inning header row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '24px 1fr repeat(' + inningCount + ', 32px)',
            gap: '4px',
            padding: '0 8px',
            marginBottom: '6px',
          }}>
            <span style={{ fontSize: '10px', color: 'rgba(245,242,235,0.3)' }}>#</span>
            <span style={{ fontSize: '10px', color: 'rgba(245,242,235,0.3)' }}>Player</span>
            {innings.map(i => (
              <span key={i} style={{
                fontSize: '10px',
                color: 'rgba(245,242,235,0.3)',
                textAlign: 'center',
              }}>
                {i + 1}
              </span>
            ))}
          </div>

          {/* Player rows */}
          {slots.map(slot => (
            <div key={slot.id} style={{
              display: 'grid',
              gridTemplateColumns: '24px 1fr repeat(' + inningCount + ', 32px)',
              gap: '4px',
              padding: '8px',
              background: 'rgba(255,255,255,0.03)',
              border: '0.5px solid rgba(245,242,235,0.07)',
              borderRadius: '6px',
              marginBottom: '4px',
              alignItems: 'center',
            }}>
              <span style={{ fontSize: '11px', color: 'rgba(245,242,235,0.3)' }}>
                {(slot.player as any)?.jersey_number}
              </span>
              <span style={{ fontSize: '13px', color: '#F5F2EB' }}>
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
        <div style={{
          textAlign: 'center',
          color: 'rgba(245,242,235,0.35)',
          marginTop: '3rem',
          fontSize: '14px',
        }}>
          No lineup built yet.
        </div>
      )}

      {/* Action buttons */}
      <div style={{ marginTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <Link href={`/games/${game.id}/lineup`} style={{ textDecoration: 'none' }}>
          <div style={{
            background: '#E8A020',
            color: '#0B1F3A',
            borderRadius: '8px',
            padding: '12px 16px',
            textAlign: 'center',
            fontWeight: 700,
            fontSize: '14px',
            cursor: 'pointer',
          }}>
            {slots && slots.length > 0 ? 'Edit lineup' : 'Build lineup'}
          </div>
        </Link>

        {game.status === 'final' && (
          <div style={{
            background: 'rgba(45,106,53,0.15)',
            border: '0.5px solid rgba(45,106,53,0.3)',
            color: '#6DB875',
            borderRadius: '8px',
            padding: '12px 16px',
            textAlign: 'center',
            fontSize: '13px',
          }}>
            Game finalized — stats locked in
          </div>
        )}
      </div>

    </main>
  )
}