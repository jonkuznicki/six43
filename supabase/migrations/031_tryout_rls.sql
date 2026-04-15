-- ============================================================
-- Six43 – Migration 031: Tryout module – Row Level Security
-- ============================================================
-- Pattern: org membership (via tryout_is_member()) gates all access.
-- org_admin → full access within org
-- head_coach → read most things, write their own evals
-- evaluator  → read session player list, write their own scores
-- ============================================================

-- Enable RLS on every tryout table
alter table tryout_seasons             enable row level security;
alter table tryout_scoring_config      enable row level security;
alter table tryout_coach_eval_config   enable row level security;
alter table tryout_players             enable row level security;
alter table tryout_player_aliases      enable row level security;
alter table tryout_player_notes        enable row level security;
alter table tryout_sessions            enable row level security;
alter table tryout_session_evaluators  enable row level security;
alter table tryout_scores              enable row level security;
alter table tryout_coach_evals         enable row level security;
alter table tryout_gc_stats            enable row level security;
alter table tryout_combined_scores     enable row level security;
alter table tryout_teams               enable row level security;
alter table tryout_team_assignments    enable row level security;
alter table tryout_import_jobs         enable row level security;
alter table tryout_audit_log           enable row level security;

-- ----------------------------------------------------------------
-- Helper aliases for readable policies
-- ----------------------------------------------------------------
-- org_admin: tryout_is_member(org_id, '{org_admin}')
-- staff:     tryout_is_member(org_id, '{org_admin,head_coach}')
-- any_member:tryout_is_member(org_id, '{org_admin,head_coach,evaluator}')

-- ----------------------------------------------------------------
-- TRYOUT_SEASONS
-- ----------------------------------------------------------------
create policy "tryout_seasons: any member can read"
  on tryout_seasons for select
  using (tryout_is_member(org_id, array['org_admin','head_coach','evaluator']));

create policy "tryout_seasons: admin can write"
  on tryout_seasons for insert
  with check (tryout_is_member(org_id, array['org_admin']));

create policy "tryout_seasons: admin can update"
  on tryout_seasons for update
  using  (tryout_is_member(org_id, array['org_admin']))
  with check (tryout_is_member(org_id, array['org_admin']));

-- ----------------------------------------------------------------
-- TRYOUT_SCORING_CONFIG / TRYOUT_COACH_EVAL_CONFIG
-- ----------------------------------------------------------------
create policy "tryout_scoring_config: any member can read"
  on tryout_scoring_config for select
  using (
    season_id in (
      select id from tryout_seasons where
        tryout_is_member(org_id, array['org_admin','head_coach','evaluator'])
    )
  );

create policy "tryout_scoring_config: admin can write"
  on tryout_scoring_config for all
  using (
    season_id in (
      select id from tryout_seasons where
        tryout_is_member(org_id, array['org_admin'])
    )
  )
  with check (
    season_id in (
      select id from tryout_seasons where
        tryout_is_member(org_id, array['org_admin'])
    )
  );

create policy "tryout_coach_eval_config: any member can read"
  on tryout_coach_eval_config for select
  using (tryout_is_member(org_id, array['org_admin','head_coach','evaluator']));

create policy "tryout_coach_eval_config: admin can write"
  on tryout_coach_eval_config for all
  using  (tryout_is_member(org_id, array['org_admin']))
  with check (tryout_is_member(org_id, array['org_admin']));

-- ----------------------------------------------------------------
-- TRYOUT_PLAYERS
-- ----------------------------------------------------------------
create policy "tryout_players: staff can read"
  on tryout_players for select
  using (tryout_is_member(org_id, array['org_admin','head_coach','evaluator']));

create policy "tryout_players: admin can write"
  on tryout_players for insert
  with check (tryout_is_member(org_id, array['org_admin']));

create policy "tryout_players: admin can update"
  on tryout_players for update
  using  (tryout_is_member(org_id, array['org_admin']))
  with check (tryout_is_member(org_id, array['org_admin']));

-- Never hard-delete players — but if admin does, allow it
create policy "tryout_players: admin can delete"
  on tryout_players for delete
  using (tryout_is_member(org_id, array['org_admin']));

-- ----------------------------------------------------------------
-- TRYOUT_PLAYER_ALIASES
-- ----------------------------------------------------------------
create policy "tryout_player_aliases: staff can read"
  on tryout_player_aliases for select
  using (
    player_id in (
      select id from tryout_players where
        tryout_is_member(org_id, array['org_admin','head_coach'])
    )
  );

create policy "tryout_player_aliases: admin can write"
  on tryout_player_aliases for all
  using (
    player_id in (
      select id from tryout_players where
        tryout_is_member(org_id, array['org_admin'])
    )
  )
  with check (
    player_id in (
      select id from tryout_players where
        tryout_is_member(org_id, array['org_admin'])
    )
  );

-- ----------------------------------------------------------------
-- TRYOUT_PLAYER_NOTES
-- ----------------------------------------------------------------
create policy "tryout_player_notes: staff can read"
  on tryout_player_notes for select
  using (tryout_is_member(org_id, array['org_admin','head_coach']));

create policy "tryout_player_notes: staff can write"
  on tryout_player_notes for insert
  with check (tryout_is_member(org_id, array['org_admin','head_coach']));

create policy "tryout_player_notes: author can update/delete"
  on tryout_player_notes for update
  using (author_id = auth.uid());

