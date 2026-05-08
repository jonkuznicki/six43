-- ============================================================
-- Six43 – Migration 067: Fix tryout_team_assignments schema
-- ============================================================
-- The original table was missing season_id and org_id columns that
-- the application code relies on. It also had:
--   - unique (player_id, team_id) — wrong; a player can play on the
--     same team in different seasons
--   - assigned_by NOT NULL with no default — every upsert was failing
--     because the UI never supplies this column
--
-- This migration:
--   1. Adds season_id + org_id, backfills from tryout_teams, makes NOT NULL
--   2. Gives assigned_by a default of 'manual'
--   3. Replaces unique(player_id, team_id) with unique(player_id, season_id)
--   4. Adds season index for efficient season-scoped queries
-- ============================================================

-- 1. Add new columns (nullable first so backfill can run)
alter table tryout_team_assignments
  add column if not exists season_id uuid references tryout_seasons(id) on delete cascade,
  add column if not exists org_id    uuid references tryout_orgs(id)    on delete cascade;

-- 2. Backfill from the team the assignment references
update tryout_team_assignments ta
   set season_id = tt.season_id,
       org_id    = tt.org_id
  from tryout_teams tt
 where tt.id = ta.team_id
   and (ta.season_id is null or ta.org_id is null);

-- 3. Drop any orphaned rows that couldn't be backfilled
delete from tryout_team_assignments
 where season_id is null or org_id is null;

-- 4. Enforce NOT NULL now that backfill is done
alter table tryout_team_assignments
  alter column season_id set not null,
  alter column org_id    set not null;

-- 5. Give assigned_by a sensible default so upserts don't require it
alter table tryout_team_assignments
  alter column assigned_by set default 'manual';

-- 6. Drop the old (player, team) uniqueness — a player can be on the
--    same team across multiple seasons
alter table tryout_team_assignments
  drop constraint if exists tryout_team_assignments_player_id_team_id_key;

-- 7. Add correct constraint: one team per player per season
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'tryout_team_assignments_player_id_season_id_key'
  ) then
    alter table tryout_team_assignments
      add constraint tryout_team_assignments_player_id_season_id_key
      unique (player_id, season_id);
  end if;
end $$;

-- 8. Index for season-scoped queries
create index if not exists idx_tryout_team_assignments_season
  on tryout_team_assignments(season_id);
