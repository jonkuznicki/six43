import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// next/font/google is compiled by Next's SWC plugin and isn't available
// under Vitest; the class names don't matter here.
vi.mock('../../../styles/fonts', () => ({
  bitter: { variable: 'font-bitter' },
  inter: { variable: 'font-inter' },
}))

import { BRAND_COLORS } from '../../../styles/brand'
import { Wordmark, DiamondBadge, Tagline, ARTWORK_STATUS } from '..'
import { BADGE_NUMERALS, UNDERLINE_PATH, WORDMARK_LETTERS } from '../artwork'
import {
  ACCENTS, BOTTOM_STITCHES, DETAIL, SIMPLE_BELOW, SIMPLE_BOTTOM_STITCHES, SIMPLE_TOP_STITCHES, TOP_STITCHES, accents,
} from '../DiamondBadge'

const root = join(__dirname, '..', '..', '..', '..')
const render = (C: ComponentType<any>, props: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(C, props))
const numbers = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
function bbox(d: string) {
  const n = numbers(d)
  const xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

describe('logo artwork', () => {
  it('is outlined vector paths: no live text and no font dependency', () => {
    const all = [
      render(Wordmark), render(Wordmark, { variant: 'compact', tone: 'onDark' }),
      render(DiamondBadge), render(DiamondBadge, { size: 32 }), render(DiamondBadge, { variant: 'reverse' }), render(DiamondBadge, { variant: 'mono' }),
    ]
    for (const html of all) {
      expect(html).not.toMatch(/<text|<tspan|font-family|fontFamily|var\(--font/)
      expect(html).toMatch(/<path d="M/)
    }
    // Path data is plain absolute commands only, rounded to 0.01 units.
    for (const d of [WORDMARK_LETTERS, BADGE_NUMERALS]) {
      expect(d).toMatch(/^M[\d. MLQCZ-]+Z$/)
      expect(d).not.toMatch(/\d\.\d{3}/)
      expect(d.length).toBeLessThan(3000)
    }
  })

  it('wordmark letters sit inside the viewBox, above the underline baseline', () => {
    const b = bbox(WORDMARK_LETTERS)
    expect(b.minX).toBeGreaterThan(0)
    expect(b.maxX).toBeLessThan(240)
    expect(b.minY).toBeGreaterThan(0)
    expect(b.maxY).toBeLessThan(64) // fits the compact viewBox too
    expect(bbox(UNDERLINE_PATH).maxY).toBeLessThan(84)
  })

  it('badge numerals sit inside the inner diamond, centered on x = 60', () => {
    const b = bbox(BADGE_NUMERALS)
    // Inner keyline diamond: |x - 60| + |y - 60| <= 46 at every corner of the box.
    for (const [x, y] of [[b.minX, b.minY], [b.maxX, b.minY], [b.minX, b.maxY], [b.maxX, b.maxY]]) {
      expect(Math.abs(x - 60) + Math.abs(y - 60)).toBeLessThanOrEqual(46)
    }
    expect((b.minX + b.maxX) / 2).toBeCloseTo(60, 0)
  })

  it('records the outlined artwork as visually approved (final)', () => {
    expect(ARTWORK_STATUS).toBe('final')
    for (const html of [render(Wordmark), render(DiamondBadge)]) expect(html).toContain('data-artwork="final"')
  })
})

describe('Wordmark', () => {
  it('renders accessible artwork with a clay underline only in the full variant', () => {
    const full = render(Wordmark, { tone: 'onDark' })
    expect(full).toContain('role="img"')
    expect(full).toContain('aria-label="Six43"')
    expect(full).toContain(`<path d="${WORDMARK_LETTERS}" fill="${BRAND_COLORS.cream}"`)
    expect(full).toContain(`<path d="${UNDERLINE_PATH}" fill="${BRAND_COLORS.clay}"`)
    expect(render(Wordmark)).toContain(`fill="${BRAND_COLORS.forest}"`)
    const compact = render(Wordmark, { variant: 'compact' })
    expect(compact).toContain('viewBox="0 0 240 64"')
    expect(compact).not.toContain(BRAND_COLORS.clay)
    const decorative = render(Wordmark, { title: '' })
    expect(decorative).toContain('aria-hidden="true"')
    expect(decorative).not.toContain('role="img"')
  })

  it('keeps the aspect ratio from its height', () => {
    expect(render(Wordmark, { height: 42 })).toMatch(/height="42" width="120"/)
    expect(render(Wordmark, { variant: 'compact', height: 32 })).toMatch(/height="32" width="120"/)
  })
})

describe('DiamondBadge', () => {
  it('primary: cream interior, forest outline and numerals, clay seams and accents', () => {
    const html = render(DiamondBadge)
    expect(html).toContain('data-variant="primary"')
    expect(html).toMatch(new RegExp(`<polygon[^>]*fill="${BRAND_COLORS.cream}"[^>]*stroke="${BRAND_COLORS.forest}"`))
    expect(html).toContain(`<path d="${BADGE_NUMERALS}" fill="${BRAND_COLORS.forest}"`)
    expect(html).toContain(`stroke="${BRAND_COLORS.clay}"`)
    expect(html.match(new RegExp(`<rect[^>]*fill="${BRAND_COLORS.clay}"`, 'g'))).toHaveLength(2)
  })

  it('reverse: forest-filled with cream numerals; cream or clay stitching', () => {
    const html = render(DiamondBadge, { variant: 'reverse' })
    expect(html).toMatch(new RegExp(`<polygon[^>]*fill="${BRAND_COLORS.forest}"`))
    expect(html).toContain(`<path d="${BADGE_NUMERALS}" fill="${BRAND_COLORS.cream}"`)
    expect(html).toMatch(new RegExp(`<g stroke="${BRAND_COLORS.cream}"`))
    expect(render(DiamondBadge, { variant: 'reverse', reverseSeamColor: 'clay' })).toMatch(new RegExp(`<g stroke="${BRAND_COLORS.clay}"`))
  })

  it('mono uses currentColor and no brand color', () => {
    const html = render(DiamondBadge, { variant: 'mono' })
    expect(html).toContain('currentColor')
    for (const c of Object.values(BRAND_COLORS)) expect(html).not.toContain(c)
  })

  it('uses the simplified badge below 48px and the full badge from 48px up', () => {
    expect(SIMPLE_BELOW).toBe(48)
    const count = (html: string) => ({
      polygons: (html.match(/<polygon/g) ?? []).length,
      stitches: (html.match(/<line/g) ?? []).length,
    })
    for (const size of [24, 36, 44]) {
      const html = render(DiamondBadge, { size })
      expect(html).toContain('data-detail="simple"')
      expect(count(html)).toEqual({ polygons: 1, stitches: 8 })   // no keyline; 4 stitches per arc
    }
    for (const size of [48, 64, 120]) {
      const html = render(DiamondBadge, { size })
      expect(html).toContain('data-detail="full"')
      expect(count(html)).toEqual({ polygons: 2, stitches: 12 })  // keyline; 6 stitches per arc
    }
    expect(render(DiamondBadge, { size: 36, detail: 'full' })).toContain('data-detail="full"')
    expect(render(DiamondBadge, { size: 120, detail: 'simple' })).toContain('data-detail="simple"')
  })

  it('simplified badge keeps the outline, numerals, colors and accents', () => {
    const simple = render(DiamondBadge, { size: 36 })
    const full = render(DiamondBadge, { size: 64 })
    for (const part of [`<path d="${BADGE_NUMERALS}" fill="${BRAND_COLORS.forest}"`, 'points="60,5 115,60 60,115 5,60"', `stroke="${BRAND_COLORS.clay}"`]) {
      expect(simple).toContain(part)
      expect(full).toContain(part)
    }
    expect(simple.match(new RegExp(`<rect[^>]*fill="${BRAND_COLORS.clay}"`, 'g'))).toHaveLength(2)
    expect(DETAIL.simple.seamWidth).toBeGreaterThan(DETAIL.full.seamWidth)
  })

  it('seams and accents are exactly symmetrical at both detail levels', () => {
    for (const [top, bottom] of [[TOP_STITCHES, BOTTOM_STITCHES], [SIMPLE_TOP_STITCHES, SIMPLE_BOTTOM_STITCHES]]) {
      expect(bottom).toHaveLength(top.length)
      top.forEach((s, i) => {
        const b = bottom[i]
        expect(b.x1).toBeCloseTo(s.x1, 2)
        expect(b.y1).toBeCloseTo(120 - s.y1, 2)
        expect(b.y2).toBeCloseTo(120 - s.y2, 2)
      })
      const n = top.length
      top.forEach((s, i) => {
        const m = top[n - 1 - i]
        expect((s.x1 + s.x2) / 2 + (m.x1 + m.x2) / 2).toBeCloseTo(120, 1)
        expect((s.y1 + s.y2) / 2).toBeCloseTo((m.y1 + m.y2) / 2, 1)
      })
    }
    for (const a of [ACCENTS, accents(DETAIL.simple.accentH)]) {
      expect(a[0].x + a[0].w / 2 + a[1].x + a[1].w / 2).toBeCloseTo(120, 5)
      expect(a[0].y).toBe(a[1].y)
      expect(a[0].y + a[0].h / 2).toBeCloseTo(60, 5)
    }
  })

  it('Tagline renders the approved tagline as text', () => {
    expect(render(Tagline)).toContain('Built for Baseball.')
  })
})

// ── Standalone SVG files (public/brand) ──────────────────────────────────────
// Generated from the components above, so there is one source of truth.
// Regenerate after an intentional artwork change with:
//   UPDATE_BRAND_SVGS=1 npx vitest run src/components/brand
const BRAND_DIR = join(root, 'public', 'brand')
const FILES: Array<[file: string, C: ComponentType<any>, props: Record<string, unknown>, title: string]> = [
  ['six43-wordmark.svg', Wordmark, { height: 84 }, 'Six43'],
  ['six43-wordmark-on-dark.svg', Wordmark, { height: 84, tone: 'onDark' }, 'Six43'],
  ['six43-wordmark-compact.svg', Wordmark, { variant: 'compact', height: 64 }, 'Six43'],
  ['six43-wordmark-compact-on-dark.svg', Wordmark, { variant: 'compact', height: 64, tone: 'onDark' }, 'Six43'],
  ['six43-badge.svg', DiamondBadge, { size: 120 }, 'Six43 643 badge'],
  ['six43-badge-reverse.svg', DiamondBadge, { size: 120, variant: 'reverse' }, 'Six43 643 badge'],
  ['six43-badge-mono.svg', DiamondBadge, { size: 120, variant: 'mono' }, 'Six43 643 badge'],
  ['six43-badge-small.svg', DiamondBadge, { size: 120, detail: 'simple' }, 'Six43 643 badge (small sizes)'],
  ['six43-badge-small-reverse.svg', DiamondBadge, { size: 120, detail: 'simple', variant: 'reverse' }, 'Six43 643 badge (small sizes)'],
]

function standalone(C: ComponentType<any>, props: Record<string, unknown>, title: string) {
  const svg = render(C, { ...props, title: '' })
    .replace(/ data-[a-z-]+="[^"]*"/g, '')
    .replace(' aria-hidden="true"', '')
    .replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="title" ')
    .replace(/^(<svg[^>]*>)/, `$1<title id="title">${title}</title>`)
    .replace(/currentColor/g, '#000000') // one-color file: black
  return `${svg}\n`
}

describe('standalone SVG files in public/brand', () => {
  it.each(FILES)('%s matches the component artwork', (file, C, props, title) => {
    const expected = standalone(C, props, title)
    const path = join(BRAND_DIR, file)
    if (process.env.UPDATE_BRAND_SVGS === '1') writeFileSync(path, expected)
    expect(existsSync(path), file).toBe(true)
    const actual = readFileSync(path, 'utf8').replace(/\r\n/g, '\n')
    expect(actual).toBe(expected)
    expect(actual).not.toMatch(/<text|font-family|data-|currentColor|<script|href=/)
    expect(Buffer.byteLength(actual)).toBeLessThan(8 * 1024)
  })

  it('public/brand holds only these files', () => {
    expect(readdirSync(BRAND_DIR).sort()).toEqual(FILES.map(f => f[0]).sort())
  })
})

describe('brand review page', () => {
  it('returns notFound outside development', async () => {
    expect(process.env.NODE_ENV).not.toBe('development')
    const mod = await import('../../../app/dev/brand/page')
    let thrown: unknown
    try { mod.default() } catch (e) { thrown = e }
    expect((thrown as { digest?: string })?.digest).toBe('NEXT_NOT_FOUND')
  })
})
