-- tryout_combined_scores weight columns have no DEFAULT, which causes the
-- admin_notes / is_excluded upserts (which don't provide weight values) to
-- fail with a NOT NULL violation when no row yet exists for that player+season.
-- Add DEFAULT 0 so those bare inserts succeed; existing rows are unaffected.

alter table tryout_combined_scores
  alter column tryout_weight      set default 0,
  alter column coach_eval_weight  set default 0,
  alter column intangibles_weight set default 0,
  alter column prior_stat_weight  set default 0;
