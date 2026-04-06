import { createServerClient } from '../../../../lib/supabase-server'
import { redirect } from 'next/navigation'
import { formatTime } from '../../../../lib/formatTime'
import AutoPrint from './AutoPrint'
import PrintBtn from './PrintBtn'

const NAVY = '#0B1F3A'
const GOLD  = '#E8A020'

const POS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  P:    { bg: '#FFF8E1', color: '#7a4800', border: '#e0c060' },
  C:    { bg: '#FCE4EC', color: '#7a1040', border: '#d080a0' },
  '1B': { bg: '#E3F2FD', color: '#1a3f7a', border: '#90b8e0' },
  '2B': { bg: '#E3F2FD', color: '#1a3f7a', border: '#90b8e0' },
  SS:   { bg: '#E3F2FD', color: '#1a3f7a', border: '#90b8e0' },
  '3B': { bg: '#E3F2FD', color: '#1a3f7a', border: '#90b8e0' },
  LF:   { bg: '#E8F5E9', color: '#1a5c20', border: '#80c880' },
  CF:   { bg: '#E8F5E9', color: '#1a5c20', border: '#80c880' },
  LC:   { bg: '#E8F5E9', color: '#1a5c20', border: '#80c880' },
  RC:   { bg: '#E8F5E9', color: '#1a5c20', border: '#80c880' },
  RF:   { bg: '#E8F5E9', color: '#1a5c20', border: '#80c880' },
}

function ExchangeCard({ game, activeSlots, teamName }: {
  game: any
  activeSlots: any[]
  teamName: string
}) {
  const gameDate = game?.game_date
    ? new Date(game.game_date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      })
    : ''
  const gameTime = formatTime(game?.game_time)
  const location = game?.location ?? ''
  const metaParts = [gameDate, location, gameTime].filter(Boolean)
  const opponent = game?.opponent ?? 'Opponent'

  return (
    <div style={{
      fontFamily: 'Arial, Helvetica, sans-serif',
      color: '#000',
      background: '#fff',
      border: `2px solid ${NAVY}`,
      borderRadius: '6px',
      overflow: 'hidden',
      pageBreakInside: 'avoid',
    }}>

      {/* ── HEADER ── */}
      <div style={{ background: NAVY, padding: '10px 14px 9px' }}>
        {/* Teams row */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '8px', marginBottom: '7px',
        }}>
          <div style={{ textAlign: 'right', flex: 1 }}>
            <span style={{
              fontSize: '18px', fontWeight: 900, color: '#fff',
              letterSpacing: '-0.5px', lineHeight: 1,
            }}>
              {teamName.toUpperCase()}
            </span>
          </div>
          <div style={{
            fontSize: '10px', fontWeight: 800, color: NAVY,
            background: GOLD, padding: '3px 7px',
            borderRadius: '3px', flexShrink: 0,
            letterSpacing: '0.06em',
          }}>
            VS
          </div>
          <div style={{ textAlign: 'left', flex: 1 }}>
            <span style={{
              fontSize: '18px', fontWeight: 900, color: 'rgba(255,255,255,0.75)',
              letterSpacing: '-0.5px', lineHeight: 1,
            }}>
              {opponent.toUpperCase()}
            </span>
          </div>
        </div>

        {/* Meta */}
        {metaParts.length > 0 && (
          <div style={{
            textAlign: 'center',
            fontSize: '10px', color: 'rgba(255,255,255,0.6)',
            borderTop: '0.5px solid rgba(255,255,255,0.2)',
            paddingTop: '7px',
            letterSpacing: '0.04em',
          }}>
            {metaParts.join('  ·  ')}
          </div>
        )}
      </div>

      {/* ── LINEUP TABLE ── */}
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        tableLayout: 'fixed',
      }}>
        <colgroup>
          <col style={{ width: '28px' }} />{/* bat order */}
          <col style={{ width: '28px' }} />{/* jersey */}
          <col />{/* name */}
          <col style={{ width: '42px' }} />{/* position */}
        </colgroup>
        <thead>
          <tr style={{ background: '#f0f2f5' }}>
            <th style={hdr}>#</th>
            <th style={hdr}>№</th>
            <th style={{ ...hdr, textAlign: 'left', paddingLeft: '10px' }}>Player</th>
            <th style={{ ...hdr, color: NAVY }}>Pos</th>
          </tr>
        </thead>
        <tbody>
          {activeSlots.map((slot: any, idx: number) => {
            const player = slot.player as any
            const pos: string | null = (slot.inning_positions ?? [])[0] ?? null
            const ps = pos && pos !== 'Bench' ? POS_STYLE[pos] : null
            const rowBg = idx % 2 === 0 ? '#fff' : '#fafbfc'

            return (
              <tr key={slot.id}>
                <td style={{
                  ...cell, background: rowBg,
                  color: '#aaa', fontSize: '10px', textAlign: 'center', fontWeight: 600,
                }}>
                  {idx + 1}
                </td>
                <td style={{
                  ...cell, background: rowBg,
                  color: '#555', textAlign: 'center', fontSize: '12px', fontWeight: 700,
                }}>
                  {player?.jersey_number}
                </td>
                <td style={{
                  ...cell, background: rowBg,
                  paddingLeft: '10px', fontSize: '13px', fontWeight: 600,
                }}>
                  {player?.first_name} {player?.last_name}
                </td>
                <td style={{
                  ...cell, textAlign: 'center', fontWeight: 800, fontSize: '13px',
                  background: ps ? ps.bg : (pos === 'Bench' ? '#f0f0f0' : rowBg),
                  color: ps ? ps.color : (pos === 'Bench' ? '#bbb' : '#ddd'),
                  borderLeft: ps ? `2px solid ${ps.border}` : '1px solid #eee',
                }}>
                  {pos === 'Bench' ? 'B' : (pos ?? '—')}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* ── FOOTER BRAND ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 12px',
        borderTop: `2px solid ${NAVY}`,
        background: '#f7f8fa',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
          <span style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '-1px', color: NAVY }}>Six</span>
          <span style={{ fontSize: '16px', fontWeight: 900, letterSpacing: '-1px', color: GOLD }}>43</span>
          <span style={{ fontSize: '9px', color: '#aaa', letterSpacing: '0.04em', marginLeft: '2px' }}>
            Lineup Builder
          </span>
        </div>
        <div style={{ fontSize: '9px', color: '#bbb', letterSpacing: '0.04em' }}>
          six43.com
        </div>
      </div>

    </div>
  )
}