-- ----------------------------------------------------------------
-- TRYOUT_SESSIONS + SESSION_EVALUATORS
-- ----------------------------------------------------------------
create policy "tryout_sessions: any member can read"
  on tryout_sessions for select
  using (tryout_is_member(org_id, array['org_admin','head_coach','evaluator']));

create policy "tryout_sessions: admin can write"
  on tryout_sessions for all
  using  (tryout_is_member(org_id, array['org_admin']))
  with check (tryout_is_member(org_id, array['org_admin']));

create policy "tryout_session_evaluators: assigned evaluator can read"
  on tryout_session_evaluators for select
  using (
    user_id = auth.uid()
    or session_id in (
      select id from tryout_sessions where
        tryout_is_member(org_id, array['org_admin','head_coach'])
    )
  );

create policy "tryout_session_evaluators: admin can write"
  on tryout_session_evaluators for all
  using (
    session_id in (
      select id from tryout_sessions where
        tryout_is_member(org_id, array['org_admin'])
    )
  )
  with check (
    session_id in (
      select id from tryout_sessions where
        tryout_is_member(org_id, array['org_admin'])
    )
  );

-- ----------------------------------------------------------------
-- TRYOUT_SCORES
-- ----------------------------------------------------------------
create policy "tryout_scores: evaluator can read own scores"
  on tryout_scores for select
  using (
    evaluator_id = auth.uid()
    or tryout_is_member(org_id, array['org_admin','head_coach'])
  );

create policy "tryout_scores: evaluator can insert their own"
  on tryout_scores for insert
  with check (
    evaluator_id = auth.uid()
    and tryout_is_member(org_id, array['org_admin','head_coach','evaluator'])
  );

create policy "tryout_scores: evaluator can update their own"
  on tryout_scores for update
  using  (evaluator_id = auth.uid())
  with check (evaluator_id = auth.uid());

-- ----------------------------------------------------------------
-- TRYOUT_COACH_EVALS
-- ----------------------------------------------------------------
create policy "tryout_coach_evals: staff can read"
  on tryout_coach_evals for select
  using (tryout_is_member(org_id, array['org_admin','head_coach']));

create policy "tryout_coach_evals: coach can insert their own"
  on tryout_coach_evals for insert
  with check (
    tryout_is_member(org_id, array['org_admin','head_coach'])
  );

create policy "tryout_coach_evals: coach can update drafts"
  on tryout_coach_evals for update
  using (
    -- Coach can only update their own, non-finalized evals
    (coach_user_id = auth.uid() and status in ('draft','submitted'))
    or tryout_is_member(org_id, array['org_admin'])
  );

-- ----------------------------------------------------------------
-- TRYOUT_GC_STATS / COMBINED_SCORES
-- ----------------------------------------------------------------
create policy "tryout_gc_stats: staff can read"
  on tryout_gc_stats for select
  using (tryout_is_member(org_id, array['org_admin','head_coach']));

create policy "tryout_gc_stats: admin can write"
  on tryout_gc_stats for all
  using  (tryout_is_member(org_id, array['org_admin']))
  with check (tryout_is_member(org_id, array['org_admin']));

create policy "tryout_combined_scores: staff can read"
  on tryout_combined_scores for select
  using (tryout_is_member(org_id, array['org_admin','head_coach']));

create policy "tryout_combined_scores: admin can write"
  on tryout_combined_scores for all
  using  (tryout_is_member(org_id, array['org_admin']))
  with check (tryout_is_member(org_id, array['org_admin']));

-- ----------------------------------------------------------------
-- TRYOUT_TEAMS / TEAM_ASSIGNMENTS
-- ----------------------------------------------------------------
create policy "tryout_teams: staff can read"
  on tryout_teams for select
  using (tryout_is_member(org_id, array['org_admin','head_coach']));

create policy "tryout_teams: admin can write"
  on tryout_teams for all
  using  (tryout_is_member(org_id, array['org_admin']))
  with check (tryout_is_member(org_id, array['org_admin']));

create policy "tryout_team_assignments: staff can read"
  on tryout_team_assignments for select
  using (
    team_id in (
      select id from tryout_teams where
        tryout_is_member(org_id, array['org_admin','head_coach'])
    )
  );

create policy "tryout_team_assignments: admin can write"
  on tryout_team_assignments for all
  using (
    team_id in (
      select id from tryout_teams where
        tryout_is_member(org_id, array['org_admin'])
    )
  )
  with check (
    team_id in (
      select id from tryout_teams where
        tryout_is_member(org_id, array['org_admin'])
    )
  );

-- ----------------------------------------------------------------
-- TRYOUT_IMPORT_JOBS
-- ----------------------------------------------------------------
create policy "tryout_import_jobs: admin can manage"
  on tryout_import_jobs for all
  using  (tryout_is_member(org_id, array['org_admin']))
  with check (tryout_is_member(org_id, array['org_admin']));

-- ----------------------------------------------------------------
-- TRYOUT_AUDIT_LOG
-- Immutable — insert only, no updates/deletes
-- ----------------------------------------------------------------
create policy "tryout_audit_log: admin can read"
  on tryout_audit_log for select
  using (tryout_is_member(org_id, array['org_admin']));

create policy "tryout_audit_log: members can insert"
  on tryout_audit_log for insert
  with check (tryout_is_member(org_id, array['org_admin','head_coach','evaluator']));
