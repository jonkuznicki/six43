import Link from 'next/link'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Travel Baseball Lineup Manager — Six43',
  description: 'The lineup manager built for travel baseball coaches. Track playing time, manage pitch counts, plan your rotation, and build fair lineups — from your phone or laptop.',
  keywords: ['travel baseball lineup manager', 'travel baseball app', 'travel baseball lineup tool', 'youth baseball lineup manager', 'baseball lineup software'],
  openGraph: {
    title: 'Travel Baseball Lineup Manager — Six43',
    description: 'The lineup manager built for travel baseball coaches. Track playing time, manage pitch counts, plan your rotation, and build fair lineups.',
    url: 'https://six43.com/travel-baseball-lineup-manager',
  },
  alternates: { canonical: 'https://six43.com/travel-baseball-lineup-manager' },
}

const FEATURES = [
  { icon: '⚾', title: 'Inning-by-inning lineup grid', body: 'Paint positions across every inning in one view. See the whole game at a glance — no more crossing out and rewriting.' },
  { icon: '📊', title: 'Playing time fairness', body: 'Track bench innings, position time, and season totals. Know before game day if a kid is getting shorted.' },
  { icon: '🎯', title: 'Pitch count tracking', body: 'Log pitch counts, set per-game limits, and track rest days. Season totals and over-limit warnings keep you compliant.' },
  { icon: '🔄', title: 'Schedule sync', body: 'Paste your webcal link from GameChanger and your full travel schedule imports in seconds.' },
  { icon: '✦',  title: 'AI player evaluations', body: 'Jot notes during the season. At year-end, generate a personalized report for each player\'s family with one tap.' },
  { icon: '🔗', title: 'Staff sharing', body: 'Invite your coaching staff. Set some coaches as read-only so everyone has the lineup without being able to change it.' },
]

export default function TravelBaseballLineupManager() {
  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif',
    }}>
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

        <div style={{
          display: 'inline-block', fontSize: '11px', fontWeight: 700,
          letterSpacing: '0.1em', textTransform: 'uppercase',
          color: 'var(--accent)', background: 'rgba(232,160,32,0.12)',
          border: '0.5px solid rgba(232,160,32,0.25)', borderRadius: '20px',
          padding: '4px 14px', marginBottom: '1.5rem',
        }}>
          Built for travel ball coaches
        </div>

        <h1 style={{ fontSize: 'clamp(30px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: '1.25rem' }}>
          The travel baseball<br />
          <span style={{ color: 'var(--accent)' }}>lineup manager</span><br />
          you've been missing.
        </h1>

        <p style={{ fontSize: '17px', lineHeight: 1.65, color: `rgba(var(--fg-rgb), 0.6)`, marginBottom: '2.5rem', maxWidth: '520px' }}>
          Travel ball means more games, more pitchers, tighter rosters, and parents watching playing time closely. Six43 gives you the tools to manage all of it — from tournament lineups to season-long pitch counts — in one place.
        </p>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '3.5rem' }}>
          <Link href="/login" style={{
            display: 'inline-block', background: 'var(--accent)', color: 'var(--accent-text)',
            fontSize: '15px', fontWeight: 700, padding: '14px 32px', borderRadius: '8px', textDecoration: 'none',
          }}>
            Try it free
          </Link>
          <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.35)`, display: 'flex', alignItems: 'center' }}>
            No credit card · free to start
          </div>
        </div>

        <blockquote style={{
          borderLeft: '3px solid var(--accent)', paddingLeft: '1.25rem', marginBottom: '3.5rem',
          fontStyle: 'italic', fontSize: '16px', color: `rgba(var(--fg-rgb), 0.7)`, lineHeight: 1.6,
        }}>
          "This is amazing! So much better than my old spreadsheets."
          <footer style={{ fontStyle: 'normal', fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '6px' }}>
            — 9U Travel Baseball Coach
          </footer>
        </blockquote>

        <h2 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '1.5rem' }}>
          Everything travel coaches need
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px', marginBottom: '3.5rem' }}>
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

        <div style={{
          background: 'rgba(232,160,32,0.07)', border: '0.5px solid rgba(232,160,32,0.2)',
          borderRadius: '14px', padding: '2.5rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '22px', fontWeight: 800, marginBottom: '10px' }}>Ready for your next tournament?</div>
          <div style={{ fontSize: '14px', color: `rgba(var(--fg-rgb), 0.55)`, marginBottom: '1.5rem' }}>
            Free to start. Beta coaches get Pro free for life.
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
