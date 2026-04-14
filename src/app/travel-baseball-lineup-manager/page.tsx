import Link from 'next/link'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Travel Baseball Lineup Manager — Six43',
  description: 'The lineup manager built for travel baseball coaches. Track playing time, manage pitch counts across tournament weekends, plan your rotation, and build fair lineups — from your phone or laptop.',
  keywords: ['travel baseball lineup manager', 'travel baseball app', 'travel baseball lineup tool', 'youth baseball lineup manager', 'baseball lineup software', 'travel baseball pitch count tracker', 'tournament lineup planner', 'travel ball playing time'],
  openGraph: {
    title: 'Travel Baseball Lineup Manager — Six43',
    description: 'The lineup manager built for travel baseball coaches. Track playing time, manage pitch counts, plan your rotation, and build fair lineups.',
    url: 'https://six43.com/travel-baseball-lineup-manager',
    images: [{ url: 'https://six43.com/screenshot-lineup.png' }],
  },
  alternates: { canonical: 'https://six43.com/travel-baseball-lineup-manager' },
}

const FEATURES = [
  { icon: '⚾', title: 'Inning-by-inning lineup grid', body: 'Paint positions across every inning in one view. See the whole game at a glance — no more crossing out and rewriting on a paper card.' },
  { icon: '📊', title: 'Playing time fairness', body: 'Track bench innings, position time, and season totals for every player. A visual heat map shows where each kid plays most on the field.' },
  { icon: '🎯', title: 'Pitch count tracking', body: 'Log pitch counts per game, set per-game limits, and track rest days. Season totals and over-limit warnings keep you pitch-rule compliant.' },
  { icon: '🔄', title: 'GameChanger schedule sync', body: 'Paste your webcal link from GameChanger and your full schedule imports in seconds — including tournament games, dates, times, and locations.' },
  { icon: '✦',  title: 'AI player evaluations', body: 'Jot notes on players during the season. At year-end, generate a personalized, parent-friendly evaluation report for each player with one tap.' },
  { icon: '🔗', title: 'Staff sharing with permissions', body: 'Invite your coaching staff. Set coaches as read-only so everyone has the lineup in the dugout without the risk of accidental changes.' },
]

const s = {
  muted: 'rgba(var(--fg-rgb), 0.6)' as const,
  dimmer: 'rgba(var(--fg-rgb), 0.4)' as const,
  dimmest: 'rgba(var(--fg-rgb), 0.25)' as const,
}

