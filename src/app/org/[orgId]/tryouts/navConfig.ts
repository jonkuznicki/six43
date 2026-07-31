// Single source of truth for the Tryouts module sidebar (layout.tsx).

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
