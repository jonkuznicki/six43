-- Store per-player N/A category flags alongside scores so they survive page navigation.
-- Stored as a JSON array of category keys, e.g. ["pitching_catching", "fielding"].
alter table tryout_scores
  add column na_flags jsonb not null default '[]';
