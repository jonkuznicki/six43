-- User plan tracking (free / pro)
-- No row = free plan (default).
-- Rows are inserted/updated by admin via service role only.

create table if not exists user_plans (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  plan       text not null default 'free' check (plan in ('free', 'pro')),
  updated_at timestamptz not null default now(),
  notes      text   -- optional: why this person got pro, e.g. "beta tester"
);

-- RLS: users can only read their own row; no client writes
alter table user_plans enable row level security;

create policy "user_plans_select_own" on user_plans
  for select using (user_id = auth.uid());
