// Product demonstration mockups for the marketing homepage.
//
// Copied from the previous homepage so the demos stay accurate. They
// intentionally keep the CURRENT app colors (navy) until the application
// itself is redesigned.

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


// ── Shared mockup wrappers ────────────────────────────────────────────────────

export function BrowserMockup({ children, caption }: { children: React.ReactNode; caption?: string }) {
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

// ── Full lineup editor demo (spotlight) ──────────────────────────────────────

export function FullDesktopLineupEditor() {
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

// ── Field view demo ───────────────────────────────────────────────────────────

export function FieldViewDemo() {
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

export function InGameModeDemo() {
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
