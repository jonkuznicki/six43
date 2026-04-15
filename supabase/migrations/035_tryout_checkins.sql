-- Migration 035: Check-ins, session config, schema fixes

-- ── tryout_checkins ───────────────────────────────────────────────────────────
-- One row per player (or write-in) per session. Holds the tryout_number that
-- appears on printed roster sheets and the evaluator's digital form.

create table tryout_checkins (
  id                    uuid primary key default gen_random_uuid(),
  session_id            uuid not null references tryout_sessions(id) on delete cascade,
  player_id             uuid references tryout_players(id) on delete set null,
  tryout_number         int  not null,

  -- Write-in: player arrived but isn't in the system yet
  is_write_in           boolean not null default false,
  write_in_name         text,
  write_in_age_group    text,

  checked_in_at         timestamptz not null default now(),
  checked_in_by         uuid references auth.users(id),

  -- Admin resolves write-ins to a real player record after the session
  resolved_to_player_id uuid references tryout_players(id) on delete set null,
  resolved_at           timestamptz,

  unique (session_id, tryout_number)
);

create index idx_tryout_checkins_session on tryout_checkins(session_id);
create index idx_tryout_checkins_player  on tryout_checkins(player_id);

-- ── tryout_sessions additions ─────────────────────────────────────────────────
alter table tryout_sessions
  add column if not exists numbering_method text not null default 'checkin_order'
    check (numbering_method in ('checkin_order', 'alphabetical')),
  add column if not exists min_score_pct    numeric(4,3) not null default 0.90;

-- ── Fix tryout_session_evaluators ────────────────────────────────────────────
-- Original schema had user_id NOT NULL and was missing member_id/email/org_id.
-- The UI inserts member_id+email+org_id so those columns need to exist.
alter table tryout_session_evaluators
  alter column user_id drop not null,
  add column if not exists member_id uuid references tryout_org_members(id) on delete set null,
  add column if not exists email     text,
  add column if not exists org_id    uuid references tryout_orgs(id) on delete cascade,
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by uuid references auth.users(id);

-- ── tryout_scores additions ───────────────────────────────────────────────────
-- Admin can lock an evaluator's scores to prevent accidental overwrites.
alter table tryout_scores
  add column if not exists locked_at timestamptz,
  add column if not exists locked_by uuid references auth.users(id);

-- ── Coach-team association ────────────────────────────────────────────────────
alter table tryout_org_members
  add column if not exists team_id uuid references tryout_teams(id) on delete set null;

-- ── GC import → team link ─────────────────────────────────────────────────────
alter table tryout_import_jobs
  add column if not exists team_id uuid references tryout_teams(id) on delete set null;

-- ── RLS for tryout_checkins ───────────────────────────────────────────────────
alter table tryout_checkins enable row level security;

create policy "tryout_checkins_member_read"
  on tryout_checkins for select
  using (
    exists (
      select 1 from tryout_sessions s
      join tryout_org_members m on m.org_id = s.org_id
      where s.id = tryout_checkins.session_id
        and m.user_id = auth.uid()
        and m.is_active = true
    )
  );

create policy "tryout_checkins_admin_write"
  on tryout_checkins for all
  using (
    exists (
      select 1 from tryout_sessions s
      join tryout_org_members m on m.org_id = s.org_id
      where s.id = tryout_checkins.session_id
        and m.user_id = auth.uid()
        and m.is_active = true
        and m.role = 'org_admin'
    )
  );
