-- GC stat scoring config: per-org, per-season, per-age-group weights.
-- Also adds gc_computed_score to tryout_gc_stats.

alter table tryout_gc_stats
  add column if not exists gc_computed_score numeric(4,2);

-- ── Config table ──────────────────────────────────────────────────────────────

create table if not exists tryout_gc_scoring_config (
  id         uuid    primary key default gen_random_uuid(),
  org_id     uuid    not null references tryout_orgs(id)    on delete cascade,
  season_id  uuid    not null references tryout_seasons(id) on delete cascade,
  age_group  text    not null,
  stat_key   text    not null,
  included   boolean not null default true,
  weight     numeric(4,1) not null default 1.0,
  unique (org_id, season_id, age_group, stat_key)
);

alter table tryout_gc_scoring_config enable row level security;

drop policy if exists "gc_scoring_config_admin" on tryout_gc_scoring_config;
create policy "gc_scoring_config_admin" on tryout_gc_scoring_config
  for all using (
    tryout_is_member(org_id, array['org_admin','head_coach'])
    or exists (select 1 from tryout_orgs where id = org_id and admin_user_id = auth.uid())
  );

grant select, insert, update, delete on tryout_gc_scoring_config to authenticated;
