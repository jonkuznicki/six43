-- Data Hub: staging tables for registration and roster imports,
-- plus tryout_age_group on tryout_players.
--
-- Registration and roster data auto-merge to tryout_players on import,
-- but these staging tables preserve the per-source values for the Data Hub
-- review UI. Upsert on (player_id, season_id) so reimports never duplicate.

-- 1. Tryout age group (the age group this player is trying out FOR,
--    distinct from age_group which reflects their current team).
--    e.g. an 11u player trying out for 12u: age_group='11u', tryout_age_group='12u'
alter table tryout_players
  add column if not exists tryout_age_group text;

-- 2. Registration staging
create table if not exists tryout_registration_staging (
  id            uuid        primary key default gen_random_uuid(),
  player_id     uuid        not null references tryout_players(id) on delete cascade,
  org_id        uuid        not null,
  season_id     uuid        references tryout_seasons(id),
  import_job_id uuid        references tryout_import_jobs(id),
  age_group     text,
  prior_team    text,
  parent_email  text,
  parent_phone  text,
  dob           date,
  grade         text,
  school        text,
  prior_org     text,
  imported_at   timestamptz not null default now(),
  unique (player_id, season_id)
);

-- 3. Roster staging
create table if not exists tryout_roster_staging (
  id            uuid        primary key default gen_random_uuid(),
  player_id     uuid        not null references tryout_players(id) on delete cascade,
  org_id        uuid        not null,
  season_id     uuid        references tryout_seasons(id),
  import_job_id uuid        references tryout_import_jobs(id),
  team_name     text,
  jersey_number text,
  imported_at   timestamptz not null default now(),
  unique (player_id, season_id)
);

-- 4. RLS
alter table tryout_registration_staging enable row level security;
alter table tryout_roster_staging        enable row level security;

create policy "reg_staging_member" on tryout_registration_staging
  for all using (tryout_is_member(org_id, array['org_admin', 'head_coach']));

create policy "roster_staging_member" on tryout_roster_staging
  for all using (tryout_is_member(org_id, array['org_admin', 'head_coach']));
