// Single source of truth for Tryouts module navigation labels.
//
// The sidebar (layout.tsx) and the Overview page (page.tsx) both read from
// this list instead of each hardcoding their own copy of item names, so the
// two can't silently drift apart again. Overview may still show additional
// context (descriptions, filtered import links, the standalone Players
// page) that don't belong in the sidebar — this file only owns the parts
// that must stay identical in both places: the segment and its label.

export interface TryoutNavItem {
  segment: string
  label: string
}

export interface TryoutNavGroup {
  label: string
  items: TryoutNavItem[]
}

export const TRYOUT_NAV: TryoutNavGroup[] = [
  {
    label: 'Setup',
    items: [
      { segment: 'seasons', label: 'Seasons' },
      { segment: 'members', label: 'Members' },
      { segment: 'scoring', label: 'Scoring Setup' },
    ],
  },
  {
    label: 'Player Data',
    items: [
      { segment: 'imports', label: 'Imports' },
      { segment: 'registration', label: 'Registration' },
      { segment: 'data-hub', label: 'Data Hub' },
      { segment: 'readiness', label: 'Readiness' },
    ],
  },
  {
    label: 'Tryouts',
    items: [
      { segment: 'sessions', label: 'Tryout Sessions' },
      { segment: 'coach-evals', label: 'Coach Evaluations' },
    ],
  },
  {
    label: 'Team Making',
    items: [
      { segment: 'rankings', label: 'Rankings' },
      { segment: 'teams', label: 'Final Rosters' },
      { segment: 'action-items', label: 'Action Items' },
    ],
  },
]

export function tryoutNavLabel(segment: string): string {
  for (const group of TRYOUT_NAV) {
    const item = group.items.find(i => i.segment === segment)
    if (item) return item.label
  }
  return segment
}
