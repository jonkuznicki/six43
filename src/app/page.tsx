import Link from 'next/link'
import Image from 'next/image'
import { createServerClient } from '../lib/supabase-server'

// ── Desktop grid illustration data ───────────────────────────────────────────

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

const FEATURES = [
  { icon: '⚾', title: 'Lineup builder',           body: 'Build a complete lineup in minutes. See every player, every inning, all at once — no spreadsheets, no paper, no guessing.' },
  { icon: '📋', title: 'Attendance tracking',      body: 'Mark who shows up on game day and the lineup adjusts automatically. No manual removal, no scrambling.' },
  { icon: '📊', title: 'By-position stats cards',  body: 'Each player gets a field heat map, bench %, top positions played, innings pitched, and pitch count — all in one card. Spot problems at a glance.' },
  { icon: '🎯', title: 'Pitching planner',         body: 'See who\'s eligible, who needs rest, and who\'s approaching their limit — days before the game, not on the mound.' },
  { icon: '🏆', title: 'Tournament planning',      body: 'Set up placeholder games before the bracket drops. Swap in real games from GameChanger when the schedule is confirmed — lineup carries over.' },
  { icon: '🔒', title: 'Game locking',             body: 'Finalize a lineup and lock it so staff can view but not change it. Only the team admin can unlock — no more accidental edits on game day.' },
  { icon: '🔄', title: 'GameChanger sync',         body: 'Paste your webcal link once and your full schedule imports. Check for updates any time — reschedules sync automatically.' },
  { icon: '📐', title: 'Depth chart',              body: 'Rank players at every position and track who can\'t play certain spots. Always current, always accessible.' },
  { icon: '🔗', title: 'Invite coaching staff',     body: 'Add assistant coaches by email. They get instant access to the roster, schedule, and lineups — with full edit or view-only permissions.' },
  { icon: '📝', title: 'Post-game notes',          body: 'Jot a quick note on any player right after the final out while it\'s still fresh.' },
  { icon: '🖨️', title: 'Print-ready card',         body: 'One tap to print a clean lineup card to bring to the field. Works from phone or desktop.' },
  { icon: '📱', title: 'Works everywhere',         body: 'Plan on your laptop the night before. Coach from your phone in the dugout. Same data, always in sync.' },
]

