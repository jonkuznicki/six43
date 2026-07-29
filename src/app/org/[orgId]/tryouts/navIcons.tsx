'use client'

// Minimal monochrome line-icon set for the Tryouts sidebar.
// Deliberately plain (single stroke, currentColor) so it reads as one
// consistent icon language instead of the emoji previously used here.

import React from 'react'

type IconProps = { size?: number }

const base: React.SVGProps<SVGSVGElement> = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function Icon({ size = 16, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg {...base} width={size} height={size} aria-hidden="true">
      {children}
    </svg>
  )
}

export const NavIcons: Record<string, (props: IconProps) => React.ReactElement> = {
  seasons: (p) => (
    <Icon {...p}>
      <rect x="3" y="4" width="14" height="13" rx="1.5" />
      <path d="M3 8h14M7 2.5v3M13 2.5v3" />
    </Icon>
  ),
  members: (p) => (
    <Icon {...p}>
      <circle cx="7.5" cy="6.5" r="2.75" />
      <path d="M2.5 17c0-2.9 2.24-5 5-5s5 2.1 5 5" />
      <path d="M13 7a2.5 2.5 0 1 0 0-5" />
      <path d="M14.5 12.3c1.8.5 3 2.2 3 4.7" />
    </Icon>
  ),
  scoring: (p) => (
    <Icon {...p}>
      <path d="M4 15V9M10 15V4M16 15v-6.5" />
      <path d="M2 15h16" />
    </Icon>
  ),
  imports: (p) => (
    <Icon {...p}>
      <path d="M10 3v9M6.5 8.5 10 12l3.5-3.5" />
      <path d="M3.5 14v1.5A1.5 1.5 0 0 0 5 17h10a1.5 1.5 0 0 0 1.5-1.5V14" />
    </Icon>
  ),
  registration: (p) => (
    <Icon {...p}>
      <rect x="4" y="3" width="12" height="14" rx="1.5" />
      <path d="M7.25 2.5v2M12.75 2.5v2M7 9.5h6M7 12.5h4" />
    </Icon>
  ),
  'data-hub': (p) => (
    <Icon {...p}>
      <rect x="2.75" y="2.75" width="6" height="6" rx="1" />
      <rect x="11.25" y="2.75" width="6" height="6" rx="1" />
      <rect x="2.75" y="11.25" width="6" height="6" rx="1" />
      <rect x="11.25" y="11.25" width="6" height="6" rx="1" />
    </Icon>
  ),
  readiness: (p) => (
    <Icon {...p}>
      <circle cx="10" cy="10" r="7.25" />
      <path d="M7 10.2l2 2 4-4.4" />
    </Icon>
  ),
  sessions: (p) => (
    <Icon {...p}>
      <rect x="3" y="4" width="14" height="13" rx="1.5" />
      <path d="M3 8h14M7 2.5v3M13 2.5v3" />
      <circle cx="13.25" cy="12.5" r="2.5" />
      <path d="M13.25 11.4v1.1l.8.6" />
    </Icon>
  ),
  'coach-evals': (p) => (
    <Icon {...p}>
      <rect x="4" y="3" width="12" height="14" rx="1.5" />
      <path d="M7.25 2.5v2M12.75 2.5v2" />
      <path d="M7 10.5l2 2 4-4.5" />
    </Icon>
  ),
  rankings: (p) => (
    <Icon {...p}>
      <path d="M4 16V11M10 16V4M16 16v-7" />
      <path d="M2 16h16" />
    </Icon>
  ),
  teams: (p) => (
    <Icon {...p}>
      <path d="M2.75 6 10 2.5l7.25 3.5-7.25 3.5L2.75 6Z" />
      <path d="M5.25 8.25v4.5c0 1.1 2.13 2 4.75 2s4.75-.9 4.75-2v-4.5" />
    </Icon>
  ),
  'action-items': (p) => (
    <Icon {...p}>
      <rect x="3.5" y="3.5" width="13" height="13" rx="1.5" />
      <path d="M6.5 10l2 2 4-4.5" />
    </Icon>
  ),
}
