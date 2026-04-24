/**
 * GameChanger stat definitions for scoring configuration.
 * These keys map directly to tryout_gc_stats columns.
 */

export interface GcStatDef {
  key:             string
  label:           string
  category:        'batting' | 'pitching'
  higherBetter:    boolean   // false = lower is better (ERA, WHIP, SO as batter)
  defaultIncluded: boolean
  defaultWeight:   number
}

export const GC_STAT_DEFS: GcStatDef[] = [
  // ── Batting ──────────────────────────────────────────────────────────────
  { key: 'avg',    label: 'Batting Average', category: 'batting', higherBetter: true,  defaultIncluded: true,  defaultWeight: 2.0 },
  { key: 'obp',    label: 'On-Base %',       category: 'batting', higherBetter: true,  defaultIncluded: true,  defaultWeight: 2.0 },
  { key: 'slg',    label: 'Slugging %',      category: 'batting', higherBetter: true,  defaultIncluded: true,  defaultWeight: 1.5 },
  { key: 'ops',    label: 'OPS',             category: 'batting', higherBetter: true,  defaultIncluded: false, defaultWeight: 2.0 },
  { key: 'rbi',    label: 'RBI',             category: 'batting', higherBetter: true,  defaultIncluded: true,  defaultWeight: 1.0 },
  { key: 'r',      label: 'Runs',            category: 'batting', higherBetter: true,  defaultIncluded: false, defaultWeight: 1.0 },
  { key: 'hr',     label: 'Home Runs',       category: 'batting', higherBetter: true,  defaultIncluded: false, defaultWeight: 1.0 },
  { key: 'sb',     label: 'Stolen Bases',    category: 'batting', higherBetter: true,  defaultIncluded: false, defaultWeight: 0.5 },
  { key: 'bb',     label: 'Walks (bat)',     category: 'batting', higherBetter: true,  defaultIncluded: false, defaultWeight: 0.5 },
  { key: 'so',     label: 'Strikeouts (bat)',category: 'batting', higherBetter: false, defaultIncluded: false, defaultWeight: 1.0 },
  // ── Pitching ─────────────────────────────────────────────────────────────
  { key: 'era',        label: 'ERA',             category: 'pitching', higherBetter: false, defaultIncluded: true,  defaultWeight: 2.0 },
  { key: 'whip',       label: 'WHIP',            category: 'pitching', higherBetter: false, defaultIncluded: true,  defaultWeight: 2.0 },
  { key: 'baa',        label: 'BAA',             category: 'pitching', higherBetter: false, defaultIncluded: true,  defaultWeight: 2.0 },
  { key: 'k',          label: 'Strikeouts (P)',  category: 'pitching', higherBetter: true,  defaultIncluded: true,  defaultWeight: 1.5 },
  { key: 'bb_per_inn', label: 'BB/INN',          category: 'pitching', higherBetter: false, defaultIncluded: true,  defaultWeight: 1.5 },
  { key: 'strike_pct', label: 'Strike %',        category: 'pitching', higherBetter: true,  defaultIncluded: true,  defaultWeight: 1.0 },
  { key: 'ip',         label: 'Innings Pitched', category: 'pitching', higherBetter: true,  defaultIncluded: true,  defaultWeight: 1.0 },
  { key: 'k_bb',       label: 'K/BB',            category: 'pitching', higherBetter: true,  defaultIncluded: false, defaultWeight: 1.5 },
  { key: 'bb_allowed', label: 'Walks Allowed',   category: 'pitching', higherBetter: false, defaultIncluded: false, defaultWeight: 1.0 },
  { key: 'bf',         label: 'Batters Faced',   category: 'pitching', higherBetter: true,  defaultIncluded: false, defaultWeight: 0.5 },
  { key: 'w',          label: 'Wins',            category: 'pitching', higherBetter: true,  defaultIncluded: false, defaultWeight: 0.5 },
  { key: 'sv',         label: 'Saves',           category: 'pitching', higherBetter: true,  defaultIncluded: false, defaultWeight: 0.5 },
]

/** Build a lookup map from key → def */
export const GC_STAT_DEF_MAP: Record<string, GcStatDef> =
  Object.fromEntries(GC_STAT_DEFS.map(d => [d.key, d]))
