-- ============================================================
-- Six43 – Migration 056: game_extra_pitchers
-- ============================================================
-- Allows coaches to record a pitcher on a finalized game who
-- was not part of the original lineup (mid-game sub, etc.).
-- Separate from lineup_slots to avoid polluting the lineup grid.
-- ============================================================

CREATE TABLE game_extra_pitchers (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id    uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id  uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  innings    int  NOT NULL DEFAULT 1,
  pitch_count int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (game_id, player_id)
);

ALTER TABLE game_extra_pitchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coaches read their extra pitchers"
  ON game_extra_pitchers FOR SELECT
  USING (
    game_id IN (
      SELECT g.id FROM games g
      INNER JOIN seasons s ON s.id = g.season_id
      WHERE s.team_id IN (SELECT public.get_my_coached_team_ids())
    )
  );

CREATE POLICY "coaches insert extra pitchers"
  ON game_extra_pitchers FOR INSERT
  WITH CHECK (
    game_id IN (
      SELECT g.id FROM games g
      INNER JOIN seasons s ON s.id = g.season_id
      WHERE s.team_id IN (SELECT public.get_my_coached_team_ids())
    )
  );

CREATE POLICY "coaches update extra pitchers"
  ON game_extra_pitchers FOR UPDATE
  USING (
    game_id IN (
      SELECT g.id FROM games g
      INNER JOIN seasons s ON s.id = g.season_id
      WHERE s.team_id IN (SELECT public.get_my_coached_team_ids())
    )
  )
  WITH CHECK (
    game_id IN (
      SELECT g.id FROM games g
      INNER JOIN seasons s ON s.id = g.season_id
      WHERE s.team_id IN (SELECT public.get_my_coached_team_ids())
    )
  );

CREATE POLICY "coaches delete extra pitchers"
  ON game_extra_pitchers FOR DELETE
  USING (
    game_id IN (
      SELECT g.id FROM games g
      INNER JOIN seasons s ON s.id = g.season_id
      WHERE s.team_id IN (SELECT public.get_my_coached_team_ids())
    )
  );
