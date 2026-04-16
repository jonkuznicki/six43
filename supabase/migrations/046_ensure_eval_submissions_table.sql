-- Idempotent fix: ensure tryout_coach_eval_submissions exists.
-- Migration 040 may not have applied cleanly on some environments.

create table if not exists tryout_coach_eval_submissions (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null,
  season_year   text        not null,
  team_label    text        not null,
  coach_name    text,
  overall_notes text,
  contact_email text,
  submitted_at  timestamptz not null default now(),
  unique (org_id, season_year, team_label)
);

alter table tryout_coach_eval_submissions enable row level security;

-- Drop existing policy before recreating (idempotent)
drop policy if exists "eval_submissions_member" on tryout_coach_eval_submissions;

create policy "eval_submissions_member" on tryout_coach_eval_submissions
  for all using (tryout_is_member(org_id, array['org_admin', 'head_coach']));

-- Also allow anon/authenticated to insert (for public eval form submissions)
drop policy if exists "eval_submissions_insert_anon" on tryout_coach_eval_submissions;

create policy "eval_submissions_insert_anon" on tryout_coach_eval_submissions
  for insert with check (true);
