// Six43 tagline, set in the display font. This is text, not artwork.

import React from 'react'
import { BRAND_TAGLINE } from '../../styles/brand'

export type TaglineProps = {
  as?: 'p' | 'span' | 'div'
  className?: string
  style?: React.CSSProperties
}

export function Tagline({ as: Tag = 'p', className, style }: TaglineProps) {
  return (
    <Tag
      className={className}
      style={{
        fontFamily: 'var(--font-display)',
        fontStyle: 'italic',
        fontWeight: 700,
        letterSpacing: '0.01em',
        margin: 0,
        ...style,
      }}
    >
      {BRAND_TAGLINE}
    </Tag>
  )
}
