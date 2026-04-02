-- Add 'lineup_ready' to the games status check constraint
alter table games drop constraint if exists games_status_check;
alter table games add constraint games_status_check
  check (status in ('scheduled','lineup_ready','in_progress','final'));
