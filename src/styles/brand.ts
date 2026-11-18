// Six43 brand tokens for TypeScript consumers (SVG components, and later
// email templates / OG images where CSS variables aren't available).
//
// Keep in sync with src/styles/brand.css. A unit test enforces this.

export const BRAND_COLORS = {
  forest:   '#0B3D2E',
  cream:    '#F7EAD2',
  clay:     '#B23A2B',
  charcoal: '#2E2E2E',
} as const

export type BrandColor = keyof typeof BRAND_COLORS

export const BRAND_TAGLINE = 'Built for Baseball.'

/** WCAG 2.x relative luminance of a #RRGGBB color. */
export function relativeLuminance(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) throw new Error(`Expected #RRGGBB, got ${hex}`)
  const [r, g, b] = [m[1], m[2], m[3]].map(h => {
    const c = parseInt(h, 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x contrast ratio between two #RRGGBB colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
