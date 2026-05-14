-- ============================================================
-- Six43 – Migration 068: Clear 8U seed players (migrations 064 + 065)
-- ============================================================
-- Removes the 14 deterministic test players inserted in 064 and
-- their associated sessions, check-ins, scores, GC stats, and
-- coach evals from migrations 064 and 065.
--
-- Idempotent: wrapped in a DO block that silently skips when the
-- hudson-baseball org or 2026 season no longer exists.
-- ============================================================

do $$
declare
  v_org_id    uuid;
  v_session_id uuid := md5('hudson-8u-session-1-2025-03-15')::uuid;

  p_ids uuid[] := array[
    md5('8u-carter-walsh')::uuid,
    md5('8u-liam-foster')::uuid,
    md5('8u-noah-kim')::uuid,
    md5('8u-mason-patel')::uuid,
    md5('8u-ethan-brooks')::uuid,
    md5('8u-aiden-nguyen')::uuid,
    md5('8u-jackson-reyes')::uuid,
    md5('8u-oliver-hayes')::uuid,
    md5('8u-lucas-chen')::uuid,
    md5('8u-ryan-mitchell')::uuid,
    md5('8u-gavin-torres')::uuid,
    md5('8u-dylan-scott')::uuid,
    md5('8u-tyler-morgan')::uuid,
    md5('8u-jake-cooper')::uuid
  ];
begin
  select id into v_org_id from tryout_orgs where slug = 'hudson-baseball';
  if v_org_id is null then
    raise notice 'Seed clear skipped — hudson-baseball org not found.';
    return;
  end if;

  -- Delete dependent rows first (FK order)
  delete from tryout_scores          where player_id = any(p_ids);
  delete from tryout_checkins        where player_id = any(p_ids);
  delete from tryout_gc_stats        where player_id = any(p_ids);
  delete from tryout_coach_evals     where player_id = any(p_ids);

  -- Delete the seeded session (created in 065)
  delete from tryout_sessions        where id = v_session_id;

  -- Delete the players themselves
  delete from tryout_players         where id = any(p_ids);

  raise notice 'Seed clear complete — 14 8U players and their data removed from hudson-baseball.';
end $$;
