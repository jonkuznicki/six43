-- Migration 050: Tryout eval form support
--
-- 1. Add is_tiebreaker to tryout_scoring_config
-- 2. Fix tryout scoring weights for Hudson Baseball (GB 33% / FB 33% / Hit 34%)
-- 3. Change tryout_checkins to use age-group-global tryout numbers
--    (was per-session; now unique per season+age_group)

-- ── 1. tryout_scoring_config: tiebreaker flag ─────────────────────────────────
alter table tryout_scoring_config
  add column if not exists is_tiebreaker boolean not null default false;

-- ── 2. Update Hudson Baseball scoring weights ─────────────────────────────────
-- Speed is a tiebreaker (collected but not in tryout_score formula)
update tryout_scoring_config sc
   set weight = 0.0, is_tiebreaker = true
  from tryout_seasons s join tryout_orgs o on o.id = s.org_id
 where sc.season_id = s.id and o.slug = 'hudson-baseball'
   and sc.category = 'speed';

-- Ground Balls: 33%
update tryout_scoring_config sc
   set weight = 0.33
  from tryout_seasons s join tryout_orgs o on o.id = s.org_id
 where sc.season_id = s.id and o.slug = 'hudson-baseball'
   and sc.category = 'ground_balls';

-- Fly Balls: 33%
update tryout_scoring_config sc
   set weight = 0.33
  from tryout_seasons s join tryout_orgs o on o.id = s.org_id
 where sc.season_id = s.id and o.slug = 'hudson-baseball'
   and sc.category = 'fly_balls';

-- Hitting: 34%
update tryout_scoring_config sc
   set weight = 0.34
  from tryout_seasons s join tryout_orgs o on o.id = s.org_id
 where sc.season_id = s.id and o.slug = 'hudson-baseball'
   and sc.category = 'hitting';

-- Pitching and catching: stored separately as tryout_pitching/tryout_catching,
-- not included in tryout_score. Weight = 0 so they don't affect the formula.
update tryout_scoring_config sc
   set weight = 0.0
  from tryout_seasons s join tryout_orgs o on o.id = s.org_id
 where sc.season_id = s.id and o.slug = 'hudson-baseball'
   and sc.category in ('pitching', 'catching');

-- ── 3. tryout_checkins: age-group-global tryout numbers ───────────────────────
-- Add season_id and age_group columns (filled from the session)
alter table tryout_checkins
  add column if not exists season_id uuid references tryout_seasons(id),
  add column if not exists age_group text;

-- Backfill from tryout_sessions
update tryout_checkins c
   set season_id = s.season_id,
       age_group = s.age_group
  from tryout_sessions s
 where s.id = c.session_id;

-- Make non-null (safe after backfill; adjust if you have checkins with no session)
alter table tryout_checkins
  alter column season_id set not null,
  alter column age_group set not null;

-- Swap the unique constraint
alter table tryout_checkins
  drop constraint if exists tryout_checkins_session_id_tryout_number_key;

alter table tryout_checkins
  add constraint tryout_checkins_season_age_number_key
  unique (season_id, age_group, tryout_number);

create index if not exists idx_tryout_checkins_season_ag
  on tryout_checkins(season_id, age_group);
