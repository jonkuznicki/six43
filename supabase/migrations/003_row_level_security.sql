-- ============================================================
-- Six43 – Migration 003: Row Level Security (RLS)
-- ============================================================
-- RLS means every database query automatically filters to only
-- the logged-in user's data. It's not optional — without this,
-- Coach A could accidentally see Coach B's roster.
--
-- Pattern: users own teams → teams own everything else.
-- So every table checks: does this row belong to a team
-- that belongs to the currently logged-in user?
-- ============================================================

-- Enable RLS on every table
alter table teams          enable row level security;
alter table players        enable row level security;
alter table seasons        enable row level security;
alter table games          enable row level security;
alter table lineup_slots   enable row level security;
alter table pitcher_plans  enable row level security;

-- ----------------------------------------------------------------
-- TEAMS: user owns the team directly
-- ----------------------------------------------------------------
create policy "users manage their own teams"
  on teams for all
  using  (auth.uid() = user_id)       -- can read rows where user_id matches
  with check (auth.uid() = user_id);  -- can only write their own user_id

-- ----------------------------------------------------------------
-- PLAYERS: access via team ownership
-- ----------------------------------------------------------------
create policy "users manage players on their teams"
  on players for all
  using (
    team_id in (
      select id from teams where user_id = auth.uid()
    )
  )
  with check (
    team_id in (
      select id from teams where user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- SEASONS: access via team ownership
-- ----------------------------------------------------------------
create policy "users manage their seasons"
  on seasons for all
  using (
    team_id in (
      select id from teams where user_id = auth.uid()
    )
  )
  with check (
    team_id in (
      select id from teams where user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- GAMES: access via season → team ownership
-- ----------------------------------------------------------------
create policy "users manage their games"
  on games for all
  using (
    season_id in (
      select s.id from seasons s
      inner join teams t on t.id = s.team_id
      where t.user_id = auth.uid()
    )
  )
  with check (
    season_id in (
      select s.id from seasons s
      inner join teams t on t.id = s.team_id
      where t.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- LINEUP SLOTS: access via game → season → team ownership
-- ----------------------------------------------------------------
create policy "users manage their lineup slots"
  on lineup_slots for all
  using (
    game_id in (
      select g.id from games g
      inner join seasons s on s.id = g.season_id
      inner join teams t   on t.id = s.team_id
      where t.user_id = auth.uid()
    )
  )
  with check (
    game_id in (
      select g.id from games g
      inner join seasons s on s.id = g.season_id
      inner join teams t   on t.id = s.team_id
      where t.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------
-- PITCHER PLANS: access via game → season → team ownership
-- ----------------------------------------------------------------
create policy "users manage their pitcher plans"
  on pitcher_plans for all
  using (
    game_id in (
      select g.id from games g
      inner join seasons s on s.id = g.season_id
      inner join teams t   on t.id = s.team_id
      where t.user_id = auth.uid()
    )
  )
  with check (
    game_id in (
      select g.id from games g
      inner join seasons s on s.id = g.season_id
      inner join teams t   on t.id = s.team_id
      where t.user_id = auth.uid()
    )
  );
