import Link from 'next/link'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Youth Baseball Lineup App — Six43',
  description: 'Free youth baseball lineup app for coaches. Build fair lineups inning by inning, track every kid\'s playing time across the season, and manage your pitchers — from your phone or laptop.',
  keywords: ['youth baseball lineup app', 'youth baseball app for coaches', 'little league lineup app', 'youth baseball lineup maker', 'baseball lineup app', 'little league playing time tracker', 'youth baseball lineup rotation'],
  openGraph: {
    title: 'Youth Baseball Lineup App — Six43',
    description: 'Free youth baseball lineup app for coaches. Build fair lineups, track playing time for every kid, and manage your pitchers.',
    url: 'https://six43.com/youth-baseball-lineup-app',
    images: [{ url: 'https://six43.com/screenshot-lineup.png' }],
  },
  alternates: { canonical: 'https://six43.com/youth-baseball-lineup-app' },
}

const s = {
  muted: 'rgba(var(--fg-rgb), 0.6)' as const,
  dimmer: 'rgba(var(--fg-rgb), 0.4)' as const,
  dimmest: 'rgba(var(--fg-rgb), 0.25)' as const,
}

export default function YouthBaseballLineupApp() {
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
          Free youth baseball app
        </div>

        <h1 style={{ fontSize: 'clamp(30px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: '1.25rem' }}>
          The youth baseball app<br />
          <span style={{ color: 'var(--accent)' }}>every coach needs.</span>
        </h1>

        <p style={{ fontSize: '17px', lineHeight: 1.65, color: s.muted, marginBottom: '1.5rem', maxWidth: '520px' }}>
          Six43 is a free lineup app built specifically for youth baseball coaches. Build your lineup inning by inning, track every kid&apos;s playing time across the season, and show up to game day organized.
        </p>

        <ul style={{ fontSize: '15px', lineHeight: 2, color: 'rgba(var(--fg-rgb), 0.7)', paddingLeft: '1.5rem', marginBottom: '2.5rem' }}>
          <li>Inning-by-inning lineup grid — see the whole game at once</li>
          <li>Playing time tracker — bench %, position time, season totals</li>
          <li>Pitch count limits and rest-day tracking</li>
          <li>Works on your phone and laptop — same data everywhere</li>
          <li>Share with assistant coaches, read-only or editable</li>
          <li>End-of-season AI player evaluations for each family</li>
        </ul>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '3.5rem' }}>
          <Link href="/login" style={{
            display: 'inline-block', background: 'var(--accent)', color: 'var(--accent-text)',
            fontSize: '15px', fontWeight: 700, padding: '14px 32px', borderRadius: '8px', textDecoration: 'none',
          }}>
            Try it free
          </Link>
          <div style={{ fontSize: '12px', color: s.dimmest, display: 'flex', alignItems: 'center' }}>
            No credit card · 10 games free
          </div>
        </div>

        <blockquote style={{
          borderLeft: '3px solid var(--accent)', paddingLeft: '1.25rem', marginBottom: '3.5rem',
          fontStyle: 'italic', fontSize: '16px', color: 'rgba(var(--fg-rgb), 0.7)', lineHeight: 1.6,
        }}>
          &ldquo;This is amazing! So much better than my old spreadsheets.&rdquo;
          <footer style={{ fontStyle: 'normal', fontSize: '12px', color: s.dimmer, marginTop: '6px' }}>
            — 9U Travel Baseball Coach
          </footer>
        </blockquote>

        {/* How it works */}
        <h2 style={{ fontSize: '26px', fontWeight: 800, marginBottom: '0.5rem' }}>How Six43 works</h2>
        <p style={{ fontSize: '15px', color: s.muted, lineHeight: 1.6, marginBottom: '1.75rem' }}>
          Six43 is designed to match the way coaches actually think about a baseball game — position by position, inning by inning.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '3.5rem' }}>
          {[
            {
              n: '1',
              title: 'Add your roster',
              body: 'Enter your players, jersey numbers, and preferred batting order. Set a fielding innings target for each kid so the app can flag anyone falling behind across the season.',
            },
            {
              n: '2',
              title: 'Build your lineup inning by inning',
              body: 'The lineup grid shows every player as a row and every inning as a column. Click a cell, press a position key, and move on. Duplicate conflicts show in red instantly. The whole game fits on one screen.',
            },
            {
              n: '3',
              title: 'Track playing time across the season',
              body: 'After each game, mark it final and the Playing Time page updates automatically. See exactly how many innings each player has spent at pitcher, catcher, infield, outfield, and bench — for every game and the season total.',
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
              q: 'What is the best app for building a youth baseball lineup?',
              a: 'Six43 is built specifically for youth baseball coaches. Unlike generic spreadsheets or overly complex apps, Six43 gives you an inning-by-inning grid where you can fill every position for every inning in seconds. It automatically tracks bench time, warns you about duplicate positions in the same inning, and carries playing time totals forward across the whole season.',
            },
            {
              q: 'How do you rotate positions fairly in Little League?',
              a: 'Fair rotation means making sure no player is always stuck on the bench or always stuck in one position. In Six43, each player\'s bench percentage is calculated automatically after every game. The Playing Time page shows a breakdown by position — pitcher, catcher, infield, outfield, and bench — so you can see at a glance if someone is getting shorted. You can also set a season-long fielding innings target per player and track their progress toward it.',
            },
            {
              q: 'How do I track playing time in Little League?',
              a: 'Six43 tracks playing time automatically from your lineups. Once you mark a game as Final, the innings each player spent at each position are added to their season totals. The Playing Time page shows every player\'s bench percentage, a color-coded position distribution bar, and a baseball diamond heat map showing where each player spends most of their time on the field.',
            },
            {
              q: 'Can my assistant coach use the same lineup app?',
              a: 'Yes — Six43 supports multiple coaches on the same team. Go to Settings → Staff and invite your assistant coach by email. You can give them full editing access or set them to View Only, so they can see the lineup without being able to change it. Both coaches see the same lineup in real time.',
            },
            {
              q: 'Does Six43 work with GameChanger?',
              a: 'Yes. In Six43, go to Games → Import, paste your webcal link from the GameChanger mobile app, and your full schedule imports automatically — including game dates, times, locations, and home/away designation. You can also run a Check for updates at any time to see what has changed in GameChanger and selectively apply those changes.',
            },
            {
              q: 'Is Six43 free to use?',
              a: 'Six43 is free for up to 10 games — no credit card required. The free tier includes full access to the lineup builder, playing time tracker, pitching log, player evaluations, and coach sharing. A Pro plan is available for unlimited games.',
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
          <div style={{ fontSize: '22px', fontWeight: 800, marginBottom: '10px' }}>Stop wrestling with spreadsheets.</div>
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
