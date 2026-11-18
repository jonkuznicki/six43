// Six43 wordmark: bold, athletic, forward-leaning italic lettering with a
// curved, tapered clay-red underline.
//
// Outlined vector artwork (./artwork.ts): renders identically everywhere and
// needs no font. Status: see ./artworkStatus.ts.

import React from 'react'
import { BRAND_COLORS } from '../../styles/brand'
import { ARTWORK_STATUS } from './artworkStatus'
import { UNDERLINE_PATH, WORDMARK_LETTERS } from './artwork'

export { UNDERLINE_PATH } from './artwork'

export type WordmarkProps = {
  /** 'full' includes the clay-red underline; 'compact' omits it for tight spaces. */
  variant?: 'full' | 'compact'
  /** Background the mark sits on. Sets the letter color. */
  tone?: 'onLight' | 'onDark'
  /** Rendered height in px. Width follows the aspect ratio. */
  height?: number
  /** Accessible name. Pass '' when the mark is purely decorative. */
  title?: string
  className?: string
  style?: React.CSSProperties
}

export const WORDMARK_VIEWBOX = {
  full:    { w: 240, h: 84 },
  compact: { w: 240, h: 64 },
} as const

export function Wordmark({
  variant = 'full',
  tone = 'onLight',
  height = 40,
  title = 'Six43',
  className,
  style,
}: WordmarkProps) {
  const { w, h } = WORDMARK_VIEWBOX[variant]
  const letterColor = tone === 'onDark' ? BRAND_COLORS.cream : BRAND_COLORS.forest
  const decorative = title === ''

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      height={height}
      width={(height * w) / h}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative ? true : undefined}
      data-artwork={ARTWORK_STATUS}
      className={className}
      style={style}
    >
      <path d={WORDMARK_LETTERS} fill={letterColor} />
      {variant === 'full' && <path d={UNDERLINE_PATH} fill={BRAND_COLORS.clay} />}
    </svg>
  )
}
