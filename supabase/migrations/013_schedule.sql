-- ============================================================
-- Six43 – Migration 013: Schedule / Field Availability
-- ============================================================

-- ----------------------------------------------------------------
-- PROFILES
-- User-level settings. One row per auth user.
-- beta_features gates experimental pages like /schedule.
-- ----------------------------------------------------------------
create table if not exists profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  beta_features boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table profiles enable row level security;

-- Users can read their own profile
create policy "profiles_select_own" on profiles
  for select using (user_id = auth.uid());

-- Users can insert their own profile (first-time setup)
create policy "profiles_insert_own" on profiles
  for insert with check (user_id = auth.uid());

-- No client-side updates — beta_features is set by admin via service role

-- Auto-create a profile row whenever a new user signs up
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ----------------------------------------------------------------
-- SCHEDULE ENTRIES
-- One row per date per season. Stores availability status + note.
-- ----------------------------------------------------------------
create table schedule_entries (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references seasons(id) on delete cascade,
  date        date not null,
  status      text not null check (status in (
                'available','preferred','blocked','tournament','game_scheduled'
              )),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (season_id, date)
);

alter table schedule_entries enable row level security;

create policy "schedule_entries_all" on schedule_entries for all
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

-- ----------------------------------------------------------------
-- SCHEDULE MONTHS
-- Tracks which months are "active" (shown in print / summary).
-- One row per season per year-month combination.
-- ----------------------------------------------------------------
create table schedule_months (
  id        uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  year      smallint not null,
  month     smallint not null check (month between 1 and 12),
  active    boolean not null default false,
  unique (season_id, year, month)
);

alter table schedule_months enable row level security;

create policy "schedule_months_all" on schedule_months for all
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
