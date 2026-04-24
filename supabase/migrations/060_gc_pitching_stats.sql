-- Additional pitching columns for tryout_gc_stats.
-- These are separate from batting so/bb to avoid overwriting when a combined
-- batting+pitching file is imported.

alter table tryout_gc_stats
  add column if not exists k          int,            -- pitching strikeouts
  add column if not exists bb_allowed int,            -- walks allowed (as pitcher)
  add column if not exists bf         int,            -- batters faced
  add column if not exists baa        numeric(5,3),   -- batting average against (lower = better)
  add column if not exists bb_per_inn numeric(5,3);   -- walks per inning (lower = better)
