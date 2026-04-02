-- ============================================================
-- Six43 – Migration 008: Game share tokens
-- Allows generating a public read-only link for a game lineup.
-- ============================================================

alter table games add column if not exists share_token text unique;
create index if not exists idx_games_share_token on games(share_token) where share_token is not null;
