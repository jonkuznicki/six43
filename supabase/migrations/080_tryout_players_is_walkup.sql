alter table tryout_players
  add column if not exists is_walkup boolean not null default false;
