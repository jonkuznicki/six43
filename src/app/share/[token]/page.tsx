import { notFound } from 'next/navigation'
import { createServiceClient } from '../../../lib/supabase-service'
import { formatTime } from '../../../lib/formatTime'

const POSITION_COLORS: Record<string, { bg: string; color: string }> = {
  P:     { bg: 'rgba(232,160,32,0.2)',    color: '#B8800A' },
  C:     { bg: 'rgba(192,80,120,0.2)',    color: '#963060' },
  '1B':  { bg: 'rgba(59,109,177,0.2)',    color: '#2A60A0' },
  '2B':  { bg: 'rgba(59,109,177,0.2)',    color: '#2A60A0' },
  SS:    { bg: 'rgba(59,109,177,0.2)',    color: '#2A60A0' },
  '3B':  { bg: 'rgba(59,109,177,0.2)',    color: '#2A60A0' },
  LF:    { bg: 'rgba(45,106,53,0.2)',     color: '#1A6025' },
  CF:    { bg: 'rgba(45,106,53,0.2)',     color: '#1A6025' },
  LC:    { bg: 'rgba(45,106,53,0.2)',     color: '#1A6025' },
  RC:    { bg: 'rgba(45,106,53,0.2)',     color: '#1A6025' },
  RF:    { bg: 'rgba(45,106,53,0.2)',     color: '#1A6025' },
  Bench: { bg: '#f3f4f6',                 color: '#9ca3af' },
}

function readNotes(raw: string | null): string {
  try { return JSON.parse(raw ?? '{}')._notes ?? '' } catch { return '' }
}

export default async function SharePage({ params }: { params: { token: string } }) {
  const supabase = createServiceClient()

  const { data: game } = await supabase
    .from('games')
    .select('*, season:seasons(team:teams(name))')
    .eq('share_token', params.token)
    .single()

  if (!game) notFound()

  const { data: slots } = await supabase
    .from('lineup_slots')
    .select('*, player:players(first_name, last_name, jersey_number)')
    .eq('game_id', game.id)
    .order('batting_order', { ascending: true, nullsFirst: false })

  const activeSlots = (slots ?? []).filter((s: any) => s.availability !== 'absent')
  const inningCount = game.innings_played ?? 6
  const innings = Array.from({ length: inningCount }, (_, i) => i)
  const teamName = (game as any)?.season?.team?.name ?? 'Us'
  const notes = readNotes(game.notes)

  const gameDate = new Date(game.game_date + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
  const metaParts = [gameDate, game.location, formatTime(game.game_time)].filter(Boolean)

  return (
    <main style={{
      minHeight: '100vh',
      background: '#f9fafb',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      color: '#111827',
      padding: '1.5rem 1rem 4rem',
      maxWidth: '540px',
      margin: '0 auto',
    }}>

      {/* ── HEADER ── */}
      <div style={{
        background: '#fff',
        border: '1px solid #e5e7eb',
        borderRadius: '12px',
        padding: '16px 18px',
        marginBottom: '16px',
      }}>
        {/* Teams */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
          <div style={{ flex: 1, textAlign: 'right' }}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#0B1F3A', letterSpacing: '-0.5px' }}>
              {teamName.toUpperCase()}
            </div>
          </div>
          <div style={{
            fontSize: '11px', fontWeight: 700, color: '#0B1F3A',
            border: '1px solid #0B1F3A', borderRadius: '4px',
            padding: '3px 8px', flexShrink: 0, letterSpacing: '0.05em',
          }}>VS</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#374151', letterSpacing: '-0.5px' }}>
              {game.opponent.toUpperCase()}
            </div>
          </div>
        </div>
        <div style={{ fontSize: '12px', color: '#6b7280', textAlign: 'center', borderTop: '1px solid #f3f4f6', paddingTop: '8px' }}>
          {metaParts.join('  ·  ')}
        </div>
      </div>

      {/* ── LINEUP ── */}
      {activeSlots.length > 0 ? (
        <div style={{
          background: '#fff', border: '1px solid #e5e7eb',
          borderRadius: '12px', overflow: 'hidden', marginBottom: '16px',
        }}>
          {/* Column header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `28px 1fr repeat(${inningCount}, 36px)`,
            gap: '2px', background: '#0B1F3A',
            padding: '8px 10px',
          }}>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', textAlign: 'center' }}>№</div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)', paddingLeft: '4px' }}>Player</div>
            {innings.map(i => (
              <div key={i} style={{ fontSize: '11px', fontWeight: 700, color: '#fff', textAlign: 'center' }}>{i + 1}</div>
            ))}
          </div>

          {/* Player rows */}
          {activeSlots.map((slot: any, idx: number) => {
            const player = slot.player
            return (
              <div key={slot.id} style={{
                display: 'grid',
                gridTemplateColumns: `28px 1fr repeat(${inningCount}, 36px)`,
                gap: '2px',
                background: idx % 2 === 0 ? '#f9fafb' : '#fff',
                padding: '6px 10px',
                alignItems: 'center',
                borderBottom: idx < activeSlots.length - 1 ? '1px solid #f3f4f6' : 'none',
              }}>
                <div style={{ fontSize: '11px', color: '#9ca3af', textAlign: 'center', fontWeight: 600 }}>
                  {player?.jersey_number}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#111827', paddingLeft: '4px' }}>
                  {player?.first_name} {player?.last_name}
                </div>
                {innings.map(i => {
                  const pos = slot.inning_positions[i]
                  const pc = pos ? (POSITION_COLORS[pos] ?? POSITION_COLORS.Bench) : null
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'center' }}>
                      {pos ? (
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 0', width: '30px', textAlign: 'center',
                          borderRadius: '4px',
                          background: pc!.bg,
                          color: pc!.color,
                          fontSize: '11px', fontWeight: 700,
                        }}>
                          {pos === 'Bench' ? 'B' : pos}
                        </span>
                      ) : (
                        <span style={{ color: '#d1d5db', fontSize: '12px' }}>·</span>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      ) : (
        <div style={{ textAlign: 'center', color: '#9ca3af', padding: '3rem 0', fontSize: '14px' }}>
          Lineup not built yet.
        </div>
      )}

      {/* ── NOTES ── */}
      {notes && (
        <div style={{
          background: '#fff', border: '1px solid #e5e7eb',
          borderRadius: '12px', padding: '14px 16px', marginBottom: '16px',
        }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: '#9ca3af', marginBottom: '6px' }}>
            Notes
          </div>
          <div style={{ fontSize: '13px', color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {notes}
          </div>
        </div>
      )}

      {/* ── FOOTER ── */}
      <div style={{ textAlign: 'center', paddingTop: '8px' }}>
        <span style={{ fontSize: '14px', fontWeight: 900, color: '#0B1F3A', letterSpacing: '-0.5px' }}>
          Six<span style={{ color: '#E8A020' }}>43</span>
        </span>
        <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '6px' }}>Lineup Builder</span>
      </div>

    </main>
  )
}
