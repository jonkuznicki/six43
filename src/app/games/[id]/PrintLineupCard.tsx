// Shared print layout — used by both the lineup builder and game detail page.
// The parent is responsible for .print-sheet / @media print visibility classes.

import { formatTime } from '../../../lib/formatTime'

function readUserNotes(raw: string | null): string {
  try { return JSON.parse(raw ?? '{}')._notes ?? '' } catch { return '' }
}

// Only P and C get colour; all other positions print on white
const POS_STYLE: Record<string, { bg: string; color: string }> = {
  P: { bg: '#FFF8E1', color: '#7a4800' },
  C: { bg: '#FCE4EC', color: '#7a1040' },
}

const NAVY = '#0B1F3A'
const GOLD  = '#E8A020'

export default function PrintLineupCard({ game, activeSlots, innings, teamName }: {
  game: any
  activeSlots: any[]
  innings: number[]
  teamName?: string
}) {
  const gameDate = game?.game_date
    ? new Date(game.game_date + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      })
    : ''
  const gameTime = formatTime(game?.game_time)
  const userNotes = readUserNotes(game?.notes ?? null)
  const location = game?.location ?? ''
  const metaParts = [gameDate, location, gameTime].filter(Boolean)

  const displayTeam = teamName ?? 'Us'
  const displayOpponent = game?.opponent ?? 'Opponent'

  return (
    <div style={{
      fontFamily: 'Arial, Helvetica, sans-serif',
      color: '#000', background: '#fff',
      fontSize: '12px',
    }}>

      {/* ── HEADER ── */}
      <div style={{ background: '#fff', padding: '12px 16px 10px', borderBottom: `4px solid ${NAVY}` }}>
        {/* Teams */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: '10px', marginBottom: '8px',
        }}>
          <div style={{ textAlign: 'right', flex: 1 }}>
            <div style={{ fontSize: '22px', fontWeight: 900, color: NAVY, letterSpacing: '-0.5px', lineHeight: 1 }}>
              {displayTeam.toUpperCase()}
            </div>
          </div>

          <div style={{
            fontSize: '13px', fontWeight: 800, color: NAVY,
            padding: '4px 10px',
            border: `1px solid ${NAVY}`,
            borderRadius: '4px', flexShrink: 0,
            letterSpacing: '0.05em',
          }}>
            VS
          </div>

          <div style={{ textAlign: 'left', flex: 1 }}>
            <div style={{ fontSize: '22px', fontWeight: 900, color: '#333', letterSpacing: '-0.5px', lineHeight: 1 }}>
              {displayOpponent.toUpperCase()}
            </div>
          </div>
        </div>

        {/* Date / time / location */}
        {metaParts.length > 0 && (
          <div style={{
            textAlign: 'center',
            fontSize: '11px', color: '#333',
            borderTop: '0.5px solid #ccc',
            paddingTop: '8px',
            letterSpacing: '0.02em',
          }}>
            {metaParts.join('  ·  ')}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '10px' }} />

      {/* ── LINEUP TABLE ── */}
      <table style={{
        width: '100%', borderCollapse: 'collapse', marginBottom: '12px',
        tableLayout: 'fixed', border: `2px solid ${NAVY}`,
      }}>
        <colgroup>
          <col style={{ width: '22px' }} />{/* batting order */}
          <col style={{ width: '22px' }} />{/* jersey # */}
          <col style={{ width: '150px' }} />{/* name — wider to reduce wrapping */}
          {innings.map(i => <col key={i} />)}
        </colgroup>
        <thead>
          <tr style={{ background: '#fff', color: NAVY, borderBottom: `2px solid ${NAVY}` }}>
            <th style={hdr}>#</th>
            <th style={hdr}>№</th>
            <th style={{ ...hdr, textAlign: 'left', paddingLeft: '8px' }}>Player</th>
            {innings.map(i => (
              <th key={i} style={{ ...hdr, fontSize: '13px' }}>{i + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {activeSlots.map((slot: any, idx: number) => {
            const player = slot.player as any
            return (
              <tr key={slot.id}>
                <td style={{ ...cell, background: '#fff', color: '#999', fontSize: '10px', textAlign: 'center' }}>
                  {idx + 1}
                </td>
                <td style={{ ...cell, background: '#fff', color: '#333', fontWeight: 700, textAlign: 'center', fontSize: '11px' }}>
                  {player?.jersey_number}
                </td>
                <td style={{ ...cell, background: '#fff', paddingLeft: '8px', fontSize: '13px', fontWeight: 600 }}>
                  {player?.first_name} {player?.last_name}
                </td>
                {innings.map(i => {
                  const pos = slot.inning_positions[i]
                  const displayPos = pos === 'Bench' ? 'B' : (pos ?? '')
                  const ps = pos ? POS_STYLE[pos] : null
                  const isBench = pos === 'Bench'
                  return (
                    <td key={i} style={{
                      ...cell,
                      textAlign: 'center',
                      fontSize: '12px',
                      fontWeight: 800,
                      background: ps ? ps.bg : isBench ? '#f0f0f0' : '#fff',
                      color: ps ? ps.color : isBench ? '#999' : '#333',
                    }}>
                      {displayPos}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>

      {/* ── NOTES ── */}
      {userNotes && (
        <div style={{ marginBottom: '14px' }}>
          <div style={{
            fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', color: '#555',
            borderBottom: `1.5px solid ${NAVY}`, paddingBottom: '3px', marginBottom: '6px',
          }}>
            Notes
          </div>
          <div style={{
            fontSize: '12px', color: '#333', lineHeight: 1.5,
            padding: '8px 10px',
            border: '1px solid #ddd', borderRadius: '4px',
            background: '#fafafa',
            whiteSpace: 'pre-wrap',
          }}>
            {userNotes}
          </div>
        </div>
      )}

      {/* ── BOX SCORE ── */}
      <div style={{
        fontSize: '9px', fontWeight: 700, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: '#555',
        borderBottom: `1.5px solid ${NAVY}`, paddingBottom: '3px', marginBottom: '6px',
      }}>
        Score
      </div>
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        tableLayout: 'fixed', border: `2px solid ${NAVY}`,
        marginBottom: '14px',
      }}>
        <colgroup>
          <col style={{ width: '130px' }} />{/* team name — wider */}
          {innings.map(i => <col key={i} />)}
          <col style={{ width: '30px' }} />
          <col style={{ width: '30px' }} />
          <col style={{ width: '30px' }} />
        </colgroup>
        <thead>
          <tr style={{ background: '#fff', color: NAVY, borderBottom: `2px solid ${NAVY}` }}>
            <th style={{ ...hdr, textAlign: 'left', paddingLeft: '8px' }}>Team</th>
            {innings.map(i => (
              <th key={i} style={{ ...hdr, fontSize: '13px' }}>{i + 1}</th>
            ))}
            <th style={{ ...hdr, borderLeft: `2px solid ${NAVY}` }}>R</th>
            <th style={hdr}>H</th>
            <th style={hdr}>E</th>
          </tr>
        </thead>
        <tbody>
          {(() => {
            // Away team always listed first in a box score
            const isHome = game?.location === 'Home'
            const rows = isHome
              ? [{ label: displayOpponent, bg: '#fff' }, { label: displayTeam, bg: '#eef3ff' }]
              : [{ label: displayTeam, bg: '#fff' }, { label: displayOpponent, bg: '#eef3ff' }]
            return rows.map((row, ti) => (
              <tr key={ti}>
                <td style={{ ...scoreCell, paddingLeft: '8px', fontWeight: 700, fontSize: '13px',
                  background: row.bg, textAlign: 'left' }}>
                  {row.label}
                </td>
                {innings.map(i => (
                  <td key={i} style={{ ...scoreCell, background: row.bg }} />
                ))}
                <td style={{ ...scoreCell, borderLeft: `2px solid ${NAVY}`, background: row.bg }} />
                <td style={{ ...scoreCell, background: row.bg }} />
                <td style={{ ...scoreCell, background: row.bg }} />
              </tr>
            ))
          })()}
        </tbody>
      </table>

      {/* ── SIX43 FOOTER BRAND ── */}
      <div style={{
        background: '#fff',
        border: `1.5px solid ${NAVY}`,
        borderRadius: '6px',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <div>
            <span style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '-1.5px', color: NAVY }}>Six</span>
            <span style={{ fontSize: '22px', fontWeight: 900, letterSpacing: '-1.5px', color: GOLD }}>43</span>
          </div>
          <span style={{ fontSize: '11px', color: '#999', letterSpacing: '0.04em' }}>
            Lineup Builder
          </span>
        </div>
        <div style={{ fontSize: '10px', color: '#aaa', textAlign: 'right' }}>
          <div>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}</div>
        </div>
      </div>

    </div>
  )
}

const ROW_H = '30px'
const SCORE_ROW_H = '38px'

const hdr: React.CSSProperties = {
  padding: '7px 3px',
  textAlign: 'center',
  fontSize: '11px',
  fontWeight: 700,
  border: '1px solid #ddd',
  height: ROW_H,
  boxSizing: 'border-box',
}

const cell: React.CSSProperties = {
  padding: '0 3px',
  border: '1px solid #ddd',
  height: ROW_H,
  boxSizing: 'border-box',
}

const scoreCell: React.CSSProperties = {
  border: '1px solid #ddd',
  height: SCORE_ROW_H,
  boxSizing: 'border-box',
  textAlign: 'center',
}
