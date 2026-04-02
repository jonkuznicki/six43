-- Add innings_target to players (nullable — null means no target set)
alter table players add column if not exists innings_target integer;
