// Line icons for the marketing homepage. currentColor. Decorative: always aria-hidden.

import React from 'react'

export function CheckIcon({ color = 'currentColor' }: { color?: string }) {
  return (
    <svg viewBox="0 0 16 16" width={16} height={16} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8.5 6.5 12 13 4.5" />
    </svg>
  )
}

export function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" width={24} height={24} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  )
}
