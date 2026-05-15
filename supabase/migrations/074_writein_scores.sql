-- Allow write-in (walk-up) players to have scores stored without a tryout_players record.
-- player_id becomes nullable; checkin_id is set instead for write-ins.

alter table tryout_scores
  alter column player_id drop not null;

alter table tryout_scores
  add column checkin_id uuid references tryout_checkins(id) on delete cascade;

-- Unique constraint for write-in rows (checkin_id present, player_id null)
create unique index idx_tryout_scores_writein
  on tryout_scores(checkin_id, session_id, evaluator_id)
  where checkin_id is not null;
