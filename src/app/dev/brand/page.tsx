// Brand review page: DEVELOPMENT ONLY.
//
// Renders a 404 in every non-development build (production and Vercel
// Preview both build with NODE_ENV=production), including direct URL access.
// It is not linked from anywhere and is not in the sitemap.

import type { Metadata } from 'next'
import type { CSSProperties, ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { bitter, inter } from '../../../styles/fonts'
import { BRAND_COLORS, BRAND_TAGLINE, contrastRatio } from '../../../styles/brand'
import { Wordmark, DiamondBadge, Tagline, ARTWORK_STATUS } from '../../../components/brand'

export const metadata: Metadata = {
  title: 'Brand review (dev only)',
  robots: { index: false, follow: false },
}

// Existing app colors, shown for comparison only (copied from globals.css).
const STATUS_BAD_LIGHT = '#B23B3B'
const STATUS_BAD_DARK = '#E05252'
const STATUS_GOOD_LIGHT = '#3F8A52'
const STATUS_GOOD_DARK = '#6DB875'

const { forest, cream, clay, charcoal } = BRAND_COLORS
const WHITE = '#FFFFFF'

// The standalone SVG files in public/brand (generated from the components;
// see src/components/brand/__tests__/logo.test.ts).
const LOGO_FILES: Array<{ file: string; label: string; bg: string; w: number; h: number }> = [
  { file: 'six43-wordmark.svg', label: 'Wordmark · on light', bg: cream, w: 360, h: 126 },
  { file: 'six43-wordmark-on-dark.svg', label: 'Wordmark · on dark', bg: forest, w: 360, h: 126 },
  { file: 'six43-wordmark-compact.svg', label: 'Wordmark, compact (no underline) · on light', bg: WHITE, w: 360, h: 96 },
  { file: 'six43-wordmark-compact-on-dark.svg', label: 'Wordmark, compact · on dark', bg: charcoal, w: 360, h: 96 },
  { file: 'six43-badge.svg', label: '643 badge · primary', bg: cream, w: 180, h: 180 },
  { file: 'six43-badge-reverse.svg', label: '643 badge · reverse (dark variation)', bg: cream, w: 180, h: 180 },
  { file: 'six43-badge-mono.svg', label: '643 badge · one color', bg: WHITE, w: 180, h: 180 },
  { file: 'six43-badge-small.svg', label: 'Small-size badge · primary (shown enlarged)', bg: cream, w: 180, h: 180 },
  { file: 'six43-badge-small-reverse.svg', label: 'Small-size badge · reverse (shown enlarged)', bg: cream, w: 180, h: 180 },
]

// Hides the app chrome (sidebar / header / bottom nav) while this page is
// mounted. Scoped to this dev-only page; no shared CSS changes.
const HIDE_CHROME = `
  .sidebar, .app-header, .bottom-nav { display: none !important; }
  .app-content { margin-left: 0 !important; }
  .app-content main.brand-review-page { max-width: none !important; }
  body { background: #FAFAF7 !important; }
  /* app install prompt (root layout) */
  div[style*="translateX(-50%)"][style*="bottom: 72px"], div[style*="translateX(-50%)"][style*="bottom:72px"] { display: none !important; }
`

const page: CSSProperties = {
  minHeight: '100vh',
  background: '#FAFAF7',
  color: charcoal,
  fontFamily: 'var(--font-ui)',
  padding: '24px 16px 80px',
}
const wrap: CSSProperties = { maxWidth: 1040, margin: '0 auto' }
const h2: CSSProperties = {
  fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 800,
  fontSize: 26, margin: '48px 0 6px', color: forest,
}
const note: CSSProperties = { fontSize: 14, lineHeight: 1.55, color: '#555', margin: '0 0 16px', maxWidth: 720 }
const grid = (min: number): CSSProperties => ({
  display: 'grid', gap: 12, gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`,
})
const label: CSSProperties = { fontSize: 12, color: '#666', marginTop: 8 }

function Section({ title, children, intro }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 style={h2}>{title}</h2>
      {intro && <p style={note}>{intro}</p>}
      {children}
    </section>
  )
}

function Tile({ bg, children, caption, border }: { bg: string; children: ReactNode; caption: ReactNode; border?: boolean }) {
  return (
    <figure style={{ margin: 0 }}>
      <div style={{
        background: bg, borderRadius: 10, minHeight: 140, padding: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, flexWrap: 'wrap',
        border: border || bg === WHITE ? '1px solid #ddd' : 'none',
      }}>
        {children}
      </div>
      <figcaption style={label}>{caption}</figcaption>
    </figure>
  )
}

function ratioVerdict(r: number) {
  if (r >= 7) return 'AAA'
  if (r >= 4.5) return 'AA'
  if (r >= 3) return 'AA large text only'
  return 'Fails: decorative only'
}

const PAIRS: Array<[string, string, string, string]> = [
  ['Cream on Forest', cream, forest, 'Primary dark surface'],
  ['Forest on Cream', forest, cream, 'Primary light surface'],
  ['Charcoal on Cream', charcoal, cream, 'Body text on cream'],
  ['Cream on Charcoal', cream, charcoal, 'Dark neutral surface'],
  ['Clay on Cream', clay, cream, 'Underline / accents on light'],
  ['White on Clay', WHITE, clay, 'Clay button text'],
  ['Clay on Forest', clay, forest, 'Underline / seams on dark'],
  ['Clay on Charcoal', clay, charcoal, 'Underline on charcoal'],
]

export default function BrandReviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound()

  const fontVars = `${bitter.variable} ${inter.variable} brand-fonts`
  const approved = ARTWORK_STATUS === 'final'

  return (
    <main className={`${fontVars} brand-review-page`} style={page} data-artwork={ARTWORK_STATUS}>
      <style dangerouslySetInnerHTML={{ __html: HIDE_CHROME }} />
      <div style={wrap}>

        <div role="note" style={{
          background: approved ? '#E6F2EA' : '#FFF4D6', border: `1px solid ${approved ? '#8CC29C' : '#E8C770'}`,
          borderRadius: 10, padding: '14px 16px', fontSize: 14, lineHeight: 1.5,
        }}>
          {approved ? (
            <><strong>Logo artwork approved.</strong> The wordmark and 643 badge below are the final outlined vector artwork.</>
          ) : (
            <>
              <strong>Outlined SVG artwork, awaiting visual approval.</strong>{' '}
              The wordmark and 643 badge are now vector paths converted from the approved working designs
              (no live text, no font needed). They stay labeled “Draft logo” on the homepage until approved.
            </>
          )}{' '}
          This page exists only in local development and returns 404 in production.
        </div>

        <header style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginTop: 28 }}>
          <Wordmark height={64} />
          <DiamondBadge size={72} />
          <Tagline style={{ fontSize: 22, color: forest }} />
        </header>

        <Section
          title="Logo files"
          intro={<>The standalone SVG files in <code>public/brand/</code>, generated from the same artwork as the components (a unit test keeps them identical). Click a file to open it on its own.</>}
        >
          <div style={grid(300)}>
            {LOGO_FILES.map(f => (
              <Tile key={f.file} bg={f.bg} caption={<><a href={`/brand/${f.file}`}>{f.file}</a> · {f.label}</>}>
                {/* eslint-disable-next-line @next/next/no-img-element -- show the actual file, unoptimized */}
                <img src={`/brand/${f.file}`} width={f.w} height={f.h} alt={f.label} />
              </Tile>
            ))}
          </div>
        </Section>

        <Section
          title="Sizes in use"
          intro="As the homepage uses them: nav (badge 36 + compact wordmark 30), hero kicker (badge 44), closing call to action (badge 64), footer (wordmark 44 on forest)."
        >
          <div style={grid(300)}>
            <Tile bg={cream} caption="Nav · badge 36 (small-size version) + compact wordmark 30">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                <DiamondBadge size={36} title="" />
                <Wordmark variant="compact" height={30} title="" />
              </span>
            </Tile>
            <Tile bg={cream} caption="Hero kicker · badge 44 (small-size version)">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
                <DiamondBadge size={44} title="" />
                <Tagline as="span" style={{ fontSize: 15, color: clay }} />
              </span>
            </Tile>
            <Tile bg={forest} caption="Closing call to action · badge 64 (full detail)">
              <DiamondBadge size={64} title="" />
            </Tile>
            <Tile bg={forest} caption="Footer · wordmark 44 on forest">
              <Wordmark tone="onDark" height={44} />
            </Tile>
          </div>
        </Section>

        <Section
          title="Small-size badge"
          intro="Below 48px the badge drops the thin inner keyline and uses slightly heavier seams with four short stitches per arc, so it stays legible. Outline, numerals, colors and accents are unchanged. From 48px up it uses the full badge."
        >
          <div style={grid(300)}>
            <Tile bg={cream} caption="Small-size version · 24 / 32 / 36 / 44">
              {[24, 32, 36, 44].map(s => <DiamondBadge key={s} size={s} />)}
            </Tile>
            <Tile bg={cream} caption="Full detail at the same sizes, for comparison">
              {[24, 32, 36, 44].map(s => <DiamondBadge key={s} size={s} detail="full" />)}
            </Tile>
            <Tile bg={forest} caption="Small-size version on forest · 24 / 36 / 44">
              {[24, 36, 44].map(s => <DiamondBadge key={s} size={s} />)}
            </Tile>
            <Tile bg={charcoal} caption="Small-size reverse on charcoal · 24 / 36 / 44">
              {[24, 36, 44].map(s => <DiamondBadge key={s} size={s} variant="reverse" />)}
            </Tile>
            <Tile bg={WHITE} caption="Full detail · 48 / 64 / 128">
              {[48, 64, 128].map(s => <DiamondBadge key={s} size={s} />)}
            </Tile>
          </div>
        </Section>

        <Section title="Wordmark" intro="Variants: full (with clay underline) and compact. Tone sets the letter color for light or dark backgrounds. Clay on forest or charcoal is low contrast, so the underline reads as decoration only on dark backgrounds.">
          <div style={grid(300)}>
            <Tile bg={cream} caption="full · onLight · on Cream"><Wordmark height={64} /></Tile>
            <Tile bg={WHITE} caption="full · onLight · on White"><Wordmark height={64} /></Tile>
            <Tile bg={forest} caption="full · onDark · on Forest"><Wordmark height={64} tone="onDark" /></Tile>
            <Tile bg={charcoal} caption="full · onDark · on Charcoal"><Wordmark height={64} tone="onDark" /></Tile>
            <Tile bg={cream} caption="compact · onLight · sizes 24 / 32 / 48">
              <Wordmark variant="compact" height={24} />
              <Wordmark variant="compact" height={32} />
              <Wordmark variant="compact" height={48} />
            </Tile>
          </div>
        </Section>

        <Section title="643 diamond badge" intro="Primary: cream interior, forest outline and numerals, two symmetrical curved clay stitching arcs and a short clay accent either side of 643. The bottom arc is the top arc mirrored, so symmetry is exact. Reverse (dark variation): forest-filled with cream numerals.">
          <div style={grid(300)}>
            <Tile bg={cream} caption="primary · on Cream · 64 / 96 / 128">
              <DiamondBadge size={64} />
              <DiamondBadge size={96} />
              <DiamondBadge size={128} />
            </Tile>
            <Tile bg={forest} caption="primary · on Forest">
              <DiamondBadge size={96} />
            </Tile>
            <Tile bg={cream} caption="reverse · cream stitching / clay stitching">
              <DiamondBadge size={96} variant="reverse" />
              <DiamondBadge size={96} variant="reverse" reverseSeamColor="clay" />
            </Tile>
            <Tile bg={charcoal} caption="primary and reverse · on Charcoal">
              <DiamondBadge size={96} />
              <DiamondBadge size={96} variant="reverse" />
            </Tile>
            <Tile bg={WHITE} caption="mono · currentColor (print / single-color)">
              <span style={{ color: charcoal }}><DiamondBadge size={96} variant="mono" /></span>
              <span style={{ color: forest }}><DiamondBadge size={96} variant="mono" /></span>
            </Tile>
          </div>
        </Section>

        <Section title="Lockups">
          <div style={grid(420)}>
            <Tile bg={forest} caption="Badge + wordmark + tagline on Forest">
              <DiamondBadge size={72} />
              <div>
                <Wordmark height={52} tone="onDark" />
                <Tagline style={{ color: cream, fontSize: 16, marginTop: 4, textAlign: 'center' }} />
              </div>
            </Tile>
            <Tile bg={cream} caption="Badge + wordmark + tagline on Cream">
              <DiamondBadge size={72} />
              <div>
                <Wordmark height={52} />
                <Tagline style={{ color: charcoal, fontSize: 16, marginTop: 4, textAlign: 'center' }} />
              </div>
            </Tile>
          </div>
        </Section>

        <Section title="Colors" intro="Approved palette. Values come from src/styles/brand.ts and the matching CSS variables in src/styles/brand.css.">
          <div style={grid(220)}>
            {(Object.keys(BRAND_COLORS) as Array<keyof typeof BRAND_COLORS>).map(name => (
              <figure key={name} style={{ margin: 0 }}>
                <div style={{
                  background: `var(--brand-${name})`, height: 96, borderRadius: 10,
                  border: name === 'cream' ? '1px solid #ddd' : 'none',
                }} />
                <figcaption style={{ ...label, fontSize: 13, color: charcoal }}>
                  <strong style={{ textTransform: 'capitalize' }}>{name}</strong> · {BRAND_COLORS[name]}
                  <br /><code style={{ fontSize: 12, color: '#666' }}>var(--brand-{name})</code>
                </figcaption>
              </figure>
            ))}
          </div>
        </Section>

        <Section title="Contrast" intro="WCAG 2.x contrast ratios. AA needs 4.5:1 for normal text and 3:1 for large text and UI shapes.">
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 14, minWidth: 560, fontFeatureSettings: '"tnum"' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
                  <th style={{ padding: '8px 12px 8px 0' }}>Sample</th>
                  <th style={{ padding: '8px 12px' }}>Pair</th>
                  <th style={{ padding: '8px 12px' }}>Ratio</th>
                  <th style={{ padding: '8px 12px' }}>Result</th>
                  <th style={{ padding: '8px 12px' }}>Use</th>
                </tr>
              </thead>
              <tbody>
                {PAIRS.map(([name, fg, bg, use]) => {
                  const r = contrastRatio(fg, bg)
                  return (
                    <tr key={name} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '8px 12px 8px 0' }}>
                        <span style={{ background: bg, color: fg, padding: '4px 10px', borderRadius: 6, fontWeight: 700 }}>Aa 643</span>
                      </td>
                      <td style={{ padding: '8px 12px' }}>{name}</td>
                      <td style={{ padding: '8px 12px' }}>{r.toFixed(2)}:1</td>
                      <td style={{ padding: '8px 12px' }}>{ratioVerdict(r)}</td>
                      <td style={{ padding: '8px 12px', color: '#666' }}>{use}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          title="Clay red vs. the app's status colors"
          intro="Clay red is almost identical to the light theme's error color, and forest sits near the success color. This informs where clay may appear in the app later. Nothing here changes existing app colors."
        >
          <div style={grid(150)}>
            {[
              ['Brand clay', clay],
              ['status-bad (light)', STATUS_BAD_LIGHT],
              ['status-bad (dark)', STATUS_BAD_DARK],
              ['Brand forest', forest],
              ['status-good (light)', STATUS_GOOD_LIGHT],
              ['status-good (dark)', STATUS_GOOD_DARK],
            ].map(([n, hex]) => (
              <figure key={n} style={{ margin: 0 }}>
                <div style={{ background: hex, height: 64, borderRadius: 8 }} />
                <figcaption style={label}>{n} · {hex}</figcaption>
              </figure>
            ))}
          </div>
        </Section>

        <Section title="Typography" intro="Both families are SIL Open Font License (free for commercial use and self-hosting), loaded through next/font and served from our own domain.">
          <div style={grid(300)}>
            <div style={{ background: cream, borderRadius: 10, padding: 20 }}>
              <div style={{ ...label, marginTop: 0 }}>Display: Bitter</div>
              <div style={{ fontFamily: 'var(--font-brand-display)', fontStyle: 'italic', fontWeight: 800, fontSize: 40, lineHeight: 1.05, color: forest, marginTop: 8 }}>
                Build the lineup.<br />Run the game.
              </div>
              <div style={{ fontFamily: 'var(--font-brand-display)', fontWeight: 400, fontSize: 17, lineHeight: 1.5, marginTop: 12 }}>
                Regular 400: fair playing time for every kid, every inning.
              </div>
              <div style={{ fontFamily: 'var(--font-brand-display)', fontStyle: 'italic', fontWeight: 700, fontSize: 17, marginTop: 4, color: clay }}>
                {BRAND_TAGLINE}
              </div>
            </div>
            <div style={{ background: WHITE, border: '1px solid #ddd', borderRadius: 10, padding: 20 }}>
              <div style={{ ...label, marginTop: 0 }}>Application UI: Inter, tabular figures</div>
              <div style={{ fontFamily: 'var(--font-brand-ui)', fontWeight: 700, fontSize: 18, marginTop: 8 }}>Playing time · Spring 2027</div>
              <table style={{ fontFamily: 'var(--font-brand-ui)', fontFeatureSettings: '"tnum"', fontSize: 14, marginTop: 10, borderCollapse: 'collapse', width: '100%' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#666', fontSize: 12 }}>
                    <th style={{ padding: '4px 0' }}>Player</th><th>Inn</th><th>Bench</th><th>Pitches</th>
                  </tr>
                </thead>
                <tbody>
                  {[['Jake M.', 18, '11%', 61], ['Connor B.', 21, '0%', 0], ['Josh M.', 14, '22%', 108]].map(r => (
                    <tr key={r[0] as string} style={{ borderTop: '1px solid #eee' }}>
                      <td style={{ padding: '6px 0' }}>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Section>

        <Section title="Approval checklist">
          <ul style={{ fontSize: 14, lineHeight: 1.8, paddingLeft: 20, margin: 0 }}>
            <li>Wordmark letterforms, lean, spacing and underline match the approved working design.</li>
            <li>Badge: cream interior, green numerals, curved red stitching, red accents either side of 643.</li>
            <li>Reverse (dark) badge reads well on cream and charcoal.</li>
            <li>Small-size badge is recognizable at 24–44px (nav and hero kicker).</li>
            <li>On approval: set ARTWORK_STATUS to &apos;final&apos; (removes the “Draft logo” labels).</li>
          </ul>
        </Section>
      </div>
    </main>
  )
}
