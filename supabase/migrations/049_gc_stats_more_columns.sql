-- Add missing batting/pitching columns to tryout_gc_stats.
-- These are produced by the GC parser but had no home in the table.

alter table tryout_gc_stats
  add column if not exists hbp  int,        -- hit by pitch
  add column if not exists sac  int,        -- sacrifice flies/bunts
  add column if not exists tb   int,        -- total bases
  add column if not exists k_bb numeric(6,3); -- strikeout-to-walk ratio
