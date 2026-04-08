import Link from 'next/link'
import Image from 'next/image'
import { createServerClient } from '../lib/supabase-server'

// ── Desktop grid illustration data ───────────────────────────────────────────

const DEMO_POS: Record<string, { bg: string; fg: string }> = {
  P:    { bg: 'rgba(232,160,32,0.22)',  fg: '#E8C060' },
  C:    { bg: 'rgba(192,80,120,0.22)', fg: '#E090B0' },
  '1B': { bg: 'rgba(59,109,177,0.22)', fg: '#80B0E8' },
  '2B': { bg: 'rgba(59,109,177,0.22)', fg: '#80B0E8' },
  SS:   { bg: 'rgba(59,109,177,0.22)', fg: '#80B0E8' },
  '3B': { bg: 'rgba(59,109,177,0.22)', fg: '#80B0E8' },
  LF:   { bg: 'rgba(45,106,53,0.22)',  fg: '#6DB875' },
  CF:   { bg: 'rgba(45,106,53,0.22)',  fg: '#6DB875' },
  RF:   { bg: 'rgba(45,106,53,0.22)',  fg: '#6DB875' },
  Bnch: { bg: 'rgba(120,120,120,0.1)', fg: 'rgba(160,160,160,0.55)' },
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
  { icon: '⚾', title: 'Lineup builder',        body: 'Tap to paint positions across every inning in one view. No spreadsheets, no paper.' },
  { icon: '📋', title: 'Attendance tracking',   body: 'Mark who\'s there on game day. Absent players are automatically removed from the lineup.' },
  { icon: '📊', title: 'Playing time fairness', body: 'See bench %, innings by position, and season totals. Get flagged before a kid sits too long.' },
  { icon: '🎯', title: 'Pitching planner',      body: 'Log pitch counts and track rest days. See who\'s eligible for your next game at a glance.' },
  { icon: '🔄', title: 'GameChanger sync',      body: 'Paste your webcal link and your full schedule imports in seconds. Keep it in sync all season.' },
  { icon: '📐', title: 'Depth chart',           body: 'Rank players at every position and flag who can\'t play certain spots. Always current.' },
  { icon: '🔗', title: 'Share with your staff', body: 'Invite assistant coaches. Generate a read-only link for anyone who just needs the card.' },
  { icon: '🖨️', title: 'Print-ready card',      body: 'One tap to print a clean lineup card to bring to the field. Works from phone or desktop.' },
  { icon: '📱', title: 'Works everywhere',      body: 'Install on your phone like an app or use from your laptop. Same lineup, everywhere.' },
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
            six43.app
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
            background: 'rgba(232,160,32,0.18)', color: '#E8C060', borderRadius: '4px',
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

function FullDesktopLineupEditor() {
  const innings = [0, 1, 2, 3, 4, 5]
  const focusedInning = 2 // right panel shows inning 3
  const focusedCell = { pi: 0, ii: 0 } // Jake M., inning 1

  // Right panel: who's at each position in inning 3
  const inning3Summary = [
    { pos: 'P',  player: null          },
    { pos: 'C',  player: 'Connor B.'  },
    { pos: '1B', player: 'Jake M.'    },
    { pos: '2B', player: 'Marcus L.'  },
    { pos: 'SS', player: 'Tyler S.'   },
    { pos: '3B', player: 'Sam T.'     },
    { pos: 'LF', player: 'Drew K.'    },
    { pos: 'CF', player: 'Ryan P.'    },
    { pos: 'RF', player: 'Alex W.'    },
  ]

  const palette = ['P','C','1B','2B','SS','3B','LF','CF','RF','Bench']
  const jerseys  = [12, 5, 8, 3, 17, 9, 22, 7, 14]

  return (
    <div style={{ background: '#0B1F3A', display: 'flex', flexDirection: 'column', height: '290px' }}>

      {/* ── Topbar ── */}
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
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.32)', whiteSpace: 'nowrap' }}>Redo ↪</span>
        <div style={{ width: 1, height: 14, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.32)', whiteSpace: 'nowrap' }}>Clear lineup</span>
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.32)', whiteSpace: 'nowrap' }}>🖨 Print</span>
        <div style={{ flex: 1 }} />
        {[
          { label: 'Scheduled',    active: false, color: 'rgba(255,255,255,0.3)',   bg: 'transparent',          border: 'rgba(255,255,255,0.1)' },
          { label: 'Lineup Ready', active: true,  color: '#80B0E8',                 bg: 'rgba(59,109,177,0.3)', border: '#80B0E8' },
          { label: 'Final',        active: false, color: 'rgba(255,255,255,0.3)',   bg: 'transparent',          border: 'rgba(255,255,255,0.1)' },
        ].map(s => (
          <span key={s.label} style={{
            fontSize: 8, fontWeight: s.active ? 700 : 500, whiteSpace: 'nowrap',
            color: s.color, padding: '2px 6px', borderRadius: 3,
            border: `1px solid ${s.border}`, background: s.bg,
          }}>{s.label}</span>
        ))}
      </div>

      {/* ── Three panels ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left: Roster + Palette */}
        <div style={{
          width: 128, flexShrink: 0,
          borderRight: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ flex: 1, overflowY: 'hidden', padding: '5px 0' }}>
            <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', padding: '0 8px 3px' }}>
              Batting order · 9
            </div>
            {DEMO_PLAYERS.map((p, i) => (
              <div key={p.name} style={{
                display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px',
              }}>
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)', width: 10, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.22)', width: 18, flexShrink: 0 }}>#{jerseys[i]}</span>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
              </div>
            ))}
          </div>

          {/* Palette */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', padding: '5px 7px 6px', background: 'rgba(255,255,255,0.02)', flexShrink: 0 }}>
            <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.3)', marginBottom: 3 }}>Select cells, then fill:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {palette.map(pos => {
                const c = DEMO_POS[pos] ?? { bg: 'rgba(120,120,120,0.1)', fg: 'rgba(255,255,255,0.3)' }
                const active = pos === 'P'
                return (
                  <div key={pos} style={{
                    padding: '2px 3px', borderRadius: 3, fontSize: 7, fontWeight: 700,
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

        {/* Center: Grid */}
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ padding: '3px 5px', fontSize: 7, color: 'rgba(255,255,255,0.2)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', width: 16 }}>#</th>
                <th style={{ padding: '3px 6px', fontSize: 7, color: 'rgba(255,255,255,0.2)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'left', minWidth: 58, borderRight: '1px solid rgba(255,255,255,0.06)' }}>Player</th>
                {innings.map(i => (
                  <th key={i} style={{
                    padding: '3px 4px', fontSize: 7, fontWeight: 600,
                    borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'center', minWidth: 26,
                    color: i === focusedInning ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.2)',
                    background: i === focusedInning ? 'rgba(255,255,255,0.03)' : 'transparent',
                  }}>
                    {i + 1}
                    {i === focusedInning && <div style={{ fontSize: 5, color: '#6DB875', lineHeight: 1 }}>✓</div>}
                  </th>
                ))}
                <th style={{ padding: '3px 5px', fontSize: 7, color: 'rgba(255,255,255,0.2)', fontWeight: 600, borderBottom: '1px solid rgba(255,255,255,0.06)', textAlign: 'center' }}>Bench</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_PLAYERS.map((player, pi) => {
                const benchCount = player.innings.filter(p => p === 'Bnch').length
                return (
                  <tr key={player.name} style={{ background: pi % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.018)' }}>
                    <td style={{ padding: '2px 5px', textAlign: 'center', fontSize: 7, color: 'rgba(255,255,255,0.22)' }}>{pi + 1}</td>
                    <td style={{ padding: '2px 6px', fontSize: 9, color: 'rgba(255,255,255,0.72)', fontWeight: 500, whiteSpace: 'nowrap', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
                      {player.name}
                    </td>
                    {player.innings.map((pos, ii) => {
                      const c = DEMO_POS[pos]
                      const isFoc = pi === focusedCell.pi && ii === focusedCell.ii
                      const isSel = pi === focusedCell.pi && ii === 1
                      const isColFoc = ii === focusedInning
                      return (
                        <td key={ii} style={{ padding: '2px 2px', textAlign: 'center', background: isColFoc ? 'rgba(255,255,255,0.025)' : 'transparent' }}>
                          <div style={{
                            background: isFoc ? 'rgba(59,109,177,0.4)' : isSel ? 'rgba(59,109,177,0.14)' : (c?.bg ?? 'transparent'),
                            color: isFoc ? '#fff' : isSel ? 'rgba(128,176,232,0.9)' : (c?.fg ?? 'rgba(255,255,255,0.18)'),
                            borderRadius: 2, padding: '1px 0',
                            fontSize: 8, fontWeight: 700,
                            minWidth: 22, display: 'inline-block',
                            outline: isFoc ? '1.5px solid rgba(59,109,177,0.85)' : isSel ? '1px solid rgba(59,109,177,0.4)' : 'none',
                            outlineOffset: -1,
                          }}>{pos === 'Bnch' ? 'B' : pos}</div>
                        </td>
                      )
                    })}
                    <td style={{ padding: '2px 5px', textAlign: 'center', fontSize: 8, fontWeight: 700, color: benchCount > 0 ? '#6DB875' : 'rgba(255,255,255,0.18)' }}>
                      {benchCount > 0 ? benchCount : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Right: Inning summary */}
        <div style={{
          width: 98, flexShrink: 0, borderLeft: '1px solid rgba(255,255,255,0.07)',
          padding: '7px 7px', overflowY: 'hidden',
        }}>
          <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.22)', marginBottom: 4 }}>
            Inning 3
          </div>
          {inning3Summary.map(({ pos, player }) => {
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
                  fontSize: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: empty ? 'rgba(232,112,96,0.8)' : 'rgba(255,255,255,0.65)',
                  fontStyle: empty ? 'italic' : 'normal',
                }}>{player ?? '—'}</span>
                {empty && <span style={{ fontSize: 7, color: '#E87060', flexShrink: 0 }}>!</span>}
              </div>
            )
          })}
          <div style={{ marginTop: 6, padding: '5px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)' }}>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.45)' }}>Bench: Josh M.</div>
            <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.28)', marginTop: 1 }}>~0.7 bench inn exp</div>
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
        background: '#f0ede8',
        borderRadius: '10px',
        overflow: 'hidden',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.1), 0 24px 60px rgba(0,0,0,0.15)',
      }}>
        <div style={{
          background: '#e4e0da',
          padding: '9px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          borderBottom: '1px solid rgba(0,0,0,0.07)',
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
            six43.app
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
  P:     { bg: 'rgba(232,160,32,0.2)',   fg: '#9E6A00' },
  C:     { bg: 'rgba(192,80,120,0.18)',  fg: '#A03060' },
  '1B':  { bg: 'rgba(59,109,177,0.18)',  fg: '#2A5A9E' },
  '2B':  { bg: 'rgba(59,109,177,0.18)',  fg: '#2A5A9E' },
  SS:    { bg: 'rgba(59,109,177,0.18)',  fg: '#2A5A9E' },
  '3B':  { bg: 'rgba(59,109,177,0.18)',  fg: '#2A5A9E' },
  LF:    { bg: 'rgba(45,106,53,0.18)',   fg: '#2A6633' },
  CF:    { bg: 'rgba(45,106,53,0.18)',   fg: '#2A6633' },
  RF:    { bg: 'rgba(45,106,53,0.18)',   fg: '#2A6633' },
  Bnch:  { bg: 'rgba(120,120,120,0.08)', fg: 'rgba(20,40,65,0.4)' },
  Bench: { bg: 'rgba(120,120,120,0.08)', fg: 'rgba(20,40,65,0.4)' },
}

function FullDesktopLineupEditorLight() {
  const innings = [0, 1, 2, 3, 4, 5]
  const focusedInning = 2
  const focusedCell = { pi: 0, ii: 0 }

  const inning3Summary = [
    { pos: 'P',  player: null          },
    { pos: 'C',  player: 'Connor B.'  },
    { pos: '1B', player: 'Jake M.'    },
    { pos: '2B', player: 'Marcus L.'  },
    { pos: 'SS', player: 'Tyler S.'   },
    { pos: '3B', player: 'Sam T.'     },
    { pos: 'LF', player: 'Drew K.'    },
    { pos: 'CF', player: 'Ryan P.'    },
    { pos: 'RF', player: 'Alex W.'    },
  ]

  const palette = ['P','C','1B','2B','SS','3B','LF','CF','RF','Bench']
  const jerseys  = [12, 5, 8, 3, 17, 9, 22, 7, 14]

  return (
    <div style={{ background: '#f0ede8', display: 'flex', flexDirection: 'column', height: '290px' }}>

      {/* Topbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 10px',
        background: '#e8e4de', borderBottom: '1px solid rgba(20,40,65,0.08)',
        flexShrink: 0, flexWrap: 'nowrap', overflow: 'hidden',
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(20,40,65,0.8)', whiteSpace: 'nowrap' }}>vs Cardinals · Apr 12</span>
        <div style={{ width: 1, height: 14, background: 'rgba(20,40,65,0.12)', flexShrink: 0 }} />
        <span style={{ fontSize: 9, color: 'rgba(20,40,65,0.35)', whiteSpace: 'nowrap' }}>− 6 inn +</span>
        <div style={{ width: 1, height: 14, background: 'rgba(20,40,65,0.12)', flexShrink: 0 }} />
        <span style={{ fontSize: 9, color: 'rgba(20,40,65,0.35)', whiteSpace: 'nowrap' }}>↩ Undo</span>
        <span style={{ fontSize: 9, color: 'rgba(20,40,65,0.35)', whiteSpace: 'nowrap' }}>Redo ↪</span>
        <div style={{ width: 1, height: 14, background: 'rgba(20,40,65,0.12)', flexShrink: 0 }} />
        <span style={{ fontSize: 9, color: 'rgba(20,40,65,0.35)', whiteSpace: 'nowrap' }}>Clear lineup</span>
        <span style={{ fontSize: 9, color: 'rgba(20,40,65,0.35)', whiteSpace: 'nowrap' }}>🖨 Print</span>
        <div style={{ flex: 1 }} />
        {[
          { label: 'Scheduled',    active: false, color: 'rgba(20,40,65,0.35)', bg: 'transparent',           border: 'rgba(20,40,65,0.15)' },
          { label: 'Lineup Ready', active: true,  color: '#2A5A9E',             bg: 'rgba(59,109,177,0.15)', border: '#2A5A9E' },
          { label: 'Final',        active: false, color: 'rgba(20,40,65,0.35)', bg: 'transparent',           border: 'rgba(20,40,65,0.15)' },
        ].map(s => (
          <span key={s.label} style={{
            fontSize: 8, fontWeight: s.active ? 700 : 500, whiteSpace: 'nowrap',
            color: s.color, padding: '2px 6px', borderRadius: 3,
            border: `1px solid ${s.border}`, background: s.bg,
          }}>{s.label}</span>
        ))}
      </div>

      {/* Three panels */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left: Roster + Palette */}
        <div style={{
          width: 128, flexShrink: 0,
          borderRight: '1px solid rgba(20,40,65,0.08)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}>
          <div style={{ flex: 1, overflowY: 'hidden', padding: '5px 0' }}>
            <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(20,40,65,0.3)', padding: '0 8px 3px' }}>
              Batting order · 9
            </div>
            {DEMO_PLAYERS.map((p, i) => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px' }}>
                <span style={{ fontSize: 8, color: 'rgba(20,40,65,0.25)', width: 10, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                <span style={{ fontSize: 8, color: 'rgba(20,40,65,0.3)', width: 18, flexShrink: 0 }}>#{jerseys[i]}</span>
                <span style={{ fontSize: 9, color: 'rgba(20,40,65,0.75)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.name}
                </span>
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid rgba(20,40,65,0.08)', padding: '5px 7px 6px', background: 'rgba(20,40,65,0.02)', flexShrink: 0 }}>
            <div style={{ fontSize: 7, color: 'rgba(20,40,65,0.35)', marginBottom: 3 }}>Select cells, then fill:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {palette.map(pos => {
                const c = LIGHT_POS[pos] ?? { bg: 'rgba(120,120,120,0.08)', fg: 'rgba(20,40,65,0.4)' }
                const active = pos === 'P'
                return (
                  <div key={pos} style={{
                    padding: '2px 3px', borderRadius: 3, fontSize: 7, fontWeight: 700,
                    border: `1px solid ${active ? c.fg : 'rgba(20,40,65,0.15)'}`,
                    background: active ? c.bg : 'transparent',
                    color: active ? c.fg : 'rgba(20,40,65,0.4)',
                    minWidth: pos === 'Bench' ? 32 : 20, textAlign: 'center',
                  }}>{pos}</div>
                )
              })}
            </div>
          </div>
        </div>

        {/* Center: Grid */}
        <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ padding: '3px 5px', fontSize: 7, color: 'rgba(20,40,65,0.25)', fontWeight: 600, borderBottom: '1px solid rgba(20,40,65,0.07)', textAlign: 'center', width: 16 }}>#</th>
                <th style={{ padding: '3px 6px', fontSize: 7, color: 'rgba(20,40,65,0.25)', fontWeight: 600, borderBottom: '1px solid rgba(20,40,65,0.07)', textAlign: 'left', minWidth: 58, borderRight: '1px solid rgba(20,40,65,0.07)' }}>Player</th>
                {innings.map(i => (
                  <th key={i} style={{
                    padding: '3px 4px', fontSize: 7, fontWeight: 600,
                    borderBottom: '1px solid rgba(20,40,65,0.07)', textAlign: 'center', minWidth: 26,
                    color: i === focusedInning ? 'rgba(20,40,65,0.6)' : 'rgba(20,40,65,0.25)',
                    background: i === focusedInning ? 'rgba(20,40,65,0.03)' : 'transparent',
                  }}>
                    {i + 1}
                    {i === focusedInning && <div style={{ fontSize: 5, color: '#2A6633', lineHeight: 1 }}>✓</div>}
                  </th>
                ))}
                <th style={{ padding: '3px 5px', fontSize: 7, color: 'rgba(20,40,65,0.25)', fontWeight: 600, borderBottom: '1px solid rgba(20,40,65,0.07)', textAlign: 'center' }}>Bench</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_PLAYERS.map((player, pi) => {
                const benchCount = player.innings.filter(p => p === 'Bnch').length
                return (
                  <tr key={player.name} style={{ background: pi % 2 === 0 ? 'transparent' : 'rgba(20,40,65,0.02)' }}>
                    <td style={{ padding: '2px 5px', textAlign: 'center', fontSize: 7, color: 'rgba(20,40,65,0.3)' }}>{pi + 1}</td>
                    <td style={{ padding: '2px 6px', fontSize: 9, color: 'rgba(20,40,65,0.75)', fontWeight: 500, whiteSpace: 'nowrap', borderRight: '1px solid rgba(20,40,65,0.07)' }}>
                      {player.name}
                    </td>
                    {player.innings.map((pos, ii) => {
                      const c = LIGHT_POS[pos]
                      const isFoc = pi === focusedCell.pi && ii === focusedCell.ii
                      const isSel = pi === focusedCell.pi && ii === 1
                      const isColFoc = ii === focusedInning
                      return (
                        <td key={ii} style={{ padding: '2px 2px', textAlign: 'center', background: isColFoc ? 'rgba(20,40,65,0.025)' : 'transparent' }}>
                          <div style={{
                            background: isFoc ? 'rgba(59,109,177,0.25)' : isSel ? 'rgba(59,109,177,0.1)' : (c?.bg ?? 'transparent'),
                            color: isFoc ? '#142841' : isSel ? '#2A5A9E' : (c?.fg ?? 'rgba(20,40,65,0.2)'),
                            borderRadius: 2, padding: '1px 0',
                            fontSize: 8, fontWeight: 700,
                            minWidth: 22, display: 'inline-block',
                            outline: isFoc ? '1.5px solid rgba(59,109,177,0.7)' : isSel ? '1px solid rgba(59,109,177,0.3)' : 'none',
                            outlineOffset: -1,
                          }}>{pos === 'Bnch' ? 'B' : pos}</div>
                        </td>
                      )
                    })}
                    <td style={{ padding: '2px 5px', textAlign: 'center', fontSize: 8, fontWeight: 700, color: benchCount > 0 ? '#2A6633' : 'rgba(20,40,65,0.2)' }}>
                      {benchCount > 0 ? benchCount : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Right: Inning summary */}
        <div style={{
          width: 98, flexShrink: 0, borderLeft: '1px solid rgba(20,40,65,0.08)',
          padding: '7px 7px', overflowY: 'hidden',
        }}>
          <div style={{ fontSize: 7, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'rgba(20,40,65,0.3)', marginBottom: 4 }}>
            Inning 3
          </div>
          {inning3Summary.map(({ pos, player }) => {
            const c = LIGHT_POS[pos]
            const empty = !player
            return (
              <div key={pos} style={{ display: 'flex', alignItems: 'center', gap: 3, marginBottom: 2, padding: '1px 3px', borderRadius: 3, background: empty ? 'rgba(200,80,70,0.07)' : 'transparent' }}>
                <span style={{
                  fontSize: 7, fontWeight: 800, minWidth: 20, padding: '1px 2px', borderRadius: 2,
                  textAlign: 'center', flexShrink: 0,
                  background: c?.bg ?? 'transparent', color: c?.fg ?? 'rgba(20,40,65,0.5)',
                }}>{pos}</span>
                <span style={{
                  fontSize: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  color: empty ? 'rgba(180,60,50,0.85)' : 'rgba(20,40,65,0.7)',
                  fontStyle: empty ? 'italic' : 'normal',
                }}>{player ?? '—'}</span>
                {empty && <span style={{ fontSize: 7, color: '#B83C32', flexShrink: 0 }}>!</span>}
              </div>
            )
          })}
          <div style={{ marginTop: 6, padding: '5px 6px', borderRadius: 4, background: 'rgba(20,40,65,0.03)', border: '0.5px solid rgba(20,40,65,0.08)' }}>
            <div style={{ fontSize: 8, color: 'rgba(20,40,65,0.5)' }}>Bench: Josh M.</div>
            <div style={{ fontSize: 7, color: 'rgba(20,40,65,0.3)', marginTop: 1 }}>~0.7 bench inn exp</div>
          </div>
        </div>

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
            background: 'rgba(232,160,32,0.12)',
            border: '0.5px solid rgba(232,160,32,0.25)',
            borderRadius: '20px',
            padding: '4px 14px',
            marginBottom: '1.5rem',
          }}>
            Youth baseball lineup management
          </div>

          <h1 style={{
            fontSize: 'clamp(36px, 6vw, 58px)',
            fontWeight: 800,
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
            marginBottom: '1.25rem',
          }}>
            Game day,<br />
            <span style={{ color: 'var(--accent)' }}>handled.</span>
          </h1>

          <p style={{
            fontSize: '17px',
            lineHeight: 1.65,
            color: `rgba(var(--fg-rgb), 0.6)`,
            maxWidth: '420px',
            margin: '0 auto 2.5rem',
          }}>
            Six43 is the fastest way for youth baseball coaches to build lineups, track playing time, and coordinate with your staff — from your phone or laptop.
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
              3 games free · beta testers get Pro free · no credit card
            </div>
          </div>
        </div>

        <div className="mkt-hero-browser">
          <BrowserMockup caption="Build and manage lineups from your laptop">
            <FullDesktopLineupEditor />
          </BrowserMockup>
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
        <h2 style={{ fontSize: '24px', fontWeight: 800, textAlign: 'center', marginBottom: '2.5rem' }}>
          Game-ready in three steps
        </h2>

        <div className="mkt-steps">
          {[
            { n: '1', title: 'Add your roster', body: 'Enter your players once. Jersey numbers, positions, and batting preferences — saved for the whole season.' },
            { n: '2', title: 'Mark attendance',  body: "On game day, tap who's there. Absent players are automatically pulled from the lineup." },
            { n: '3', title: 'Build the lineup', body: 'Pick a position, paint the innings. The whole lineup grid fills in as you go. Done in minutes.' },
          ].map((step, i, arr) => (
            <div key={step.n} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', position: 'relative', flex: 1 }}>
              {i < arr.length - 1 && (
                <div className="mkt-step-connector" style={{
                  position: 'absolute', left: '19px', top: '40px',
                  width: '2px', height: 'calc(100% - 16px)',
                  background: 'rgba(232,160,32,0.15)',
                }} />
              )}
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
                background: 'rgba(232,160,32,0.12)', border: '0.5px solid rgba(232,160,32,0.3)',
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
              Build a lineup in minutes,<br />not an hour
            </h2>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: `rgba(var(--fg-rgb), 0.6)`, marginBottom: '1.5rem' }}>
              See every player, every inning, all at once. Click cells to select, press a key or click a position to fill. Shift+click to paint a range. The whole grid fills out as you go — no spreadsheets, no paper lineups.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {[
                'Full grid view — every player across every inning',
                'Keyboard shortcuts: P, C, 1, 2, SS, 3, and more',
                'Shift+click or shift+arrow to fill multiple cells at once',
                'Print a clean lineup card to bring to the field',
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
          <div className="mkt-spotlight-img">
            <PhoneMockup src="/screenshot-fairness.png" alt="Playing time view" />
          </div>
          <div className="mkt-spotlight-text">
            <div style={{
              fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              color: 'var(--accent)', marginBottom: '12px',
            }}>Playing time</div>
            <h2 style={{ fontSize: 'clamp(22px, 3vw, 32px)', fontWeight: 800, lineHeight: 1.15, marginBottom: '1rem' }}>
              Every kid plays.<br />You have the receipts.
            </h2>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: `rgba(var(--fg-rgb), 0.6)`, marginBottom: '1.5rem' }}>
              See bench percentage, innings by position, and season totals for every player. Set targets and get flagged before anyone sits too long — before a parent brings it up after the game.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {['Bench % tracked per player per game', 'Set an innings target and track progress', 'Per-game breakdown: who played where and when'].map(item => (
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
              Know who can pitch<br />before you get to the field.
            </h2>
            <p style={{ fontSize: '15px', lineHeight: 1.7, color: `rgba(var(--fg-rgb), 0.6)`, marginBottom: '1.5rem' }}>
              Log pitch counts after each game and track rest days automatically. See exactly who's eligible for your next game — no more guessing or scrambling on game day.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {['Pitch counts logged per game', 'Rest days calculated to the next scheduled game', 'Eligible pitchers highlighted at a glance'].map(item => (
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

      {/* ── Spotlight 4: GameChanger sync ── */}
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
          Built for the whole season
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
            color: 'var(--accent)', background: 'rgba(232,160,32,0.1)',
            border: '0.5px solid rgba(232,160,32,0.25)',
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
              3 games · no credit card required
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
            background: 'rgba(232,160,32,0.05)',
            border: '0.5px solid rgba(232,160,32,0.3)',
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
          background: 'rgba(232,160,32,0.07)',
          border: '0.5px solid rgba(232,160,32,0.2)',
          borderRadius: '14px',
          padding: '3rem 2rem',
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 'clamp(20px, 3vw, 28px)', fontWeight: 800, marginBottom: '10px' }}>
            Ready to simplify game day?
          </div>
          <div style={{
            fontSize: '15px', color: `rgba(var(--fg-rgb), 0.55)`,
            marginBottom: '2rem', lineHeight: 1.6, maxWidth: '400px', margin: '0 auto 2rem',
          }}>
            Start free. Early beta testers get Pro free for life — limited spots available.
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
        <div>
          Questions or feedback?{' '}
          <a href="mailto:jonkuznicki@gmail.com?subject=Six43 feedback" style={{
            color: `rgba(var(--fg-rgb), 0.45)`, textDecoration: 'none',
            borderBottom: '0.5px solid rgba(var(--fg-rgb), 0.2)',
          }}>
            jonkuznicki@gmail.com
          </a>
        </div>
      </footer>

    </main>
  )
}
