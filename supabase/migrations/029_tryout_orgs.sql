-- ============================================================
-- Six43 – Migration 029: Tryout module – orgs and members
-- ============================================================
-- Adds the Organization layer that was always planned ("Phase 2"
-- comment in migration 001). Scoped to the tryout module for now.
-- All tryout tables are prefixed with tryout_ to namespace them.
-- ============================================================

-- ----------------------------------------------------------------
-- TRYOUT_ORGS
-- A sports organization that runs tryouts. Hudson Baseball is
-- org #1. Multiple six43 users (coaches) can belong to one org.
-- ----------------------------------------------------------------
create table tryout_orgs (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  sport         text not null default 'baseball',
  -- URL-friendly slug: "hudson-baseball"
  slug          text unique,
  -- admin_user_id is the Supabase Auth user who created/owns this org
  admin_user_id uuid not null references auth.users(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_tryout_orgs_admin on tryout_orgs(admin_user_id);

-- ----------------------------------------------------------------
-- TRYOUT_ORG_MEMBERS
-- Roles within an org. admin_user_id on tryout_orgs is always
-- an implicit org_admin. This table handles all other members.
--
-- Roles:
--   org_admin  – full access
--   head_coach – enters their team's season evals, views rankings
--   evaluator  – scores players during live tryout sessions only
-- ----------------------------------------------------------------
create table tryout_org_members (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references tryout_orgs(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  -- email stored separately so invites work before the user signs up
  email       text not null,
  name        text,
  role        text not null default 'evaluator'
                check (role in ('org_admin','head_coach','evaluator')),
  invited_by  uuid references auth.users(id),
  invited_at  timestamptz not null default now(),
  accepted_at timestamptz,
  is_active   boolean not null default true,
  unique (org_id, email)
);

create index idx_tryout_org_members_org  on tryout_org_members(org_id);
create index idx_tryout_org_members_user on tryout_org_members(user_id);

-- ----------------------------------------------------------------
-- Helper: is_org_member(org_id, min_role)
-- Used in RLS policies so they stay readable.
-- ----------------------------------------------------------------
create or replace function tryout_is_member(
  p_org_id  uuid,
  p_roles   text[]   -- array of acceptable roles, e.g. '{org_admin,head_coach}'
) returns boolean
language sql stable security definer as $$
  select exists (
    select 1 from tryout_org_members
    where org_id   = p_org_id
      and user_id  = auth.uid()
      and role     = any(p_roles)
      and is_active = true
  )
  or exists (
    -- org creator is always org_admin even without a member row
    select 1 from tryout_orgs
    where id            = p_org_id
      and admin_user_id = auth.uid()
  );
$$;

-- ----------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------
alter table tryout_orgs        enable row level security;
alter table tryout_org_members enable row level security;

-- Any authenticated user can read orgs they belong to
create policy "tryout_orgs: members can read"
  on tryout_orgs for select
  using (
    admin_user_id = auth.uid()
    or tryout_is_member(id, array['org_admin','head_coach','evaluator'])
  );

-- Only the org creator can update
create policy "tryout_orgs: admin can update"
  on tryout_orgs for update
  using (admin_user_id = auth.uid())
  with check (admin_user_id = auth.uid());

-- Any auth user can insert (creates their own org)
create policy "tryout_orgs: anyone can create"
  on tryout_orgs for insert
  with check (admin_user_id = auth.uid());

-- Org members: org_admin can manage
create policy "tryout_org_members: admin can manage"
  on tryout_org_members for all
  using  (tryout_is_member(org_id, array['org_admin']))
  with check (tryout_is_member(org_id, array['org_admin']));

-- Members can read their own row (to know their own role)
create policy "tryout_org_members: self read"
  on tryout_org_members for select
  using (user_id = auth.uid());
