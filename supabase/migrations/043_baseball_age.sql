-- Baseball age validation support.
-- "Baseball age" = the player's age as of May 1 of the tryout season year.
-- Admins can override a player's tryout_age_group with a reason stored here.

alter table tryout_players
  add column if not exists age_group_override_reason text;

-- Pure SQL helper used server-side; frontend replicates the same logic.
create or replace function baseball_age(p_dob date, p_season_year int)
returns int language sql immutable parallel safe as $$
  select date_part('year', age(make_date(p_season_year, 5, 1), p_dob))::int
$$;
