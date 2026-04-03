import Link from 'next/link'
import Image from 'next/image'
import { createServerClient } from '../lib/supabase-server'
import { redirect } from 'next/navigation'

const FEATURES = [
  {
    icon: '⚾',
    title: 'Lineup builder',
    body: 'Tap to paint positions across every inning in one view. No spreadsheets, no paper — just pick a position and tap the cells.',
  },
  {
    icon: '📋',
    title: 'Attendance tracking',
    body: 'Mark who\'s there on game day. Absent players are automatically pulled from the lineup so you\'re never caught off guard.',
  },
  {
    icon: '📊',
    title: 'Playing time fairness',
    body: 'See bench %, innings by position, and season totals for every player. Get flagged before a kid sits too long.',
  },
  {
    icon: '🎯',
    title: 'Pitching planner',
    body: 'Log pitch counts and track rest days for every pitcher. See who\'s eligible for your next game at a glance.',
  },
  {
    icon: '📐',
    title: 'Depth chart',
    body: 'Rank players at every position and flag who can\'t play certain spots. Your depth chart lives with your roster — always current.',
  },
  {
    icon: '🔗',
    title: 'Share with your staff',
    body: 'Invite assistant coaches to collaborate. Generate a read-only link for anyone who just needs to see the card — no login required.',
  },
  {
    icon: '🖨️',
    title: 'Print-ready lineup card',
    body: 'One tap to print a clean lineup card to bring to the field. Works from your phone or desktop.',
  },
  {
    icon: '📱',
    title: 'Works on any device',
    body: 'Install it on your phone like an app or use it from your laptop. The same lineup, everywhere.',
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
          Six43 is the fastest way for youth baseball coaches to build lineups, track playing time, and coordinate with your staff — from your phone or laptop.
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
          Try it free
        </Link>
        <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '10px' }}>
          3 games free · no credit card required
        </div>
      </section>

      {/* Phone mockup */}
      <section style={{ maxWidth: '680px', margin: '0 auto', padding: '0 1.5rem 4rem', textAlign: 'center' }}>
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
      }}>
        <div style={{
          fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.3)`,
          marginBottom: '4px', textAlign: 'center',
        }}>
          Everything included
        </div>
        <h2 style={{ fontSize: '24px', fontWeight: 800, textAlign: 'center', marginBottom: '0.5rem' }}>
          Built for the whole season
        </h2>
        <p style={{ textAlign: 'center', fontSize: '14px', color: `rgba(var(--fg-rgb), 0.45)`, marginBottom: '2rem' }}>
          Every feature is available on every plan — free or paid.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{
              background: 'var(--bg-card)',
              border: '0.5px solid var(--border)',
              borderRadius: '12px',
              padding: '1.25rem 1.5rem',
              display: 'flex', gap: '1rem', alignItems: 'flex-start',
            }}>
              <span style={{ fontSize: '24px', lineHeight: 1, flexShrink: 0, marginTop: '2px' }}>
                {f.icon}
              </span>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '5px' }}>
                  {f.title}
                </div>
                <div style={{ fontSize: '13px', lineHeight: 1.6, color: `rgba(var(--fg-rgb), 0.55)` }}>
                  {f.body}
                </div>
              </div>
            </div>
          ))}
        </div>
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
          Simple, honest pricing
        </h2>
        <p style={{ textAlign: 'center', fontSize: '14px', color: `rgba(var(--fg-rgb), 0.5)`, marginBottom: '2rem' }}>
          Same experience on every plan. Pay when you're ready for unlimited.
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
              3 games included
            </div>
            {[
              'All features included',
              'Lineup builder',
              'Playing time tracking',
              'Pitching planner',
              'Depth chart',
              'Share & print lineups',
            ].map((f, i) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
                <span style={{ color: i === 0 ? 'var(--accent)' : '#6DB875', fontSize: '12px', fontWeight: i === 0 ? 700 : 400 }}>
                  {i === 0 ? '★' : '✓'}
                </span>
                <span style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), ${i === 0 ? '0.85' : '0.65'})`, fontWeight: i === 0 ? 600 : 400 }}>{f}</span>
              </div>
            ))}
            <Link href="/login" style={{
              display: 'block', marginTop: '1.25rem', padding: '10px',
              background: 'var(--accent)', color: 'var(--accent-text)',
              borderRadius: '6px', textAlign: 'center',
              fontSize: '13px', fontWeight: 700, textDecoration: 'none',
            }}>
              Get started free
            </Link>
          </div>

          {/* Pro tier */}
          <div style={{
            background: 'var(--bg-card)',
            border: '0.5px solid rgba(232,160,32,0.3)',
            borderRadius: '12px', padding: '1.25rem',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: '-1px', right: '16px',
              fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em',
              background: 'var(--accent)', color: 'var(--accent-text)',
              padding: '3px 10px', borderRadius: '0 0 6px 6px',
            }}>POPULAR</div>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--accent)', marginBottom: '4px' }}>Pro</div>
            <div style={{ fontSize: '28px', fontWeight: 800, marginBottom: '2px' }}>$4.99<span style={{ fontSize: '14px', fontWeight: 400, color: `rgba(var(--fg-rgb), 0.4)` }}>/mo</span></div>
            <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '1.25rem' }}>
              or $39/year · save 35%
            </div>
            {[
              'Everything in Free',
              'Unlimited games',
              'Full season history',
              'Priority support',
              'Early access to new features',
            ].map((f, i) => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '7px' }}>
                <span style={{ color: i === 0 ? 'var(--accent)' : '#6DB875', fontSize: '12px', fontWeight: i === 0 ? 700 : 400 }}>
                  {i === 0 ? '★' : '✓'}
                </span>
                <span style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), ${i === 0 ? '0.85' : '0.65'})`, fontWeight: i === 0 ? 600 : 400 }}>{f}</span>
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
            Set up your roster in minutes. 3 games free, no credit card required.
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
