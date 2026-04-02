import Link from 'next/link'

const FEATURES = [
  {
    icon: '⚡',
    title: 'Build a lineup in minutes',
    body: 'Tap to paint positions across every inning in one view. No spreadsheets, no paper — just tap a position, tap the cells, and your lineup is done.',
  },
  {
    icon: '📋',
    title: 'Everything in one place',
    body: 'Roster, schedule, lineup, score, and notes — all connected. Create a game, mark attendance, build the lineup, and print a card to bring to the field.',
  },
  {
    icon: '🔗',
    title: 'Share instantly with parents',
    body: "Generate a read-only link after you set the lineup. Parents can see where their kid is playing each inning — no app download, no login required.",
  },
  {
    icon: '📊',
    title: 'Playing time that adds up fairly',
    body: 'See bench %, innings by position, and season totals for every player. Set targets and get a heads-up before a kid has been sitting too long.',
  },
]

export default function HomePage() {
  return (
    <main style={{
      minHeight: '100vh',
      background: 'var(--bg)',
      color: 'var(--fg)',
      fontFamily: 'sans-serif',
    }}>

      {/* Nav */}
      <nav style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '1.25rem 1.5rem',
        maxWidth: '680px', margin: '0 auto',
      }}>
        <span style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-0.01em' }}>
          Six<span style={{ color: 'var(--accent)' }}>43</span>
        </span>
        <Link href="/login" style={{
          fontSize: '13px', fontWeight: 600,
          color: `rgba(var(--fg-rgb), 0.6)`,
          textDecoration: 'none',
          padding: '7px 16px',
          border: '0.5px solid var(--border-md)',
          borderRadius: '6px',
        }}>
          Log in
        </Link>
      </nav>

      {/* Hero */}
      <section style={{
        maxWidth: '680px', margin: '0 auto',
        padding: '3.5rem 1.5rem 4rem',
        textAlign: 'center',
      }}>
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
          fontSize: 'clamp(32px, 7vw, 52px)',
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          marginBottom: '1.25rem',
        }}>
          Lineups done before<br />
          <span style={{ color: 'var(--accent)' }}>you leave the car.</span>
        </h1>

        <p style={{
          fontSize: '17px',
          lineHeight: 1.6,
          color: `rgba(var(--fg-rgb), 0.6)`,
          maxWidth: '460px',
          margin: '0 auto 2.5rem',
        }}>
          Six43 is the fastest way for youth baseball coaches to build lineups, track playing time, and share with parents — all from your phone.
        </p>

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
          Get started free
        </Link>
      </section>

      {/* Divider */}
      <div style={{ borderTop: '0.5px solid var(--border-subtle)', maxWidth: '680px', margin: '0 auto' }} />

      {/* Features */}
      <section style={{
        maxWidth: '680px', margin: '0 auto',
        padding: '3rem 1.5rem 4rem',
        display: 'flex', flexDirection: 'column', gap: '16px',
      }}>
        <div style={{
          fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.3)`,
          marginBottom: '4px', textAlign: 'center',
        }}>
          Built for game day
        </div>

        {FEATURES.map(f => (
          <div key={f.title} style={{
            background: 'var(--bg-card)',
            border: '0.5px solid var(--border)',
            borderRadius: '12px',
            padding: '1.25rem 1.5rem',
            display: 'flex', gap: '1rem', alignItems: 'flex-start',
          }}>
            <span style={{ fontSize: '28px', lineHeight: 1, flexShrink: 0, marginTop: '2px' }}>
              {f.icon}
            </span>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>
                {f.title}
              </div>
              <div style={{ fontSize: '13px', lineHeight: 1.6, color: `rgba(var(--fg-rgb), 0.55)` }}>
                {f.body}
              </div>
            </div>
          </div>
        ))}
      </section>

      {/* Divider */}
      <div style={{ borderTop: '0.5px solid var(--border-subtle)', maxWidth: '680px', margin: '0 auto' }} />

      {/* Pricing */}
      <section style={{
        maxWidth: '680px', margin: '0 auto',
        padding: '3rem 1.5rem 1rem',
      }}>
        <div style={{
          fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.3)`,
          marginBottom: '4px', textAlign: 'center',
        }}>
          Pricing
        </div>
        <h2 style={{ fontSize: '26px', fontWeight: 800, textAlign: 'center', marginBottom: '0.5rem' }}>
          Free while we're in beta
        </h2>
        <p style={{ textAlign: 'center', fontSize: '14px', color: `rgba(var(--fg-rgb), 0.5)`, marginBottom: '2rem' }}>
          Full access, no credit card required. Paid plans coming later.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {/* Free tier */}
          <div style={{
            background: 'var(--bg-card)',
            border: '0.5px solid var(--border)',
            borderRadius: '12px', padding: '1.25rem',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', marginBottom: '4px' }}>Free</div>
            <div style={{ fontSize: '28px', fontWeight: 800, marginBottom: '2px' }}>$0</div>
            <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '1.25rem' }}>
              During beta
            </div>
            {[
              'Lineup builder',
              'Playing time tracking',
              'Share with parents',
              'Invite coaches',
              'Season management',
            ].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
                <span style={{ color: '#6DB875', fontSize: '12px' }}>✓</span>
                <span style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.65)` }}>{f}</span>
              </div>
            ))}
            <Link href="/login" style={{
              display: 'block', marginTop: '1.25rem', padding: '10px',
              background: 'var(--accent)', color: 'var(--accent-text)',
              borderRadius: '6px', textAlign: 'center',
              fontSize: '13px', fontWeight: 700, textDecoration: 'none',
            }}>
              Get started
            </Link>
          </div>

          {/* Pro tier */}
          <div style={{
            background: 'var(--bg-card)',
            border: '0.5px solid var(--border)',
            borderRadius: '12px', padding: '1.25rem',
            opacity: 0.6,
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '4px' }}>Pro</div>
            <div style={{ fontSize: '28px', fontWeight: 800, marginBottom: '2px' }}>TBD</div>
            <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '1.25rem' }}>
              Coming soon
            </div>
            {[
              'Everything in Free',
              'Multiple teams',
              'Advanced analytics',
              'Priority support',
              'More coming...',
            ].map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
                <span style={{ color: `rgba(var(--fg-rgb), 0.25)`, fontSize: '12px' }}>·</span>
                <span style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.35)` }}>{f}</span>
              </div>
            ))}
            <div style={{
              display: 'block', marginTop: '1.25rem', padding: '10px',
              border: '0.5px solid var(--border-md)',
              borderRadius: '6px', textAlign: 'center',
              fontSize: '13px', color: `rgba(var(--fg-rgb), 0.3)`,
            }}>
              Coming soon
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{
        maxWidth: '680px', margin: '0 auto',
        padding: '1rem 1.5rem 5rem',
        textAlign: 'center',
      }}>
        <div style={{
          background: 'rgba(232,160,32,0.07)',
          border: '0.5px solid rgba(232,160,32,0.2)',
          borderRadius: '14px',
          padding: '2.5rem 1.5rem',
        }}>
          <div style={{ fontSize: '22px', fontWeight: 800, marginBottom: '8px' }}>
            Ready to simplify game day?
          </div>
          <div style={{
            fontSize: '14px', color: `rgba(var(--fg-rgb), 0.55)`,
            marginBottom: '1.75rem', lineHeight: 1.6,
          }}>
            Set up your roster in minutes. No credit card required.
          </div>
          <Link href="/login" style={{
            display: 'inline-block',
            background: 'var(--accent)',
            color: 'var(--accent-text)',
            fontSize: '14px', fontWeight: 700,
            padding: '12px 32px',
            borderRadius: '8px',
            textDecoration: 'none',
          }}>
            Get started free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '0.5px solid var(--border-subtle)',
        padding: '1.5rem',
        textAlign: 'center',
        fontSize: '12px',
        color: `rgba(var(--fg-rgb), 0.25)`,
      }}>
        Six<span style={{ color: 'var(--accent)', opacity: 0.6 }}>43</span> · Built for youth baseball coaches
      </footer>

    </main>
  )
}
