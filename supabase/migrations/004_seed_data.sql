-- ============================================================
-- Six43 – Migration 004: Sample data for development
-- ============================================================
-- This file loads the Blue Jays roster and 2 games from your
-- spreadsheet so you can see real data immediately.
--
-- HOW TO USE:
--   1. Sign up in your app to create an auth user
--   2. Copy your user UUID from Supabase Dashboard → Auth → Users
--   3. Replace 'YOUR-USER-UUID-HERE' below with that UUID
--   4. Run this file in Supabase Dashboard → SQL Editor
--
-- DO NOT run this in production. Dev/testing only.
-- ============================================================

-- Replace this with your actual user UUID from Supabase Auth
do $$
declare
  v_user_id    uuid := '55d32882-9dee-4f34-af32-e866a14b01af';
  v_team_id    uuid;
  v_season_id  uuid;
  v_game1_id   uuid;
  v_game2_id   uuid;

  -- Player UUIDs
  p_jake       uuid;
  p_lucas      uuid;
  p_ethan      uuid;
  p_ryan       uuid;
  p_mason      uuid;
  p_aiden_g    uuid;
  p_noah       uuid;
  p_liam       uuid;
  p_carter     uuid;
  p_owen       uuid;
  p_aiden_m    uuid;
  p_connor     uuid;

begin

-- ----------------------------------------------------------------
-- Team
-- ----------------------------------------------------------------
insert into teams (user_id, name, age_group)
values (v_user_id, 'Blue Jays', '12U')
returning id into v_team_id;

-- ----------------------------------------------------------------
-- Season
-- ----------------------------------------------------------------
insert into seasons (team_id, name, start_date, end_date, innings_per_game, is_active)
values (v_team_id, 'Fall 2024', '2024-09-01', '2024-11-30', 6, true)
returning id into v_season_id;

-- ----------------------------------------------------------------
-- Roster (from your spreadsheet Configuration tab)
-- ----------------------------------------------------------------
insert into players (team_id, first_name, last_name, jersey_number, primary_position)
values (v_team_id, 'Jake',   'Johnson',  12, 'P')   returning id into p_jake;

insert into players (team_id, first_name, last_name, jersey_number, primary_position)
values (v_team_id, 'Lucas',  'Smith',    24, '1B')  returning id into p_lucas;

insert into players (team_id, first_name, last_name, jersey_number, primary_position)
values (v_team_id, 'Ethan',  'Anderson',  7, 'C')   returning id into p_ethan;

insert into players (team_id, first_name, last_name, jersey_number, primary_position)
values (v_team_id, 'Ryan',   'Miller',   33, '2B')  returning id into p_ryan;

insert into players (team_id, first_name, last_name, jersey_number, primary_position)
values (v_team_id, 'Mason',  'Davis',    19, 'C')   returning id into p_mason;

insert into players (team_id, first_name, last_name, jersey_number, primary_position)
values (v_team_id, 'Aiden',  'Garcia',   45, 'SS')  returning id into p_aiden_g;

insert into players (team_id, first_name, last_name, jersey_number, primary_position)
values (v_team_id, 'Noah',   'Martinez', 11, 'SS')  returning id into p_noah;

insert into players (team_id, first_name, last_name, jersey_number, primary_position)
values (v_team_id, 'Liam',   'Brown',    22, 'C')   returning id into p_liam;

insert into players (team_id, first_name, last_name, jersey_number, primary_position)
values (v_team_id, 'Carter', 'Wilson',    9, '3B')  returning id into p_carter;

insert into players (team_id, first_name, last_name, jersey_number, primary_position)
values (v_team_id, 'Owen',   'Clark',    14, 'P')   returning id into p_owen;

insert into players (team_id, first_name, last_name, jersey_number, primary_position)
values (v_team_id, 'Aiden',  'Martinez', 41, '2B')  returning id into p_aiden_m;

insert into players (team_id, first_name, last_name, jersey_number, primary_position)
values (v_team_id, 'Connor', 'Lee',      17, '3B')  returning id into p_connor;

-- ----------------------------------------------------------------
-- Game 1: vs Tigers, Oct 22 2024 — Final (from your spreadsheet)
-- ----------------------------------------------------------------
insert into games (season_id, game_number, opponent, game_date, game_time, location, status, innings_played)
values (v_season_id, 1, 'Tigers', '2024-10-22', '18:00', 'Home', 'final', 6)
returning id into v_game1_id;

