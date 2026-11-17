import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// next/font/google is compiled by Next's SWC plugin and isn't available
// under Vitest; the class names don't matter for these tests.
vi.mock('../../../styles/fonts', () => ({
  bitter: { variable: 'font-bitter' },
  inter: { variable: 'font-inter' },
}))

import { Homepage, HERO_COPY } from '../Homepage'
import { MARKETING_PHOTOS, PRICING, type MarketingPhoto } from '../content'

const root = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n')
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

// React escapes apostrophes, ampersands and quotes in HTML output.
const unescape = (s: string) => s.replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"')
const render = (loggedIn: boolean, draftLogos = true) =>
  unescape(renderToStaticMarkup(createElement(Homepage, { loggedIn, draftLogos })))
const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

const html = render(false)
const hero = html.slice(html.indexOf('<h1'), html.indexOf('id="highlights"'))
const cta = html.slice(html.indexOf('aria-labelledby="cta-title"'), html.indexOf('<footer'))

describe('pricing is unchanged from the previous homepage', () => {
  // Every pricing string as it appeared on the homepage before the redesign
  // (src/app/page.tsx at main@562d025). Changing pricing must change this list.
  const PREVIOUS_HOMEPAGE_PRICING = [
    'Pricing', 'Simple, honest pricing', 'Try it free. Beta testers get Pro free for life — limited spots.',
    'Beta · limited spots available',
    'Free', '$0', '10 games · no credit card required', 'Get started free',
    'All features included', 'Lineup builder & field view', 'Game Mode & scoreboard', 'Print & exchange cards', 'Playing time tracking',
    'Pro', 'BETA OFFER', '$1.49/mo', 'for beta testers · limited spots', 'Claim beta access',
    'Everything in Free', 'Unlimited games', 'Full season history', 'Priority support', 'Early access to new features',
  ]

  it('every pricing string is one the previous homepage showed', () => {
    const strings = [
      PRICING.eyebrow, PRICING.title, PRICING.intro, PRICING.pill,
      ...PRICING.plans.flatMap(p => [p.name, p.price, p.note, p.cta.label, ...(p.badge ? [p.badge] : []), ...(p.wasPrice ? [p.wasPrice] : []), ...p.features]),
    ]
    for (const s of strings) expect(PREVIOUS_HOMEPAGE_PRICING, s).toContain(s)
    for (const s of PREVIOUS_HOMEPAGE_PRICING) expect(text(html), s).toContain(s)
  })

  it('all plan buttons link to /login, as before', () => {
    for (const p of PRICING.plans) expect(p.cta.href).toBe('/login')
  })

  it('free-plan game count matches FREE_GAME_LIMIT in the app', () => {
    const limit = /FREE_GAME_LIMIT\s*=\s*(\d+)/.exec(read('src/app/games/new/page.tsx'))?.[1]
    expect(limit).toBeDefined()
    expect(PRICING.plans.find(p => p.id === 'free')!.note).toContain(`${limit} games`)
  })
})

