-- ============================================================
-- Six43 – Migration 030: Tryout module – core tables
-- ============================================================
-- Players, seasons, sessions, scores, evals, rankings,
-- team formation, imports, and audit log.
-- All isolated under the tryout_ prefix.
-- ============================================================

-- ----------------------------------------------------------------
-- TRYOUT_SEASONS
-- One per year per org. Holds score weights for that year.
-- ----------------------------------------------------------------
create table tryout_seasons (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references tryout_orgs(id) on delete cascade,
  year                int not null,
  label               text not null,           -- "2026 Season"
  sport               text not null default 'baseball',
  age_groups          text[] not null default array['8U','9U','10U','11U','12U'],
  is_active           boolean not null default true,

  -- Score weights (must sum to 1.0; enforced in app logic)
  tryout_weight       numeric(4,3) not null default 0.400,
  coach_eval_weight   numeric(4,3) not null default 0.400,
  intangibles_weight  numeric(4,3) not null default 0.100,
  prior_stats_weight  numeric(4,3) not null default 0.100,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  unique (org_id, year)
);

create index idx_tryout_seasons_org on tryout_seasons(org_id);

-- ----------------------------------------------------------------
-- TRYOUT_SCORING_CONFIG
-- Configurable tryout scoring categories per season.
-- Seeded with Hudson Baseball defaults. Admins can edit.
-- ----------------------------------------------------------------
create table tryout_scoring_config (
  id              uuid primary key default gen_random_uuid(),
  season_id       uuid not null references tryout_seasons(id) on delete cascade,
  category        text not null,         -- "speed"|"ground_balls"|"fly_balls"|"hitting"|"pitching"|"catching"
  label           text not null,         -- "60-yard Dash"
  -- JSON: [{ "key": "hands", "label": "Hands", "weight": 0.33 }, ...]
  subcategories   jsonb not null default '[]',
  weight          numeric(5,4) not null, -- fraction of tryout score
  is_optional     boolean not null default false,
  sort_order      int not null default 0,
  unique (season_id, category)
);

-- ----------------------------------------------------------------
-- TRYOUT_COACH_EVAL_CONFIG
-- Configurable coach eval rubric per org (with optional season override).
-- ----------------------------------------------------------------
create table tryout_coach_eval_config (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references tryout_orgs(id) on delete cascade,
  season_id   uuid references tryout_seasons(id) on delete cascade, -- null = org default
  section     text not null,    -- "fielding_hitting"|"pitching_catching"|"intangibles"
  field_key   text not null,    -- "fielding_ground_balls"|"coachability" etc.
  label       text not null,
  is_optional boolean not null default false,
  sort_order  int not null default 0,
  unique (org_id, season_id, field_key)
);

