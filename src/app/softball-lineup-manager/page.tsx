import Link from 'next/link'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Softball Lineup Manager — Six43',
  description: 'Free softball lineup manager for youth coaches. Build fair 10-player lineups inning by inning, track playing time, manage pitchers, and sync your schedule from GameChanger.',
  keywords: ['softball lineup manager', 'youth softball app', 'softball lineup app', 'softball lineup maker', 'youth softball lineup', 'softball playing time tracker', '10 player softball lineup', 'softball lineup rotation'],
  openGraph: {
    title: 'Softball Lineup Manager — Six43',
    description: 'Free softball lineup manager for youth coaches. Build fair 10-player lineups, track playing time, and manage your pitchers.',
    url: 'https://six43.com/softball-lineup-manager',
    images: [{ url: 'https://six43.com/screenshot-lineup.png' }],
  },
  alternates: { canonical: 'https://six43.com/softball-lineup-manager' },
}

const s = {
  muted: 'rgba(var(--fg-rgb), 0.6)' as const,
  dimmer: 'rgba(var(--fg-rgb), 0.4)' as const,
  dimmest: 'rgba(var(--fg-rgb), 0.25)' as const,
}

export default function SoftballLineupManager() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif' }}>
      <nav style={{
        borderBottom: '0.5px solid var(--border-subtle)', padding: '1rem 1.5rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        maxWidth: '900px', margin: '0 auto',
      }}>
        <Link href="/" style={{ fontWeight: 800, fontSize: '16px', color: 'var(--accent)', textDecoration: 'none', letterSpacing: '0.04em' }}>
          SIX43
        </Link>
        <Link href="/login" style={{
          fontSize: '13px', fontWeight: 700, padding: '8px 20px', borderRadius: '7px',
          background: 'var(--accent)', color: 'var(--accent-text)', textDecoration: 'none',
        }}>Try free</Link>
      </nav>

      <div style={{ maxWidth: '700px', margin: '0 auto', padding: '4rem 1.5rem 6rem' }}>

        {/* Hero */}
        <div style={{
          display: 'inline-block', fontSize: '11px', fontWeight: 700,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'var(--accent)', background: 'rgba(232,160,32,0.12)',
          border: '0.5px solid rgba(232,160,32,0.25)', borderRadius: '20px',
          padding: '4px 14px', marginBottom: '1.5rem',
        }}>
          Works for softball too
        </div>

        <h1 style={{ fontSize: 'clamp(30px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: '1.25rem' }}>
          Softball lineup manager<br />
          <span style={{ color: 'var(--accent)' }}>built for coaches.</span>
        </h1>

        <p style={{ fontSize: '17px', lineHeight: 1.65, color: s.muted, marginBottom: '1.5rem', maxWidth: '520px' }}>
          Six43 supports both baseball and softball out of the box — including the full 10-player softball field layout with LC and RC outfield positions. Build your lineup inning by inning, track every player&apos;s time, and show up organized.
        </p>

        <ul style={{ fontSize: '15px', lineHeight: 2, color: 'rgba(var(--fg-rgb), 0.7)', paddingLeft: '1.5rem', marginBottom: '2.5rem' }}>
          <li>Full 10-player softball layout including LC and RC outfield positions</li>
          <li>Inning-by-inning lineup grid — assign every position for every inning</li>
          <li>Playing time fairness tracker — bench %, position time, season totals</li>
          <li>Pitch count tracking and rest-day management</li>
          <li>GameChanger schedule sync — import your season in seconds</li>
          <li>Works from your phone or laptop — install it like a native app</li>
        </ul>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '3.5rem' }}>
          <Link href="/login" style={{
            display: 'inline-block', background: 'var(--accent)', color: 'var(--accent-text)',
            fontSize: '15px', fontWeight: 700, padding: '14px 32px', borderRadius: '8px', textDecoration: 'none',
          }}>
            Try it free
          </Link>
          <div style={{ fontSize: '12px', color: s.dimmest, display: 'flex', alignItems: 'center' }}>
            No credit card · free to start
          </div>
        </div>

        <blockquote style={{
          borderLeft: '3px solid var(--accent)', paddingLeft: '1.25rem', marginBottom: '3.5rem',
          fontStyle: 'italic', fontSize: '16px', color: 'rgba(var(--fg-rgb), 0.7)', lineHeight: 1.6,
        }}>
          &ldquo;This is amazing! So much better than my old spreadsheets.&rdquo;
          <footer style={{ fontStyle: 'normal', fontSize: '12px', color: s.dimmer, marginTop: '6px' }}>
            — Youth Softball Coach
          </footer>
        </blockquote>

        {/* How it works */}
        <h2 style={{ fontSize: '26px', fontWeight: 800, marginBottom: '0.5rem' }}>How Six43 works for softball</h2>
        <p style={{ fontSize: '15px', color: s.muted, lineHeight: 1.6, marginBottom: '1.75rem' }}>
          Managing a 10-player softball roster is different from baseball — more outfield positions mean more rotation combinations, and keeping track of who has played where gets complicated fast. Six43 handles it automatically.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '3.5rem' }}>
          {[
            {
              n: '1',
              title: 'Set up your softball team',
              body: 'When creating your team in Settings, choose the "Softball – 10 players" field configuration. This unlocks the LC (left-center) and RC (right-center) outfield positions throughout the app — in the lineup builder, the playing time tracker, and the position heat map.',
            },
            {
              n: '2',
              title: 'Build your lineup inning by inning',
              body: 'The lineup grid shows all 10 players across every inning. Click a cell and type a position shortcut — P, C, 1, 2, SS, 3, L, LC, RC, R — to fill it instantly. Duplicate positions in the same inning highlight red so you catch mistakes before game day.',
            },
            {
              n: '3',
              title: 'Track playing time and position variety',
              body: 'After each game, the Playing Time page shows exactly how many innings each player has spent at every position — including each outfield slot separately. The position distribution bar and baseball diamond heat map make it easy to spot who always plays the same spot and who is getting a well-rounded experience.',
            },
          ].map(step => (
            <div key={step.n} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start' }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                background: 'rgba(232,160,32,0.12)', border: '1px solid rgba(232,160,32,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', fontWeight: 800, color: 'var(--accent)',
              }}>{step.n}</div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>{step.title}</div>
                <div style={{ fontSize: '14px', color: s.muted, lineHeight: 1.6 }}>{step.body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <h2 style={{ fontSize: '26px', fontWeight: 800, marginBottom: '1.5rem' }}>Frequently asked questions</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '3.5rem' }}>
          {[
            {
              q: 'What positions are on a youth softball lineup?',
              a: 'A standard youth softball lineup has 10 players: Pitcher (P), Catcher (C), First Base (1B), Second Base (2B), Shortstop (SS), Third Base (3B), Left Field (LF), Left-Center (LC), Right-Center (RC), and Right Field (RF). Six43 supports all 10 positions natively — just select the Softball field configuration when setting up your team.',
            },
            {
              q: 'How do you rotate 10 players fairly in youth softball?',
              a: 'Fair rotation in youth softball means making sure every player gets time in the infield, outfield, and pitcher/catcher positions over the course of the season — not just getting equal bench time. Six43 tracks innings by position group (infield, outfield, pitcher, catcher, bench) across all your games. The Playing Time page shows each player\'s distribution as a colorful stacked bar so you can see at a glance who is only playing outfield and who needs more infield time.',
            },
            {
              q: 'How do I track bench time for youth softball players?',
              a: 'Six43 calculates bench percentage automatically from your lineups. Each player\'s bench innings are compared to what is fair given the roster size and game length, then shown as a green/amber/red indicator. The app also detects patterns — if a player is consistently benched in the same inning across multiple games, it flags that so you can address it before parents bring it up.',
            },
            {
              q: 'Can I sync my GameChanger schedule for softball?',
              a: 'Yes. Go to Games → Import and paste your webcal link from the GameChanger mobile app. Six43 imports all your games — dates, times, locations, and opponent names — and correctly identifies home vs. away games from the GameChanger event format. You can run Check for updates any time to pull in schedule changes.',
            },
            {
              q: 'Does Six43 work on iPhone for softball coaches?',
              a: 'Yes — Six43 is a progressive web app that works on any device. On iPhone, open six43.com in Safari and tap "Add to Home Screen" to install it like a native app. Your lineup, roster, and playing time data sync across your phone, tablet, and laptop so you can build lineups on your laptop and pull them up on your phone in the dugout.',
            },
            {
              q: 'Can my assistant coach see the lineup too?',
              a: 'Yes — go to Settings → Staff and invite your assistant coach by email. You can give them full editing access or limit them to View Only. They\'ll be able to see the roster, lineup, and playing time from their own device without needing to ask you to share a screenshot.',
            },
          ].map(({ q, a }) => (
            <div key={q} style={{ borderBottom: '0.5px solid var(--border-subtle)', paddingBottom: '20px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>{q}</h3>
              <p style={{ fontSize: '14px', color: s.muted, lineHeight: 1.65, margin: 0 }}>{a}</p>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{
          background: 'rgba(232,160,32,0.07)', border: '0.5px solid rgba(232,160,32,0.2)',
          borderRadius: '14px', padding: '2.5rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '22px', fontWeight: 800, marginBottom: '10px' }}>Ready to simplify game day?</div>
          <div style={{ fontSize: '14px', color: s.muted, marginBottom: '1.5rem' }}>
            Free to start. No credit card required.
          </div>
          <Link href="/login" style={{
            display: 'inline-block', background: 'var(--accent)', color: 'var(--accent-text)',
            fontSize: '15px', fontWeight: 700, padding: '13px 32px', borderRadius: '8px', textDecoration: 'none',
          }}>
            Get started free
          </Link>
        </div>
      </div>
    </main>
  )
}
