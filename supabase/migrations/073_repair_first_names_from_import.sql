-- ============================================================
-- Six43 – Migration 073: Repair blank first names from import jobs
-- ============================================================
-- The original registration import stored blank first_name because
-- the BOM on the "First Name" column header wasn't being stripped.
-- This migration matches players (by DOB) against the createPayload
-- stored in import job match_reports to backfill the first name.
-- Also patches tryout_registration_staging.player_first_name.
-- ============================================================

-- Step 1: Repair tryout_players.first_name
WITH best_name AS (
  SELECT DISTINCT ON (tp.id)
    tp.id                                             AS player_id,
    row_elem -> 'createPayload' ->> 'firstName'       AS first_name,
    row_elem -> 'createPayload' ->> 'lastName'        AS last_name
  FROM  tryout_players tp
  JOIN  tryout_import_jobs j
        ON  j.org_id = tp.org_id
        AND j.type   = 'registration'
  CROSS JOIN LATERAL jsonb_array_elements(j.match_report::jsonb) row_elem
  WHERE (tp.first_name IS NULL OR tp.first_name = '')
    AND tp.dob IS NOT NULL
    AND (row_elem -> 'createPayload' ->> 'dob') = tp.dob::text
    AND (row_elem -> 'createPayload' ->> 'firstName') IS NOT NULL
    AND (row_elem -> 'createPayload' ->> 'firstName') <> ''
  ORDER BY tp.id, j.created_at DESC   -- prefer the most recent import job
)
UPDATE tryout_players tp
SET    first_name = bn.first_name
FROM   best_name bn
WHERE  tp.id       = bn.player_id
  AND  (tp.first_name IS NULL OR tp.first_name = '');

-- Step 2: Repair tryout_registration_staging.player_first_name
WITH best_staging_name AS (
  SELECT DISTINCT ON (s.id)
    s.id                                              AS staging_id,
    row_elem -> 'createPayload' ->> 'firstName'       AS first_name,
    row_elem -> 'createPayload' ->> 'lastName'        AS last_name
  FROM  tryout_registration_staging s
  JOIN  tryout_players tp ON tp.id = s.player_id
  JOIN  tryout_import_jobs j
        ON  j.org_id = s.org_id
        AND j.type   = 'registration'
  CROSS JOIN LATERAL jsonb_array_elements(j.match_report::jsonb) row_elem
  WHERE (s.player_first_name IS NULL OR s.player_first_name = '')
    AND tp.dob IS NOT NULL
    AND (row_elem -> 'createPayload' ->> 'dob') = tp.dob::text
    AND (row_elem -> 'createPayload' ->> 'firstName') IS NOT NULL
    AND (row_elem -> 'createPayload' ->> 'firstName') <> ''
  ORDER BY s.id, j.created_at DESC
)
UPDATE tryout_registration_staging s
SET    player_first_name = bsn.first_name
FROM   best_staging_name bsn
WHERE  s.id = bsn.staging_id
  AND  (s.player_first_name IS NULL OR s.player_first_name = '');
