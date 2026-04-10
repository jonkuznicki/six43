import Link from 'next/link'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Softball Lineup Manager — Six43',
  description: 'Lineup management app for youth softball coaches. Build fair lineups, track playing time, manage your pitchers, and sync your schedule from GameChanger.',
  keywords: ['softball lineup manager', 'youth softball app', 'softball lineup app', 'softball lineup maker', 'youth softball lineup'],
  openGraph: {
    title: 'Softball Lineup Manager — Six43',
    description: 'Lineup management app for youth softball coaches. Build fair lineups, track playing time, and manage your pitchers.',
    url: 'https://six43.app/softball-lineup-manager',
  },
  alternates: { canonical: 'https://six43.app/softball-lineup-manager' },
}

export default function SoftballLineupManager() {
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
          Works for softball too
        </div>

        <h1 style={{ fontSize: 'clamp(30px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: '1.25rem' }}>
          Softball lineup manager<br />
          <span style={{ color: 'var(--accent)' }}>built for coaches.</span>
        </h1>

        <p style={{ fontSize: '17px', lineHeight: 1.65, color: `rgba(var(--fg-rgb), 0.6)`, marginBottom: '1.5rem', maxWidth: '520px' }}>
          Six43 supports both baseball and softball out of the box — including the full 10-player softball field layout (LC, RC). Build your lineup inning by inning, track every player's time, and show up organized.
        </p>

        <ul style={{ fontSize: '15px', lineHeight: 2, color: `rgba(var(--fg-rgb), 0.7)`, paddingLeft: '1.5rem', marginBottom: '2.5rem' }}>
          <li>Full softball positions including LC and RC</li>
          <li>Inning-by-inning lineup grid — paint positions across the game</li>
          <li>Playing time fairness tracker — bench %, position time, season totals</li>
          <li>Pitch count tracking and rest-day management</li>
          <li>GameChanger schedule sync</li>
          <li>Works from your phone or laptop — install it like an app</li>
        </ul>

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

        <div style={{
          background: 'rgba(232,160,32,0.07)', border: '0.5px solid rgba(232,160,32,0.2)',
          borderRadius: '14px', padding: '2.5rem', textAlign: 'center',
        }}>
          <div style={{ fontSize: '22px', fontWeight: 800, marginBottom: '10px' }}>Ready to simplify game day?</div>
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
