import Link from 'next/link'
import Image from 'next/image'
import { createServerClient } from '../lib/supabase-server'

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_POS: Record<string, { bg: string; fg: string }> = {
  P:    { bg: 'rgba(75,156,211,0.22)',  fg: '#4B9CD3' },
  C:    { bg: 'rgba(192,80,120,0.22)', fg: '#E090B0' },
  '1B': { bg: 'transparent', fg: '#80B0E8' },
  '2B': { bg: 'transparent', fg: '#80B0E8' },
  SS:   { bg: 'transparent', fg: '#80B0E8' },
  '3B': { bg: 'transparent', fg: '#80B0E8' },
  LF:   { bg: 'transparent', fg: '#6DB875' },
  CF:   { bg: 'transparent', fg: '#6DB875' },
  RF:   { bg: 'transparent', fg: '#6DB875' },
  Bnch: { bg: 'transparent', fg: 'rgba(160,160,160,0.55)' },
}

const DEMO_PLAYERS = [
  { name: 'Jake M.',    innings: ['P',   'P',   '1B', 'CF',  '1B', 'P'  ] },
  { name: 'Connor B.', innings: ['C',   'C',   'C',  'C',   'C',  'C'  ] },
  { name: 'Tyler S.',  innings: ['1B',  'SS',  'SS', '1B',  '2B', 'SS' ] },
  { name: 'Marcus L.', innings: ['SS',  '2B',  '2B', 'SS',  '1B', '2B' ] },
  { name: 'Ryan P.',   innings: ['LF',  'LF',  'CF', 'RF',  'LF', 'LF' ] },
  { name: 'Drew K.',   innings: ['CF',  'RF',  'LF', 'LF',  'RF', 'CF' ] },
  { name: 'Sam T.',    innings: ['2B',  '3B',  '3B', '2B',  '3B', '3B' ] },
  { name: 'Alex W.',   innings: ['3B',  '1B',  'RF', '3B',  'SS', '1B' ] },
  { name: 'Josh M.',   innings: ['RF',  'CF', 'Bnch','RF',  'CF', 'RF' ] },
]

const DEMO_ZONE_CHIPS: Array<{ chips: string[]; done: boolean }> = [
  { chips: ['P·3', 'IF·1', 'OF·2'], done: true },
  { chips: ['C·6'],                  done: true },
  { chips: ['IF·6'],                 done: true },
  { chips: ['IF·6'],                 done: true },
  { chips: ['OF·6'],                 done: true },
  { chips: ['OF·6'],                 done: true },
  { chips: ['IF·5', 'B·1'],          done: false },
  { chips: ['IF·4', 'OF·2'],         done: true },
  { chips: ['OF·4', 'B·2'],          done: false },
]

const FEATURES = [
  { icon: '⚾', title: 'Lineup grid builder',       body: 'See every player across every inning at once. Paint positions with a click and your lineup is done in minutes — not an hour with paper and pencil.' },
  { icon: '🏟️', title: 'Field diagram view',        body: 'Flip to a baseball field view and see exactly who is standing where. Player chips show names and positions on a live field diagram.' },
  { icon: '🎮', title: 'Game Mode',                 body: 'A full-screen, high-contrast view built for the dugout. Big text, big buttons — readable from across the dugout on an iPad.' },
  { icon: '📊', title: 'Scoreboard tracking',       body: 'Track runs inning by inning right inside the app during a game. The box score is always one tap away.' },
  { icon: '🔒', title: 'Locked view',               body: 'Lock the lineup when the game starts so nothing gets changed by accident. Score stays editable — positions are protected until you unlock.' },
  { icon: '🖨️', title: 'Print & exchange cards',   body: 'Print a clean dugout lineup sheet in one tap. Exchange cards for the opposing coach too — formatted and ready to hand over at home plate.' },
  { icon: '📋', title: 'Roster & attendance',       body: 'Manage your full roster with jersey numbers and positions. Mark who shows up on game day and the lineup adjusts automatically.' },
  { icon: '📅', title: 'Seasons & schedule',        body: 'Organize games by season, set inning counts, and keep everything connected to your lineups all year long.' },
  { icon: '🔗', title: 'Coaching staff access',     body: 'Add assistant coaches by email with edit or view-only permissions. Everyone stays on the same page in real time.' },
  { icon: '📈', title: 'Playing time tracking',     body: 'See each player\'s bench %, innings by position, and field heat map for the whole season. Know who needs more time before it becomes a problem.' },
  { icon: '🎯', title: 'Pitching planner',          body: 'Log pitch counts and Six43 calculates rest days automatically. Know who\'s eligible before game day — not when you\'re already on the mound.' },
  { icon: '🏆', title: 'Tryout & team tools',       body: 'Score players at tryouts, collect coach evaluations, rank candidates, and build your team roster — all in one organized workflow.' },
]

// ── Shared mockup wrappers ────────────────────────────────────────────────────

