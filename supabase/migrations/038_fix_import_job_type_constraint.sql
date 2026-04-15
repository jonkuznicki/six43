-- Fix tryout_import_jobs.type CHECK constraint to include 'roster' and 'gc_stats'
-- Previous constraint: check (type in ('registration','coach_eval','tryout_scores','gamechanger'))
-- This caused roster and gc_stats import job records to silently fail on INSERT.

alter table tryout_import_jobs
  drop constraint if exists tryout_import_jobs_type_check;

alter table tryout_import_jobs
  add constraint tryout_import_jobs_type_check
  check (type in ('registration', 'roster', 'gc_stats', 'gamechanger', 'coach_eval', 'tryout_scores'));
