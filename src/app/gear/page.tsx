import Link from 'next/link'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Youth Baseball Gear Guide — Six43',
  description: 'Curated youth baseball gear recommendations from Six43 coaches — bats, gloves, helmets, catcher\'s gear, cleats, training equipment, and arm care.',
  openGraph: {
    title: 'Youth Baseball Gear Guide — Six43',
    description: 'Curated gear picks for youth baseball coaches and parents. Bats, gloves, helmets, catcher\'s gear, cleats, training equipment, and arm care.',
    url: 'https://six43.com/gear',
  },
  alternates: { canonical: 'https://six43.com/gear' },
}

// ── Affiliate link helpers ─────────────────────────────────────────────────
// Dick's: wrap any dickssportinggoods.com URL with your CJ tracking link:
//   DICKS_BASE + encodeURIComponent('https://www.dickssportinggoods.com/p/...')
const DICKS_BASE = 'https://www.tkqlhce.com/click-101704867-17172189?url='

function dicks(productUrl: string) {
  return DICKS_BASE + encodeURIComponent(productUrl)
}

// Amazon: replace TAG with your Amazon Associates tracking ID
// e.g. 'https://www.amazon.com/dp/ASIN?tag=YOUR-TAG-20'
const AMAZON_TAG = 'YOUR-AMAZON-TAG-20' // TODO: replace with your Associates tag

function amazon(asin: string) {
  return `https://www.amazon.com/dp/${asin}?tag=${AMAZON_TAG}`
}

// ── Gear data ──────────────────────────────────────────────────────────────

type Product = {
  name: string
  note: string
  dicksUrl?: string   // dickssportinggoods.com product URL (pre-encoding)
  amazonAsin?: string // Amazon ASIN
}

type Category = {
  id: string
  icon: string
  title: string
  intro: string
  products: Product[]
}