function PhoneMockup({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{
        display: 'inline-block',
        position: 'relative',
        background: '#0a0a0a',
        borderRadius: '44px',
        padding: '14px',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 32px 64px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.3)',
        width: '100%',
        maxWidth: '240px',
      }}>
        <div style={{
          position: 'absolute', top: '22px', left: '50%', transform: 'translateX(-50%)',
          width: '70px', height: '9px', background: '#1a1a1a',
          borderRadius: '6px', zIndex: 2,
        }} />
        <div style={{
          borderRadius: '32px', overflow: 'hidden',
          background: '#0B1F3A',
          aspectRatio: '9/19.5',
          position: 'relative',
        }}>
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
        background: '#0B1F3A',
        borderRadius: '10px',
        overflow: 'hidden',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.07), 0 24px 60px rgba(0,0,0,0.5)',
      }}>
        {/* Browser chrome */}
        <div style={{
          background: '#0d2240',
          padding: '9px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
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

function DesktopLineupGrid() {
  const innings = [1, 2, 3, 4, 5, 6]
  return (
    <div style={{ background: '#0B1F3A' }}>
      {/* Topbar */}
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
      {/* Grid */}
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

// Per-player inline zone chips shown in grid (P, C, IF, OF, B totals)
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
  const jerseys  = [12, 5, 8, 3, 17, 9, 22, 7, 14]

  return (
    <div style={{ background: '#0B1F3A', display: 'flex', flexDirection: 'column', height: '310px' }}>

      {/* Topbar */}
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

      {/* Two-panel layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Center: Grid + palette below */}
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

          {/* Palette below grid */}
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

          {/* Notes — below palette */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '5px 8px 6px', background: 'rgba(255,255,255,0.01)', flexShrink: 0 }}>
            <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginBottom: 2 }}>Notes</div>
            <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.28)', lineHeight: 1.4 }}>Jake pitching first 3. Watch Ryan's hamstring.</div>
          </div>
        </div>

        {/* Right panel: inning snapshot */}
        <div style={{
          width: 108, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', flexDirection: 'column', overflowY: 'hidden',
        }}>
          {/* Inning snapshot */}
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

function BrowserMockupLight({ children, caption }: { children: React.ReactNode; caption?: string }) {
  return (
    <div style={{ width: '100%' }}>
      <div style={{
        background: '#EBF0F7',
        borderRadius: '10px',
        overflow: 'hidden',
        boxShadow: '0 0 0 1px rgba(11,31,58,0.1), 0 24px 60px rgba(0,0,0,0.12)',
      }}>
        <div style={{
          background: '#dde4ee',
          padding: '9px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
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
  const jerseys  = [12, 5, 8, 3, 17, 9, 22, 7, 14]

  return (
    <div style={{ background: '#EBF0F7', display: 'flex', flexDirection: 'column', height: '310px' }}>

      {/* Topbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 10px',
        background: '#dde4ee', borderBottom: '1px solid rgba(11,31,58,0.08)',
        flexShrink: 0, flexWrap: 'nowrap', overflow: 'hidden',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(11,31,58,0.8)', whiteSpace: 'nowrap' }}>vs Cardinals · Apr 12</span>
        <div style={{ width: 1, height: 14, background: 'rgba(11,31,58,0.12)', flexShrink: 0 }} />
        <span style={{ fontSize: 9, color: 'rgba(11,31,58,0.35)', whiteSpace: 'nowrap' }}>− 6 inn +</span>
        <div style={{ width: 1, height: 14, background: 'rgba(11,31,58,0.12)', flexShrink: 0 }} />
        <span style={{ fontSize: 9, color: 'rgba(11,31,58,0.35)', whiteSpace: 'nowrap' }}>↩ Undo</span>
        <span style={{ fontSize: 9, color: 'rgba(11,31,58,0.35)', whiteSpace: 'nowrap' }}>🖨 Print</span>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 8, fontWeight: 700, color: '#2B7AB5', padding: '2px 6px', borderRadius: 3, border: '1px solid #2B7AB5', background: 'rgba(43,122,181,0.12)', whiteSpace: 'nowrap' }}>Lineup Ready</span>
      </div>

      {/* Two-panel layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Grid + palette */}
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
                        <div style={{ display: 'flex', gap: 2, marginTop: 1, flexWrap: 'wrap' }}>
                          {zoneInfo.chips.map(chip => {
                            const col = chip.startsWith('P') ? '#2B7AB5' : chip.startsWith('C') ? '#A03060' : chip.startsWith('IF') ? '#2A5A9E' : chip.startsWith('OF') ? '#2A6633' : 'rgba(80,80,90,0.45)'
                            return <span key={chip} style={{ fontSize: 6, fontWeight: 700, color: col, opacity: 0.85 }}>{chip}</span>
                          })}
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

          {/* Palette */}
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

          {/* Notes — below palette */}
          <div style={{ borderTop: '1px solid rgba(11,31,58,0.07)', padding: '5px 8px 6px', background: 'rgba(11,31,58,0.015)', flexShrink: 0 }}>
            <div style={{ fontSize: 6, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(11,31,58,0.25)', marginBottom: 2 }}>Notes</div>
            <div style={{ fontSize: 7, color: 'rgba(11,31,58,0.4)', lineHeight: 1.4 }}>Jake pitching first 3. Watch Ryan's hamstring.</div>
          </div>
        </div>

        {/* Right panel — inning snapshot only */}
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

// ── By-Position stats card demo ───────────────────────────────────────────────
function ByPositionDemo() {
  const players = [
    { name: 'Jake M.',  jersey: 12, benchPct: 11, fieldInn: 16, benchInn: 2,  ip: 6, pitches: 78,
      topPos: [{ l: 'P', v: 6, c: '#4B9CD3' }, { l: 'SS', v: 5, c: '#80B0E8' }, { l: 'CF', v: 5, c: '#6DB875' }], spots: 5,
      d: { P: 0.85, C: 0, '1B': 0, '2B': 0, SS: 0.65, '3B': 0, LF: 0, CF: 0.55, RF: 0 } },
    { name: 'Ryan P.',  jersey: 17, benchPct: 6,  fieldInn: 17, benchInn: 1,  ip: 0, pitches: 0,
      topPos: [{ l: 'LF', v: 8, c: '#6DB875' }, { l: 'CF', v: 6, c: '#6DB875' }, { l: 'RF', v: 3, c: '#6DB875' }], spots: 3,
      d: { P: 0, C: 0, '1B': 0, '2B': 0, SS: 0, '3B': 0, LF: 1.0, CF: 0.75, RF: 0.4 } },
    { name: 'Tyler S.', jersey: 8,  benchPct: 44, fieldInn: 10, benchInn: 8,  ip: 0, pitches: 0,
      topPos: [{ l: 'SS', v: 7, c: '#80B0E8' }, { l: '2B', v: 3, c: '#80B0E8' }], spots: 2,
      d: { P: 0, C: 0, '1B': 0.2, '2B': 0.4, SS: 1.0, '3B': 0, LF: 0, CF: 0, RF: 0 } },
  ]

  function MiniDiamond({ d }: { d: Record<string, number> }) {
    const W = 68, H = 63
    const pos = [
      { k: 'P',  fx: 0.500, fy: 0.660, c: '#4B9CD3' },
      { k: 'C',  fx: 0.500, fy: 0.940, c: '#E090B0' },
      { k: '1B', fx: 0.810, fy: 0.615, c: '#80B0E8' },
      { k: '2B', fx: 0.655, fy: 0.415, c: '#80B0E8' },
      { k: 'SS', fx: 0.332, fy: 0.480, c: '#80B0E8' },
      { k: '3B', fx: 0.190, fy: 0.615, c: '#80B0E8' },
      { k: 'LF', fx: 0.118, fy: 0.200, c: '#6DB875' },
      { k: 'CF', fx: 0.500, fy: 0.065, c: '#6DB875' },
      { k: 'RF', fx: 0.882, fy: 0.200, c: '#6DB875' },
    ]
    const hX = 0.5*W, hY = 0.94*H, fX = 0.81*W, fY = 0.615*H, sX = 0.5*W, sY = 0.25*H, tX = 0.19*W, tY = 0.615*H
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: `${W}px`, display: 'block' }}>
        <polygon points={`${hX},${hY} ${fX},${fY} ${sX},${sY} ${tX},${tY}`}
          style={{ fill: 'rgba(75,156,211,0.05)', stroke: 'rgba(75,156,211,0.2)', strokeWidth: 0.6 }} />
        {pos.map(p => {
          const v = d[p.k] ?? 0
          const cx = p.fx * W, cy = p.fy * H, r = 5 + v * 3
          return (
            <g key={p.k}>
              <circle cx={cx} cy={cy} r={r} style={{ fill: p.c, fillOpacity: v > 0 ? 0.1 + v * 0.55 : 0.04, stroke: p.c, strokeWidth: 1, strokeOpacity: v > 0 ? 0.35 + v * 0.55 : 0.12 }} />
              <text x={cx} y={cy + 2.5} textAnchor="middle" style={{ fontSize: '5.5px', fontWeight: 800, fill: p.c, fillOpacity: v > 0 ? 0.88 : 0.18 }}>{p.k}</text>
            </g>
          )
        })}
      </svg>
    )
  }

  return (
    <div style={{ background: '#0B1F3A', padding: '10px 10px 12px', borderRadius: '0 0 9px 9px' }}>
      <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 8 }}>
        Playing Time · By Position
      </div>
      <div style={{ display: 'flex', gap: '6px' }}>
        {players.map(player => {
          const benchColor = player.benchPct > 40 ? '#E87060' : player.benchPct > 25 ? '#E8A020' : '#6DB875'
          return (
            <div key={player.name} style={{
              flex: 1, background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.08)',
              borderRadius: '8px', padding: '7px 6px',
            }}>
              <div style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.28)', marginRight: 3 }}>#{player.jersey}</span>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: 'rgba(255,255,255,0.78)' }}>{player.name}</span>
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'flex-start' }}>
                <div style={{ flex: '0 0 46%' }}>
                  <MiniDiamond d={player.d} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 2 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                    <span style={{ fontSize: 18, fontWeight: 800, lineHeight: 1, color: benchColor }}>{player.benchPct}%</span>
                    <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)' }}>bench</span>
                  </div>
                  <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.42)' }}>
                    <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>{player.fieldInn}</span> field · <span style={{ fontWeight: 600 }}>{player.benchInn}</span> bench
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
                    {player.topPos.map(p => (
                      <span key={p.l} style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 2, background: `${p.c}20`, color: p.c, border: `0.5px solid ${p.c}44` }}>
                        {p.l}·{p.v}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.28)' }}>{player.spots} spot{player.spots !== 1 ? 's' : ''}</div>
                  {player.ip > 0 && (
                    <div style={{ fontSize: 7.5, fontWeight: 600, color: '#4B9CD3' }}>
                      {player.ip} IP · <span style={{ fontWeight: 400, color: 'rgba(255,255,255,0.32)' }}>{player.pitches}p</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
          <Link href="/gear" style={{
            fontSize: '13px', fontWeight: 600,
            color: `rgba(var(--fg-rgb), 0.55)`,
            textDecoration: 'none',
          }}>
            Gear Guide
          </Link>
          {loggedIn ? (
            <Link href="/games" style={{
              fontSize: '13px', fontWeight: 700,
              color: 'var(--accent-text)',
              background: 'var(--accent)',
              textDecoration: 'none',
              padding: '7px 18px',
              borderRadius: '6px',
            }}>
              Open app →
            </Link>
          ) : (
            <>
              <Link href="/login" style={{
                fontSize: '13px', fontWeight: 600,
                color: `rgba(var(--fg-rgb), 0.6)`,
                textDecoration: 'none',
              }}>
                Log in
              </Link>
              <Link href="/login" style={{
                fontSize: '13px', fontWeight: 700,
                color: 'var(--accent-text)',
                background: 'var(--accent)',
                textDecoration: 'none',
                padding: '7px 18px',
                borderRadius: '6px',
              }}>
                Get started
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
            borderRadius: '20px',
            padding: '4px 14px',
            marginBottom: '1.5rem',
          }}>
            The coach's planning tool
          </div>

          <h1 style={{
            fontSize: 'clamp(36px, 6vw, 58px)',
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            marginBottom: '1.25rem',
          }}>
            Plan every game.<br />
            <span style={{ color: 'var(--accent)' }}>Coach with confidence.</span>
          </h1>

          <p style={{
            fontSize: '17px',
            lineHeight: 1.65,
            color: `rgba(var(--fg-rgb), 0.6)`,
            maxWidth: '420px',
            margin: '0 auto 2.5rem',
          }}>
            Six43 keeps your lineups, pitching rotations, playing time, and tournament schedules in one place — so you walk into every game prepared, not scrambling.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'inherit', gap: '10px' }}>
            <div>
              <Link href="/login" style={{
                display: 'inline-block',
                background: 'var(--accent)',
                color: 'var(--accent-text)',
                fontSize: '15px', fontWeight: 700,
                padding: '14px 36px',
                borderRadius: '8px',
                textDecoration: 'none',
                letterSpacing: '0.01em',
              }}>
                Try it free
              </Link>
            </div>
            <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.35)` }}>
              10 games free · beta testers get Pro free · no credit card
            </div>
          </div>
        </div>

        <div className="mkt-hero-browser">
          <BrowserMockup caption="Build and manage lineups from your laptop">
            <FullDesktopLineupEditor />
          </BrowserMockup>
        </div>
      </section>

      {/* ── Social proof bar ── */}
      <section style={{ padding: '1.5rem 1.5rem', borderTop: '0.5px solid var(--border-subtle)', borderBottom: '0.5px solid var(--border-subtle)' }}>
        <div style={{ maxWidth: '760px', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: '2rem' }}>
          <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.4)`, textAlign: 'center' }}>
            <span style={{ fontWeight: 700, color: 'var(--fg)' }}>Travel · Rec · Tournament</span>
            <span style={{ margin: '0 8px', opacity: 0.3 }}>·</span>
            Built for youth baseball &amp; softball coaches
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
            Free to start · No credit card
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="mkt-divider" />

      {/* ── How it works ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem' }}>
        <div style={{
          fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.3)`,
          marginBottom: '4px', textAlign: 'center',
        }}>
          How it works
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: 800, textAlign: 'center', marginBottom: '0.5rem' }}>
          Plan ahead. Coach better.
        </h2>
        <p style={{ textAlign: 'center', fontSize: '14px', color: `rgba(var(--fg-rgb), 0.45)`, maxWidth: '380px', margin: '0 auto 2.5rem', lineHeight: 1.6 }}>
          Six43 is built for the work that happens before you ever step on the field.
        </p>

        <div className="mkt-steps">
          {[
            { n: '1', title: 'Set up your season', body: 'Add your roster once — jersey numbers, positions, batting preferences. Import your schedule from GameChanger or enter games manually. Done in minutes.' },
            { n: '2', title: 'Plan every game', body: 'Build lineups ahead of time. Track pitching rest days. Set up tournament weekends before the schedule drops. Everything ready before you leave the house.' },
            { n: '3', title: 'Coach with confidence', body: 'Check attendance on game day, pull up your lineup, and step into the dugout prepared. Playing time data and pitch counts update automatically after every game.' },
          ].map((step, i, arr) => (
            <div key={step.n} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', position: 'relative', flex: 1 }}>
              {i < arr.length - 1 && (
                <div className="mkt-step-connector" style={{
                  position: 'absolute', left: '19px', top: '40px',
                  width: '2px', height: 'calc(100% - 16px)',
                  background: 'rgba(75,156,211,0.15)',
                }} />
              )}
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                background: 'rgba(75,156,211,0.12)', border: '0.5px solid rgba(75,156,211,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '15px', fontWeight: 800, color: 'var(--accent)',
              }}>{step.n}</div>
              <div style={{ paddingBottom: i < arr.length - 1 ? '2rem' : 0 }}>
                <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px', marginTop: '8px' }}>{step.title}</div>
                <div style={{ fontSize: '13px', lineHeight: 1.6, color: `rgba(var(--fg-rgb), 0.55)` }}>{step.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="mkt-divider" />

      {/* ── Spotlight 1: Lineup builder (desktop) ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem' }}>
        <div className="mkt-spotlight">
          <div className="mkt-spotlight-img" style={{ maxWidth: '420px', width: '100%' }}>
            <BrowserMockup>
              <DesktopLineupGrid />
            </BrowserMockup>
          </div>
          <div className="mkt-spotlight-text">
            <div style={{
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--accent)', marginBottom: '12px',
            }}>Lineup builder</div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 800, lineHeight: 1.15, marginBottom: '1rem' }}>
              Your lineup, done<br />the night before.
            </h2>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: `rgba(var(--fg-rgb), 0.6)`, marginBottom: '1.5rem' }}>
              Most coaches build their lineup the night before the game. Six43 makes that 45-minute process take 10. See every player across every inning at once, paint positions with a click, and you're done — ready to share or print before you go to bed.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                'Full grid — every player, every inning, all in one view',
                'Paint positions with keyboard shortcuts or click-to-fill',
                'Shift+click to fill a range across multiple innings at once',
                'Share with your staff or print a clean card for the field',
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

      {/* ── Divider ── */}
      <div className="mkt-divider" />

      {/* ── Spotlight 2: Playing time ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem' }}>
        <div className="mkt-spotlight reverse">
          <div className="mkt-spotlight-img" style={{ maxWidth: '420px', width: '100%' }}>
            <BrowserMockup caption="Full season — field heat map, bench %, pitch counts">
              <FullDesktopLineupEditor />
            </BrowserMockup>
          </div>
          <div className="mkt-spotlight-text">
            <div style={{
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--accent)', marginBottom: '12px',
            }}>Playing time</div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 800, lineHeight: 1.15, marginBottom: '1rem' }}>
              Be fair to every kid —<br />and prove it.
            </h2>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: `rgba(var(--fg-rgb), 0.6)`, marginBottom: '1.5rem' }}>
              Every player gets a card showing their field heat map, bench percentage, top positions, innings pitched, and pitch count — all season, at a glance. Set targets and get flagged before anyone's being overlooked.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                'Field heat map shows where each player actually spends innings',
                'Bench %, field/bench split, and top positions in one card',
                'Innings pitched and pitch count for your pitchers',
                'Set an innings target and track progress toward it',
                'Per-game breakdown: who played where and when',
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

      {/* ── Divider ── */}
      <div className="mkt-divider" />

      {/* ── Spotlight 3: Pitching planner ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem' }}>
        <div className="mkt-spotlight">
          <div className="mkt-spotlight-img">
            <PhoneMockup src="/screenshot-pitching.png" alt="Pitching planner" />
          </div>
          <div className="mkt-spotlight-text">
            <div style={{
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--accent)', marginBottom: '12px',
            }}>Pitching planner</div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 800, lineHeight: 1.15, marginBottom: '1rem' }}>
              Know who can pitch<br />three days before game day.
            </h2>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: `rgba(var(--fg-rgb), 0.6)`, marginBottom: '1.5rem' }}>
              Log pitch counts after each game and Six43 calculates rest days to your next scheduled game automatically. Know exactly who's eligible and who needs more time — before you're standing on the mound making a decision on the fly.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                'Pitch counts logged per game, rest days calculated automatically',
                'See eligible pitchers at a glance before every game',
                'Season totals and over-limit warnings built in',
                'Plan your pitching rotation for the whole weekend',
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

      {/* ── Divider ── */}
      <div className="mkt-divider" />

      {/* ── Spotlight 4: Coaching staff ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem' }}>
        <div className="mkt-spotlight">
          {/* Visual: staff card mock */}
          <div className="mkt-spotlight-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              background: 'var(--bg-card)', border: '0.5px solid var(--border)',
              borderRadius: '14px', padding: '20px', width: '100%', maxWidth: '300px',
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '12px' }}>Coaching Staff</div>

              {/* Admin row */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '10px 12px', borderRadius: '8px',
                background: 'rgba(128,176,232,0.07)', border: '0.5px solid rgba(128,176,232,0.2)',
                marginBottom: '6px',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600 }}>joncoach@email.com</div>
                </div>
                <span style={{ fontSize: '10px', fontWeight: 700, color: '#80B0E8' }}>Admin</span>
              </div>

              {/* Active staff */}
              <div style={{ fontSize: '9px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.25)`, margin: '10px 0 6px' }}>Active · 2</div>
              {[
                { email: 'assistant1@email.com', perm: 'Can edit' },
                { email: 'assistant2@email.com', perm: 'View only' },
              ].map((m, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 12px', borderRadius: '8px',
                  background: 'var(--bg-card-alt)', border: '0.5px solid var(--border)',
                  marginBottom: '6px',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', fontWeight: 500 }}>{m.email}</div>
                  </div>
                  <span style={{ fontSize: '10px', fontWeight: 600, color: '#6DB875' }}>Staff</span>
                </div>
              ))}

              {/* Invite row */}
              <div style={{ marginTop: '10px', display: 'flex', gap: '6px' }}>
                <div style={{
                  flex: 1, padding: '8px 10px', borderRadius: '6px',
                  background: 'var(--bg-input)', border: '0.5px solid var(--border-md)',
                  fontSize: '11px', color: `rgba(var(--fg-rgb), 0.3)`,
                }}>coach@email.com</div>
                <div style={{
                  padding: '8px 12px', borderRadius: '6px',
                  background: 'var(--accent)', color: 'var(--accent-text)',
                  fontSize: '11px', fontWeight: 700,
                }}>Send</div>
              </div>
            </div>
          </div>

          <div className="mkt-spotlight-text">
            <div style={{
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--accent)', marginBottom: '12px',
            }}>Coaching staff</div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 800, lineHeight: 1.15, marginBottom: '1rem' }}>
              Bring your whole<br />coaching staff along.
            </h2>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: `rgba(var(--fg-rgb), 0.6)`, marginBottom: '1.5rem' }}>
              Enter an email address and your assistant coach is added to the team instantly — no link sharing, no workarounds. Everyone sees the same schedule, roster, and lineups in real time.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                'Invite coaches by email — they get notified automatically',
                'Existing Six43 users get access the moment you add them',
                'Set edit or view-only permissions per coach',
                'See who has accepted and manage staff from the Settings tab',
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

      {/* ── Divider ── */}
      <div className="mkt-divider" />

      {/* ── Spotlight 5: Tournament planning ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem' }}>
        <div className="mkt-spotlight reverse">
          {/* Visual: tournament view mock */}
          <div className="mkt-spotlight-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              background: 'var(--bg-card)', border: '0.5px solid var(--border)',
              borderRadius: '14px', padding: '20px', width: '100%', maxWidth: '300px',
            }}>
              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '4px' }}>Tournament</div>
              <div style={{ fontSize: '14px', fontWeight: 800, marginBottom: '2px' }}>Memorial Day Invitational</div>
              <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '16px' }}>May 24 – May 25</div>

              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: '#80B0E8', marginBottom: '8px' }}>Pool Play</div>
              {[
                { label: 'Pool Play 1', date: 'Sat May 24 · 9:00am', placeholder: false, opp: 'Tigers' },
                { label: 'Pool Play 2', date: 'Sat May 24 · 12:00pm', placeholder: true },
              ].map((g, i) => (
                <div key={i} style={{
                  background: g.placeholder ? 'transparent' : 'var(--bg-card)',
                  border: g.placeholder ? '1px dashed rgba(var(--fg-rgb), 0.2)' : '0.5px solid var(--border)',
                  borderRadius: '8px', padding: '10px 12px', marginBottom: '6px',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>{g.placeholder ? g.label : `vs ${g.opp}`}</span>
                    {g.placeholder && <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: '20px', background: 'rgba(var(--fg-rgb),0.06)', color: `rgba(var(--fg-rgb),0.4)`, border: '0.5px solid rgba(var(--fg-rgb),0.12)' }}>TBD</span>}
                  </div>
                  <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.4)` }}>{g.date}</div>
                </div>
              ))}

              <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--accent)', margin: '12px 0 8px' }}>Bracket</div>
              <div style={{
                border: '1px dashed rgba(75,156,211,0.35)', borderRadius: '8px', padding: '10px 12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <span style={{ fontSize: '12px', fontWeight: 600 }}>Bracket Game 1</span>
                  <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 6px', borderRadius: '20px', background: 'rgba(232,112,96,0.1)', color: '#E87060', border: '0.5px solid rgba(232,112,96,0.3)' }}>Needs swap</span>
                </div>
                <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '8px' }}>Sun May 25 · TBD</div>
                <div style={{ fontSize: '10px', padding: '6px 10px', borderRadius: '5px', textAlign: 'center', background: 'rgba(var(--fg-rgb),0.06)', color: `rgba(var(--fg-rgb),0.5)`, fontWeight: 600 }}>
                  Swap with imported game →
                </div>
              </div>
            </div>
          </div>

          <div className="mkt-spotlight-text">
            <div style={{
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--accent)', marginBottom: '12px',
            }}>Tournament planning</div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 800, lineHeight: 1.15, marginBottom: '1rem' }}>
              Plan the whole weekend<br />before the bracket drops.
            </h2>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: `rgba(var(--fg-rgb), 0.6)`, marginBottom: '1.5rem' }}>
              Tournament schedules are never finalized until the last minute. Set up placeholder games for pool play and bracket rounds ahead of time — so you can start planning lineups and pitching rotations before you even know the opponent. When the real schedule comes in from GameChanger, swap with one tap and your work carries over.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                'Create pool play and bracket slots before the schedule is set',
                'Build lineups on placeholders — they carry over when you swap',
                'GameChanger sync suggests which imported games match your placeholders',
                'Stale placeholders are flagged if the date passes without a swap',
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

      {/* ── Divider ── */}
      <div className="mkt-divider" />

      {/* ── Spotlight 5: GameChanger sync ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem' }}>
        <div className="mkt-spotlight reverse">
          {/* Visual: styled sync flow card */}
          <div className="mkt-spotlight-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{
              background: 'var(--bg-card)', border: '0.5px solid var(--border)',
              borderRadius: '14px', padding: '20px', width: '100%', maxWidth: '300px',
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <span style={{ fontSize: '18px' }}>🔄</span>
                <span style={{ fontSize: '13px', fontWeight: 700 }}>GameChanger → Six43</span>
              </div>
              {/* Fake game rows */}
              {[
                { opp: 'Tigers',   date: 'Apr 12 · 10:00am', color: '#6DB875' },
                { opp: 'Cardinals', date: 'Apr 19 · 11:00am', color: '#6DB875' },
                { opp: 'Yankees',  date: 'Apr 26 · 10:00am', color: '#6DB875' },
                { opp: 'Red Sox',  date: 'May 3 · 9:00am',   color: '#6DB875' },
              ].map((g, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '9px 10px', borderRadius: '8px',
                  background: 'var(--bg-card-alt)',
                  marginBottom: i < 3 ? '6px' : 0,
                }}>
                  <span style={{ fontSize: '12px', color: g.color }}>✓</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', fontWeight: 600 }}>{g.opp}</div>
                    <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '1px' }}>{g.date}</div>
                  </div>
                </div>
              ))}
              <div style={{
                marginTop: '14px', padding: '10px', borderRadius: '7px', textAlign: 'center',
                background: 'var(--accent)', color: 'var(--accent-text)',
                fontSize: '12px', fontWeight: 700,
              }}>
                4 games imported ✓
              </div>
            </div>
          </div>

          <div className="mkt-spotlight-text">
            <div style={{
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--accent)', marginBottom: '12px',
            }}>GameChanger integration</div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 800, lineHeight: 1.15, marginBottom: '1rem' }}>
              Already on GameChanger?<br />Import your schedule in seconds.
            </h2>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: `rgba(var(--fg-rgb), 0.6)`, marginBottom: '1.5rem' }}>
              Most youth leagues run on GameChanger. Just grab your team's calendar link from the mobile app, paste it in, and your full season schedule is ready — no retyping, no manual entry.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                'Import your full season schedule from GameChanger with one link',
                'Check for updates anytime — reschedules and new games sync automatically',
                'Only touches future games — completed lineups are never overwritten',
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

      {/* ── Divider ── */}
      <div className="mkt-divider" />

      {/* ── Any device ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem' }}>
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{
            fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.3)`, marginBottom: '4px',
          }}>
            Any device
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '0.5rem' }}>
            At your desk or on the field
          </h2>
          <p style={{ fontSize: '14px', color: `rgba(var(--fg-rgb), 0.5)`, maxWidth: '380px', margin: '0 auto', lineHeight: 1.6 }}>
            Plan the lineup on your laptop the night before. Pull it up on your phone in the dugout. Same data, always in sync.
          </p>
        </div>

        <div style={{
          display: 'flex', gap: '2rem', alignItems: 'center',
          justifyContent: 'center', flexWrap: 'wrap',
        }}>
          {/* Desktop */}
          <div style={{ flex: 1, minWidth: '260px', maxWidth: '520px' }}>
            <BrowserMockupLight>
              <FullDesktopLineupEditorLight />
            </BrowserMockupLight>
            <div style={{
              textAlign: 'center', fontSize: '12px',
              color: `rgba(var(--fg-rgb), 0.3)`, marginTop: '0.75rem',
            }}>
              Desktop — full grid, keyboard shortcuts
            </div>
          </div>

          {/* Phone */}
          <div style={{ flexShrink: 0, width: '160px' }}>
            <PhoneMockup src="/screenshot-lineup.png" alt="Six43 on mobile" />
            <div style={{
              textAlign: 'center', fontSize: '12px',
              color: `rgba(var(--fg-rgb), 0.3)`, marginTop: '0.75rem',
            }}>
              Mobile — game day, in the dugout
            </div>
          </div>
        </div>
      </section>

      {/* ── Divider ── */}
      <div className="mkt-divider" />

      {/* ── Features grid ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem 4rem' }}>
        <div style={{
          fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.3)`,
          marginBottom: '4px', textAlign: 'center',
        }}>
          Everything included
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: 800, textAlign: 'center', marginBottom: '0.5rem' }}>
          Your planning toolkit, start to finish
        </h2>
        <p style={{ textAlign: 'center', fontSize: '14px', color: `rgba(var(--fg-rgb), 0.45)`, marginBottom: '2rem' }}>
          Every feature available on every plan — free or paid.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{
              background: 'var(--bg-card)',
              border: '0.5px solid var(--border)',
              borderRadius: '12px',
              padding: '1.25rem 1.5rem',
              display: 'flex', gap: '1rem', alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: '22px', lineHeight: 1, flexShrink: 0, marginTop: '2px' }}>
                {f.icon}
              </span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '5px' }}>{f.title}</div>
                <div style={{ fontSize: '12px', lineHeight: 1.6, color: `rgba(var(--fg-rgb), 0.55)` }}>{f.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Divider ── */}
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

      {/* ── Divider ── */}
      <div className="mkt-divider" />

      {/* ── Pricing ── */}
      <section className="mkt-wide" style={{ padding: '3.5rem 1.5rem 1rem' }}>
        <div style={{
          fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.3)`,
          marginBottom: '4px', textAlign: 'center',
        }}>
          Pricing
        </div>
        <h2 style={{ fontSize: '26px', fontWeight: 800, textAlign: 'center', marginBottom: '0.5rem' }}>
          Simple, honest pricing
        </h2>
        <p style={{ textAlign: 'center', fontSize: '14px', color: `rgba(var(--fg-rgb), 0.5)`, marginBottom: '0.75rem' }}>
          Try it free. Early beta testers get Pro free for life — limited spots.
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
          <div style={{
            background: 'var(--bg-card)',
            border: '0.5px solid var(--border)',
            borderRadius: '12px', padding: '1.5rem',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', marginBottom: '4px' }}>Free</div>
            <div style={{ fontSize: '32px', fontWeight: 800, marginBottom: '2px' }}>$0</div>
            <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '1.5rem' }}>
              10 games · no credit card required
            </div>
            {['All features included', 'Lineup builder', 'Playing time tracking', 'Pitching planner', 'Depth chart', 'Share & print lineups'].map((f, i) => (
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
            background: 'rgba(75,156,211,0.05)',
            border: '0.5px solid rgba(75,156,211,0.3)',
            borderRadius: '12px', padding: '1.5rem',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: '-1px', right: '16px',
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
              background: 'var(--accent)', color: 'var(--accent-text)',
              padding: '3px 10px', borderRadius: '0 0 6px 6px',
            }}>BETA OFFER</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', marginBottom: '4px' }}>Pro</div>
            <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.35)`, textDecoration: 'line-through', marginBottom: '2px' }}>
              $1.49/mo
            </div>
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
      <section className="mkt-wide" style={{ padding: '1rem 1.5rem 5rem' }}>
        <div style={{
          background: 'rgba(75,156,211,0.07)',
          border: '0.5px solid rgba(75,156,211,0.2)',
          borderRadius: '14px',
          padding: '3rem 2rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 800, marginBottom: '10px' }}>
            Ready to coach with a plan?
          </div>
          <div style={{
            fontSize: '15px', color: `rgba(var(--fg-rgb), 0.55)`,
            marginBottom: '2rem', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto 2rem',
          }}>
            Start free. Build your first lineup tonight — early beta testers get Pro free for life.
          </div>
          <Link href="/login" style={{
            display: 'inline-block',
            background: 'var(--accent)',
            color: 'var(--accent-text)',
            fontSize: '15px', fontWeight: 700,
            padding: '13px 36px',
            borderRadius: '8px',
            textDecoration: 'none',
          }}>
            Get started free
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '0.5px solid var(--border-subtle)',
        padding: '1.5rem',
        textAlign: 'center',
        fontSize: '12px',
        color: `rgba(var(--fg-rgb), 0.25)`,
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
        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
          <Link href="/privacy" style={{
            color: `rgba(var(--fg-rgb), 0.3)`, textDecoration: 'none',
            borderBottom: '0.5px solid rgba(var(--fg-rgb), 0.15)',
          }}>
            Privacy Policy
          </Link>
          <Link href="/gear" style={{
            color: `rgba(var(--fg-rgb), 0.3)`, textDecoration: 'none',
            borderBottom: '0.5px solid rgba(var(--fg-rgb), 0.15)',
          }}>
            Gear Guide
          </Link>
        </div>
      </footer>

    </main>
  )
}
