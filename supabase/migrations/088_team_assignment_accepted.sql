-- Track whether a player has officially accepted their roster spot.
-- is_accepted lives on tryout_team_assignments since acceptance is tied to a
-- specific (player, team, season) assignment — if the assignment changes,
-- the old acceptance no longer applies.

alter table tryout_team_assignments
  add column if not exists is_accepted boolean not null default false;

-- Backfill: existing assignment rows default to "Not Accepted" via the
-- column default above; nothing further to backfill.