-- ----------------------------------------------------------------
-- TRYOUT_PLAYERS
-- Org-scoped player identity. Persists across seasons.
-- Separate from the existing six43 players table intentionally —
-- tryout players are pre-roster candidates, not yet season-assigned.
-- ----------------------------------------------------------------
create table tryout_players (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references tryout_orgs(id) on delete cascade,

  -- Canonical identity (set from registration import)
  first_name      text not null,
  last_name       text not null,
  dob             date,
  age_group       text,           -- "10U", "11U", etc.

  -- Contact (from registration)
  parent_email    text,
  parent_phone    text,
  grade           text,
  school          text,

  -- Prior history
  prior_org       text,
  prior_team      text,

  -- Lifecycle
  is_active       boolean not null default true,

  -- Link to existing six43 player record once placed on a team
  platform_player_id uuid,       -- references players(id) in the main schema

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index idx_tryout_players_org       on tryout_players(org_id);
create index idx_tryout_players_org_ag    on tryout_players(org_id, age_group);
create index idx_tryout_players_lastname  on tryout_players(org_id, lower(last_name));

-- ----------------------------------------------------------------
-- TRYOUT_PLAYER_ALIASES
-- Every name variant seen across sources, linked to the canonical player.
-- This is the audit trail for identity resolution.
-- ----------------------------------------------------------------
create table tryout_player_aliases (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references tryout_players(id) on delete cascade,
  raw_name      text not null,     -- exactly as it appeared in the source file
  source        text not null      -- "registration"|"coach_eval"|"tryout"|"gamechanger"|"manual"
                  check (source in ('registration','coach_eval','tryout','gamechanger','manual')),
  confidence    numeric(4,3),      -- 0.000–1.000
  confirmed     boolean not null default false,
  confirmed_by  uuid references auth.users(id),
  confirmed_at  timestamptz,
  import_job_id uuid,              -- set after tryout_import_jobs exists (FK added later)
  created_at    timestamptz not null default now()
);

create index idx_tryout_aliases_player on tryout_player_aliases(player_id);
create index idx_tryout_aliases_name   on tryout_player_aliases(lower(raw_name));

-- ----------------------------------------------------------------
-- TRYOUT_PLAYER_NOTES
-- Free-form notes per player per org. Admin/coach visible only.
-- ----------------------------------------------------------------
create table tryout_player_notes (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references tryout_players(id) on delete cascade,
  org_id      uuid not null references tryout_orgs(id) on delete cascade,
  author_id   uuid not null references auth.users(id),
  author_name text not null,
  body        text not null,
  source      text not null default 'admin'
                check (source in ('coach_eval','tryout','admin','import')),
  is_private  boolean not null default true,
  created_at  timestamptz not null default now()
);

create index idx_tryout_player_notes_player on tryout_player_notes(player_id);

-- ----------------------------------------------------------------
-- TRYOUT_SESSIONS
-- A scheduled tryout event. Status: scheduled → open → closed.
-- Evaluators score players during "open" sessions.
-- ----------------------------------------------------------------
create table tryout_sessions (
  id           uuid primary key default gen_random_uuid(),
  season_id    uuid not null references tryout_seasons(id) on delete cascade,
  org_id       uuid not null references tryout_orgs(id) on delete cascade,
  age_group    text not null,
  session_date date not null,
  start_time   text,              -- "9:00 AM"
  end_time     text,
  field        text,
  label        text not null,     -- "Week 1 / Day 1"
  status       text not null default 'scheduled'
                 check (status in ('scheduled','open','closed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_tryout_sessions_season on tryout_sessions(season_id);
create index idx_tryout_sessions_org    on tryout_sessions(org_id, age_group);

-- ----------------------------------------------------------------
-- TRYOUT_SESSION_EVALUATORS
-- Which users are assigned to a session and at which station.
-- ----------------------------------------------------------------
create table tryout_session_evaluators (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references tryout_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id),
  name        text not null,
  station     text,               -- "Ground Balls", "Pitching", etc.
  unique (session_id, user_id)
);

-- ----------------------------------------------------------------
-- TRYOUT_SCORES
-- One row per player per evaluator per session.
-- Scores stored as JSON to support configurable categories.
-- ----------------------------------------------------------------
create table tryout_scores (
  id              uuid primary key default gen_random_uuid(),
  player_id       uuid not null references tryout_players(id) on delete cascade,
  session_id      uuid not null references tryout_sessions(id) on delete cascade,
  org_id          uuid not null references tryout_orgs(id) on delete cascade,
  evaluator_id    uuid not null references auth.users(id),
  evaluator_name  text not null,

  -- Shape: { "speed_60yd": 3.5, "gb_hands": 4, "gb_range": 3, ... }
  scores          jsonb not null default '{}',

  -- Computed rollups (recalculated after save)
  tryout_score    numeric(5,3),
  tryout_pitching numeric(5,3),
  tryout_catching numeric(5,3),

  comments        text,
  submitted_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  -- One score entry per evaluator per player per session
  unique (player_id, session_id, evaluator_id)
);

create index idx_tryout_scores_player  on tryout_scores(player_id);
create index idx_tryout_scores_session on tryout_scores(session_id);

-- ----------------------------------------------------------------
-- TRYOUT_COACH_EVALS
-- End-of-season coach evaluation per player.
-- Can be imported from spreadsheet OR entered directly via web form.
-- ----------------------------------------------------------------
create table tryout_coach_evals (
  id                  uuid primary key default gen_random_uuid(),
  player_id           uuid not null references tryout_players(id) on delete cascade,
  org_id              uuid not null references tryout_orgs(id) on delete cascade,
  season_year         text not null,       -- "2025" — season being evaluated
  season_id           uuid references tryout_seasons(id),
  team_label          text not null,       -- "10u Blue" (from the eval file)

  coach_user_id       uuid references auth.users(id),
  coach_name          text not null,

  -- Shape: { "fielding_ground_balls": 4, "throwing": 3, "coachability": 5, ... }
  scores              jsonb not null default '{}',

  -- Computed from scores
  coach_eval_score    numeric(5,3),
  coach_eval_rank     int,
  intangibles_score   numeric(5,3),
  intangibles_rank    int,

  comments            text,

  -- Workflow: draft → submitted → reviewed → finalized
  status              text not null default 'draft'
                        check (status in ('draft','submitted','reviewed','finalized')),
  submitted_at        timestamptz,
  reviewed_by         uuid references auth.users(id),
  reviewed_at         timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- One eval per player per season year
  unique (player_id, org_id, season_year)
);

create index idx_tryout_coach_evals_player on tryout_coach_evals(player_id);
create index idx_tryout_coach_evals_org    on tryout_coach_evals(org_id, season_year);

-- ----------------------------------------------------------------
-- TRYOUT_GC_STATS
-- GameChanger season stats per player per year.
-- ----------------------------------------------------------------
create table tryout_gc_stats (
  id            uuid primary key default gen_random_uuid(),
  player_id     uuid not null references tryout_players(id) on delete cascade,
  org_id        uuid not null references tryout_orgs(id) on delete cascade,
  season_year   text not null,
  team_label    text,
  source        text not null default 'gamechanger',

  -- Batting
  games_played  int,
  pa int, ab int,
  avg numeric(5,3), obp numeric(5,3), slg numeric(5,3), ops numeric(5,3),
  h int, doubles int, triples int, hr int, rbi int, r int,
  bb int, so int, sb int, sb_pct numeric(5,3),
  xbh int, qab int, qab_pct numeric(5,3),

  -- Pitching
  ip numeric(6,1), gs int, w int, l int, sv int,
  era numeric(6,2), whip numeric(5,3), strike_pct numeric(5,3),

  -- Fielding
  tc int, fpct numeric(5,3), errors int,

  raw_json      jsonb,
  created_at    timestamptz not null default now(),

  unique (player_id, org_id, season_year)
);

create index idx_tryout_gc_stats_org on tryout_gc_stats(org_id, season_year);

-- ----------------------------------------------------------------
-- TRYOUT_COMBINED_SCORES
-- One row per player per season. Recalculated on demand.
-- Stores the combined score used for rankings and team formation.
-- ----------------------------------------------------------------
create table tryout_combined_scores (
  id                  uuid primary key default gen_random_uuid(),
  player_id           uuid not null references tryout_players(id) on delete cascade,
  org_id              uuid not null references tryout_orgs(id) on delete cascade,
  season_id           uuid not null references tryout_seasons(id) on delete cascade,
  age_group           text not null,

  -- Component scores (normalized to 0–5 scale)
  tryout_score        numeric(5,3),
  coach_eval_score    numeric(5,3),
  intangibles_score   numeric(5,3),
  prior_stat_score    numeric(5,3),

  -- Weights snapshotted at calculation time
  tryout_weight       numeric(4,3) not null,
  coach_eval_weight   numeric(4,3) not null,
  intangibles_weight  numeric(4,3) not null,
  prior_stat_weight   numeric(4,3) not null,

  combined_score      numeric(5,3),
  combined_rank       int,

  -- Specialty scores
  pitching_score      numeric(5,3),
  catching_score      numeric(5,3),
  speed_score         numeric(5,3),
  hitting_score       numeric(5,3),

  admin_notes         text,
  locked_rank         boolean not null default false,

  calculated_at       timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  -- One combined score per player per season (not per player globally — spec bug fixed)
  unique (player_id, season_id)
);

create index idx_tryout_combined_org_season on tryout_combined_scores(org_id, season_id, age_group);

-- ----------------------------------------------------------------
-- TRYOUT_TEAMS
-- Teams created during team formation. Not the same as six43 teams
-- until finalized (when platform_team_id gets set).
-- ----------------------------------------------------------------
create table tryout_teams (
  id                uuid primary key default gen_random_uuid(),
  season_id         uuid not null references tryout_seasons(id) on delete cascade,
  org_id            uuid not null references tryout_orgs(id) on delete cascade,
  name              text not null,     -- "Blue", "White", "Gray"
  age_group         text not null,
  color             text,              -- "#1A56A0"
  coach_name        text,
  coach_user_id     uuid references auth.users(id),
  -- Set when this tryout team is finalized and pushed to the platform
  platform_team_id  uuid,             -- references teams(id) in main schema
  created_at        timestamptz not null default now()
);

create index idx_tryout_teams_season on tryout_teams(season_id, age_group);

-- ----------------------------------------------------------------
-- TRYOUT_TEAM_ASSIGNMENTS
-- Player → team assignments. History preserved; not deleted on reassign.
-- ----------------------------------------------------------------
create table tryout_team_assignments (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references tryout_players(id) on delete cascade,
  team_id     uuid not null references tryout_teams(id) on delete cascade,
  is_locked   boolean not null default false,
  is_coach_kid boolean not null default false,
  assigned_by text not null,          -- "auto"|"snake_draft"|"manual"|userId
  notes       text,
  assigned_at timestamptz not null default now(),
  -- A player can only be on one team per season (enforced via season via team)
  unique (player_id, team_id)
);

create index idx_tryout_team_assignments_player on tryout_team_assignments(player_id);
create index idx_tryout_team_assignments_team   on tryout_team_assignments(team_id);

-- ----------------------------------------------------------------
-- TRYOUT_IMPORT_JOBS
-- Tracks every file upload. Stores match results for review queue.
-- ----------------------------------------------------------------
create table tryout_import_jobs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references tryout_orgs(id) on delete cascade,
  season_id       uuid references tryout_seasons(id),
  imported_by     uuid not null references auth.users(id),
  type            text not null
                    check (type in ('registration','coach_eval','tryout_scores','gamechanger')),
  filename        text not null,
  status          text not null default 'pending'
                    check (status in ('pending','processing','needs_review','complete','error')),

  rows_total      int,
  rows_matched    int,       -- auto-matched at ≥0.90 confidence
  rows_suggested  int,       -- 0.70–0.89, needs 1-click confirm
  rows_unresolved int,       -- <0.70, manual selection required
  rows_created    int,       -- new players created

  -- Full match report stored as JSON for the review screen
  -- Shape: [{ rawName, resolvedPlayerId, confidence, status, candidates: [...] }]
  match_report    jsonb,

  error_log       text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create index idx_tryout_import_jobs_org on tryout_import_jobs(org_id);

-- Now add the FK from tryout_player_aliases → tryout_import_jobs
alter table tryout_player_aliases
  add constraint fk_alias_import_job
  foreign key (import_job_id) references tryout_import_jobs(id) on delete set null;

-- ----------------------------------------------------------------
-- TRYOUT_AUDIT_LOG
-- Immutable log of every significant action.
-- ----------------------------------------------------------------
create table tryout_audit_log (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references tryout_orgs(id) on delete cascade,
  actor_id    uuid not null references auth.users(id),
  actor_name  text not null,
  -- e.g. "player.merged", "team.assigned", "eval.submitted", "import.confirmed"
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  before_val  jsonb,
  after_val   jsonb,
  created_at  timestamptz not null default now()
);

create index idx_tryout_audit_org  on tryout_audit_log(org_id, created_at desc);
create index idx_tryout_audit_entity on tryout_audit_log(entity_type, entity_id);

-- ----------------------------------------------------------------
-- updated_at triggers (reuse the function from migration 001)
-- ----------------------------------------------------------------
create trigger trg_tryout_seasons_updated_at
  before update on tryout_seasons
  for each row execute function update_updated_at();

create trigger trg_tryout_players_updated_at
  before update on tryout_players
  for each row execute function update_updated_at();

create trigger trg_tryout_sessions_updated_at
  before update on tryout_sessions
  for each row execute function update_updated_at();

create trigger trg_tryout_scores_updated_at
  before update on tryout_scores
  for each row execute function update_updated_at();

create trigger trg_tryout_coach_evals_updated_at
  before update on tryout_coach_evals
  for each row execute function update_updated_at();

create trigger trg_tryout_combined_updated_at
  before update on tryout_combined_scores
  for each row execute function update_updated_at();
