-- Per-team coach eval score multiplier for competitive-level adjustment.
-- Example: set 0.9 to discount White-team eval scores by 10%.

alter table tryout_teams
  add column if not exists eval_multiplier float not null default 1.0;