-- Lineup slots for Game 1
-- inning_positions array: index 0=inn1, 1=inn2, 2=inn3, 3=inn4, 4=inn5, 5=inn6, 6-8=null
insert into lineup_slots (game_id, player_id, batting_order, inning_positions, planned_positions) values
(v_game1_id, p_lucas,   1, array['1B','1B','1B','1B','1B','1B',null,null,null], array['1B','1B','1B','1B','1B','1B',null,null,null]),
(v_game1_id, p_ethan,   2, array['LF','LF','2B','2B','C','C',null,null,null],   array['LF','LF','2B','2B','C','C',null,null,null]),
(v_game1_id, p_ryan,    3, array['2B','2B','CF','CF','RF','RF',null,null,null],  array['2B','2B','CF','CF','RF','RF',null,null,null]),
(v_game1_id, p_mason,   4, array['Bench','Bench','C','C','Bench','Bench',null,null,null], array['Bench','Bench','C','C','Bench','Bench',null,null,null]),
(v_game1_id, p_aiden_g, 5, array['SS','SS','Bench','Bench','CF','Bench',null,null,null], array['SS','SS','Bench','Bench','CF','Bench',null,null,null]),
(v_game1_id, p_noah,    6, array['Bench','Bench','SS','SS','Bench','CF',null,null,null],  array['Bench','Bench','SS','SS','Bench','CF',null,null,null]),
(v_game1_id, p_liam,    7, array['C','C','P','P','SS','SS',null,null,null],      array['C','C','P','P','SS','SS',null,null,null]),
(v_game1_id, p_carter,  8, array['3B','3B','Bench','Bench','Bench','Bench',null,null,null], array['3B','3B','Bench','Bench','Bench','Bench',null,null,null]),
(v_game1_id, p_owen,    9, array['P','P','3B','3B','LF','LF',null,null,null],    array['P','P','3B','3B','LF','LF',null,null,null]),
(v_game1_id, p_aiden_m,10, array['Bench','Bench','LF','LF','2B','2B',null,null,null], array['Bench','Bench','LF','LF','2B','2B',null,null,null]),
(v_game1_id, p_connor, 11, array['CF','CF','Bench','Bench','3B','3B',null,null,null],  array['CF','CF','Bench','Bench','3B','3B',null,null,null]),
(v_game1_id, p_jake,   12, array['RF','RF','RF','RF','P','P',null,null,null],    array['RF','RF','RF','RF','P','P',null,null,null]);

-- ----------------------------------------------------------------
-- Game 2: vs Yankees, Mar 13 — Final
-- ----------------------------------------------------------------
insert into games (season_id, game_number, opponent, game_date, game_time, location, status, innings_played)
values (v_season_id, 2, 'Yankees', '2025-03-13', '18:00', 'Away', 'final', 6)
returning id into v_game2_id;

insert into lineup_slots (game_id, player_id, batting_order, inning_positions, planned_positions) values
(v_game2_id, p_lucas,   1, array['1B','1B','1B','1B','1B','1B',null,null,null],  array['1B','1B','1B','1B','1B','1B',null,null,null]),
(v_game2_id, p_ethan,   2, array['LF','LF','2B','C','C','C',null,null,null],     array['LF','LF','2B','C','C','C',null,null,null]),
(v_game2_id, p_ryan,    3, array['2B','2B','CF','CF','RF','RF',null,null,null],   array['2B','2B','CF','CF','RF','RF',null,null,null]),
(v_game2_id, p_mason,   4, array['Bench','Bench','C','2B','Bench','Bench',null,null,null], array['Bench','Bench','C','2B','Bench','Bench',null,null,null]),
(v_game2_id, p_aiden_g, 5, array['SS','SS','Bench','Bench','Bench','Bench',null,null,null], array['SS','SS','Bench','Bench','Bench','Bench',null,null,null]),
(v_game2_id, p_noah,    6, array['Bench','Bench','SS','SS','Bench','CF',null,null,null],  array['Bench','Bench','SS','SS','Bench','CF',null,null,null]),
(v_game2_id, p_liam,    7, array['C','C','P','P','SS','SS',null,null,null],       array['C','C','P','P','SS','SS',null,null,null]),
(v_game2_id, p_carter,  8, array['3B','3B','Bench','Bench','Bench','Bench',null,null,null], array['3B','3B','Bench','Bench','Bench','Bench',null,null,null]),
(v_game2_id, p_owen,    9, array['P','P','3B','3B','LF','LF',null,null,null],     array['P','P','3B','3B','LF','LF',null,null,null]),
(v_game2_id, p_aiden_m,10, array['Bench','Bench','LF','LF','2B','2B',null,null,null],  array['Bench','Bench','LF','LF','2B','2B',null,null,null]),
(v_game2_id, p_connor, 11, array['CF','CF','Bench','Bench','3B','3B',null,null,null],   array['CF','CF','Bench','Bench','3B','3B',null,null,null]),
(v_game2_id, p_jake,   12, array['RF','RF','RF','RF','P','P',null,null,null],     array['RF','RF','RF','RF','P','P',null,null,null]);

end $$;
