// 643 diamond badge.
//
//   variant="primary"  cream interior, forest-green diamond outline and 643
//                      numerals, two symmetrical curved clay-red stitching
//                      arcs above and below the numerals, and a short
//                      clay-red horizontal accent either side of 643.
//   variant="reverse"  forest-filled diamond, cream numerals (for dark use).
//   variant="mono"     single color in currentColor (print / one-color use).
//
//   detail="full"      the complete badge (keyline and six stitches per arc).
//   detail="simple"    small-size version: no inner keyline, slightly heavier
//                      seams and four short stitches per arc, so it stays
//                      legible below ~48px. Same outline, numerals, colors
//                      and accents.
//   detail="auto"      (default) simple below 48px, full from 48px up.
//
// Symmetry is guaranteed by construction: the bottom seam is the top seam
// mirrored across the badge's horizontal center line, and the accents mirror
// across the vertical center line.
//
// Outlined vector artwork (numerals from ./artwork.ts): renders identically
// everywhere and needs no font. Status: see ./artworkStatus.ts.

import React from 'react'
import { BRAND_COLORS } from '../../styles/brand'
import { ARTWORK_STATUS } from './artworkStatus'
import { BADGE_NUMERALS } from './artwork'

export type DiamondBadgeVariant = 'primary' | 'reverse' | 'mono'
export type DiamondBadgeDetail = 'auto' | 'full' | 'simple'

export type DiamondBadgeProps = {
  /** Rendered width and height in px. */
  size?: number
  variant?: DiamondBadgeVariant
  /** 'auto' picks the simplified badge below SIMPLE_BELOW px. */
  detail?: DiamondBadgeDetail
  /** Stitching color for variant="reverse" (primary is always clay; mono is currentColor). */
  reverseSeamColor?: 'cream' | 'clay'
  /** Accessible name. Pass '' when the badge is purely decorative. */
  title?: string
  className?: string
  style?: React.CSSProperties
}

/** Size (px) below which detail="auto" uses the simplified badge. */
export const SIMPLE_BELOW = 48

const SIZE = 120
const C = SIZE / 2 // center of symmetry

// Top seam: quadratic curve bowing down toward the numerals.
const P0 = { x: 40, y: 35 }
const P1 = { x: 60, y: 48 }
const P2 = { x: 80, y: 35 }

/** Geometry that differs between the full and simplified badge. */
export const DETAIL = {
  full:   { keyline: 1.4, seamWidth: 2.2, stitchT: [0.1, 0.26, 0.42, 0.58, 0.74, 0.9], stitchHalf: 3.2, stitchWidth: 1.6, accentH: 3 },
  simple: { keyline: 0,   seamWidth: 3.4, stitchT: [0.14, 0.38, 0.62, 0.86],           stitchHalf: 2.8, stitchWidth: 2.4, accentH: 3.6 },
} as const

const r2 = (n: number) => Math.round(n * 100) / 100

function bezier(t: number) {
  const u = 1 - t
  return {
    x: u * u * P0.x + 2 * u * t * P1.x + t * t * P2.x,
    y: u * u * P0.y + 2 * u * t * P1.y + t * t * P2.y,
  }
}

function tangent(t: number) {
  const dx = 2 * (1 - t) * (P1.x - P0.x) + 2 * t * (P2.x - P1.x)
  const dy = 2 * (1 - t) * (P1.y - P0.y) + 2 * t * (P2.y - P1.y)
  const len = Math.hypot(dx, dy)
  return { x: dx / len, y: dy / len }
}

/** Stitch tick segments for the top seam, perpendicular to the curve. */
function topStitches(ts: readonly number[], half: number) {
  return ts.map(t => {
    const p = bezier(t)
    const tg = tangent(t)
    const n = { x: -tg.y, y: tg.x }
    return {
      x1: r2(p.x - n.x * half), y1: r2(p.y - n.y * half),
      x2: r2(p.x + n.x * half), y2: r2(p.y + n.y * half),
    }
  })
}

const mirrorY = (y: number) => r2(2 * C - y)

const mirrorStitches = (s: ReturnType<typeof topStitches>) =>
  s.map(t => ({ x1: t.x1, y1: mirrorY(t.y1), x2: t.x2, y2: mirrorY(t.y2) }))

