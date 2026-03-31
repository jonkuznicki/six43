-- ============================================================
-- Six43 – Migration 001: Core tables
-- Run this first. Creates everything the app needs to function.
-- ============================================================

-- ----------------------------------------------------------------
-- TEAMS
-- One team per account for MVP. Organizations come in Phase 2.
-- ----------------------------------------------------------------
create table teams (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  age_group     text,                        -- e.g. "12U", "Varsity"
  -- Ordered list of valid positions for this team.
  -- Default: ["P","C","1B","2B","SS","3B","LF","CF","RF","Bench"]
  positions     text[] not null default array['P','C','1B','2B','SS','3B','LF','CF','RF','Bench'],
  created_at    timestamptz not null default now()
);

-- Every query on teams will filter by the logged-in user.
create index idx_teams_user on teams(user_id);

-- ----------------------------------------------------------------
-- PLAYERS
-- Belongs to a team. UUID primary key — never use jersey_number
-- as a key anywhere in the app. Jersey numbers can change.
-- ----------------------------------------------------------------
create table players (
  id                   uuid primary key default gen_random_uuid(),
  team_id              uuid not null references teams(id) on delete cascade,
  first_name           text not null,
  last_name            text not null,
  jersey_number        smallint not null,
  primary_position     text,
  secondary_positions  text[] default '{}',
  throws               char(1) check (throws in ('R','L','S')),  -- R/L/Switch
  bats                 char(1) check (bats   in ('R','L','S')),
  -- active = playing this season
  -- inactive = on roster but not available
  -- injured = injured, flag for fairness reporting
  status               text not null default 'active'
                         check (status in ('active','inactive','injured')),
  batting_pref_order   smallint,             -- soft default batting slot
  notes                text,
  created_at           timestamptz not null default now(),
  -- No two active players on the same team share a jersey number.
  -- Inactive players can hold a retired number without conflict.
  unique (team_id, jersey_number)
);

create index idx_players_team on players(team_id, status);

-- ----------------------------------------------------------------
-- SEASONS
-- A team can have multiple seasons (Spring 2025, Fall 2025, etc.)
-- Stats are always scoped to a single season.
-- ----------------------------------------------------------------
create table seasons (
  id                uuid primary key default gen_random_uuid(),
  team_id           uuid not null references teams(id) on delete cascade,
  name              text not null,           -- "Fall 2025"
  start_date        date,
  end_date          date,
  innings_per_game  smallint not null default 6,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now()
);

create index idx_seasons_team on seasons(team_id);

-- ----------------------------------------------------------------
-- GAMES
-- One row per game. Status drives whether stats are counted.
-- Only 'final' games feed into season_position_stats.
-- ----------------------------------------------------------------
create table games (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid not null references seasons(id) on delete cascade,
  game_number   smallint,
  opponent      text not null,
  game_date     date not null,
  game_time     time,
  location      text check (location in ('Home','Away','Neutral')),
  -- scheduled → in_progress → final
  status        text not null default 'scheduled'
                  check (status in ('scheduled','in_progress','final')),
  innings_played smallint,                  -- actual innings at end of game
  notes         text,
  created_at    timestamptz not null default now()
);

create index idx_games_season on games(season_id, game_date);

-- ----------------------------------------------------------------
-- LINEUP SLOTS
-- The heart of the app. One row per player per game.
--
-- inning_positions: array of 9 slots, index 0 = inning 1.
--   Each slot holds a position string: 'P','C','1B', etc.
--   null = player didn't play that inning (late arrival, short game).
--
-- planned_positions: copy of inning_positions taken when the
--   pre-game lineup is first saved. Never overwritten after that.
--   This gives us the "plan vs actual" audit trail.
--
-- availability: game-day status. Does not change season-level
--   player.status — this is game-specific.
-- ----------------------------------------------------------------
create table lineup_slots (
  id                uuid primary key default gen_random_uuid(),
  game_id           uuid not null references games(id) on delete cascade,
  player_id         uuid not null references players(id) on delete cascade,
  batting_order     smallint,
  -- 9-element array. Use null for unused innings (e.g. 6-inning game
  -- leaves indexes 6,7,8 as null).
  inning_positions  text[] not null default array[null,null,null,null,null,null,null,null,null]::text[],
  -- Snapshot of plan before any in-game edits.
  -- Set once when coach first saves lineup. Never updated after.
  planned_positions text[] default null,
  availability      text not null default 'available'
                      check (availability in ('available','absent','late','injured')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  -- One slot per player per game.
  unique (game_id, player_id)
);

create index idx_lineup_slots_game   on lineup_slots(game_id);
create index idx_lineup_slots_player on lineup_slots(player_id);

-- Auto-update updated_at on any row change.
create or replace function update_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_lineup_slots_updated_at
  before update on lineup_slots
  for each row execute function update_updated_at();

-- ----------------------------------------------------------------
-- PITCHER PLANS
-- Season-level pitching schedule. Separate from inning_positions
-- because a coach plans pitchers differently (P1, P2, P3, P4).
-- ----------------------------------------------------------------
create table pitcher_plans (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references games(id) on delete cascade,
  player_id     uuid not null references players(id) on delete cascade,
  pitcher_slot  smallint not null check (pitcher_slot between 1 and 4),
  -- true = pre-game plan, false = what actually happened
  is_planned    boolean not null default true,
  notes         text,                        -- "3 innings max", "rest day"
  created_at    timestamptz not null default now(),
  unique (game_id, pitcher_slot, is_planned)
);

create index idx_pitcher_plans_game on pitcher_plans(game_id);