export default async function ExchangeCardPage({ params }: { params: { id: string } }) {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: game } = await supabase
    .from('games')
    .select('*, season:seasons(team:teams(name))')
    .eq('id', params.id)
    .single()

  if (!game) redirect('/games')

  const teamName: string = (game as any)?.season?.team?.name ?? 'Us'

  const { data: slots } = await supabase
    .from('lineup_slots')
    .select('*, player:players(first_name, last_name, jersey_number)')
    .eq('game_id', params.id)
    .order('batting_order', { ascending: true, nullsFirst: false })

  const activeSlots = (slots ?? []).filter((s: any) => s.availability !== 'absent')

  return (
    <html>
      <head>
        <title>Lineup Card — {teamName} vs {game.opponent}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body { background: #fff; }
          @media screen {
            body { padding: 20px; background: #f0f2f5; }
            .page-wrap { max-width: 520px; margin: 0 auto; }
            .print-btn {
              display: flex; align-items: center; justify-content: center; gap: 8px;
              background: #0B1F3A; color: #fff; border: none; border-radius: 8px;
              padding: 12px 20px; font-size: 14px; font-weight: 700;
              cursor: pointer; width: 100%; margin-bottom: 20px; letter-spacing: 0.02em;
            }
            .print-btn:hover { background: #162e52; }
            .back-link {
              display: inline-block; font-size: 13px; color: #888;
              text-decoration: none; margin-bottom: 16px;
            }
          }
          @media print {
            body { padding: 0; background: #fff; }
            .no-print { display: none !important; }
            .page-wrap { max-width: 100%; }
            @page { size: letter portrait; margin: 0.4in 0.45in; }
          }
          .card-gap { height: 28px; }
          @media print { .card-gap { height: 0.35in; } }
          .cut-line {
            border: none; border-top: 1.5px dashed #ccc;
            margin: 0; position: relative;
          }
          .cut-label {
            position: absolute; top: -8px; left: 50%;
            transform: translateX(-50%);
            background: #f0f2f5; padding: 0 8px;
            font-size: 9px; color: #bbb; letter-spacing: 0.08em;
            font-family: Arial, sans-serif; white-space: nowrap;
          }
          @media print {
            .cut-label { background: #fff; }
          }
        `}</style>
      </head>
      <body>
        <AutoPrint />
        <div className="page-wrap">
          <div className="no-print" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <a href={`/games/${params.id}`} className="back-link">‹ Back to game</a>
          </div>
          <PrintBtn />

          {/* Copy 1 */}
          <ExchangeCard game={game} activeSlots={activeSlots} teamName={teamName} />

          {/* Cut line separator */}
          <div className="card-gap" />
          <div style={{ position: 'relative', margin: '0 0 0px' }}>
            <hr className="cut-line" />
            <span className="cut-label">CUT HERE · HAND TO OPPOSING COACH</span>
          </div>
          <div className="card-gap" />

          {/* Copy 2 */}
          <ExchangeCard game={game} activeSlots={activeSlots} teamName={teamName} />
        </div>
      </body>
    </html>
  )
}

const ROW_H = '28px'

const hdr: React.CSSProperties = {
  padding: '5px 3px',
  textAlign: 'center',
  fontSize: '10px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#666',
  borderBottom: '1.5px solid #ddd',
  height: '26px',
  boxSizing: 'border-box',
}

const cell: React.CSSProperties = {
  padding: '0 3px',
  borderBottom: '0.5px solid #eee',
  height: ROW_H,
  boxSizing: 'border-box',
}
