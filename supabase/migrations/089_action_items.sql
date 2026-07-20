-- ============================================================
-- Six43 – Migration 089: Team Selection Action Items
-- ============================================================
-- Follow-up/decision tracker for the team-selection meeting
-- ("confirm Player X accepts", "if declined, contact Player Y",
-- "check with the board before finalizing").
--
-- player_id/team_id are direct FKs, not derived from
-- tryout_team_assignments, so reassigning or removing a player
-- never silently re-targets an existing action item.
--
-- parent_id supports simple lineage (one decision leading to a
-- follow-up) — no rule engine, the UI creates the child row
-- explicitly when a parent is resolved with a follow-up needed.
-- ============================================================

create table tryout_action_items (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references tryout_orgs(id) on delete cascade,
  season_id        uuid not null references tryout_seasons(id) on delete cascade,

  age_group        text not null,
  team_id          uuid references tryout_teams(id) on delete set null,
  player_id        uuid references tryout_players(id) on delete set null,

  title            text not null,
  details          text,
  status           text not null default 'open'
                     check (status in ('open','waiting','in_progress','blocked','completed','cancelled')),
  priority         text check (priority in ('low','normal','high')),
  due_date         date,

  -- Free-text owner: board members/coaches may not have a system account.
  owner_name       text,

  resolution_notes text,

  parent_id        uuid references tryout_action_items(id) on delete set null,

  created_by       uuid references auth.users(id),
  created_by_name  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz
);

create index idx_action_items_org    on tryout_action_items(org_id);
create index idx_action_items_season on tryout_action_items(season_id);
create index idx_action_items_team   on tryout_action_items(team_id);
create index idx_action_items_player on tryout_action_items(player_id);
create index idx_action_items_status on tryout_action_items(status);
create index idx_action_items_parent on tryout_action_items(parent_id);

create trigger trg_action_items_updated_at
  before update on tryout_action_items
  for each row execute function update_updated_at();

alter table tryout_action_items enable row level security;

create policy "tryout_action_items: staff can read"
  on tryout_action_items for select
  using (tryout_is_member(org_id, array['org_admin','head_coach']));

create policy "tryout_action_items: staff can insert"
  on tryout_action_items for insert
  with check (tryout_is_member(org_id, array['org_admin','head_coach']));

create policy "tryout_action_items: staff can update"
  on tryout_action_items for update
  using (tryout_is_member(org_id, array['org_admin','head_coach']));

-- No delete policy: completed/cancelled items are never hard-deleted by
-- normal app use — they remain available for historical reference.
