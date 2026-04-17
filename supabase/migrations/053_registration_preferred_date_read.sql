-- Migration 053: Ensure preferred_tryout_date is queryable in registration staging
--
-- Migration 051 added preferred_tryout_date to tryout_registration_staging.
-- This no-op migration documents that the column must exist for the import
-- pipeline and data hub to work correctly.
-- If 051 was never run, run it first.

-- Idempotent: add column if missing (belt-and-suspenders)
alter table tryout_registration_staging
  add column if not exists preferred_tryout_date date;