const CATEGORIES: Category[] = [
  {
    id: 'bats',
    icon: '🏏',
    title: 'Bats',
    intro: 'Choosing the right bat depends on the league standard your team plays under. Most youth rec leagues use USA Baseball certification. Travel ball typically uses USSSA. Always check with your league before buying.',
    products: [
      {
        name: 'Easton ADV 360 USA Baseball Bat',
        note: 'One of the most popular USA-certified bats for Little League and rec ball. Light swing weight makes it a favorite for younger hitters.',
        dicksUrl: 'https://www.dickssportinggoods.com/s/easton-usa-baseball-bats',
        amazonAsin: 'B09XXXXXXX', // TODO: replace with real ASIN
      },
      {
        name: 'Louisville Slugger Meta USSSA Bat',
        note: 'A top-tier travel ball bat. Premium feel with excellent pop — a consistent choice for competitive youth leagues.',
        dicksUrl: 'https://www.dickssportinggoods.com/s/louisville-slugger-usssa-bats',
        amazonAsin: 'B09XXXXXXX', // TODO: replace with real ASIN
      },
      {
        name: 'Rawlings Clout USSSA Bat',
        note: 'A reliable mid-range USSSA option. Great for players who need a quality travel ball bat without the premium price tag.',
        dicksUrl: 'https://www.dickssportinggoods.com/s/rawlings-usssa-bats',
        amazonAsin: 'B09XXXXXXX', // TODO: replace with real ASIN
      },
    ],
  },
  {
    id: 'helmets',
    icon: '⛑️',
    title: 'Helmets',
    intro: 'Every batter needs a properly fitted helmet. Look for NOCSAE certification and a snug fit without being tight. Double-ear flaps are required in most youth leagues.',
    products: [
      {
        name: 'Rawlings Mach EXT Batting Helmet',
        note: 'Top-rated protection with a comfortable fit. One of the best helmets in youth baseball at a reasonable price.',
        dicksUrl: 'https://www.dickssportinggoods.com/s/rawlings-batting-helmets',
        amazonAsin: 'B09XXXXXXX', // TODO: replace with real ASIN
      },
      {
        name: 'Easton Z5 2.0 Batting Helmet',
        note: 'A proven design with a wide range of sizes. A great everyday helmet that holds up through a full season.',
        dicksUrl: 'https://www.dickssportinggoods.com/s/easton-batting-helmets',
        amazonAsin: 'B09XXXXXXX', // TODO: replace with real ASIN
      },
    ],
  },
  {
    id: 'gloves',
    icon: '🧤',
    title: 'Gloves',
    intro: 'Glove sizing varies by position. Infielders typically use 11–11.5", outfielders 12–12.5", and first basemen use a dedicated mitt. A glove that fits well and has been properly broken in is more important than a brand name.',
    products: [
      {
        name: 'Rawlings Select Pro Lite Youth Glove',
        note: 'Game-ready right out of the box — great for younger players who can\'t spend weeks breaking in a stiff glove. Excellent all-around infield option.',
        dicksUrl: 'https://www.dickssportinggoods.com/s/rawlings-youth-baseball-gloves',
        amazonAsin: 'B09XXXXXXX', // TODO: replace with real ASIN
      },
      {
        name: 'Wilson A500 Youth Baseball Glove',
        note: 'A reliable mid-range glove that works well for outfielders. Wilson\'s A500 series is a consistent performer across age groups.',
        dicksUrl: 'https://www.dickssportinggoods.com/s/wilson-youth-baseball-gloves',
        amazonAsin: 'B09XXXXXXX', // TODO: replace with real ASIN
      },
      {
        name: 'Rawlings Player Preferred First Base Mitt',
        note: 'A quality first base mitt at an accessible price. Deep pocket helps scoop throws in the dirt.',
        dicksUrl: 'https://www.dickssportinggoods.com/s/rawlings-first-base-mitts',
        amazonAsin: 'B09XXXXXXX', // TODO: replace with real ASIN
      },
    ],
  },
  {
    id: 'catchers-gear',
    icon: '🛡️',
    title: "Catcher's Gear",
    intro: "Catchers take a beating. A proper set includes a helmet/mask, chest protector, and shin guards — all sized for your player's age and height. Buying a complete set is usually more economical than buying pieces individually.",
    products: [
      {
        name: "Rawlings Renegade Youth Catcher's Set",
        note: "A complete 3-piece set covering mask, chest protector, and leg guards. Consistently rated as one of the best value sets for youth catchers.",
        dicksUrl: 'https://www.dickssportinggoods.com/s/youth-catchers-gear-sets',
        amazonAsin: 'B09XXXXXXX', // TODO: replace with real ASIN
      },
      {
        name: "All-Star Youth League Series Catcher's Set",
        note: "All-Star is a catcher's gear specialist. Their youth sets offer a step up in protection and durability for players who catch regularly.",
        dicksUrl: 'https://www.dickssportinggoods.com/s/all-star-catchers-gear',
        amazonAsin: 'B09XXXXXXX', // TODO: replace with real ASIN
      },
    ],
  },
  {
    id: 'cleats',
    icon: '👟',
    title: 'Cleats',
    intro: 'Molded cleats work for all ages and most surfaces — and are required in many youth leagues. Metal cleats are typically allowed starting at the 13U level. Kids grow fast, so fit matters more than brand.',
    products: [
      {
        name: 'New Balance Fresh Foam 3000 V6 Molded',
        note: 'Exceptional comfort with great traction. One of the most popular molded cleats for youth and high school players alike.',
        dicksUrl: 'https://www.dickssportinggoods.com/s/new-balance-baseball-cleats',
        amazonAsin: 'B09XXXXXXX', // TODO: replace with real ASIN
      },
      {
        name: 'Nike Force Zoom Trout 8 Pro',
        note: 'Lightweight and durable with good lateral support. The Trout line has been a youth baseball staple for years.',
        dicksUrl: 'https://www.dickssportinggoods.com/s/nike-baseball-cleats',
        amazonAsin: 'B09XXXXXXX', // TODO: replace with real ASIN
      },
      {
        name: 'Under Armour Harper 7 Mid Metal',
        note: 'A top metal cleat for older youth players (13U+). Great ankle support and aggressive traction for competitive play.',
        dicksUrl: 'https://www.dickssportinggoods.com/s/under-armour-metal-baseball-cleats',
        amazonAsin: 'B09XXXXXXX', // TODO: replace with real ASIN
      },
    ],
  },
  {
    id: 'training',
    icon: '🎯',
    title: 'Training Equipment',
    intro: 'The best teams practice more than they play. A good batting tee and a net in the backyard or garage pays off all season. These are the tools coaches and parents come back to again and again.',
    products: [
      {
        name: 'Tanner Tee — The Original',
        note: 'The gold standard in batting tees. Used at every level from Little League to MLB. Adjustable height, durable rubber ball stop, and it will outlast multiple seasons.',
        dicksUrl: 'https://www.dickssportinggoods.com/s/batting-tees',
        amazonAsin: 'B00165QKFY',
      },
      {
        name: 'Jugs Sports Instant Screen Net',
        note: 'A sturdy backyard pitching and hitting net. Easy to set up and take down. One of the most-used training tools in youth baseball.',
        dicksUrl: 'https://www.dickssportinggoods.com/s/baseball-batting-nets',
        amazonAsin: 'B09XXXXXXX', // TODO: replace with real ASIN
      },
      {
        name: 'Rawlings 5-Tool Weighted Training Balls',
        note: 'Weighted training balls build bat speed and improve hand strength. A simple, affordable addition to any batting practice routine.',
        dicksUrl: 'https://www.dickssportinggoods.com/s/baseball-training-balls',
        amazonAsin: 'B09XXXXXXX', // TODO: replace with real ASIN
      },
    ],
  },
  {
    id: 'arm-care',
    icon: '💪',
    title: 'Arm Care',
    intro: "You're already tracking pitch counts in Six43 — arm care is the other half of protecting your pitcher. A proper warm-up routine, resistance bands, and recovery tools can make a real difference over a long season.",
    products: [
      {
        name: 'Jaeger Sports J-Bands',
        note: 'The most widely used arm care tool in baseball at every level. A set of resistance bands with a specific routine designed to strengthen and protect the throwing arm. Every pitcher should have these.',
        dicksUrl: undefined,
        amazonAsin: 'B001TO5GEY',
      },
      {
        name: 'Rawlings Gold Glove Compression Arm Sleeve',
        note: 'Helps maintain arm temperature between innings and during warm-up. A simple, inexpensive tool that many pitchers swear by.',
        dicksUrl: 'https://www.dickssportinggoods.com/s/baseball-arm-sleeves',
        amazonAsin: 'B09XXXXXXX', // TODO: replace with real ASIN
      },
      {
        name: 'TheraBand FlexBar Resistance Bar',
        note: 'Recommended by athletic trainers for elbow and forearm strengthening. Particularly useful for preventing and recovering from common youth pitching injuries.',
        dicksUrl: undefined,
        amazonAsin: 'B001ARUF0Y',
      },
    ],
  },
]

