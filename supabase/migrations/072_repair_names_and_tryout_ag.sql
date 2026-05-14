-- ============================================================
-- Six43 – Migration 072: Repair blank player names and backfill tryout_age_group
-- ============================================================

-- 1. Repair first_name from import job JSON where createPayload.firstName
--    was correctly populated (imports after the BOM fix was deployed).
UPDATE tryout_players tp
SET first_name = cp.first_name
FROM (
  SELECT DISTINCT ON (player_id)
    (row_elem->>'resolvedPlayerId')::uuid AS player_id,
    row_elem->'createPayload'->>'firstName' AS first_name
  FROM tryout_import_jobs j,
    LATERAL jsonb_array_elements(j.match_report::jsonb) AS row_elem
  WHERE j.type = 'registration'
    AND (row_elem->>'resolvedPlayerId') IS NOT NULL
    AND (row_elem->'createPayload'->>'firstName') IS NOT NULL
    AND (row_elem->'createPayload'->>'firstName') <> ''
  ORDER BY player_id, j.created_at DESC
) cp
WHERE tp.id = cp.player_id
  AND (tp.first_name IS NULL OR tp.first_name = '');

-- 2. Backfill tryout_age_group from registration staging for the active season
--    where tryout_age_group is not yet set.
UPDATE tryout_players tp
SET tryout_age_group = s.age_group
FROM tryout_registration_staging s
JOIN tryout_seasons ts ON ts.id = s.season_id AND ts.is_active = true
WHERE tp.id = s.player_id
  AND (tp.tryout_age_group IS NULL OR tp.tryout_age_group = '')
  AND s.age_group IS NOT NULL;