export default function TravelBaseballLineupManager() {
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
          Built for travel ball coaches
        </div>

        <h1 style={{ fontSize: 'clamp(30px, 5vw, 48px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: '1.25rem' }}>
          The travel baseball<br />
          <span style={{ color: 'var(--accent)' }}>lineup manager</span><br />
          you&apos;ve been missing.
        </h1>

        <p style={{ fontSize: '17px', lineHeight: 1.65, color: s.muted, marginBottom: '2.5rem', maxWidth: '520px' }}>
          Travel ball means more games, more pitchers, tighter rosters, and parents watching playing time closely. Six43 gives you the tools to manage all of it — from tournament lineups to season-long pitch counts — in one place.
        </p>

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
            — 9U Travel Baseball Coach
          </footer>
        </blockquote>

        {/* Feature grid */}
        <h2 style={{ fontSize: '26px', fontWeight: 800, marginBottom: '1.5rem' }}>
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
                <div style={{ fontSize: '12px', lineHeight: 1.6, color: s.muted }}>{f.body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Why travel coaches */}
        <h2 style={{ fontSize: '26px', fontWeight: 800, marginBottom: '0.5rem' }}>Why travel coaches choose Six43</h2>
        <p style={{ fontSize: '15px', color: s.muted, lineHeight: 1.6, marginBottom: '1.75rem' }}>
          Travel baseball is a different beast from rec league. Weekends can mean three games in two days, four pitchers in rotation, and parents who have driven two hours to watch their kid play. Six43 is designed with that pressure in mind.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '3.5rem' }}>
          {[
            { title: 'Full visibility over the whole game', body: 'See every player, every position, every inning on one screen. No more juggling three pieces of paper or a confusing spreadsheet on your phone.' },
            { title: 'Pitch counts that follow you all season', body: 'Log pitch counts after every outing. Six43 tracks rest days and warns you before you exceed your league\'s limits — so you\'re never caught off guard at a tournament.' },
            { title: 'Playing time parents can trust', body: 'The playing time page shows exactly how many innings each player has spent at each position this season. If a parent asks why their kid only played two innings, you have the data to back up every decision.' },
            { title: 'The whole coaching staff, in sync', body: 'Invite your assistant coaches to the team. They can see the current lineup from their own phone in the dugout — no more "can you send me the lineup?" texts. Set them to View Only if you don\'t want anyone editing on game day.' },
          ].map(item => (
            <div key={item.title} style={{
              padding: '14px 16px', background: 'var(--bg-card)',
              border: '0.5px solid var(--border)', borderRadius: '10px',
            }}>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>{item.title}</div>
              <div style={{ fontSize: '13px', color: s.muted, lineHeight: 1.6 }}>{item.body}</div>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <h2 style={{ fontSize: '26px', fontWeight: 800, marginBottom: '1.5rem' }}>Frequently asked questions</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginBottom: '3.5rem' }}>
          {[
            {
              q: 'How do I manage pitch counts across a tournament weekend?',
              a: 'In Six43, each game has a pitching log where you enter each pitcher\'s inning count and pitch count. Six43 tracks cumulative pitch counts for the season and calculates required rest days based on the counts you enter. Before a tournament, you can see exactly which pitchers are available and how many pitches each one has left before they need rest — so you can plan your rotation across multiple games in a day.',
            },
            {
              q: 'How do you handle fair playing time in travel baseball?',
              a: 'Travel baseball rosters are typically bigger relative to the number of field positions, which means bench time is unavoidable. Six43 tracks bench innings per player and compares each player\'s bench percentage to what is statistically fair given the roster size. Players who are getting significantly more bench time than average are flagged in amber or red so you can rebalance before the gap becomes a problem. You can also set a season-long fielding innings target per player and track their progress.',
            },
            {
              q: 'Can I sync my GameChanger travel schedule with Six43?',
              a: 'Yes. In Six43, go to Games → Import and paste your webcal link from the GameChanger mobile app. Six43 imports your entire schedule including tournament games, regular season games, practice dates, and all location and time details. When GameChanger updates — a rainout, a rescheduled game, a new tournament added — you can run Check for updates to review and apply those changes without re-entering anything.',
            },
            {
              q: 'What is a tournament in Six43?',
              a: 'Six43 has a dedicated Tournament mode for organizing multi-game weekends. When you create a tournament, you can add pool play games and bracket games separately, and Six43 organizes them in the correct order on your schedule. Each game in the tournament links to its own lineup builder, so you can plan all your lineups ahead of the weekend.',
            },
            {
              q: 'Can I print my lineup card from Six43?',
              a: 'Yes — the desktop lineup editor has a Print button in the top bar that generates a print-friendly lineup card. You can also generate an exchange card (the condensed lineup summary you hand to the opposing coach before the game) from the game detail page. Both print cleanly on standard paper.',
            },
            {
              q: 'How is Six43 different from a spreadsheet?',
              a: 'Spreadsheets require you to manually track everything — building formulas for bench counts, copying lineups between games, and maintaining your own position history. Six43 does all of that automatically. Bench percentages, position totals, pitch count rest days, and season summaries are all calculated and updated in real time as you build lineups. You also get features spreadsheets can\'t replicate — conflict detection (two players at the same position), a visual baseball diamond heat map, GameChanger sync, and coach sharing.',
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
          <div style={{ fontSize: '22px', fontWeight: 800, marginBottom: '10px' }}>Ready for your next tournament?</div>
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
