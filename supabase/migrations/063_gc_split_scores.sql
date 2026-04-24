-- ============================================================
-- Six43 – Migration 063: split gc_computed_score into hitting + pitching
-- ============================================================
ALTER TABLE tryout_gc_stats
  ADD COLUMN IF NOT EXISTS gc_hitting_score  numeric(4,2),
  ADD COLUMN IF NOT EXISTS gc_pitching_score numeric(4,2);
