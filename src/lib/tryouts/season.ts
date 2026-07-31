/**
 * tryout_seasons has no lifecycle/status field — only `is_active`, and only
 * one season can be active per org at a time (see seasons/page.tsx setActive).
 * "Historical" therefore only ever means an admin has switched `is_active`
 * back onto an older season. We infer it by year comparison rather than
 * adding a schema column: if the active season isn't the most recent year
 * the org has ever run, treat it as a past-season / read-only view.
 */
export function isHistoricalSeason(
  active: { year: number },
  all: { year: number }[],
): boolean {
  if (all.length === 0) return false
  const maxYear = Math.max(...all.map(s => s.year))
  return active.year < maxYear
}