describe('homepage content', () => {
  it('keeps the single H1 "Build the lineup. Run the game."', () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(html).toMatch(/<h1[^>]*>Build the lineup\.<br\/>/)
    expect(html).toContain('Run the game.')
  })

  it('uses the approved hero copy, word for word, with one primary CTA', () => {
    expect(`${HERO_COPY.lead} ${HERO_COPY.body}`).toBe(
      'Less time planning. More time coaching. Build better lineups, manage game day, and track playing time—all in one place.')
    expect(text(hero)).toContain(`${HERO_COPY.lead} ${HERO_COPY.body}`)
    expect(text(hero)).toContain('For youth baseball & softball coaches · Free to start · No credit card required')
    expect(hero.match(/Start building for free/g)).toHaveLength(1)
  })

  it('shows the tagline, the three highlights, pricing and the closing CTA', () => {
    expect(html).toContain('Built for Baseball.')
    for (const t of ['Build lineups', 'Manage game day', 'Track playing time']) expect(html).toContain(`>${t}</h3>`)
    expect(html.match(/<article/g)).toHaveLength(3 + 2) // 3 highlights + 2 pricing plans
    for (const id of ['main', 'highlights', 'pricing']) expect(html).toContain(`id="${id}"`)
    expect(cta).toContain('Ready to build your first lineup?')
    expect(html).toContain('youth baseball & softball coaches.') // footer
  })

  it('shows a phone-sized demo on phones and the lineup editor on larger screens', () => {
    expect(hero).toContain('Six43 lineup builder on a phone (product demo)')
    expect(hero).toContain('J. Martinez') // mobile demo uses the app's real name format
    expect(hero).toContain('vs Cardinals') // desktop lineup editor
    expect(hero).toContain('six43.com')   // browser frame
    expect(html).toContain('sample data') // playing-time demo is labeled
  })

  it('mobile demo uses the real lineup page position colors and column sizes', () => {
    const real = read('src/app/games/[id]/lineup/page.tsx')
    const demo = read('src/components/marketing/mockups/MobileLineupDemo.tsx')
    const block = (s: string) => s.slice(s.indexOf('const POSITION_COLORS'), s.indexOf('}\n', s.indexOf('Bench:')))
    const pairs = (s: string) => Array.from(block(s).matchAll(/^\s*'?(\w+)'?:\s*\{\s*bg:\s*'([^']+)',\s*color:\s*'([^']+)'/gm), m => `${m[1]}|${m[2]}|${m[3]}`)
    const realPairs = new Set(pairs(real))
    const demoPairs = pairs(demo)
    expect(demoPairs.length).toBeGreaterThanOrEqual(9)
    for (const p of demoPairs) expect(realPairs, p).toContain(p)
    for (const c of ['COL_NUM = 28', 'COL_NAME = 110', 'COL_INN = 42', 'COL_STATUS = 24']) {
      expect(real).toContain(c)
      expect(demo).toContain(c)
    }
  })

  it('has no testimonials, ratings, user counts or tryouts', () => {
    expect(html).not.toContain('<blockquote')
    expect(html).not.toMatch(/\b\d[\d,]*\+?\s+(coaches|teams|users)\b/i)
    expect(html).not.toMatch(/trusted by|loved by|rated|★/i)
    expect(html).not.toMatch(/tryout/i)
  })

  it('switches the nav CTA for signed-in coaches, as before', () => {
    expect(html).toContain('Get started free')
    expect(html).toContain('href="/login"')
    expect(html).not.toContain('Open app')
    const member = render(true)
    expect(member).toContain('href="/games"')
    expect(member).toContain('Open app →')
  })

  it('labels the logos "Draft logo" while the artwork is draft, and only then', () => {
    expect(html.match(/Draft logo/g)).toHaveLength(2) // nav + footer
    expect(html).toContain('data-artwork="draft"')
    expect(render(false, false)).not.toContain('Draft logo')
  })

  it('every link goes to an existing route, an in-page anchor or the support address', () => {
    const hrefs = [...new Set(Array.from((html + render(true)).matchAll(/href="([^"]+)"/g), m => m[1]))]
    expect(hrefs.length).toBeGreaterThan(5)
    for (const h of hrefs) {
      if (h.startsWith('#')) { expect(html, h).toContain(`id="${h.slice(1)}"`); continue }
      if (h.startsWith('mailto:')) { expect(h).toMatch(/^mailto:support@six43\.com\?subject=/); continue }
      const page = h === '/' ? 'src/app/page.tsx' : `src/app${h}/page.tsx`
      expect(existsSync(join(root, page)), h).toBe(true)
    }
    // Links the previous homepage had are all still here.
    for (const h of ['/login', '/privacy', '/help']) expect(hrefs).toContain(h)
    expect(hrefs).toContain('/games')
  })

  it('links to the three SEO landing pages (the previous homepage linked to none)', () => {
    for (const h of ['/youth-baseball-lineup-app', '/travel-baseball-lineup-manager', '/softball-lineup-manager']) {
      expect(html).toContain(`href="${h}"`)
    }
  })
})

describe('homepage photography', () => {
  const photos = Object.values(MARKETING_PHOTOS) as MarketingPhoto[]

  /** Width/height from a baseline or progressive JPEG's SOF marker. */
  function jpegInfo(file: string) {
    const b = readFileSync(file)
    expect(b[0] === 0xff && b[1] === 0xd8, `${file} is a JPEG`).toBe(true)
    let i = 2, exif = false
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue }
      const m = b[i + 1], len = b.readUInt16BE(i + 2)
      if (m === 0xe1 && b.toString('latin1', i + 4, i + 8) === 'Exif') exif = true
      if (m >= 0xc0 && m <= 0xc3) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7), exif, bytes: b.length }
      i += 2 + len
    }
    throw new Error(`no SOF in ${file}`)
  }

  it('uses the approved photos: Chris Bair (hero) and Salvador Rios (closing CTA)', () => {
    expect(MARKETING_PHOTOS.heroField).toMatchObject({
      src: '/marketing/hero-field-dusk-wide.jpg',
      srcMobile: '/marketing/hero-field-dusk-portrait.jpg',
      focus: 'center 30%',
      focusMobile: 'center 20%',
      overlay: 'brand',
      overlayOpacity: [0.36, 0.58, 0.82],
    })
    expect(MARKETING_PHOTOS.heroField.credit.sourceUrl).toBe('https://unsplash.com/photos/baseball-field-with-stadium-lights-under-a-cloudy-evening-sky-hV1FxJzB8QY')
    expect(MARKETING_PHOTOS.closingCta).toMatchObject({
      src: '/marketing/cta-base-golden-hour-wide.jpg',
      srcMobile: '/marketing/cta-base-golden-hour-portrait.jpg',
      focus: 'center 30%',
      focusMobile: 'center 50%',
      overlay: 'text',
    })
    expect(MARKETING_PHOTOS.closingCta.credit.sourceUrl).toBe('https://unsplash.com/photos/a-baseball-field-with-a-base-in-the-dirt-kJce0SXcrw0')
  })

  it('every photo has a complete credit record under the Unsplash License', () => {
    for (const p of photos) {
      const c = p.credit
      for (const k of ['photographer', 'photographerUrl', 'sourceUrl', 'license', 'licenseUrl', 'retrieved', 'original'] as const) expect(c[k], `${p.id} ${k}`).toBeTruthy()
      expect(c.license).toBe('Unsplash License')
      expect(c.licenseUrl).toBe('https://unsplash.com/license')
      expect(c.sourceUrl).toMatch(/^https:\/\/unsplash\.com\/photos\/[a-z0-9-]+-[A-Za-z0-9_-]{11}$/)
      expect(c.photographerUrl).toMatch(/^https:\/\/unsplash\.com\/@[A-Za-z0-9_]+$/)
      expect(c.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('web masters are web-sized, metadata-free JPEGs; public/marketing holds only these four files', () => {
    const referenced = photos.flatMap(p => [p.src, p.srcMobile!])
    for (const f of referenced) {
      const info = jpegInfo(join(root, 'public', f))
      expect(info.exif, `${f} has no EXIF`).toBe(false)
      expect(info.width, f).toBeGreaterThanOrEqual(1200)
      expect(info.width, f).toBeLessThanOrEqual(2400)
      expect(info.bytes, f).toBeLessThan(700 * 1024)
      if (f.includes('-wide')) expect(info.width, f).toBeGreaterThan(info.height)
      if (f.includes('-portrait')) expect(info.height, f).toBeGreaterThan(info.width)
    }
    const onDisk = readdirSync(join(root, 'public', 'marketing'), { withFileTypes: true })
    expect(onDisk.every(d => d.isFile())).toBe(true) // no candidate folders
    expect(onDisk.map(d => `/marketing/${d.name}`).sort()).toEqual([...referenced].sort())
  })

  it('hero: art-directed photo under the tuned forest overlay, beneath the demo', () => {
    expect(hero).toContain('data-photo-slot="hero-field"')
    expect(hero).toMatch(/<picture><source media="\(min-width: 640px\)" srcSet="[^"]*hero-field-dusk-wide\.jpg/)
    expect(hero).toMatch(/<img[^>]*alt=""[^>]*src="[^"]*hero-field-dusk-portrait\.jpg/)
    expect(hero).toContain('style="--overlay-a:0.36;--overlay-b:0.58;--overlay-c:0.82"')
    expect(hero.indexOf('<picture>')).toBeLessThan(hero.indexOf('data-overlay="forest"'))
    expect(hero.indexOf('data-overlay="forest"')).toBeLessThan(hero.indexOf('Six43 lineup builder on a phone'))
  })

  it('closing CTA: art-directed photo under the stronger text overlay', () => {
    expect(cta).toContain('data-overlay-strength="text"')
    expect(cta).not.toContain('--overlay-a')
    expect(cta).toMatch(/<picture><source media="\(min-width: 640px\)" srcSet="[^"]*cta-base-golden-hour-wide\.jpg/)
    expect(cta).toMatch(/<img[^>]*alt=""[^>]*src="[^"]*cta-base-golden-hour-portrait\.jpg/)
    expect(cta.indexOf('<picture>')).toBeLessThan(cta.indexOf('data-overlay="forest"'))
  })

  it('photos are decorative and only the hero photo loads with priority', () => {
    expect(html.match(/data-photo-slot="[^"]+" aria-hidden="true"/g)).toHaveLength(2)
    expect(hero).toMatch(/fetchPriority="high"/)
    expect(cta).not.toMatch(/fetchPriority="high"/)
    expect(cta).toMatch(/loading="lazy"/)
  })

  it('the default forest overlay is unchanged', () => {
    const css = read('src/components/marketing/marketing.module.css')
    expect(css).toContain('rgba(11, 61, 46, var(--overlay-a, 0.52)) 0%, rgba(11, 61, 46, var(--overlay-b, 0.72)) 55%, rgba(8, 44, 33, var(--overlay-c, 0.88)) 100%')
  })
})

