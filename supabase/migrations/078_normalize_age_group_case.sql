-- Migration 078: normalize age_group / tryout_age_group to uppercase U suffix
-- Fixes values like "10u" -> "10U" entered via walk-up check-in or manual edit.

update tryout_players
   set age_group = regexp_replace(age_group, 'u$', 'U')
 where age_group ~ 'u$'
   and age_group !~ 'U$';

update tryout_players
   set tryout_age_group = regexp_replace(tryout_age_group, 'u$', 'U')
 where tryout_age_group ~ 'u$'
   and tryout_age_group !~ 'U$';

update tryout_checkins
   set write_in_age_group = regexp_replace(write_in_age_group, 'u$', 'U')
 where write_in_age_group ~ 'u$'
   and write_in_age_group !~ 'U$';