// ── Styles ─────────────────────────────────────────────────────────────────

const s = {
  muted:   'rgba(var(--fg-rgb), 0.55)' as const,
  dimmer:  'rgba(var(--fg-rgb), 0.38)' as const,
  dimmest: 'rgba(var(--fg-rgb), 0.22)' as const,
}

// ── Component ──────────────────────────────────────────────────────────────

export default function GearPage() {
  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif' }}>

      {/* Nav */}
      <nav style={{
        borderBottom: '0.5px solid var(--border-subtle)', padding: '1rem 1.5rem',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        maxWidth: '860px', margin: '0 auto',
      }}>
        <Link href="/" style={{ fontWeight: 800, fontSize: '16px', color: 'var(--accent)', textDecoration: 'none', letterSpacing: '0.04em' }}>
          SIX43
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
          <Link href="/" style={{ fontSize: '13px', color: s.muted, textDecoration: 'none', fontWeight: 500 }}>
            Lineup App
          </Link>
          <Link href="/login" style={{
            fontSize: '13px', fontWeight: 700, padding: '8px 20px', borderRadius: '7px',
            background: 'var(--accent)', color: 'var(--accent-text)', textDecoration: 'none',
          }}>
            Try free
          </Link>
        </div>
      </nav>

      <div style={{ maxWidth: '860px', margin: '0 auto', padding: '3.5rem 1.5rem 6rem' }}>

        {/* Hero */}
        <div style={{ marginBottom: '3rem' }}>
          <div style={{
            display: 'inline-block', fontSize: '11px', fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'var(--accent)', background: 'rgba(75,156,211,0.1)',
            border: '0.5px solid rgba(75,156,211,0.25)', borderRadius: '20px',
            padding: '4px 14px', marginBottom: '1.25rem',
          }}>
            Gear Guide
          </div>
          <h1 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: '1rem', margin: '0 0 1rem' }}>
            Youth baseball gear,<br />
            <span style={{ color: 'var(--accent)' }}>curated for coaches.</span>
          </h1>
          <p style={{ fontSize: '16px', lineHeight: 1.65, color: s.muted, maxWidth: '560px', margin: '0 0 1.5rem' }}>
            We put these lists together based on what coaches and parents in our community actually use.
            No filler — just the gear worth buying for youth baseball and softball.
          </p>

          {/* FTC Disclosure */}
          <div style={{
            fontSize: '11px', color: s.dimmer, lineHeight: 1.6,
            background: 'var(--bg-card)', border: '0.5px solid var(--border-subtle)',
            borderRadius: '8px', padding: '10px 14px', maxWidth: '560px',
          }}>
            <strong>Disclosure:</strong> Six43 participates in affiliate programs with Dick&apos;s Sporting Goods and Amazon.
            We earn a small commission on qualifying purchases at no extra cost to you.
            We only recommend gear we&apos;d actually put in front of our players.
          </div>
        </div>

        {/* Category nav */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '3rem' }}>
          {CATEGORIES.map(cat => (
            <a key={cat.id} href={`#${cat.id}`} style={{
              fontSize: '12px', fontWeight: 600, padding: '5px 12px', borderRadius: '20px',
              border: '0.5px solid var(--border-md)', color: s.muted, textDecoration: 'none',
              background: 'transparent',
            }}>
              {cat.icon} {cat.title}
            </a>
          ))}
        </div>

        {/* Categories */}
        {CATEGORIES.map((cat, ci) => (
          <section key={cat.id} id={cat.id} style={{ marginBottom: '4rem', scrollMarginTop: '1.5rem' }}>
            <div style={{ marginBottom: '1.25rem' }}>
              <h2 style={{ fontSize: '22px', fontWeight: 800, margin: '0 0 0.5rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>{cat.icon}</span> {cat.title}
              </h2>
              <p style={{ fontSize: '14px', lineHeight: 1.65, color: s.muted, margin: 0, maxWidth: '620px' }}>
                {cat.intro}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {cat.products.map(product => (
                <div key={product.name} style={{
                  background: 'var(--bg-card)', border: '0.5px solid var(--border)',
                  borderRadius: '12px', padding: '1.25rem 1.5rem',
                  display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
                  gap: '1.5rem', flexWrap: 'wrap',
                }}>
                  <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>
                      {product.name}
                    </div>
                    <div style={{ fontSize: '13px', lineHeight: 1.6, color: s.muted }}>
                      {product.note}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0, flexWrap: 'wrap', alignItems: 'center' }}>
                    {product.amazonAsin && (
                      <a
                        href={amazon(product.amazonAsin)}
                        target="_blank" rel="noopener noreferrer nofollow"
                        style={{
                          fontSize: '12px', fontWeight: 700, padding: '7px 14px',
                          borderRadius: '7px', textDecoration: 'none',
                          background: '#FF9900', color: '#000',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Amazon →
                      </a>
                    )}
                    {product.dicksUrl && (
                      <a
                        href={dicks(product.dicksUrl)}
                        target="_blank" rel="noopener noreferrer nofollow"
                        style={{
                          fontSize: '12px', fontWeight: 700, padding: '7px 14px',
                          borderRadius: '7px', textDecoration: 'none',
                          background: 'var(--accent)', color: 'var(--accent-text)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        Dick&apos;s →
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {ci < CATEGORIES.length - 1 && (
              <div style={{ borderBottom: '0.5px solid var(--border-subtle)', marginTop: '4rem' }} />
            )}
          </section>
        ))}

        {/* App CTA */}
        <div style={{
          background: 'var(--bg-card)', border: '0.5px solid var(--border)',
          borderRadius: '16px', padding: '2rem 2rem', textAlign: 'center', marginTop: '2rem',
        }}>
          <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '0.5rem' }}>
            Already coaching? Try Six43 free.
          </div>
          <p style={{ fontSize: '14px', color: s.muted, marginBottom: '1.25rem', lineHeight: 1.6 }}>
            Build fair lineups inning by inning, track pitch counts, and show up to every game organized — from your phone or laptop.
          </p>
          <Link href="/login" style={{
            display: 'inline-block', fontSize: '14px', fontWeight: 700,
            padding: '12px 28px', borderRadius: '8px',
            background: 'var(--accent)', color: 'var(--accent-text)', textDecoration: 'none',
          }}>
            Get started free →
          </Link>
        </div>

      </div>
    </main>
  )
}
