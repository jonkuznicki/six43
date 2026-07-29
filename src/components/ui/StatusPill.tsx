'use client'

import React from 'react'

// Shared status pill — replaces the half-dozen locally-defined status-color
// maps scattered across the Tryouts module. Tone carries the *meaning*
// (good/warn/bad/info/neutral); it never doubles as a brand accent.

export type StatusTone = 'good' | 'warn' | 'bad' | 'info' | 'neutral'

const TONE_VARS: Record<StatusTone, { fg: string; bg: string }> = {
  good:    { fg: 'var(--status-good)',    bg: 'var(--status-good-bg)' },
  warn:    { fg: 'var(--status-warn)',    bg: 'var(--status-warn-bg)' },
  bad:     { fg: 'var(--status-bad)',     bg: 'var(--status-bad-bg)' },
  info:    { fg: 'var(--status-info)',    bg: 'var(--status-info-bg)' },
  neutral: { fg: 'var(--status-neutral)', bg: 'var(--status-neutral-bg)' },
}

export function StatusPill({
  tone,
  children,
  size = 'md',
  style,
}: {
  tone: StatusTone
  children: React.ReactNode
  size?: 'sm' | 'md'
  style?: React.CSSProperties
}) {
  const t = TONE_VARS[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: size === 'sm' ? 10.5 : 11,
        fontWeight: 700,
        lineHeight: 1.4,
        padding: size === 'sm' ? '2px 8px' : '3px 9px',
        borderRadius: 20,
        whiteSpace: 'nowrap',
        color: t.fg,
        background: t.bg,
        ...style,
      }}
    >
      {children}
    </span>
  )
}
