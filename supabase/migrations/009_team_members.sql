-- ============================================================
-- Six43 – Migration 009: Team members / assistant coaches
-- Allows a team owner to invite additional coaches by link.
-- ============================================================

-- ----------------------------------------------------------------
-- TEAM MEMBERS
-- One row per membership. Pending invites have user_id = null.
-- owner_user_id: denormalized owner reference to avoid RLS recursion
--   between teams and team_members policies.
-- ----------------------------------------------------------------
create table if not exists team_members (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references teams(id) on delete cascade,
  user_id        uuid references auth.users(id) on delete cascade,
  owner_user_id  uuid references auth.users(id),
  role           text not null default 'coach' check (role in ('owner','coach')),
  invite_email   text,
  invite_token   text unique not null default gen_random_uuid()::text,
  accepted_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists idx_team_members_team   on team_members(team_id);
create index if not exists idx_team_members_user   on team_members(user_id) where user_id is not null;
create index if not exists idx_team_members_token  on team_members(invite_token);

-- RLS
alter table team_members enable row level security;

-- Owner can manage all rows for their teams (no teams join — avoids recursion)
-- Member can see/update their own accepted row
create policy "team member self or owner"
  on team_members for all
  using  (owner_user_id = auth.uid() or user_id = auth.uid())
  with check (owner_user_id = auth.uid());

-- ----------------------------------------------------------------
-- Update RLS policies to grant team members the same data access.
-- Uses inline subqueries (same pattern as original migration 003)
-- to avoid SECURITY DEFINER function permission issues.
-- ----------------------------------------------------------------

-- TEAMS ---------------------------------------------------------
drop policy if exists "users manage their own teams" on teams;

-- Owner: full control
create policy "team owner full access"
  on teams for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Member: read-only on accepted teams
-- Safe: team_members policy no longer references teams
create policy "team member read access"
  on teams for select
  using (
    id in (
      select team_id from team_members
      where user_id = auth.uid() and accepted_at is not null
    )
  );

-- PLAYERS --------------------------------------------------------
drop policy if exists "users manage players on their teams" on players;

create policy "team access players" on players for all
  using (
    team_id in (select id from teams where user_id = auth.uid())
    or team_id in (select team_id from team_members where user_id = auth.uid() and accepted_at is not null)
  )
  with check (
    team_id in (select id from teams where user_id = auth.uid())
    or team_id in (select team_id from team_members where user_id = auth.uid() and accepted_at is not null)
  );

-- SEASONS --------------------------------------------------------
drop policy if exists "users manage their seasons" on seasons;

create policy "team access seasons" on seasons for all
  using (
    team_id in (select id from teams where user_id = auth.uid())
    or team_id in (select team_id from team_members where user_id = auth.uid() and accepted_at is not null)
  )
  with check (
    team_id in (select id from teams where user_id = auth.uid())
    or team_id in (select team_id from team_members where user_id = auth.uid() and accepted_at is not null)
  );

-- GAMES ----------------------------------------------------------
drop policy if exists "users manage their games" on games;

create policy "team access games" on games for all
  using (
    season_id in (
      select s.id from seasons s
      inner join teams t on t.id = s.team_id
      where t.user_id = auth.uid()
    )
    or season_id in (
      select s.id from seasons s
      inner join team_members tm on tm.team_id = s.team_id
      where tm.user_id = auth.uid() and tm.accepted_at is not null
    )
  )
  with check (
    season_id in (
      select s.id from seasons s
      inner join teams t on t.id = s.team_id
      where t.user_id = auth.uid()
    )
    or season_id in (
      select s.id from seasons s
      inner join team_members tm on tm.team_id = s.team_id
      where tm.user_id = auth.uid() and tm.accepted_at is not null
    )
  );

-- LINEUP SLOTS ---------------------------------------------------
drop policy if exists "users manage their lineup slots" on lineup_slots;

create policy "team access lineup slots" on lineup_slots for all
  using (
    game_id in (
      select g.id from games g
      inner join seasons s on s.id = g.season_id
      inner join teams t on t.id = s.team_id
      where t.user_id = auth.uid()
    )
    or game_id in (
      select g.id from games g
      inner join seasons s on s.id = g.season_id
      inner join team_members tm on tm.team_id = s.team_id
      where tm.user_id = auth.uid() and tm.accepted_at is not null
    )
  )
  with check (
    game_id in (
      select g.id from games g
      inner join seasons s on s.id = g.season_id
      inner join teams t on t.id = s.team_id
      where t.user_id = auth.uid()
    )
    or game_id in (
      select g.id from games g
      inner join seasons s on s.id = g.season_id
      inner join team_members tm on tm.team_id = s.team_id
      where tm.user_id = auth.uid() and tm.accepted_at is not null
    )
  );

-- PITCHER PLANS --------------------------------------------------
drop policy if exists "users manage their pitcher plans" on pitcher_plans;

create policy "team access pitcher plans" on pitcher_plans for all
  using (
    game_id in (
      select g.id from games g
      inner join seasons s on s.id = g.season_id
      inner join teams t on t.id = s.team_id
      where t.user_id = auth.uid()
    )
    or game_id in (
      select g.id from games g
      inner join seasons s on s.id = g.season_id
      inner join team_members tm on tm.team_id = s.team_id
      where tm.user_id = auth.uid() and tm.accepted_at is not null
    )
  )
  with check (
    game_id in (
      select g.id from games g
      inner join seasons s on s.id = g.season_id
      inner join teams t on t.id = s.team_id
      where t.user_id = auth.uid()
    )
    or game_id in (
      select g.id from games g
      inner join seasons s on s.id = g.season_id
      inner join team_members tm on tm.team_id = s.team_id
      where tm.user_id = auth.uid() and tm.accepted_at is not null
    )
  );
