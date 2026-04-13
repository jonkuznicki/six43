import { formatTime } from '../../../lib/formatTime'

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

export default function ExchangeCardLayout({ game, activeSlots, teamName }: {
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
      maxWidth: '420px',
      margin: '0 auto',
    }}>

      {/* ── HEADER ── */}
      <div style={{
        background: '#fff',
        borderBottom: `2px solid ${NAVY}`,
        padding: '12px 16px 11px',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '10px', marginBottom: metaParts.length ? '8px' : '0',
        }}>
          <div style={{ textAlign: 'right', flex: 1 }}>
            <span style={{
              fontSize: '20px', fontWeight: 900, color: NAVY,
              letterSpacing: '-0.5px', lineHeight: 1,
            }}>
              {teamName.toUpperCase()}
            </span>
          </div>
          <div style={{
            fontSize: '10px', fontWeight: 800, color: NAVY,
            border: `1.5px solid ${NAVY}`, padding: '3px 8px',
            borderRadius: '3px', flexShrink: 0,
            letterSpacing: '0.06em',
          }}>
            VS
          </div>
          <div style={{ textAlign: 'left', flex: 1 }}>
            <span style={{
              fontSize: '20px', fontWeight: 900, color: '#555',
              letterSpacing: '-0.5px', lineHeight: 1,
            }}>
              {opponent.toUpperCase()}
            </span>
          </div>
        </div>
        {metaParts.length > 0 && (
          <div style={{
            textAlign: 'center',
            fontSize: '10px', color: '#666',
            borderTop: '0.5px solid #ddd',
            paddingTop: '8px',
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
          <col style={{ width: '28px' }} />
          <col style={{ width: '30px' }} />
          <col />
          <col style={{ width: '44px' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#f0f2f5', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
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
              <tr key={slot.id} style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' } as React.CSSProperties}>
                <td style={{ ...cell, background: rowBg, color: '#aaa', fontSize: '10px', textAlign: 'center', fontWeight: 600 }}>
                  {idx + 1}
                </td>
                <td style={{ ...cell, background: rowBg, color: '#555', textAlign: 'center', fontSize: '12px', fontWeight: 700 }}>
                  {player?.jersey_number}
                </td>
                <td style={{ ...cell, background: rowBg, paddingLeft: '10px', fontSize: '13px', fontWeight: 600 }}>
                  {player?.first_name} {player?.last_name}
                </td>
                <td style={{
                  ...cell,
                  textAlign: 'center', fontWeight: 800, fontSize: '13px',
                  background: ps ? ps.bg : (pos === 'Bench' ? '#f0f0f0' : rowBg),
                  color: ps ? ps.color : (pos === 'Bench' ? '#bbb' : '#ccc'),
                  borderLeft: ps ? `2px solid ${ps.border}` : '1px solid #eee',
                  WebkitPrintColorAdjust: 'exact',
                  printColorAdjust: 'exact',
                } as React.CSSProperties}>
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
        padding: '8px 14px',
        borderTop: `2px solid ${NAVY}`,
        background: '#f7f8fa',
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      } as React.CSSProperties}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '5px' }}>
          <span style={{ fontSize: '17px', fontWeight: 900, letterSpacing: '-1px', color: NAVY }}>Six</span>
          <span style={{ fontSize: '17px', fontWeight: 900, letterSpacing: '-1px', color: GOLD }}>43</span>
          <span style={{ fontSize: '9px', color: '#bbb', letterSpacing: '0.04em', marginLeft: '3px' }}>
            Lineup Builder
          </span>
        </div>
        <div style={{ fontSize: '9px', color: '#ccc', letterSpacing: '0.04em' }}>
          six43.com
        </div>
      </div>

    </div>
  )
}

const ROW_H = '30px'

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
