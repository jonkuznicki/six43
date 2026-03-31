-- ============================================================
-- Six43 – Migration 002: Season position stats
-- ============================================================
-- This replaces the "Positions" tab in your spreadsheet and
-- the manual "Refresh All" Power Query step.
--
-- It's a VIEW — Postgres recalculates it automatically every
-- time it's queried. No manual refresh. Ever.
--
-- How it works:
--   1. Looks at all lineup_slots for games with status = 'final'
--   2. Unpacks the inning_positions array into individual rows
--   3. Counts innings per position per player per season
--   4. Calculates bench %, infield total, outfield total
-- ============================================================

create or replace view season_position_stats as
with

-- Step 1: Get all final games with their season info
final_games as (
  select
    g.id        as game_id,
    g.season_id,
    g.innings_played
  from games g
  where g.status = 'final'
),

-- Step 2: Unpack inning_positions array into one row per inning
-- unnest with ordinality gives us the inning number (1-9)
innings_unpacked as (
  select
    ls.player_id,
    fg.season_id,
    -- ordinality is 1-based, so index 1 = inning 1
    inn.position,
    inn.inning_num
  from lineup_slots ls
  inner join final_games fg on fg.game_id = ls.game_id
  -- unnest the array, get position value and its index
  cross join lateral unnest(ls.inning_positions)
    with ordinality as inn(position, inning_num)
  where
    -- Only count innings that were actually played (not null)
    inn.position is not null
    -- Only count up to innings_played if set, otherwise count all non-null
    and (fg.innings_played is null or inn.inning_num <= fg.innings_played)
),

-- Step 3: Count innings per position per player per season
position_counts as (
  select
    player_id,
    season_id,
    count(*) filter (where position = 'P')     as innings_p,
    count(*) filter (where position = 'C')     as innings_c,
    count(*) filter (where position = '1B')    as innings_1b,
    count(*) filter (where position = '2B')    as innings_2b,
    count(*) filter (where position = 'SS')    as innings_ss,
    count(*) filter (where position = '3B')    as innings_3b,
    count(*) filter (where position = 'LF')    as innings_lf,
    count(*) filter (where position = 'CF')    as innings_cf,
    count(*) filter (where position = 'RF')    as innings_rf,
    count(*) filter (where position = 'Bench') as innings_bench,
    count(*) filter (where position != 'Bench') as innings_field
  from innings_unpacked
  group by player_id, season_id
)

-- Step 4: Final output with derived columns
select
  pc.player_id,
  pc.season_id,
  p.first_name,
  p.last_name,
  p.jersey_number,
  -- Individual position counts (cast to int for clean display)
  pc.innings_p::int,
  pc.innings_c::int,
  pc.innings_1b::int,
  pc.innings_2b::int,
  pc.innings_ss::int,
  pc.innings_3b::int,
  pc.innings_lf::int,
  pc.innings_cf::int,
  pc.innings_rf::int,
  pc.innings_bench::int,
  -- Derived group totals (mirrors your spreadsheet columns)
  (pc.innings_p + pc.innings_c + pc.innings_1b +
   pc.innings_2b + pc.innings_ss + pc.innings_3b)::int as innings_infield,
  (pc.innings_lf + pc.innings_cf + pc.innings_rf)::int as innings_outfield,
  pc.innings_field::int                                  as innings_total,
  (pc.innings_bench + pc.innings_field)::int             as innings_all,
  -- Bench percentage: bench / (bench + field)
  -- Matches your spreadsheet formula exactly.
  -- Returns 0 if player has no innings yet (avoids division by zero).
  case
    when (pc.innings_bench + pc.innings_field) = 0 then 0
    else round(
      pc.innings_bench::numeric /
      (pc.innings_bench + pc.innings_field)::numeric,
      4  -- 4 decimal places, e.g. 0.6667 = 66.67%
    )
  end as bench_pct
from position_counts pc
inner join players p on p.id = pc.player_id;

-- ----------------------------------------------------------------
-- HELPER: game_inning_validation view
-- Shows per-inning position counts for a game so the UI can
-- highlight validation errors (missing pitcher, duplicate 2B, etc.)
-- This replaces the hidden validation rows in your game sheets.
-- ----------------------------------------------------------------
create or replace view game_inning_validation as
select
  ls.game_id,
  inn.inning_num,
  inn.position,
  count(*) as player_count
from lineup_slots ls
cross join lateral unnest(ls.inning_positions)
  with ordinality as inn(position, inning_num)
where inn.position is not null
group by ls.game_id, inn.inning_num, inn.position;

-- Usage example:
-- SELECT * FROM game_inning_validation
-- WHERE game_id = 'your-game-uuid'
-- ORDER BY inning_num, position;
--
-- A valid inning has player_count = 1 for every fielding position.
-- Bench can be > 1. Any fielding position with count != 1 is an error.
