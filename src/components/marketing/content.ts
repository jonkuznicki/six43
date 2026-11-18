// Homepage content as data.
//
// PRICING strings are copied exactly from the previous homepage, and the
// free-plan game count must match FREE_GAME_LIMIT in src/app/games/new/page.tsx.
// Unit tests check both, so pricing cannot drift without a test change.
//
// No testimonials or social-proof claims live here: only add a quote when
// it's from a real, verified coach who has given written permission.

export const SIGNUP_HREF = '/login'
export const LOGIN_HREF = '/login'
export const APP_HREF = '/games'

export type Plan = {
  id: 'free' | 'pro'
  name: string
  badge?: string
  wasPrice?: string
  price: string
  note: string
  features: string[]
  cta: { label: string; href: string }
  highlighted: boolean
}

export const PRICING = {
  eyebrow: 'Pricing',
  title: 'Simple, honest pricing',
  intro: 'Try it free. Beta testers get Pro free for life — limited spots.',
  pill: 'Beta · limited spots available',
  plans: [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      note: '10 games · no credit card required',
      features: ['All features included', 'Lineup builder & field view', 'Game Mode & scoreboard', 'Print & exchange cards', 'Playing time tracking'],
      cta: { label: 'Get started free', href: SIGNUP_HREF },
      highlighted: false,
    },
    {
      id: 'pro',
      name: 'Pro',
      badge: 'BETA OFFER',
      wasPrice: '$1.49/mo',
      price: 'Free',
      note: 'for beta testers · limited spots',
      features: ['Everything in Free', 'Unlimited games', 'Full season history', 'Priority support', 'Early access to new features'],
      cta: { label: 'Claim beta access', href: SIGNUP_HREF },
      highlighted: true,
    },
  ] as Plan[],
}

export const SEO_LINKS = [
  { href: '/youth-baseball-lineup-app',      label: 'Youth baseball lineup app' },
  { href: '/travel-baseball-lineup-manager', label: 'Travel baseball lineup manager' },
  { href: '/softball-lineup-manager',        label: 'Softball lineup manager' },
]

export const SUPPORT_EMAIL = 'support@six43.com'

// ── Marketing photography ─────────────────────────────────────────────────────
//
// To replace a photo:
//   1. Check the license on the photo's own page (Pexels License / Unsplash
//      License, not Unsplash+) and that it meets the content rules below.
//   2. Put web masters in public/marketing/: about 2000–2400px wide (portrait
//      crops ~1200px), sRGB, metadata stripped. next/image serves resized WebP.
//   3. Set `src`/`srcMobile`, the crop (`focus` for tablet/desktop,
//      `focusMobile` for phones, CSS object-position) and the `credit` record.
//      Neither license requires on-page attribution; the record here is our
//      proof of source and license (originals are archived outside the repo).
// Content rules: no identifiable children, no readable jersey names, team
// logos or advertising, correct field markings, no AI-generated imagery.
// Neither Pexels nor Unsplash provides model or property releases.

export type PhotoCredit = {
  photographer: string
  photographerUrl: string
  /** Exact page the photo was taken from. */
  sourceUrl: string
  license: 'Pexels License' | 'Unsplash License'
  licenseUrl: string
  /** Date the license was checked and the original downloaded (YYYY-MM-DD). */
  retrieved: string
  /** Original file as downloaded, and the web versions made from it. */
  original: string
}

export type MarketingPhoto = {
  id: string
  /** Public path of the licensed image (tablet/desktop crop). */
  src: string
  /** Optional separate crop for phones (below 640px), e.g. a portrait version. */
  srcMobile?: string
  /** CSS object-position on tablet/desktop, e.g. 'center 65%'. */
  focus?: string
  /** CSS object-position on phones (below 640px). Falls back to `focus`. */
  focusMobile?: string
  /** Forest overlay strength: 'brand' (behind a product demo) or 'text' (behind copy; stronger). */
  overlay?: 'brand' | 'text'
  /**
   * Optional per-photo tuning of the 'brand' overlay: forest-green opacity at
   * the start, middle and end of its diagonal gradient. Default 0.52 / 0.72 / 0.88.
   */
  overlayOpacity?: readonly [number, number, number]
  /** What the photo shows (for the record; the photo itself is decorative). */
  description: string
  credit: PhotoCredit
}

export const MARKETING_PHOTOS = {
  heroField: {
    id: 'hero-field',
    // Landscape crop for tablet/desktop; portrait crop keeps the lit field lights above the phone demo.
    src: '/marketing/hero-field-dusk-wide.jpg',
    srcMobile: '/marketing/hero-field-dusk-portrait.jpg',
    focus: 'center 30%',
    focusMobile: 'center 20%',
    overlay: 'brand',
    overlayOpacity: [0.36, 0.58, 0.82],
    description: 'Community ballfield at dusk with the field lights on, dugouts and fence under a heavy evening sky. No identifiable people, logos or advertising.',
    credit: {
      photographer: 'Chris Bair',
      photographerUrl: 'https://unsplash.com/@chrisbair',
      sourceUrl: 'https://unsplash.com/photos/baseball-field-with-stadium-lights-under-a-cloudy-evening-sky-hV1FxJzB8QY',
      license: 'Unsplash License',
      licenseUrl: 'https://unsplash.com/license',
      retrieved: '2026-11-13',
      original: 'photo-1780161485626-c5b96bbd4840, 4000×6000 JPEG (published May 30, 2026); web versions: wide crop 2400×1600, portrait crop 1200×1500',
    },
  },
  closingCta: {
    id: 'closing-cta',
    // Landscape crop (fence to base) for tablet/desktop; full portrait frame for phones.
    src: '/marketing/cta-base-golden-hour-wide.jpg',
    srcMobile: '/marketing/cta-base-golden-hour-portrait.jpg',
    focus: 'center 30%',
    focusMobile: 'center 50%',
    overlay: 'text',
    description: 'A dusty base in the infield dirt in low evening sun, with the backstop fence behind. No people.',
    credit: {
      photographer: 'Salvador Rios',
      photographerUrl: 'https://unsplash.com/@salvadorr',
      sourceUrl: 'https://unsplash.com/photos/a-baseball-field-with-a-base-in-the-dirt-kJce0SXcrw0',
      license: 'Unsplash License',
      licenseUrl: 'https://unsplash.com/license',
      retrieved: '2026-11-13',
      original: 'photo-1722927120264-e06b2bcdea0d, 2849×3903 JPEG (Aug 7, 2024, Sony ILCE-7M4); web versions: wide crop 2400×1371, portrait 1200×1644',
    },
  },
} satisfies Record<string, MarketingPhoto>
