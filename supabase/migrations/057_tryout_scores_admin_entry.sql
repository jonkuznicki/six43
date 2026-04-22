-- ============================================================
-- Migration 057: Allow admin to enter tryout scores on behalf
--                of named (non-auth) field evaluators
-- ============================================================
--
-- The original evaluator_id FK referenced auth.users, which only
-- works for mobile evaluators with real accounts.  The admin
-- entry grid uses tryout_session_evaluators.id as a stable UUID
-- — those are not auth users, so the FK violated.
--
-- Also, the old insert/update RLS only permitted evaluator_id =
-- auth.uid(), blocking any admin-entered row where the evaluator
-- is a named person without an account.
-- ============================================================

-- Drop FK so session_evaluator UUIDs are accepted
alter table tryout_scores
  drop constraint if exists tryout_scores_evaluator_id_fkey;

-- Replace restrictive policies with org_admin override
drop policy if exists "tryout_scores: evaluator can insert their own" on tryout_scores;
drop policy if exists "tryout_scores: evaluator can update their own" on tryout_scores;

-- Authenticated evaluators save their own; org_admin saves for any evaluator
create policy "tryout_scores: evaluator or admin can insert"
  on tryout_scores for insert
  with check (
    (evaluator_id = auth.uid()
      and tryout_is_member(org_id, array['org_admin','head_coach','evaluator']))
    or tryout_is_member(org_id, array['org_admin'])
  );

create policy "tryout_scores: evaluator or admin can update"
  on tryout_scores for update
  using  (evaluator_id = auth.uid() or tryout_is_member(org_id, array['org_admin']))
  with check (evaluator_id = auth.uid() or tryout_is_member(org_id, array['org_admin']));
