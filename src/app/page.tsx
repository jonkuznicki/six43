import Link from 'next/link'
import Image from 'next/image'
import { createServerClient } from '../lib/supabase-server'
import { redirect } from 'next/navigation'

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
    title: 'Share with your coaching staff',
    body: "Invite assistant coaches so everyone is working from the same lineup. Generate a read-only link for anyone who just needs to see the card — no login required.",
  },
  {
    icon: '📊',
    title: 'Playing time that adds up fairly',
    body: 'See bench %, innings by position, and season totals for every player. Set targets and get a heads-up before a kid has been sitting too long.',
  },
]

export default async function HomePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/games')
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
          Game day,<br />
          <span style={{ color: 'var(--accent)' }}>handled.</span>
        </h1>

        <p style={{
          fontSize: '17px',
          lineHeight: 1.6,
          color: `rgba(var(--fg-rgb), 0.6)`,
          maxWidth: '460px',
          margin: '0 auto 2.5rem',
        }}>
          Six43 is the fastest way for youth baseball coaches to build lineups, track playing time, and coordinate with your staff — seamlessly from your phone or desktop.
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

      {/* Phone mockup */}
      <section style={{ maxWidth: '680px', margin: '0 auto', padding: '0 1.5rem 4rem', textAlign: 'center' }}>
        {/* Phone frame */}
        <div style={{
          display: 'inline-block',
          position: 'relative',
          background: '#0a0a0a',
          borderRadius: '44px',
          padding: '14px',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.08), 0 32px 64px rgba(0,0,0,0.5), 0 8px 24px rgba(0,0,0,0.3)',
          maxWidth: '280px',
          width: '100%',
        }}>
          {/* Camera pill */}
          <div style={{
            position: 'absolute', top: '22px', left: '50%', transform: 'translateX(-50%)',
            width: '80px', height: '10px', background: '#1a1a1a',
            borderRadius: '6px', zIndex: 2,
          }} />
          {/* Screen */}
          <div style={{
            borderRadius: '32px', overflow: 'hidden',
            background: '#0B1F3A',
            aspectRatio: '9/19.5',
            position: 'relative',
          }}>
            {/* Screenshot */}
            <Image
              src="/screenshot-lineup.png"
              alt="Six43 lineup builder"
              fill
              style={{ objectFit: 'cover', objectPosition: 'top' }}
            />
          </div>
        </div>
        <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.3)`, marginTop: '1.25rem' }}>
          The lineup builder — tap to assign positions across every inning
        </div>
      </section>

      {/* Divider */}
      <div style={{ borderTop: '0.5px solid var(--border-subtle)', maxWidth: '680px', margin: '0 auto' }} />

      {/* How it works */}
      <section style={{ maxWidth: '680px', margin: '0 auto', padding: '3rem 1.5rem' }}>
        <div style={{
          fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.3)`,
          marginBottom: '4px', textAlign: 'center',
        }}>
          How it works
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: 800, textAlign: 'center', marginBottom: '2rem' }}>
          Game-ready in three steps
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {[
            { n: '1', title: 'Add your roster', body: 'Enter your players once. Jersey numbers, positions, and batting preferences — all saved for the season.' },
            { n: '2', title: 'Mark attendance', body: "On game day, tap who's there. Absent players are automatically pulled from the lineup." },
            { n: '3', title: 'Build the lineup', body: 'Pick a position, paint the innings. The whole lineup grid fills in as you go. Done in minutes.' },
          ].map((step, i, arr) => (
            <div key={step.n} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', position: 'relative' }}>
              {/* Line connector */}
              {i < arr.length - 1 && (
                <div style={{
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
                <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px', marginTop: '8px' }}>{step.title}</div>
                <div style={{ fontSize: '13px', lineHeight: 1.6, color: `rgba(var(--fg-rgb), 0.55)` }}>{step.body}</div>
              </div>
            </div>
          ))}
        </div>
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
              'Share lineups instantly',
              'Invite assistant coaches',
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
