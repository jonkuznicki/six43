# Security Release 2026-11

Fixes three access-control issues and adds CI. All testing used a local Supabase stack and
synthetic users. Deployment steps: `RELEASE_CHECKLIST_2026-11.md`.

| Fix | Area | Ships via |
|---|---|---|
| **R1** Stats views ignored row-level security | DB migration `091` + tests | Applied to the database |
| **R6** Email → user-id lookup callable from browsers | DB migration `092` + tests | Applied to the database |
| **R5** Removed tryout members could rejoin with an old invite link | App code + tests | Merge to `main` |
| CI | GitHub Actions: tests, type-check, build, database access tests | Merge to `main` |

The edits to migrations 004/032/040/041/058 in this branch only make a **fresh local
database** build cleanly. Environments that already applied those migrations don't re-run
them, so they have no production effect.

---

## R1: stats views ignored row-level security

**Issue.** `season_position_stats` and `game_inning_validation` were evaluated with their
owner's privileges, so the row-level security on `players`, `games` and `lineup_slots` didn't
apply to queries through the views.

**Fix.** `091_security_invoker_stats_views.sql`:
- sets `security_invoker = on` on both views, so callers' own RLS applies;
- revokes anonymous access.

View definitions, columns and data are unchanged. Requires Postgres 15+.

**Tests.** `tests/rls/r1-stats-views.test.ts` (9):
- owners and accepted coaches see their own team;
- other teams' users, users with no team, and anonymous callers see nothing.

**App impact.** None expected. The Fairness and desktop lineup pages read the views as the
signed-in user and already filter to that user's team.

---

## R6: email lookup callable from browsers

**Issue.** `get_user_id_by_email(text)` is `SECURITY DEFINER` and kept the default `PUBLIC`
execute grant.

**Fix.** `092_restrict_get_user_id_by_email.sql`: execute is revoked from `public`, `anon`
and `authenticated`, and granted to `service_role`. The function body is unchanged.

**Tests.** `tests/rls/r6-email-lookup.test.ts` (3):
- anonymous and signed-in callers are denied;
- the server can still resolve emails.

**App impact.** None. The only callers are the server routes `/api/invite/create` and
`/api/tryouts/invite`.

---

## R5: removed tryout members could rejoin

**Issue.** Removing a member deactivates the row but keeps its invite token. The accept route
and the sign-in callback could re-activate such a row without an admin.

**Fix.**
- `src/lib/tryouts/inviteAcceptance.ts` distinguishes three member states: pending, active and removed.
- `/api/tryouts/invite/accept`:
  - a removed member gets **410**;
  - a link already used by another account gets **409**;
  - the row is claimed only if it is still in the state that was checked.
- `/auth/callback` auto-accepts only never-accepted invites.

**Unchanged:**
- Pending invite links work as before.
- Admin *Reactivate* and fresh invites work as before.
- Team (lineup) invites are unaffected.

**Tests.**
- `src/lib/__tests__/inviteAcceptance.test.ts` (7)
- `tests/rls/r5-tryout-invites.test.ts` (2)

**User-visible change.** A removed member who opens an old link sees *"This invite is no longer
active. Ask an organization admin to invite you again."*

---

## Rollback

None of these changes modify data.
- **App:** Vercel Instant Rollback, then `git revert`.
- **Migrations:** each file's header comment contains its rollback statement. Rolling back
  re-opens the issue, so a forward fix is preferred.