describe('served at / without changing SEO, auth or the app layout', () => {
  const page = read('src/app/page.tsx')

  it('the route renders the homepage with the signed-in state and artwork status', () => {
    expect(page).toContain("import { createServerClient } from '../lib/supabase-server'")
    expect(page).toContain('await supabase.auth.getUser()')
    expect(page).toContain("<Homepage loggedIn={!!user} draftLogos={ARTWORK_STATUS === 'draft'} />")
  })

  it('page metadata still comes from the root layout', () => {
    expect(page).not.toMatch(/export (const|async function|function) (metadata|generateMetadata|viewport|revalidate|dynamic)\b/)
  })

  it('layout (metadata, canonical, Open Graph, structured data), sitemap, robots and middleware are byte-identical to main', () => {
    // SHA-256 (LF line endings) as of main@562d025.
    const BASELINE: Record<string, string> = {
      'src/app/layout.tsx': '5f53fb72f51be3a28daf92ae9efce3724b7f2f371b0de496c217c2b8d658d548',
      'src/app/sitemap.ts': '3e7e282dd9ae3e3405b980c01cc3a9e6e897dbc489f1eea63a2e7b8bf3e047b5',
      'public/robots.txt': '8516ecf5a9f05f2fec9c2746b21e061ef28d70923df9b048f7e936e27635fe74',
      'src/middleware.ts': '0c4a0fda5bcdbb6cbb22ba499cdbd4f5384290c2ff95ab0576e54d70d446691e',
    }
    for (const [f, hash] of Object.entries(BASELINE)) expect(sha256(read(f)), f).toBe(hash)
  })

  it('the desktop sidebar offset is removed only on the homepage, via homepage-scoped styles', () => {
    const css = read('src/components/marketing/marketing.module.css')
    expect(css).toMatch(/:global\(\.app-content\):has\(\.shell\) \{ margin-left: 0; \}/)
    expect(css).toMatch(/\.shell \.main \{ max-width: none !important; padding-bottom: 0 !important; \}/)
    // The authenticated app's layout rules are untouched (globals.css hash: brand.test.ts).
    expect(read('src/app/globals.css')).toContain('.app-content {\n    margin-left: 220px;\n  }')
  })

  it('the homepage prototypes and photo comparison are not part of the release', () => {
    expect(readdirSync(join(root, 'src/app/dev'))).toEqual(['brand'])
    for (const f of ['HomepageView.tsx', 'HomepageViewV2.tsx', 'HomepageViewV3.tsx', 'PhotoPlaceholder.tsx']) {
      expect(existsSync(join(root, 'src/components/marketing', f)), f).toBe(false)
    }
    expect(existsSync(join(root, 'public/marketing/candidates'))).toBe(false)
  })
})
