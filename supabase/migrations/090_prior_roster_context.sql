-- ============================================================
-- Six43 – Migration 090: Prior-Roster Context
-- ============================================================
-- Season-rollover audit (see project notes) found tryout_players.prior_team
-- doing double duty: it's the ONLY signal for "returning player," yet it's
-- a single mutable field that every registration/roster import silently
-- overwrites, so it can never distinguish "team as of 2 seasons ago" from
-- "team as of today." This table replaces that role with a real,
-- season-scoped snapshot.
--
-- One row = "here's what was true for this player BEFORE the current
-- (season_id) tryout season started." Populated by an explicit admin
-- action ("Seed Prior Rosters from <season>"), never automatically.
--
-- Deliberately a SNAPSHOT, not a live reference:
--   - prior_team_name / prior_age_group / prior_org are plain text copied
--     at seed time, NOT foreign keys to tryout_teams — team names have no
--     history of their own (see tryout_teams.name), so a live join could
--     quietly show a since-renamed team's current name against an old
--     season. Snapshotting freezes it as it was.
--   - source_season_id / source_assignment_id are audit-trail pointers
--     ONLY (nullable, on delete set null) — nothing reads through them to
--     reconstruct history; they exist so an admin can trace "where did
--     this snapshot come from."
--
-- unique(season_id, player_id): one prior-context row per player per
-- season. The seed action upserts on this key, so re-running it for the
-- same season updates the snapshot rather than duplicating rows.
-- ============================================================

create table tryout_prior_roster_context (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references tryout_orgs(id) on delete cascade,

  -- The season this prior context is FOR (e.g. 2028).
  season_id            uuid not null references tryout_seasons(id) on delete cascade,
  player_id            uuid not null references tryout_players(id) on delete cascade,

  -- Snapshot values — text, not FKs. Frozen as of the seed action.
  prior_team_name      text,
  prior_age_group      text,
  prior_org            text,

  -- Audit-trail pointers only (e.g. to 2027's season/assignment row) — never
  -- dereferenced live by the app. Both go null if the source is later
  -- deleted; the snapshot values above are unaffected either way.
  source_season_id     uuid references tryout_seasons(id) on delete set null,
  source_assignment_id uuid references tryout_team_assignments(id) on delete set null,

  created_by           uuid references auth.users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (season_id, player_id)
);

create index idx_prior_roster_context_org           on tryout_prior_roster_context(org_id);
create index idx_prior_roster_context_season         on tryout_prior_roster_context(season_id);
create index idx_prior_roster_context_player         on tryout_prior_roster_context(player_id);
create index idx_prior_roster_context_source_season  on tryout_prior_roster_context(source_season_id);

create trigger trg_prior_roster_context_updated_at
  before update on tryout_prior_roster_context
  for each row execute function update_updated_at();

alter table tryout_prior_roster_context enable row level security;

create policy "tryout_prior_roster_context: staff can read"
  on tryout_prior_roster_context for select
  using (tryout_is_member(org_id, array['org_admin','head_coach']));

create policy "tryout_prior_roster_context: staff can insert"
  on tryout_prior_roster_context for insert
  with check (tryout_is_member(org_id, array['org_admin','head_coach']));

create policy "tryout_prior_roster_context: staff can update"
  on tryout_prior_roster_context for update
  using (tryout_is_member(org_id, array['org_admin','head_coach']));

-- Only admins can remove a seeded row (e.g. undoing a mistaken seed run) —
-- head coaches can view/adjust the snapshot but not delete it outright.
create policy "tryout_prior_roster_context: admin can delete"
  on tryout_prior_roster_context for delete
  using (tryout_is_member(org_id, array['org_admin']));
