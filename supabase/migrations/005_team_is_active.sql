-- Add is_active flag to teams so users can manage multiple teams
-- and hide ones they're not currently using in the Games tab.
alter table teams add column if not exists is_active boolean not null default true;
