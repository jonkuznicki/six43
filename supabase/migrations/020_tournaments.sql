-- ============================================================
-- Six43 – Migration 020: Tournaments
-- ============================================================

-- Tournament event (wraps a group of games over a weekend)
create table tournaments (
  id         uuid primary key default gen_random_uuid(),
  season_id  uuid not null references seasons(id) on delete cascade,
  name       text not null,
  start_date date not null,
  end_date   date not null,
  notes      text,
  created_at timestamptz not null default now()
);

create index idx_tournaments_season on tournaments(season_id);

-- Add tournament columns to games
alter table games
  add column if not exists tournament_id  uuid references tournaments(id) on delete set null,
  add column if not exists is_placeholder boolean not null default false,
  add column if not exists game_type      text check (game_type in ('pool_play', 'bracket'));

create index idx_games_tournament on games(tournament_id) where tournament_id is not null;

-- RLS
alter table tournaments enable row level security;

create policy "users manage their tournaments"
  on tournaments for all
  using (
    season_id in (
      select s.id from seasons s
      join teams t on t.id = s.team_id
      where t.user_id = auth.uid()
    )
  )
  with check (
    season_id in (
      select s.id from seasons s
      join teams t on t.id = s.team_id
      where t.user_id = auth.uid()
    )
  );
