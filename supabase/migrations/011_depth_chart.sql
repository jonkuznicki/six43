-- Depth chart: player rankings by position
create table if not exists depth_chart (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references seasons(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  position    text not null,
  depth_order int  not null default 99,
  restricted  boolean not null default false,
  created_at  timestamptz default now(),
  unique (season_id, player_id, position)
);

-- RLS
alter table depth_chart enable row level security;

create policy "depth_chart_select" on depth_chart for select
  using (
    exists (
      select 1 from seasons s
      join teams t on t.id = s.team_id
      where s.id = depth_chart.season_id
        and t.user_id = auth.uid()
    )
  );

create policy "depth_chart_insert" on depth_chart for insert
  with check (
    exists (
      select 1 from seasons s
      join teams t on t.id = s.team_id
      where s.id = depth_chart.season_id
        and t.user_id = auth.uid()
    )
  );

create policy "depth_chart_update" on depth_chart for update
  using (
    exists (
      select 1 from seasons s
      join teams t on t.id = s.team_id
      where s.id = depth_chart.season_id
        and t.user_id = auth.uid()
    )
  );

create policy "depth_chart_delete" on depth_chart for delete
  using (
    exists (
      select 1 from seasons s
      join teams t on t.id = s.team_id
      where s.id = depth_chart.season_id
        and t.user_id = auth.uid()
    )
  );