export const TOP_STITCHES = topStitches(DETAIL.full.stitchT, DETAIL.full.stitchHalf)
export const BOTTOM_STITCHES = mirrorStitches(TOP_STITCHES)
export const SIMPLE_TOP_STITCHES = topStitches(DETAIL.simple.stitchT, DETAIL.simple.stitchHalf)
export const SIMPLE_BOTTOM_STITCHES = mirrorStitches(SIMPLE_TOP_STITCHES)

/** Short horizontal accents either side of the numerals (mirror across x = 60), centered on y = 60. */
export const accents = (h: number) => [
  { x: 17, y: C - h / 2, w: 9, h },
  { x: SIZE - 17 - 9, y: C - h / 2, w: 9, h },
]
export const ACCENTS = accents(DETAIL.full.accentH)

const TOP_SEAM = `M${P0.x} ${P0.y} Q${P1.x} ${P1.y} ${P2.x} ${P2.y}`
const BOTTOM_SEAM = `M${P0.x} ${mirrorY(P0.y)} Q${P1.x} ${mirrorY(P1.y)} ${P2.x} ${mirrorY(P2.y)}`

function palette(variant: DiamondBadgeVariant, reverseSeam: 'cream' | 'clay') {
  switch (variant) {
    case 'reverse':
      return { fill: BRAND_COLORS.forest, outline: BRAND_COLORS.forest, keyline: BRAND_COLORS.cream,
               numerals: BRAND_COLORS.cream, seam: BRAND_COLORS[reverseSeam], accent: BRAND_COLORS.clay }
    case 'mono':
      return { fill: 'none', outline: 'currentColor', keyline: 'currentColor',
               numerals: 'currentColor', seam: 'currentColor', accent: 'currentColor' }
    default:
      return { fill: BRAND_COLORS.cream, outline: BRAND_COLORS.forest, keyline: BRAND_COLORS.forest,
               numerals: BRAND_COLORS.forest, seam: BRAND_COLORS.clay, accent: BRAND_COLORS.clay }
  }
}

export function DiamondBadge({
  size = 64,
  variant = 'primary',
  detail = 'auto',
  reverseSeamColor = 'cream',
  title = 'Six43',
  className,
  style,
}: DiamondBadgeProps) {
  const p = palette(variant, reverseSeamColor)
  const level = detail === 'auto' ? (size < SIMPLE_BELOW ? 'simple' : 'full') : detail
  const g = DETAIL[level]
  const stitches = level === 'simple'
    ? [...SIMPLE_TOP_STITCHES, ...SIMPLE_BOTTOM_STITCHES]
    : [...TOP_STITCHES, ...BOTTOM_STITCHES]
  const decorative = title === ''

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      width={size}
      height={size}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative ? true : undefined}
      data-artwork={ARTWORK_STATUS}
      data-variant={variant}
      data-detail={level}
      className={className}
      style={style}
    >
      {/* Diamond with a heavy outline */}
      <polygon
        points="60,5 115,60 60,115 5,60"
        fill={p.fill}
        stroke={p.outline}
        strokeWidth={6}
        strokeLinejoin="round"
      />
      {/* Inner keyline (full detail only) */}
      {g.keyline > 0 && (
        <polygon
          points="60,14 106,60 60,106 14,60"
          fill="none"
          stroke={p.keyline}
          strokeWidth={g.keyline}
          strokeLinejoin="round"
        />
      )}

      {/* Curved stitching */}
      <g stroke={p.seam} strokeLinecap="round" fill="none">
        <path d={TOP_SEAM} strokeWidth={g.seamWidth} />
        <path d={BOTTOM_SEAM} strokeWidth={g.seamWidth} />
        {stitches.map((s, i) => (
          <line key={i} {...s} strokeWidth={g.stitchWidth} />
        ))}
      </g>

      {/* Horizontal accents */}
      {accents(g.accentH).map((a, i) => (
        <rect key={i} x={a.x} y={a.y} width={a.w} height={a.h} rx={1} fill={p.accent} />
      ))}

      {/* Numerals: outlined, centered on x = 60 */}
      <path d={BADGE_NUMERALS} fill={p.numerals} />
    </svg>
  )
}
