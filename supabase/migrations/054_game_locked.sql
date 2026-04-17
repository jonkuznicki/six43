-- Add locked flag to games so admin can prevent staff from editing a set lineup
alter table games add column if not exists locked boolean not null default false;
