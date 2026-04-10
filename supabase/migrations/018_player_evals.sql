-- ============================================================
-- Six43 – Migration 018: player evaluations
-- ============================================================

-- Dated notes per player per season (append-only log)
CREATE TABLE IF NOT EXISTS player_eval_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season_id   uuid NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  note_date   date NOT NULL DEFAULT CURRENT_DATE,
  body        text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS player_eval_notes_player_idx ON player_eval_notes(player_id);
CREATE INDEX IF NOT EXISTS player_eval_notes_season_idx ON player_eval_notes(season_id);

-- Skill scores stored as jsonb on the player row (updated in place)
-- Expected shape: { hitting, fielding, arm, speed, coachability } — each 1–5 or null
ALTER TABLE players ADD COLUMN IF NOT EXISTS eval_scores jsonb;

-- RLS: team members can read/write eval data for their own teams
ALTER TABLE player_eval_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team members can manage eval notes" ON player_eval_notes
  USING (
    player_id IN (
      SELECT p.id FROM players p
      JOIN seasons s ON s.id = p.season_id
      JOIN teams t ON t.id = s.team_id
      WHERE t.user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM team_members tm
          WHERE tm.team_id = t.id AND tm.user_id = auth.uid() AND tm.accepted_at IS NOT NULL
        )
    )
  );
