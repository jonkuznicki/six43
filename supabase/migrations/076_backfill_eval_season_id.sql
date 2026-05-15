-- Backfill season_id on coach eval rows where it was never set.
-- Matches via org_id + season_year (text) against tryout_seasons.year (int).
update tryout_coach_evals e
  set season_id = s.id
  from tryout_seasons s
  where e.season_id is null
    and e.org_id    = s.org_id
    and e.season_year = s.year::text;
