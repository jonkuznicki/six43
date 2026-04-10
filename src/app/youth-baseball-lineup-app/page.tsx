import Link from 'next/link'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Youth Baseball Lineup App — Six43',
  description: 'Free youth baseball lineup app for coaches. Build fair lineups, track playing time for every kid, manage your pitchers, and coordinate with your staff.',
  keywords: ['youth baseball lineup app', 'youth baseball app for coaches', 'little league lineup app', 'youth baseball lineup maker', 'baseball lineup app'],
  openGraph: {
    title: 'Youth Baseball Lineup App — Six43',
    description: 'Free youth baseball lineup app for coaches. Build fair lineups, track playing time for every kid, and manage your pitchers.',
    url: 'https://six43.app/youth-baseball-lineup-app',
  },
  alternates: { canonical: 'https://six43.app/youth-baseball-lineup-app' },
}

export default function YouthBaseballLineupApp() {
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
          Free youth baseball app
        </div>

        <h1 style={{ fontSize: 'clamp(30px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: '1.25rem' }}>
          The youth baseball app<br />
          <span style={{ color: 'var(--accent)' }}>every coach needs.</span>
        </h1>

        <p style={{ fontSize: '17px', lineHeight: 1.65, color: `rgba(var(--fg-rgb), 0.6)`, marginBottom: '1.5rem', maxWidth: '520px' }}>
          Six43 is a free lineup app built specifically for youth baseball coaches. Build your lineup inning by inning, track every kid's playing time across the season, and show up to game day organized.
        </p>

        <ul style={{ fontSize: '15px', lineHeight: 2, color: `rgba(var(--fg-rgb), 0.7)`, paddingLeft: '1.5rem', marginBottom: '2.5rem' }}>
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
          <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.35)`, display: 'flex', alignItems: 'center' }}>
            No credit card · 3 games free
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
          <div style={{ fontSize: '22px', fontWeight: 800, marginBottom: '10px' }}>Stop wrestling with spreadsheets.</div>
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
