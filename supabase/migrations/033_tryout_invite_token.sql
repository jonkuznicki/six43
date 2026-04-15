-- Add invite_token to tryout_org_members for invite-link flow
alter table tryout_org_members
  add column if not exists invite_token uuid unique default gen_random_uuid(),
  add column if not exists invited_at  timestamptz default now();

-- Index for fast token lookup
create index if not exists tryout_org_members_invite_token_idx
  on tryout_org_members (invite_token);
