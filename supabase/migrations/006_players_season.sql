-- Players now belong to a season, not just a team.
-- Different seasons can have different rosters.

-- Add season_id to players
ALTER TABLE players ADD COLUMN IF NOT EXISTS season_id uuid references seasons(id) on delete cascade;

-- Assign existing players to the most recent season of their team
UPDATE players p
SET season_id = (
  SELECT s.id FROM seasons s
  WHERE s.team_id = p.team_id
  ORDER BY s.created_at DESC
  LIMIT 1
)
WHERE p.season_id IS NULL;

-- Drop the old team+jersey uniqueness (jersey numbers can repeat across seasons)
ALTER TABLE players DROP CONSTRAINT IF EXISTS players_team_id_jersey_number_key;

-- Jersey numbers must be unique within a season
ALTER TABLE players ADD CONSTRAINT players_season_jersey_key
  UNIQUE (season_id, jersey_number);

-- Index for fast season-based roster lookups
CREATE INDEX IF NOT EXISTS idx_players_season ON players(season_id, status);
