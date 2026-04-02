import Link from 'next/link'

const FEATURES = [
  {
    icon: '⚾',
    title: 'Inning-by-inning lineup builder',
    body: 'Assign every player a position for every inning in a single view. Use paint mode to fill the lineup fast, reorder the batting lineup with a drag, and print a clean card to bring to the field.',
  },
  {
    icon: '📊',
    title: "Playing time that's actually fair",
    body: 'Track bench percentage, infield innings, catcher time, and total innings for every player across the season. Set per-player targets and get alerts before a kid sits too many innings in a row.',
  },
  {
    icon: '🔗',
    title: 'Share with parents. Coach with your staff.',
    body: 'Generate a read-only link so parents can follow the lineup without logging in. Invite assistant coaches so your whole staff is working from the same page.',
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
          Build fair lineups.<br />
          <span style={{ color: 'var(--accent)' }}>Every game.</span>
        </h1>

        <p style={{
          fontSize: '17px',
          lineHeight: 1.6,
          color: `rgba(var(--fg-rgb), 0.6)`,
          maxWidth: '480px',
          margin: '0 auto 2.5rem',
        }}>
          Six43 gives youth baseball coaches a smarter way to manage lineups and track playing time — so every kid on your roster gets their fair share of innings.
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
          Everything you need on game day
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
            Ready to run a tighter bench?
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