function PhoneMockup({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        display: 'inline-block', position: 'relative',
        background: '#0a0a0a', borderRadius: '44px', padding: '14px',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 32px 64px rgba(0,0,0,0.5)',
        width: '100%', maxWidth: '240px',
      }}>
        <div style={{
          position: 'absolute', top: '22px', left: '50%', transform: 'translateX(-50%)',
          width: '70px', height: '9px', background: '#1a1a1a', borderRadius: '6px', zIndex: 2,
        }} />
        <div style={{ borderRadius: '32px', overflow: 'hidden', background: '#0B1F3A', aspectRatio: '9/19.5', position: 'relative' }}>
          <Image src={src} alt={alt} fill style={{ objectFit: 'cover', objectPosition: 'top' }} />
        </div>
      </div>
      {caption && (
        <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.3)`, marginTop: '1rem' }}>{caption}</div>
      )}
    </div>
  )
}

function BrowserMockup({ children, caption }: { children: React.ReactNode; caption?: string }) {
  return (
    <div style={{ width: '100%' }}>
      <div style={{
        background: '#0B1F3A', borderRadius: '10px', overflow: 'hidden',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.07), 0 24px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{
          background: '#0d2240', padding: '9px 14px',
          display: 'flex', alignItems: 'center', gap: '10px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FF5F57' }} />
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FFBD2E' }} />
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#28CA41' }} />
          </div>
          <div style={{
            flex: 1, background: 'rgba(255,255,255,0.05)', borderRadius: '4px',
            padding: '3px 10px', fontSize: '10px', color: 'rgba(255,255,255,0.25)',
            textAlign: 'center', maxWidth: '160px', margin: '0 auto',
          }}>
            six43.com
          </div>
        </div>
        {children}
      </div>
      {caption && (
        <div style={{ fontSize: '12px', color: 'rgba(var(--fg-rgb), 0.3)', marginTop: '1rem', textAlign: 'center' }}>
          {caption}
        </div>
      )}
    </div>
  )
}

// ── Lineup grid demo (hero) ───────────────────────────────────────────────────

function DesktopLineupGrid() {
  const innings = [1, 2, 3, 4, 5, 6]
  return (
    <div style={{ background: '#0B1F3A' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '7px 12px', background: '#0d2240',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ fontSize: '11px', fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>
          vs Cardinals · Apr 12
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap' }}>− 6 inn +</span>
          <span style={{
            fontSize: '9px', fontWeight: 700, padding: '2px 8px',
            background: 'rgba(75,156,211,0.18)', color: '#4B9CD3', borderRadius: '4px',
          }}>Lineup Ready</span>
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ padding: '5px 10px', textAlign: 'left', color: 'rgba(255,255,255,0.2)', fontWeight: 600, fontSize: '9px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              Player
            </th>
            {innings.map(i => (
              <th key={i} style={{ padding: '5px 6px', textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontWeight: 600, fontSize: '9px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                {i}
              </th>
            ))}
            <th style={{ padding: '5px 10px', textAlign: 'right', color: 'rgba(255,255,255,0.2)', fontWeight: 600, fontSize: '9px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              Inn
            </th>
          </tr>
        </thead>
        <tbody>
          {DEMO_PLAYERS.map((player, pi) => {
            const fieldingInnings = player.innings.filter(p => p !== 'Bnch').length
            return (
              <tr key={player.name} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding: '3px 10px', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '9px', color: 'rgba(255,255,255,0.22)', marginRight: '5px' }}>{pi + 1}</span>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.72)', fontWeight: 500 }}>{player.name}</span>
                </td>
                {player.innings.map((pos, ii) => {
                  const c = DEMO_POS[pos]
                  return (
                    <td key={ii} style={{ padding: '3px 3px', textAlign: 'center' }}>
                      <div style={{
                        background: c?.bg ?? 'transparent',
                        color: c?.fg ?? 'rgba(255,255,255,0.25)',
                        borderRadius: '3px', padding: '2px 0',
                        fontSize: '9px', fontWeight: 700,
                        minWidth: '26px', display: 'inline-block',
                      }}>{pos}</div>
                    </td>
                  )
                })}
                <td style={{ padding: '3px 10px', textAlign: 'right', fontSize: '9px', color: 'rgba(255,255,255,0.35)' }}>
                  {fieldingInnings}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Full lineup editor demo (spotlight) ──────────────────────────────────────

function FullDesktopLineupEditor() {
  const innings = [0, 1, 2, 3, 4, 5]
  const focusedInning = 3
  const focusedCell = { pi: 2, ii: 2 }

  const inning4Summary = [
    { pos: 'P',  player: 'Jake M.'   },
    { pos: 'C',  player: 'Connor B.' },
    { pos: '1B', player: 'Tyler S.'  },
    { pos: '2B', player: 'Marcus L.' },
    { pos: 'SS', player: null        },
    { pos: '3B', player: 'Sam T.'    },
    { pos: 'LF', player: 'Ryan P.'   },
    { pos: 'CF', player: 'Drew K.'   },
    { pos: 'RF', player: 'Alex W.'   },
  ]

  const palette = ['P','C','1B','2B','SS','3B','LF','CF','RF','Bench']

  return (
    <div style={{ background: '#0B1F3A', display: 'flex', flexDirection: 'column', height: '310px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 10px',
        background: '#0d2240', borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0, flexWrap: 'nowrap', overflow: 'hidden',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.8)', whiteSpace: 'nowrap' }}>vs Cardinals · Apr 12</span>
        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.32)', whiteSpace: 'nowrap' }}>− 6 inn +</span>
        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.32)', whiteSpace: 'nowrap' }}>↩ Undo</span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.32)', whiteSpace: 'nowrap' }}>🖨 Print</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 8, fontWeight: 700, color: '#80B0E8', padding: '2px 6px', borderRadius: 3, border: '1px solid #80B0E8', background: 'rgba(59,109,177,0.3)', whiteSpace: 'nowrap' }}>Lineup Ready</span>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ padding: '3px 5px', fontSize: 7, color: 'rgba(255,255,255,0.2)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', width: 14 }}>#</th>
                  <th style={{ padding: '3px 6px', fontSize: 7, color: 'rgba(255,255,255,0.2)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'left', minWidth: 80, borderRight: '1px solid rgba(255,255,255,0.06)' }}>Player</th>
                  {innings.map(i => (
                    <th key={i} style={{
                      padding: '3px 4px', fontSize: 7, fontWeight: 600,
                      borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', minWidth: 26,
                      color: i === focusedInning ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.2)',
                      background: i === focusedInning ? 'rgba(255,255,255,0.03)' : 'transparent',
                    }}>
                      {i + 1}
                      {i < 3 && <div style={{ fontSize: 5, color: '#6DB875', lineHeight: 1 }}>✓</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DEMO_PLAYERS.map((player, pi) => {
                  const zoneInfo = DEMO_ZONE_CHIPS[pi]
                  return (
                    <tr key={player.name} style={{ background: pi % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.018)' }}>
                      <td style={{ padding: '2px 5px', textAlign: 'center', fontSize: 7, color: 'rgba(255,255,255,0.22)' }}>{pi + 1}</td>
                      <td style={{ padding: '2px 6px', borderRight: '1px solid rgba(255,255,255,0.06)', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: 500, whiteSpace: 'nowrap' }}>{player.name}</span>
                          {zoneInfo.done && <span style={{ fontSize: 7, color: '#6DB875' }}>✓</span>}
                        </div>
                        <div style={{ display: 'flex', gap: 2, marginTop: 1, flexWrap: 'wrap' }}>
                          {zoneInfo.chips.map(chip => {
                            const col = chip.startsWith('P') ? '#4B9CD3' : chip.startsWith('C') ? '#E090B0' : chip.startsWith('IF') ? '#80B0E8' : chip.startsWith('OF') ? '#6DB875' : 'rgba(150,150,160,0.5)'
                            return <span key={chip} style={{ fontSize: 6, fontWeight: 700, color: col, opacity: 0.85 }}>{chip}</span>
                          })}
                        </div>
                      </td>
                      {player.innings.map((pos, ii) => {
                        const c = DEMO_POS[pos]
                        const isFoc = pi === focusedCell.pi && ii === focusedCell.ii
                        const isColFoc = ii === focusedInning
                        return (
                          <td key={ii} style={{ padding: '2px 2px', textAlign: 'center', background: isColFoc ? 'rgba(255,255,255,0.025)' : 'transparent' }}>
                            <div style={{
                              background: isFoc ? 'rgba(59,109,177,0.5)' : (c?.bg ?? 'transparent'),
                              color: isFoc ? '#fff' : (c?.fg ?? 'rgba(255,255,255,0.18)'),
                              borderRadius: 2, padding: '2px 0',
                              fontSize: 8, fontWeight: 700,
                              minWidth: 22, display: 'inline-block',
                              outline: isFoc ? '1.5px solid rgba(59,109,177,0.9)' : 'none',
                              outlineOffset: -1,
                            }}>{pos === 'Bnch' ? 'B' : pos}</div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '5px 8px 6px', background: 'rgba(255,255,255,0.02)', flexShrink: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
              <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.25)', marginRight: 2 }}>Fill:</span>
              {palette.map(pos => {
                const c = DEMO_POS[pos] ?? { bg: 'transparent', fg: 'rgba(255,255,255,0.3)' }
                const active = pos === 'SS'
                return (
                  <div key={pos} style={{
                    padding: '2px 4px', borderRadius: 3, fontSize: 7, fontWeight: 700,
                    border: `1px solid ${active ? c.fg : 'rgba(255,255,255,0.12)'}`,
                    background: active ? c.bg : 'transparent',
                    color: active ? c.fg : 'rgba(255,255,255,0.35)',
                    minWidth: pos === 'Bench' ? 32 : 20, textAlign: 'center',
                  }}>{pos}</div>
                )
              })}
            </div>
          </div>
        </div>

        <div style={{
          width: 108, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', flexDirection: 'column', overflowY: 'hidden',
        }}>
          <div style={{ padding: '6px 7px', flex: 1, overflowY: 'hidden' }}>
            <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', marginBottom: 4 }}>
              Inning 4
            </div>
            {inning4Summary.map(({ pos, player }) => {
              const c = DEMO_POS[pos]
              const empty = !player
              return (
                <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 2, padding: '1px 3px', borderRadius: 3, background: empty ? 'rgba(232,112,96,0.07)' : 'transparent' }}>
                  <span style={{
                    fontSize: 7, fontWeight: 800, minWidth: 20, padding: '1px 2px', borderRadius: 2,
                    textAlign: 'center', flexShrink: 0,
                    background: c?.bg ?? 'transparent', color: c?.fg ?? 'rgba(255,255,255,0.5)',
                  }}>{pos}</span>
                  <span style={{
                    fontSize: 7.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: empty ? 'rgba(232,112,96,0.8)' : 'rgba(255,255,255,0.62)',
                    fontStyle: empty ? 'italic' : 'normal',
                  }}>{player ?? '—'}</span>
                  {empty && <span style={{ fontSize: 7, color: '#E87060', flexShrink: 0 }}>!</span>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Light-theme lineup editor (any device section) ────────────────────────────

const LIGHT_POS: Record<string, { bg: string; fg: string }> = {
  P:     { bg: 'rgba(75,156,211,0.2)',   fg: '#2B7AB5' },
  C:     { bg: 'rgba(192,80,120,0.18)',  fg: '#A03060' },
  '1B':  { bg: 'transparent', fg: '#2A5A9E' },
  '2B':  { bg: 'transparent', fg: '#2A5A9E' },
  SS:    { bg: 'transparent', fg: '#2A5A9E' },
  '3B':  { bg: 'transparent', fg: '#2A5A9E' },
  LF:    { bg: 'transparent', fg: '#2A6633' },
  CF:    { bg: 'transparent', fg: '#2A6633' },
  RF:    { bg: 'transparent', fg: '#2A6633' },
  Bnch:  { bg: 'transparent', fg: 'rgba(20,40,65,0.4)' },
  Bench: { bg: 'transparent', fg: 'rgba(20,40,65,0.4)' },
}

function BrowserMockupLight({ children, caption }: { children: React.ReactNode; caption?: string }) {
  return (
    <div style={{ width: '100%' }}>
      <div style={{
        background: '#EBF0F7', borderRadius: '10px', overflow: 'hidden',
        boxShadow: '0 0 0 1px rgba(11,31,58,0.1), 0 24px 60px rgba(0,0,0,0.12)',
      }}>
        <div style={{
          background: '#dde4ee', padding: '9px 14px',
          display: 'flex', alignItems: 'center', gap: '10px',
          borderBottom: '1px solid rgba(11,31,58,0.08)',
        }}>
          <div style={{ display: 'flex', gap: '5px', flexShrink: 0 }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FF5F57' }} />
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FFBD2E' }} />
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#28CA41' }} />
          </div>
          <div style={{
            flex: 1, background: 'rgba(0,0,0,0.07)', borderRadius: '4px',
            padding: '3px 10px', fontSize: '10px', color: 'rgba(0,0,0,0.4)',
            textAlign: 'center', maxWidth: '160px', margin: '0 auto',
          }}>
            six43.com
          </div>
        </div>
        {children}
      </div>
      {caption && (
        <div style={{ fontSize: '12px', color: 'rgba(var(--fg-rgb), 0.3)', marginTop: '1rem', textAlign: 'center' }}>
          {caption}
        </div>
      )}
    </div>
  )
}

function FullDesktopLineupEditorLight() {
  const innings = [0, 1, 2, 3, 4, 5]
  const focusedInning = 3
  const focusedCell = { pi: 2, ii: 2 }

  const inning4Summary = [
    { pos: 'P',  player: 'Jake M.'   },
    { pos: 'C',  player: 'Connor B.' },
    { pos: '1B', player: 'Tyler S.'  },
    { pos: '2B', player: 'Marcus L.' },
    { pos: 'SS', player: null        },
    { pos: '3B', player: 'Sam T.'    },
    { pos: 'LF', player: 'Ryan P.'   },
    { pos: 'CF', player: 'Drew K.'   },
    { pos: 'RF', player: 'Alex W.'   },
  ]

  const palette = ['P','C','1B','2B','SS','3B','LF','CF','RF','Bench']

  return (
    <div style={{ background: '#EBF0F7', display: 'flex', flexDirection: 'column', height: '310px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 10px',
        background: '#dde4ee', borderBottom: '1px solid rgba(11,31,58,0.08)',
        flexShrink: 0, flexWrap: 'nowrap', overflow: 'hidden',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(11,31,58,0.8)', whiteSpace: 'nowrap' }}>vs Cardinals · Apr 12</span>
        <div style={{ width: 1, height: 14, background: 'rgba(11,31,58,0.12)', flexShrink: 0 }} />
        <span style={{ fontSize: 9, color: 'rgba(11,31,58,0.35)', whiteSpace: 'nowrap' }}>− 6 inn +</span>
        <span style={{ fontSize: 9, color: 'rgba(11,31,58,0.35)', whiteSpace: 'nowrap' }}>🖨 Print</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 8, fontWeight: 700, color: '#2B7AB5', padding: '2px 6px', borderRadius: 3, border: '1px solid #2B7AB5', background: 'rgba(43,122,181,0.12)', whiteSpace: 'nowrap' }}>Lineup Ready</span>
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={{ padding: '3px 5px', fontSize: 7, color: 'rgba(11,31,58,0.25)', fontWeight: 600, borderBottom: '1px solid rgba(11,31,58,0.07)', textAlign: 'center', width: 14 }}>#</th>
                  <th style={{ padding: '3px 6px', fontSize: 7, color: 'rgba(11,31,58,0.25)', fontWeight: 600, borderBottom: '1px solid rgba(11,31,58,0.07)', textAlign: 'left', minWidth: 80, borderRight: '1px solid rgba(11,31,58,0.07)' }}>Player</th>
                  {innings.map(i => (
                    <th key={i} style={{
                      padding: '3px 4px', fontSize: 7, fontWeight: 600,
                      borderBottom: '1px solid rgba(11,31,58,0.07)', textAlign: 'center', minWidth: 26,
                      color: i === focusedInning ? 'rgba(11,31,58,0.6)' : 'rgba(11,31,58,0.25)',
                      background: i === focusedInning ? 'rgba(11,31,58,0.03)' : 'transparent',
                    }}>
                      {i + 1}
                      {i < 3 && <div style={{ fontSize: 5, color: '#2A6633', lineHeight: 1 }}>✓</div>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DEMO_PLAYERS.map((player, pi) => {
                  const zoneInfo = DEMO_ZONE_CHIPS[pi]
                  return (
                    <tr key={player.name} style={{ background: pi % 2 === 0 ? 'transparent' : 'rgba(11,31,58,0.02)' }}>
                      <td style={{ padding: '2px 5px', textAlign: 'center', fontSize: 7, color: 'rgba(11,31,58,0.3)' }}>{pi + 1}</td>
                      <td style={{ padding: '2px 6px', borderRight: '1px solid rgba(11,31,58,0.07)', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ fontSize: 9, color: 'rgba(11,31,58,0.72)', fontWeight: 500, whiteSpace: 'nowrap' }}>{player.name}</span>
                          {zoneInfo.done && <span style={{ fontSize: 7, color: '#2A6633' }}>✓</span>}
                        </div>
                      </td>
                      {player.innings.map((pos, ii) => {
                        const c = LIGHT_POS[pos]
                        const isFoc = pi === focusedCell.pi && ii === focusedCell.ii
                        const isColFoc = ii === focusedInning
                        return (
                          <td key={ii} style={{ padding: '2px 2px', textAlign: 'center', background: isColFoc ? 'rgba(11,31,58,0.025)' : 'transparent' }}>
                            <div style={{
                              background: isFoc ? 'rgba(43,122,181,0.25)' : (c?.bg ?? 'transparent'),
                              color: isFoc ? '#0B1F3A' : (c?.fg ?? 'rgba(11,31,58,0.2)'),
                              borderRadius: 2, padding: '2px 0',
                              fontSize: 8, fontWeight: 700,
                              minWidth: 22, display: 'inline-block',
                              outline: isFoc ? '1.5px solid rgba(43,122,181,0.7)' : 'none',
                              outlineOffset: -1,
                            }}>{pos === 'Bnch' ? 'B' : pos}</div>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div style={{ borderTop: '1px solid rgba(11,31,58,0.07)', padding: '5px 8px 6px', background: 'rgba(11,31,58,0.02)', flexShrink: 0 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, alignItems: 'center' }}>
              <span style={{ fontSize: 7, color: 'rgba(11,31,58,0.3)', marginRight: 2 }}>Fill:</span>
              {palette.map(pos => {
                const c = LIGHT_POS[pos] ?? { bg: 'transparent', fg: 'rgba(11,31,58,0.4)' }
                const active = pos === 'SS'
                return (
                  <div key={pos} style={{
                    padding: '2px 4px', borderRadius: 3, fontSize: 7, fontWeight: 700,
                    border: `1px solid ${active ? c.fg : 'rgba(11,31,58,0.15)'}`,
                    background: active ? c.bg : 'transparent',
                    color: active ? c.fg : 'rgba(11,31,58,0.4)',
                    minWidth: pos === 'Bench' ? 32 : 20, textAlign: 'center',
                  }}>{pos}</div>
                )
              })}
            </div>
          </div>
        </div>

        <div style={{
          width: 108, flexShrink: 0, borderLeft: '1px solid rgba(11,31,58,0.08)',
          display: 'flex', flexDirection: 'column', overflowY: 'hidden',
        }}>
          <div style={{ padding: '6px 7px', flex: 1, overflowY: 'hidden' }}>
            <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(11,31,58,0.28)', marginBottom: 4 }}>
              Inning 4
            </div>
            {inning4Summary.map(({ pos, player }) => {
              const c = LIGHT_POS[pos]
              const empty = !player
              return (
                <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 2, padding: '1px 3px', borderRadius: 3, background: empty ? 'rgba(200,80,70,0.06)' : 'transparent' }}>
                  <span style={{ fontSize: 7, fontWeight: 800, minWidth: 20, padding: '1px 2px', borderRadius: 2, textAlign: 'center', flexShrink: 0, background: c?.bg ?? 'transparent', color: c?.fg ?? 'rgba(11,31,58,0.5)' }}>{pos}</span>
                  <span style={{ fontSize: 7.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: empty ? 'rgba(180,60,50,0.85)' : 'rgba(11,31,58,0.65)', fontStyle: empty ? 'italic' : 'normal' }}>{player ?? '—'}</span>
                  {empty && <span style={{ fontSize: 7, color: '#B83C32', flexShrink: 0 }}>!</span>}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Field view demo ───────────────────────────────────────────────────────────

function FieldViewDemo() {
  const players = [
    { pos: 'CF',  name: 'Alex W.',   top: 22, left: 50,  bg: 'rgba(109,184,117,0.38)', fg: '#6DB875' },
    { pos: 'LF',  name: 'Ryan P.',   top: 41, left: 14,  bg: 'rgba(109,184,117,0.38)', fg: '#6DB875' },
    { pos: 'RF',  name: 'Josh M.',   top: 41, left: 86,  bg: 'rgba(109,184,117,0.38)', fg: '#6DB875' },
    { pos: 'SS',  name: 'Tyler S.',  top: 60, left: 37,  bg: 'rgba(128,176,232,0.32)', fg: '#80B0E8' },
    { pos: '2B',  name: 'Marcus L.', top: 57, left: 63,  bg: 'rgba(128,176,232,0.32)', fg: '#80B0E8' },
    { pos: '3B',  name: 'Sam T.',    top: 72, left: 22,  bg: 'rgba(128,176,232,0.32)', fg: '#80B0E8' },
    { pos: '1B',  name: 'Drew K.',   top: 72, left: 78,  bg: 'rgba(128,176,232,0.32)', fg: '#80B0E8' },
    { pos: 'P',   name: 'Jake M.',   top: 68, left: 50,  bg: 'rgba(75,156,211,0.45)',  fg: '#4B9CD3', isUp: true },
    { pos: 'C',   name: 'Connor B.', top: 87, left: 50,  bg: 'rgba(192,80,120,0.35)', fg: '#E090B0' },
  ]
  return (
    <div style={{ background: '#0B1F3A', padding: '10px 10px 14px' }}>
      {/* Inning strip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
        <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)', marginRight: 4 }}>Inning</span>
        {[1,2,3,4,5,6].map(i => (
          <div key={i} style={{
            width: 22, height: 22, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, fontWeight: i === 3 ? 700 : 400,
            background: i === 3 ? 'rgba(75,156,211,0.18)' : 'rgba(255,255,255,0.04)',
            border: i === 3 ? '1px solid rgba(75,156,211,0.5)' : '0.5px solid rgba(255,255,255,0.08)',
            color: i === 3 ? '#4B9CD3' : 'rgba(255,255,255,0.35)',
          }}>{i}</div>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 7, padding: '2px 6px', borderRadius: 3, background: 'rgba(75,156,211,0.12)', color: '#4B9CD3', fontWeight: 700, border: '0.5px solid rgba(75,156,211,0.3)' }}>◈ Field</div>
      </div>

      {/* Field container */}
      <div style={{ position: 'relative', width: '100%', maxWidth: 340, margin: '0 auto', aspectRatio: '400/440', borderRadius: 10, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' }}>
        <svg viewBox="0 0 400 440" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
          <rect width="400" height="440" fill="#243d24" />
          <path d="M 200 420 L 0 220 A 260 260 0 0 1 400 220 Z" fill="#2e5c32" />
          <path d="M 0 220 A 260 260 0 0 1 400 220" fill="none" stroke="rgba(180,125,55,0.75)" strokeWidth="22" />
          <path d="M 0 220 A 260 260 0 0 1 400 220" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
          <line x1="200" y1="420" x2="0"   y2="220" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
          <line x1="200" y1="420" x2="400" y2="220" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" />
          <polygon points="200,420 280,340 200,260 120,340" fill="#9a6535" opacity="0.85" />
          <line x1="200" y1="420" x2="280" y2="340" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
          <line x1="280" y1="340" x2="200" y2="260" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
          <line x1="200" y1="260" x2="120" y2="340" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
          <line x1="120" y1="340" x2="200" y2="420" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
          <rect x="273" y="333" width="14" height="14" rx="1" fill="white" opacity="0.92" transform="rotate(45 280 340)" />
          <rect x="193" y="253" width="14" height="14" rx="1" fill="white" opacity="0.92" transform="rotate(45 200 260)" />
          <rect x="113" y="333" width="14" height="14" rx="1" fill="white" opacity="0.92" transform="rotate(45 120 340)" />
          <polygon points="193,418 207,418 212,429 200,436 188,429" fill="white" opacity="0.92" />
          <circle cx="200" cy="324" r="13" fill="#8b5a2b" opacity="0.88" />
          <circle cx="200" cy="324" r="4"  fill="#a06832" />
          <rect x="194" y="321" width="12" height="4" rx="1" fill="white" opacity="0.85" />
        </svg>

        {players.map(p => (
          <div key={p.pos} style={{
            position: 'absolute',
            top: `${p.top}%`, left: `${p.left}%`,
            transform: 'translate(-50%, -50%)',
            width: 62, padding: '3px 4px', borderRadius: 6,
            textAlign: 'center', zIndex: 10,
            backdropFilter: 'blur(4px)',
            background: p.bg,
            border: p.isUp ? '1.5px solid #4B9CD3' : `1px solid ${p.fg}44`,
            boxShadow: p.isUp ? '0 0 10px rgba(75,156,211,0.5)' : 'none',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 1 }}>
              <span style={{ fontSize: 7, fontWeight: 800, color: p.isUp ? '#fff' : p.fg }}>{p.pos}</span>
            </div>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
              {p.name.split(' ')[1]}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── In-game mode demo ─────────────────────────────────────────────────────────

function InGameModeDemo() {
  const GM_BG      = '#060E1C'
  const GM_BG2     = '#0B1628'
  const GM_BORDER  = 'rgba(238,244,255,0.1)'
  const GM_FG      = '#EEF4FF'
  const GM_FG_DIM  = 'rgba(238,244,255,0.45)'
  const GM_AMBER   = '#F5A623'

  const inning = 2 // 0-indexed → "Inning 3"
  const innings = [0,1,2,3,4,5]
  const us   = [null, 2, 1, null, null, null]
  const them = [null, 1, 0, null, null, null]

  const batting = [
    { order: 1, jersey: 12, name: 'Jake Martinez',  pos: 'P',   isUp: false, isNext: false },
    { order: 2, jersey: 5,  name: 'Connor Brown',   pos: 'C',   isUp: false, isNext: false },
    { order: 3, jersey: 8,  name: 'Tyler Smith',    pos: 'SS',  isUp: true,  isNext: false },
    { order: 4, jersey: 3,  name: 'Marcus Lee',     pos: '2B',  isUp: false, isNext: true  },
    { order: 5, jersey: 17, name: 'Ryan Parker',    pos: 'LF',  isUp: false, isNext: false },
  ]

  const posBg: Record<string, { bg: string; color: string }> = {
    P:   { bg: 'rgba(75,156,211,0.25)',  color: '#6BB8FF' },
    C:   { bg: 'rgba(220,100,150,0.25)', color: '#F0A0C8' },
    SS:  { bg: 'rgba(128,176,232,0.2)',  color: '#9EC8FF' },
    '2B':{ bg: 'rgba(128,176,232,0.2)',  color: '#9EC8FF' },
    LF:  { bg: 'rgba(109,184,117,0.22)', color: '#80D890' },
  }

  return (
    <div style={{ background: GM_BG, borderRadius: 10, overflow: 'hidden', boxShadow: '0 0 0 1px rgba(255,255,255,0.07), 0 24px 60px rgba(0,0,0,0.5)' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 12px', height: 44,
        background: GM_BG2, borderBottom: `1px solid ${GM_BORDER}`,
      }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: GM_FG_DIM, padding: '3px 8px', borderRadius: 4, border: `1px solid ${GM_BORDER}`, background: 'rgba(238,244,255,0.04)' }}>✕ Exit</div>
        <div style={{ width: 1, height: 16, background: GM_BORDER }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 9, color: GM_FG_DIM }}>‹</span>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 7, fontWeight: 700, color: GM_FG_DIM, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Inning</div>
            <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1, color: GM_FG }}>3</div>
          </div>
          <span style={{ fontSize: 9, color: GM_FG_DIM }}>›</span>
        </div>
        <div style={{ width: 1, height: 16, background: GM_BORDER }} />
        <div style={{ fontSize: 16, fontWeight: 800, color: '#6DD880' }}>3</div>
        <div style={{ fontSize: 11, color: GM_FG_DIM }}>–</div>
        <div style={{ fontSize: 16, fontWeight: 800, color: GM_FG }}>1</div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', border: `1px solid ${GM_BORDER}`, borderRadius: 5, overflow: 'hidden', fontSize: 8, fontWeight: 700 }}>
          <div style={{ padding: '4px 8px', background: 'rgba(75,156,211,0.2)', color: '#6BB8FF' }}>◈ Field</div>
          <div style={{ padding: '4px 8px', color: GM_FG_DIM }}>≡ List</div>
        </div>
        <div style={{ fontSize: 10, padding: '3px 7px', borderRadius: 4, border: `1px solid rgba(245,166,35,0.4)`, background: 'rgba(245,166,35,0.1)', color: GM_AMBER }}>🔒</div>
      </div>

      {/* Scoreboard */}
      <div style={{ padding: '8px 12px', background: GM_BG2, borderBottom: `1px solid ${GM_BORDER}` }}>
        {/* Inning header */}
        <div style={{ display: 'flex', marginBottom: 3 }}>
          <div style={{ width: 52, flexShrink: 0 }} />
          {innings.map(i => (
            <div key={i} style={{
              flex: 1, textAlign: 'center', fontSize: 9,
              fontWeight: i === inning ? 800 : 500,
              color: i === inning ? GM_AMBER : 'rgba(238,244,255,0.3)',
            }}>{i + 1}</div>
          ))}
          <div style={{ width: 28, textAlign: 'center', fontSize: 9, color: 'rgba(238,244,255,0.35)', fontWeight: 700 }}>R</div>
        </div>
        {/* Us row */}
        <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(238,244,255,0.04)', border: `0.5px solid ${GM_BORDER}`, borderRadius: 6, overflow: 'hidden', marginBottom: 4 }}>
          <div style={{ width: 52, padding: '5px 6px 5px 10px', fontSize: 10, fontWeight: 800, color: GM_FG, borderRight: `0.5px solid ${GM_BORDER}`, flexShrink: 0 }}>Bears</div>
          {innings.map(i => (
            <div key={i} style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '3px 1px', background: i === inning ? 'rgba(245,166,35,0.08)' : 'transparent' }}>
              <div style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 3, border: i === inning ? `1px solid rgba(245,166,35,0.4)` : `0.5px solid rgba(238,244,255,0.1)`, fontSize: 10, fontWeight: 800, color: GM_AMBER }}>{us[i] ?? ''}</div>
            </div>
          ))}
          <div style={{ width: 28, textAlign: 'center', fontSize: 16, fontWeight: 900, color: GM_AMBER, borderLeft: `1px solid ${GM_BORDER}` }}>3</div>
        </div>
        {/* Them row */}
        <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(238,244,255,0.04)', border: `0.5px solid ${GM_BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
          <div style={{ width: 52, padding: '5px 6px 5px 10px', fontSize: 10, fontWeight: 600, color: GM_FG_DIM, borderRight: `0.5px solid ${GM_BORDER}`, flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Cards</div>
          {innings.map(i => (
            <div key={i} style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: '3px 1px' }}>
              <div style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 3, border: `0.5px solid rgba(238,244,255,0.1)`, fontSize: 10, fontWeight: 800, color: GM_FG }}>{them[i] ?? ''}</div>
            </div>
          ))}
          <div style={{ width: 28, textAlign: 'center', fontSize: 16, fontWeight: 900, color: GM_FG_DIM, borderLeft: `1px solid ${GM_BORDER}` }}>1</div>
        </div>
      </div>

      {/* UP banner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(245,166,35,0.1)', borderBottom: `1px solid rgba(245,166,35,0.2)` }}>
        <span style={{ fontSize: 9, fontWeight: 900, color: GM_AMBER, letterSpacing: '0.1em' }}>UP</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: GM_FG }}>
          #3 Tyler Smith
        </span>
        <span style={{ fontSize: 11, color: GM_FG_DIM }}>on deck: #4 Marcus Lee</span>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 9, fontWeight: 800, padding: '4px 10px', borderRadius: 5, background: 'rgba(245,166,35,0.2)', border: `1px solid rgba(245,166,35,0.4)`, color: GM_AMBER }}>Next →</div>
      </div>

      {/* Batting list */}
      {batting.map(b => {
        const pc = posBg[b.pos]
        return (
          <div key={b.order} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px',
            borderBottom: `1px solid ${GM_BORDER}`,
            background: b.isUp ? 'rgba(245,166,35,0.1)' : b.isNext ? 'rgba(245,166,35,0.04)' : 'transparent',
            borderLeft: b.isUp ? `3px solid ${GM_AMBER}` : b.isNext ? `3px solid rgba(245,166,35,0.3)` : '3px solid transparent',
          }}>
            <div style={{ width: 18, textAlign: 'center', fontSize: 12, fontWeight: 800, color: b.isUp ? GM_AMBER : GM_FG_DIM }}>{b.order}</div>
            <div style={{ width: 28, textAlign: 'center', fontSize: 9, color: GM_FG_DIM }}>#{b.jersey}</div>
            <div style={{ flex: 1, fontSize: 16, fontWeight: 800, color: GM_FG }}>{b.name}</div>
            <div style={{
              fontSize: 13, fontWeight: 900, padding: '4px 10px', borderRadius: 6,
              background: pc?.bg ?? 'rgba(238,244,255,0.08)',
              color: pc?.color ?? GM_FG_DIM,
              minWidth: 40, textAlign: 'center',
            }}>{b.pos}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function HomePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const loggedIn = !!user

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif' }}>

      {/* ── Nav ── */}
      <nav className="mkt-outer" style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '1.25rem 1.5rem',
      }}>
        <span style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.01em' }}>
          Six<span style={{ color: 'var(--accent)' }}>43</span>
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {loggedIn ? (
            <Link href="/games" style={{
              fontSize: '13px', fontWeight: 700,
              color: 'var(--accent-text)', background: 'var(--accent)',
              textDecoration: 'none', padding: '7px 18px', borderRadius: '6px',
            }}>
              Open app →
            </Link>
          ) : (
            <>
              <Link href="/login" style={{
                fontSize: '13px', fontWeight: 600,
                color: `rgba(var(--fg-rgb), 0.6)`, textDecoration: 'none',
              }}>
                Log in
              </Link>
              <Link href="/login" style={{
                fontSize: '13px', fontWeight: 700,
                color: 'var(--accent-text)', background: 'var(--accent)',
                textDecoration: 'none', padding: '7px 18px', borderRadius: '6px',
              }}>
                Get started free
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="mkt-outer mkt-hero">
        <div className="mkt-hero-text">
          <div style={{
            display: 'inline-block',
            fontSize: '11px', fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--accent)',
            background: 'rgba(75,156,211,0.12)',
            border: '0.5px solid rgba(75,156,211,0.25)',
            borderRadius: '20px', padding: '4px 14px', marginBottom: '1.5rem',
          }}>
            Built for youth baseball coaches
          </div>

          <h1 style={{
            fontSize: 'clamp(34px, 5.5vw, 56px)', fontWeight: 800,
            lineHeight: 1.05, letterSpacing: '-0.02em', marginBottom: '1.25rem',
          }}>
            Build the lineup.<br />
            <span style={{ color: 'var(--accent)' }}>Run the game.</span>
          </h1>

          <p style={{
            fontSize: '17px', lineHeight: 1.65,
            color: `rgba(var(--fg-rgb), 0.6)`,
            maxWidth: '420px', margin: '0 auto 2.5rem',
          }}>
            Six43 is the lineup planner and game management tool designed for youth baseball coaches. Plan positions the night before, manage the game from the dugout, and stay organized all season long.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'inherit', gap: '10px' }}>
            <div>
              <Link href="/login" style={{
                display: 'inline-block', background: 'var(--accent)',
                color: 'var(--accent-text)', fontSize: '15px', fontWeight: 700,
                padding: '14px 36px', borderRadius: '8px',
                textDecoration: 'none', letterSpacing: '0.01em',
              }}>
                Start building for free
              </Link>
            </div>
            <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.35)` }}>
              Free to start · No credit card required · Beta access available
            </div>
          </div>
        </div>

        <div className="mkt-hero-browser">
          <BrowserMockup caption="Build and manage lineups from your laptop">
            <FullDesktopLineupEditor />
          </BrowserMockup>
        </div>
      </section>

      {/* ── Social proof strip ── */}
      <section style={{ padding: '1.25rem 1.5rem', borderTop: '0.5px solid var(--border-subtle)', borderBottom: '0.5px solid var(--border-subtle)' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '2rem' }}>
          <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.4)`, textAlign: 'center' }}>
            <span style={{ fontWeight: 700, color: 'var(--fg)' }}>Travel · Rec · Tournament</span>
            <span style={{ margin: '0 8px', opacity: 0.3 }}>·</span>
            Works on desktop, tablet, and mobile
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            {[1,2,3,4,5].map(i => (
              <span key={i} style={{ color: 'var(--accent)', fontSize: '14px' }}>★</span>
            ))}
            <span style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.45)`, marginLeft: '4px' }}>
              "Finally a tool that thinks like a coach"
            </span>
          </div>
          <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.35)` }}>
            Youth baseball &amp; softball · Free to start
          </div>
        </div>
      </section>

      <div className="mkt-divider" />

      {/* ── Spotlight 1: Lineup Grid ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem' }}>
        <div className="mkt-spotlight">
          <div className="mkt-spotlight-img" style={{ maxWidth: '460px', width: '100%' }}>
            <BrowserMockup>
              <DesktopLineupGrid />
            </BrowserMockup>
          </div>
          <div className="mkt-spotlight-text">
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '12px' }}>Lineup grid</div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 800, lineHeight: 1.15, marginBottom: '1rem' }}>
              Every player, every inning,<br />all at once.
            </h2>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: `rgba(var(--fg-rgb), 0.6)`, marginBottom: '1.5rem' }}>
              The grid view is the fastest way to plan defensive positions. See your whole lineup in one table — rows are players, columns are innings. Click a cell, pick a position, move on. No paper, no spreadsheet.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                'Full grid — all players and all innings in a single view',
                'Click to assign, keyboard shortcuts for speed',
                'Position color coding makes gaps and rotations obvious at a glance',
                'Playing time summary shows innings played per player',
                'Inning column turns green when fully covered — no missed slots',
              ].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ color: '#6DB875', fontSize: '13px', marginTop: '1px', flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.7)` }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mkt-divider" />

      {/* ── Spotlight 2: Field View ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem' }}>
        <div className="mkt-spotlight reverse">
          <div className="mkt-spotlight-img" style={{ maxWidth: '420px', width: '100%' }}>
            <BrowserMockup>
              <FieldViewDemo />
            </BrowserMockup>
          </div>
          <div className="mkt-spotlight-text">
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '12px' }}>Field diagram</div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 800, lineHeight: 1.15, marginBottom: '1rem' }}>
              See exactly who's<br />standing where.
            </h2>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: `rgba(var(--fg-rgb), 0.6)`, marginBottom: '1.5rem' }}>
              Switch to the field view and see every player positioned on a live baseball diamond. Player chips show names on the field — so you can spot a crowded outfield or an uncovered infield in seconds.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                'Interactive field diagram with all nine positions',
                'Tap any chip to reassign a player\'s position',
                'Sidebar shows the full batting order alongside the field',
                'Flip between grid view and field view with a single tap',
                'Works on desktop, tablet, and phone',
              ].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ color: '#6DB875', fontSize: '13px', marginTop: '1px', flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.7)` }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mkt-divider" />

      {/* ── Spotlight 3: Game Mode ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem' }}>
        <div className="mkt-spotlight">
          <div className="mkt-spotlight-img" style={{ maxWidth: '460px', width: '100%' }}>
            <InGameModeDemo />
          </div>
          <div className="mkt-spotlight-text">
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '12px' }}>Game day</div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 800, lineHeight: 1.15, marginBottom: '1rem' }}>
              Built for the dugout.<br />Big text. No fumbling.
            </h2>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: `rgba(var(--fg-rgb), 0.6)`, marginBottom: '1.5rem' }}>
              Game Mode is a full-screen, high-contrast view designed for coaches on an iPad in the dugout. One tap gets you into a clean display — large player names, clear positions, and the score — readable from the other end of the bench.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                'Full-screen Game Mode with large text and max contrast',
                'Scoreboard tracks runs by inning — editable during the game',
                'Batting order highlights who\'s up and who\'s on deck',
                'Lock positions to prevent accidental changes mid-game',
                'Switch between batting list and field diagram on the fly',
              ].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ color: '#6DB875', fontSize: '13px', marginTop: '1px', flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.7)` }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mkt-divider" />

      {/* ── "Built for game day" 3-card section ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.3)`, marginBottom: '4px' }}>
            Game day features
          </div>
          <h2 style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 800, marginBottom: '0.5rem' }}>
            Less chaos in the dugout
          </h2>
          <p style={{ fontSize: '14px', color: `rgba(var(--fg-rgb), 0.5)`, maxWidth: '440px', margin: '0 auto', lineHeight: 1.6 }}>
            Six43 was built to be useful when the game is actually happening — not just in the planning phase.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '16px' }}>
          {[
            {
              icon: '🔒',
              title: 'Locked view',
              body: 'Once the game starts, lock the lineup. Position assignments are protected against accidental taps — but the score is always editable. One tap on the lock icon to unlock when you need to make a change.',
              accent: '#F5A623',
              accentBg: 'rgba(245,166,35,0.08)',
              accentBorder: 'rgba(245,166,35,0.2)',
            },
            {
              icon: '📊',
              title: 'Inning scoreboard',
              body: 'Track runs inning by inning without leaving the app. The box score sits right above your batting order — type in a run and it updates the total instantly. No separate scorecard.',
              accent: '#6BB8FF',
              accentBg: 'rgba(75,156,211,0.08)',
              accentBorder: 'rgba(75,156,211,0.2)',
            },
            {
              icon: '📱',
              title: 'iPad & tablet ready',
              body: 'Game Mode is designed for a tablet in the dugout. Large fonts, high-contrast colors, and a full-screen layout so coaches can glance at it from a few feet away without squinting.',
              accent: '#80D890',
              accentBg: 'rgba(109,184,117,0.08)',
              accentBorder: 'rgba(109,184,117,0.2)',
            },
          ].map(card => (
            <div key={card.title} style={{
              background: card.accentBg,
              border: `0.5px solid ${card.accentBorder}`,
              borderRadius: '14px', padding: '1.75rem',
            }}>
              <div style={{ fontSize: '28px', marginBottom: '12px', lineHeight: 1 }}>{card.icon}</div>
              <div style={{ fontSize: '16px', fontWeight: 800, marginBottom: '8px', color: 'var(--fg)' }}>{card.title}</div>
              <div style={{ fontSize: '13px', lineHeight: 1.65, color: `rgba(var(--fg-rgb), 0.6)` }}>{card.body}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="mkt-divider" />

      {/* ── Spotlight 4: Print & share ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem' }}>
        <div className="mkt-spotlight reverse">
          <div className="mkt-spotlight-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '14px', padding: '20px', width: '100%', maxWidth: '300px' }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '14px' }}>Print Options</div>

              {/* Lineup card */}
              <div style={{ background: 'var(--bg-card-alt)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '18px' }}>🖨️</span>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700 }}>Dugout lineup card</div>
                    <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.4)` }}>Full batting order + inning positions</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <div style={{ flex: 1, padding: '6px 0', borderRadius: '5px', textAlign: 'center', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '11px', fontWeight: 700 }}>Print</div>
                  <div style={{ flex: 1, padding: '6px 0', borderRadius: '5px', textAlign: 'center', background: 'transparent', border: '0.5px solid var(--border-md)', color: `rgba(var(--fg-rgb), 0.55)`, fontSize: '11px' }}>Share link</div>
                </div>
              </div>

              {/* Exchange card */}
              <div style={{ background: 'var(--bg-card-alt)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <span style={{ fontSize: '18px' }}>📋</span>
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: 700 }}>Exchange card</div>
                    <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.4)` }}>Standard format for the opposing coach</div>
                  </div>
                </div>
                <div style={{ flex: 1, padding: '6px 0', borderRadius: '5px', textAlign: 'center', background: 'transparent', border: '0.5px solid var(--border-md)', color: `rgba(var(--fg-rgb), 0.55)`, fontSize: '11px' }}>Print exchange card</div>
              </div>
            </div>
          </div>

          <div className="mkt-spotlight-text">
            <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '12px' }}>Print & share</div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 34px)', fontWeight: 800, lineHeight: 1.15, marginBottom: '1rem' }}>
              Your lineup on paper<br />in one tap.
            </h2>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: `rgba(var(--fg-rgb), 0.6)`, marginBottom: '1.5rem' }}>
              Some coaches prefer paper. Some leagues require an exchange card. Six43 handles both. Print a clean dugout lineup sheet or a formatted exchange card ready to hand over at home plate — from your phone, tablet, or laptop.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                'Dugout lineup card — batting order with inning-by-inning positions',
                'Exchange card formatted for the opposing team\'s coach',
                'Print from desktop, tablet, or phone',
                'Share a read-only link with your coaching staff',
              ].map(item => (
                <div key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <span style={{ color: '#6DB875', fontSize: '13px', marginTop: '1px', flexShrink: 0 }}>✓</span>
                  <span style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.7)` }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="mkt-divider" />

      {/* ── "Stay organized" section ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.3)`, marginBottom: '4px' }}>
            Season management
          </div>
          <h2 style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 800, marginBottom: '0.5rem' }}>
            Everything in one place, all season
          </h2>
          <p style={{ fontSize: '14px', color: `rgba(var(--fg-rgb), 0.5)`, maxWidth: '440px', margin: '0 auto', lineHeight: 1.6 }}>
            From first practice to the championship game, Six43 keeps your team organized without the pile of papers.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
          {[
            { icon: '👥', title: 'Roster management', body: 'Add players with jersey numbers and positions. Mark who\'s absent on game day and the lineup updates automatically.' },
            { icon: '📅', title: 'Seasons & games',   body: 'Organize by season. Set inning counts per game. Import schedules from GameChanger or enter games manually.' },
            { icon: '📈', title: 'Playing time',      body: 'Track bench %, field innings, and position history for every player all season. Know who needs more time before a parent asks.' },
            { icon: '🎯', title: 'Pitching planner',  body: 'Log pitch counts after each game. Rest days are calculated automatically so you always know who\'s eligible.' },
            { icon: '🔗', title: 'Coaching staff',    body: 'Add assistant coaches by email with edit or view-only access. Everyone works from the same data.' },
            { icon: '🏆', title: 'Tryout tools',      body: 'Score players at tryouts, collect coach evaluations, compare candidates, and build your roster — all in one organized workflow.' },
          ].map(card => (
            <div key={card.title} style={{
              background: 'var(--bg-card)', border: '0.5px solid var(--border)',
              borderRadius: '12px', padding: '1.25rem 1.5rem',
              display: 'flex', gap: '12px', alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: '20px', lineHeight: 1, flexShrink: 0, marginTop: '2px' }}>{card.icon}</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '5px' }}>{card.title}</div>
                <div style={{ fontSize: '12px', lineHeight: 1.6, color: `rgba(var(--fg-rgb), 0.55)` }}>{card.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mkt-divider" />

      {/* ── Any device ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.3)`, marginBottom: '4px' }}>
            Any device
          </div>
          <h2 style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 800, marginBottom: '0.5rem' }}>
            Plan at your desk.<br />Coach from the dugout.
          </h2>
          <p style={{ fontSize: '14px', color: `rgba(var(--fg-rgb), 0.5)`, maxWidth: '400px', margin: '0 auto', lineHeight: 1.6 }}>
            Build the lineup on your laptop the night before. Pull it up on your iPad or phone when the game starts. Same data, always in sync.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '2rem', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '260px', maxWidth: '520px' }}>
            <BrowserMockupLight>
              <FullDesktopLineupEditorLight />
            </BrowserMockupLight>
            <div style={{ textAlign: 'center', fontSize: '12px', color: `rgba(var(--fg-rgb), 0.3)`, marginTop: '0.75rem' }}>
              Desktop — full grid, keyboard shortcuts
            </div>
          </div>
          <div style={{ flexShrink: 0, width: '160px' }}>
            <PhoneMockup src="/screenshot-lineup.png" alt="Six43 on mobile" />
            <div style={{ textAlign: 'center', fontSize: '12px', color: `rgba(var(--fg-rgb), 0.3)`, marginTop: '0.75rem' }}>
              Mobile — game day in the dugout
            </div>
          </div>
        </div>
      </section>

      <div className="mkt-divider" />

      {/* ── Full features grid ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem 4rem' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.3)`, marginBottom: '4px', textAlign: 'center' }}>
          Everything included
        </div>
        <h2 style={{ fontSize: '26px', fontWeight: 800, textAlign: 'center', marginBottom: '0.5rem' }}>
          Your complete coaching toolkit
        </h2>
        <p style={{ textAlign: 'center', fontSize: '14px', color: `rgba(var(--fg-rgb), 0.45)`, marginBottom: '2rem' }}>
          Every feature included — no hidden tiers, no locked features on the free plan.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{
              background: 'var(--bg-card)', border: '0.5px solid var(--border)',
              borderRadius: '12px', padding: '1.25rem 1.5rem',
              display: 'flex', gap: '1rem', alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: '22px', lineHeight: 1, flexShrink: 0, marginTop: '2px' }}>{f.icon}</span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '5px' }}>{f.title}</div>
                <div style={{ fontSize: '12px', lineHeight: 1.6, color: `rgba(var(--fg-rgb), 0.55)` }}>{f.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="mkt-divider" />

      {/* ── Testimonial ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem' }}>
        <div style={{ maxWidth: '560px', margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: '40px', color: 'var(--accent)', lineHeight: 1, marginBottom: '1.25rem', opacity: 0.6 }}>"</div>
          <blockquote style={{
            fontSize: 'clamp(18px, 2.5vw, 22px)', fontWeight: 600, lineHeight: 1.55,
            color: 'var(--fg)', margin: '0 0 1.5rem', fontStyle: 'italic',
          }}>
            I used to scramble the night before every game. Now I build the lineup three days out, the pitching is already planned, and I actually enjoy coaching again.
          </blockquote>
          <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`, fontWeight: 600 }}>
            10U Travel Baseball Coach
          </div>
        </div>
      </section>

      <div className="mkt-divider" />

      {/* ── Pricing ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem 1rem' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.3)`, marginBottom: '4px', textAlign: 'center' }}>
          Pricing
        </div>
        <h2 style={{ fontSize: '26px', fontWeight: 800, textAlign: 'center', marginBottom: '0.5rem' }}>
          Simple, honest pricing
        </h2>
        <p style={{ textAlign: 'center', fontSize: '14px', color: `rgba(var(--fg-rgb), 0.5)`, marginBottom: '0.75rem' }}>
          Try it free. Beta testers get Pro free for life — limited spots.
        </p>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <span style={{
            display: 'inline-block', fontSize: '11px', fontWeight: 700,
            letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'var(--accent)', background: 'rgba(75,156,211,0.1)',
            border: '0.5px solid rgba(75,156,211,0.25)',
            borderRadius: '20px', padding: '4px 14px',
          }}>
            Beta · limited spots available
          </span>
        </div>

        <div style={{ maxWidth: '560px', margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {/* Free */}
          <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1.5rem' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', marginBottom: '4px' }}>Free</div>
            <div style={{ fontSize: '32px', fontWeight: 800, marginBottom: '2px' }}>$0</div>
            <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '1.5rem' }}>
              10 games · no credit card required
            </div>
            {['All features included', 'Lineup builder & field view', 'Game Mode & scoreboard', 'Print & exchange cards', 'Playing time tracking'].map((f, i) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ color: i === 0 ? 'var(--accent)' : '#6DB875', fontSize: '12px', fontWeight: i === 0 ? 700 : 400 }}>
                  {i === 0 ? '★' : '✓'}
                </span>
                <span style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), ${i === 0 ? '0.85' : '0.65'})`, fontWeight: i === 0 ? 600 : 400 }}>{f}</span>
              </div>
            ))}
            <Link href="/login" style={{
              display: 'block', marginTop: '1.5rem', padding: '11px',
              background: 'var(--accent)', color: 'var(--accent-text)',
              borderRadius: '6px', textAlign: 'center',
              fontSize: '13px', fontWeight: 700, textDecoration: 'none',
            }}>
              Get started free
            </Link>
          </div>

          {/* Pro */}
          <div style={{
            background: 'rgba(75,156,211,0.05)', border: '0.5px solid rgba(75,156,211,0.3)',
            borderRadius: '12px', padding: '1.5rem', position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: '-1px', right: '16px',
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
              background: 'var(--accent)', color: 'var(--accent-text)',
              padding: '3px 10px', borderRadius: '0 0 6px 6px',
            }}>BETA OFFER</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', marginBottom: '4px' }}>Pro</div>
            <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.35)`, textDecoration: 'line-through', marginBottom: '2px' }}>$1.49/mo</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px', marginBottom: '2px' }}>
              <span style={{ fontSize: '32px', fontWeight: 800, color: 'var(--accent)' }}>Free</span>
            </div>
            <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '1.5rem' }}>
              for beta testers · limited spots
            </div>
            {['Everything in Free', 'Unlimited games', 'Full season history', 'Priority support', 'Early access to new features'].map((f, i) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <span style={{ color: i === 0 ? 'var(--accent)' : '#6DB875', fontSize: '12px', fontWeight: i === 0 ? 700 : 400 }}>
                  {i === 0 ? '★' : '✓'}
                </span>
                <span style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), ${i === 0 ? '0.85' : '0.65'})`, fontWeight: i === 0 ? 600 : 400 }}>{f}</span>
              </div>
            ))}
            <Link href="/login" style={{
              display: 'block', marginTop: '1.5rem', padding: '11px',
              background: 'var(--accent)', color: 'var(--accent-text)',
              borderRadius: '6px', textAlign: 'center',
              fontSize: '13px', fontWeight: 700, textDecoration: 'none',
            }}>
              Claim beta access
            </Link>
          </div>
        </div>
      </section>

      {/* ── Bottom CTA ── */}
      <section className="mkt-wide" style={{ padding: '2rem 1.5rem 5rem' }}>
        <div style={{
          background: 'rgba(75,156,211,0.07)', border: '0.5px solid rgba(75,156,211,0.2)',
          borderRadius: '16px', padding: '3rem 2rem', textAlign: 'center',
        }}>
          <h2 style={{ fontSize: 'clamp(20px, 3vw, 30px)', fontWeight: 800, marginBottom: '10px' }}>
            Ready to build your first lineup?
          </h2>
          <p style={{
            fontSize: '15px', color: `rgba(var(--fg-rgb), 0.55)`,
            maxWidth: '420px', margin: '0 auto 2rem', lineHeight: 1.65,
          }}>
            Set up your team, build a lineup, and step into the dugout with a plan. Free to start — no credit card needed.
          </p>
          <Link href="/login" style={{
            display: 'inline-block', background: 'var(--accent)', color: 'var(--accent-text)',
            fontSize: '15px', fontWeight: 700, padding: '13px 36px',
            borderRadius: '8px', textDecoration: 'none',
          }}>
            Get started free
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '0.5px solid var(--border-subtle)', padding: '1.5rem',
        textAlign: 'center', fontSize: '12px', color: `rgba(var(--fg-rgb), 0.25)`,
      }}>
        <div style={{ marginBottom: '8px' }}>
          Six<span style={{ color: 'var(--accent)', opacity: 0.6 }}>43</span> · Built for youth baseball coaches
        </div>
        <div style={{ marginBottom: '6px' }}>
          Questions or feedback?{' '}
          <a href="mailto:support@six43.com?subject=Six43 feedback" style={{
            color: `rgba(var(--fg-rgb), 0.45)`, textDecoration: 'none',
            borderBottom: '0.5px solid rgba(var(--fg-rgb), 0.2)',
          }}>
            support@six43.com
          </a>
        </div>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '8px', flexWrap: 'wrap' }}>
          <Link href="/privacy" style={{ color: `rgba(var(--fg-rgb), 0.3)`, textDecoration: 'none' }}>Privacy</Link>
          <Link href="/help" style={{ color: `rgba(var(--fg-rgb), 0.3)`, textDecoration: 'none' }}>Help</Link>
        </div>
      </footer>

    </main>
  )
}
