import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BRAND_COLORS, contrastRatio } from '../brand'

const root = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(root, p), 'utf8').replace(/\r\n/g, '\n')

describe('brand tokens', () => {
  it('uses the approved hex values', () => {
    expect(BRAND_COLORS).toEqual({
      forest: '#0B3D2E',
      cream: '#F7EAD2',
      clay: '#B23A2B',
      charcoal: '#2E2E2E',
    })
  })

  it('keeps brand.css in sync with brand.ts (hex and rgb triplets)', () => {
    const css = read('src/styles/brand.css')
    for (const [name, hex] of Object.entries(BRAND_COLORS)) {
      expect(css).toMatch(new RegExp(`--brand-${name}:\\s*${hex};`, 'i'))
      const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)).join(', ')
      expect(css).toMatch(new RegExp(`--brand-${name}-rgb:\\s*${rgb};`))
    }
  })

  it('computes WCAG contrast correctly', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 5)
    expect(contrastRatio(BRAND_COLORS.cream, BRAND_COLORS.forest)).toBeGreaterThan(7)
  })
})

describe('existing app styles are untouched', () => {
  // SHA-256 of src/app/globals.css as of main@562d025, with LF line endings.
  // The brand work may only add the brand.css import line at the top. If a
  // later change intentionally alters app styles, update this hash in it.
  const GLOBALS_CSS_BASELINE_SHA256 = 'f84e69726cda0275529a5d5a91235ca3dd6eb85a21af13ffb8602e4ee7f46531'

  it('globals.css is byte-identical to main apart from the brand import', () => {
    const css = read('src/app/globals.css')
    expect(css.startsWith("@import '../styles/brand.css';\n")).toBe(true)
    const withoutImport = css.replace("@import '../styles/brand.css';\n", '')
    const hash = createHash('sha256').update(withoutImport).digest('hex')
    expect(hash).toBe(GLOBALS_CSS_BASELINE_SHA256)
  })

  it('brand.css defines only new --brand-* / --font-* variables', () => {
    const css = read('src/styles/brand.css').replace(/\/\*[\s\S]*?\*\//g, '')
    const declared = Array.from(css.matchAll(/(--[a-z0-9-]+)\s*:/g), m => m[1])
    expect(declared.length).toBeGreaterThan(0)
    for (const v of declared) expect(v).toMatch(/^--(brand|font)-/)
  })

  it('tailwind maps brand colors to the CSS variables without replacing defaults', async () => {
    const config = (await import('../../../tailwind.config')).default as any
    expect(config.theme.colors).toBeUndefined()
    expect(config.theme.fontFamily).toBeUndefined()
    expect(config.theme.extend.colors.forest).toBe('rgba(var(--brand-forest-rgb), <alpha-value>)')
    expect(config.theme.extend.fontFamily.display).toEqual(['var(--font-display)'])
  })
})
