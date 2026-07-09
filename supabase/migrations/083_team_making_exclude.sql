-- Add exclude flag and expand admin_notes to text on tryout_combined_scores.
-- is_excluded: hides the player from active cutoff counts during team selection.

alter table tryout_combined_scores
  add column if not exists is_excluded boolean not null default false;
