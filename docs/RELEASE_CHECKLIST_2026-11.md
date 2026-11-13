# Release Checklist — Security Release 2026-11 (R1, R6, R5)

Covers migrations `091` (R1) and `092` (R6), the R5 app fix and the CI workflow on
`security/release-2026-11`. Background: `SECURITY_RELEASE_2026-11.md`.

**Who runs it:** the owner, in the Supabase / Vercel / GitHub dashboards. Every SQL query
in §2 is **read-only**. The only production writes are steps B2 and B4 (the two migration
files) and C4 (the merge).

Nothing in this release depends on which Supabase API key format is in use. The secret key
maps to `service_role`, which migration 092 grants.

---

## 0. Order

1. **Database first (Phase B).** Both migrations are backward-compatible with the currently
   deployed app, so they go in before any code changes.
2. **Then code (Phase C):** PR, CI, merge and deploy, in one sitting.

---

## 1. Preconditions (no changes; any ❌ = stop)

| # | Check | Where |
|---|---|---|
| A1 | The server-side Supabase secret key is scoped to **Production only**. Preview deployments have no production Supabase URL or keys. | Vercel → Settings → Environment Variables |
| A2 | Preview deployments are protected (Vercel Authentication). | Vercel → Deployment Protection |
| A3 | Postgres ≥ 15. Run query Q1. | SQL Editor |
| A4 | Pre-flight queries Q2–Q7 match the "expected now" values. | SQL Editor |
| A5 | Pre-flight REST checks R-pre return the "expected now" values. | Your terminal |
| A6 | Write down the current Production deployment ID and commit SHA. This is the **rollback target**. It must be a deployment built with the current environment variables. | Vercel → Deployments |
| A7 | Low-traffic window: not a game day or tryout day. Allow about 90 minutes. | |

---

## 2. Read-only SQL (Supabase SQL Editor)

Paste each block and compare with **Expected now** (before the release).

**Q1. Postgres version**
```sql
select current_setting('server_version') as version,
       current_setting('server_version_num')::int >= 150000 as supports_security_invoker;
```
Expected: `supports_security_invoker = true`. If it's `false`, **stop**: 091 would fail (safely, rolling back).

**Q2. Stats views: owner, options, privileges** (also confirms R1 is *not yet* deployed)
```sql
select c.relname,
       pg_get_userbyid(c.relowner)                    as owner,
       c.reloptions,
       has_table_privilege('anon',          c.oid, 'select') as anon_select,
       has_table_privilege('authenticated', c.oid, 'select') as authenticated_select
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('season_position_stats', 'game_inning_validation')
order by 1;
```
| | owner | reloptions | anon_select | authenticated_select |
|---|---|---|---|---|
| Expected now | `postgres` | `NULL` | `true` | `true` |
| After 091 | `postgres` | `{security_invoker=on}` | **`false`** | `true` |

- `reloptions` already `{security_invoker=on}` → R1 is already deployed (or partly). Stop and reconcile.
- Owner is not `postgres` → stop. The SQL Editor role may not be allowed to `ALTER` the view.

**Q3. View definitions match the repo (drift check)**
```sql
select viewname, md5(definition) as md5, definition
from pg_views
where schemaname = 'public'
  and viewname in ('season_position_stats', 'game_inning_validation')
order by 1;
```
- Local reference on Postgres 17.11: `game_inning_validation` = `8d94c93718cc306b1d7cf5927463e984`, `season_position_stats` = `36e6598d97d83c8a9153f2061e681c37`.
- A different Postgres minor or major version can format the definition differently. If the md5 differs, compare the `definition` text with `supabase/migrations/002_season_stats_view.sql`. It should read `games`, `lineup_slots` and `players` only.
- 091 doesn't change the definitions, so a cosmetic difference isn't a blocker. A different **set of tables** is.

**Q4. The base tables the views read: signed-in users can select, and RLS is on**
```sql
select c.relname,
       c.relrowsecurity                                         as rls_enabled,
       has_table_privilege('authenticated', c.oid, 'select')    as authenticated_select
from pg_class c
where c.relnamespace = 'public'::regnamespace
  and c.relname in ('games', 'lineup_slots', 'players')
order by 1;
```
Expected: all `true`. With `security_invoker`, the view runs as the signed-in coach, so these
grants and policies now decide what each coach sees.

**Q5. `get_user_id_by_email` privileges** (also confirms R6 is *not yet* deployed)
```sql
select p.oid::regprocedure                                     as signature,
       p.prosecdef                                             as security_definer,
       pg_get_userbyid(p.proowner)                             as owner,
       has_function_privilege('anon',          p.oid, 'execute') as anon,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
       has_function_privilege('service_role',  p.oid, 'execute') as service_role
from pg_proc p
where p.proname = 'get_user_id_by_email';
```
| | rows | anon | authenticated | service_role |
|---|---|---|---|---|
| Expected now | exactly 1: `get_user_id_by_email(text)` | `true` | `true` | `true` |
| After 092 | same | **`false`** | **`false`** | `true` |

- More than one row (an overload exists) → stop. 092 only revokes the `(text)` version.
- Already `false` / `false` → R6 is already deployed.

**Q6. Nothing else depends on the changed objects** (catches changes made in production outside the repo)
```sql
-- other functions that call get_user_id_by_email
select p.oid::regprocedure, p.prosecdef
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog', 'information_schema')
  and p.prosrc ilike '%get_user_id_by_email%'
  and p.proname <> 'get_user_id_by_email';

-- RLS policies that call it
select schemaname, tablename, policyname
from pg_policies
where qual ilike '%get_user_id_by_email%' or with_check ilike '%get_user_id_by_email%';

-- other views built on top of the stats views
select distinct v.relname
from pg_depend d
join pg_rewrite r on r.oid = d.objid
join pg_class   v on v.oid = r.ev_class
where d.refobjid in ('public.season_position_stats'::regclass, 'public.game_inning_validation'::regclass)
  and v.oid <> d.refobjid;
```
Expected: **0 rows** from each. In the repo, the function's only callers are two server
routes. Any row here means production has drifted from the repo. **Stop** and review that
object before applying 092 or 091.

**Q7. Columns the R5 code needs**
```sql
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'tryout_org_members'
  and column_name in ('id', 'org_id', 'role', 'email', 'user_id', 'is_active', 'invite_token')
order by 1;
```
Expected: **7 rows**. Fewer → stop; the R5 route would error.

**Q8. Optional: how many people the R5 change affects** (counts only, no personal data)
```sql
select count(*) filter (where not is_active and user_id is not null) as removed_members,
       count(*) filter (where not is_active and user_id is null)     as pending_invites,
       count(*) filter (where is_active)                             as active_members
from public.tryout_org_members;
```
`removed_members` is the number of people whose old invite link stops working after R5.

---

## 3. REST checks (your terminal; no data returned)

Use the **publishable** key, the value that ships to browsers. It's public by design, but
keep it in a shell variable rather than pasting it into chat or docs.

```bash
URL="https://<project-ref>.supabase.co"; PK="<sb_publishable_…>"

# R1: limit=0 never returns rows, only the status code matters
curl -s -o /dev/null -w "season_position_stats:  %{http_code}\n" "$URL/rest/v1/season_position_stats?select=player_id&limit=0"  -H "apikey: $PK"
curl -s -o /dev/null -w "game_inning_validation: %{http_code}\n" "$URL/rest/v1/game_inning_validation?select=game_id&limit=0"   -H "apikey: $PK"

# R6: a made-up address that can't belong to anyone
curl -s -w "  -> %{http_code}\n" -X POST "$URL/rest/v1/rpc/get_user_id_by_email" \
  -H "apikey: $PK" -H "Content-Type: application/json" \
  -d '{"user_email":"release-check@example.invalid"}'
```
| | stats views | rpc |
|---|---|---|
| **R-pre** (expected now) | `200` | `null -> 200` |
| **R-post** (after the release) | `401` | permission-denied JSON (`42501`) `-> 401` |

The local stack after the fix returns `401` for both views.

---

## 4. Ordered release

### Phase A: preconditions
Complete §1. Every row ✅.

### Phase B: database (before the code merge)
- **B1. Fresh backup.** In WSL, run `bash scripts/db/backup.sh`, then `bash scripts/db/verify_restore.sh <dir>`.
  Required: `RESULT: PASS`, taken **today**.
- **B2. Apply 091.**
  1. SQL Editor → paste the **whole** `supabase/migrations/091_security_invoker_stats_views.sql`.
  2. Run it. Expect success with no rows.
- **B3. Validate 091.**
  1. Q2: "After 091" row.
  2. REST R-post for both views: `401`.
  3. Log in at six43.com as a team **owner**:
     - Fairness page shows the season's position stats.
     - A game's **desktop lineup** page shows the season-stats column.
     - A lineup with an error still shows the inning-validation warning.
  4. Log in as an **accepted coach** of someone else's team (a second test account): the same pages show that team's stats.
  5. Saving a lineup still works. Saves write to `lineup_slots`, not the views, so they should be unaffected; this confirms it.
- **B4. Apply 092** (whole file).
- **B5. Validate 092.**
  1. Q5: "After 092" row.
  2. REST R-post for the rpc.
  3. From a team you own, **invite a test email**: the invite is created.
  4. From a tryout org you own, **invite a test email**: the invite is created.

  Both invites go through the server, using the `sb_secret_` key and therefore `service_role`.
- **B6. Record** that 091 and 092 were applied, with date and time, in your private release log.

At this point R1 and R6 are fixed in production, with the app unchanged. You can pause here
safely, for days if needed.

### Phase C: code (one sitting)
- **C1.** Push the release branch and open a PR into `main`.
- **C2.** CI must pass both jobs:
  - `Tests, type-check, build`
  - `Migrations + cross-team access tests`

  This is the first real CI run; locally the same steps pass (§6).
  - Vercel builds a **Preview** of the PR. If Preview has no Supabase variables (A1), the preview may fail to build or load data. That's expected and safe.
  - **Do not** make the Vercel preview a required check.
- **C3.** Turn on branch protection (§7). The CI check names can only be selected after they've run once, which is why it comes after C2.
- **C4.** Merge.
  - Use **Rebase and merge** to keep R1, R6, R5 and CI as separate, individually revertable commits. Squash works too, but then a revert undoes everything at once.
  - Vercel builds production. Wait for *Ready* and confirm the deployment SHA equals the merged `main` SHA.
- **C5. Validate R5 and smoke-test.**
  1. Log in; the dashboard, a roster, a game lineup and the fairness page all load.
  2. In a synthetic tryout org you own: invite your test account, accept, **remove** it, then open the old join link as that account. Expected: *"This invite is no longer active…"*.
  3. **Reactivate** the member from the Members page: it works.
  4. Send a fresh team invite to a test email and accept it.
  5. Open a lineup share link while logged out: it renders.
  6. REST R-post again: still `401`.

### Phase D: monitor (24 h)
- Vercel → Logs: no new 5xx on `/fairness`, `/games/*/lineup/*`, `/api/invite/*`, `/api/tryouts/invite*`, `/auth/callback`.
- Supabase → Logs → API / Postgres: no new `42501 permission denied` from signed-in requests. Anonymous ones are expected.

---

## 5. Stop conditions

Stop and roll back the step you just did; don't continue to the next phase.

| When | Condition | Action |
|---|---|---|
| Phase A | Any precondition ❌; Q2/Q5 show the fix already present; Q6 returns rows; Q7 shows fewer than 7 columns; Q1 shows Postgres < 15 | Don't start. Investigate the drift. |
| B1 | Backup or verify isn't `PASS` | Don't apply migrations. |
| B2/B4 | The SQL Editor returns any error | Nothing changed, because each file is one transaction. Investigate. |
| B3 | An owner or accepted coach sees **no** stats on Fairness or desktop lineup, or `42501` errors appear for signed-in users | Roll back 091 (§8), then investigate. |
| B5 | Team or tryout invite creation fails | Roll back 092 (§8). |
| C2 | CI red | Don't merge. Database fixes stay in place. |
| C4 | Vercel build fails | Production stays on the previous deployment automatically. Don't retry blindly. |
| C5 | Login, dashboard, lineup or invites broken, or 5xx spike | Vercel Instant Rollback to the A6 target. |
| D | Sustained 5xx or user reports tied to stats pages or invites | Roll back the relevant piece (§8). |

---

## 6. Local evidence (2026-11-12, branch `9bed986`)

| Check | Result |
|---|---|
| Working tree | Clean. All changes committed. Branch on no remote; `origin/main` = `741c32b`. |
| `npm test` | 111/111 |
| `npm run test:rls` (local stack, 091/092 applied) | 14/14: R1 9, R6 3, R5 2 |
| `npx tsc --noEmit` | 0 errors |
| `next build` from a clean checkout of `HEAD`, with CI placeholder env | Success |
| CI `supabase start -x …` service names | All valid for CLI 3.1.0 |
| Earlier, with only `sb_publishable_` / `sb_secret_` keys | 14/14, plus app-route probes |
| Local REST, anon key, stats views after fix | `401` |

**Not verified:**
- The workflow running on GitHub (first run happens at C2).
- Anything about production state. That's the purpose of §1–§3.

---

## 7. Branch protection (`main`)

Configure under Settings → Rules → Rulesets → New branch ruleset, or Settings → Branches → Add rule:
- Target: `main` (default branch).
- **Require a pull request before merging.** Set required approvals to **0**: you can't approve your own PR, and 1 would block you.
- **Require status checks to pass:**
  - `Tests, type-check, build`
  - `Migrations + cross-team access tests`
- **Require branches to be up to date before merging.**
- **Block force pushes. Restrict deletions.**
- Optional: require linear history. This means rebase or squash merges only, which is consistent with C4.
- Bypass list: empty. If you want an emergency bypass, add only yourself, and only "for pull requests".
- Actions → General: keep "Require approval for first-time contributors" so outside PRs don't run CI unreviewed. The workflow has no secrets and `contents: read`.

**Workflow review notes** (no change needed for this release):
- No secrets, read-only token. `pull_request` (not `pull_request_target`), so fork PRs can't reach anything sensitive.
- CI uses the local stack's legacy demo keys. Production now uses `sb_` keys. Switching CI to `PUBLISHABLE_KEY` / `SECRET_KEY` would mirror production more closely; it's a small follow-up and both styles pass locally.
- Third-party actions are pinned by major tag (`@v4`, `@v1`). Pinning to commit SHAs is a hardening follow-up.
- `cancel-in-progress` applies to `main` pushes too. Harmless.

---

## 8. Rollback

None of these changes alter data, so **no rollback needs a database restore.** Rolling back 091 or 092 **re-opens** the hole. Prefer a forward fix if the problem is narrow.

| Piece | Rollback | Speed | Side effects |
|---|---|---|---|
| R1 (091) | `alter view public.season_position_stats reset (security_invoker); alter view public.game_inning_validation reset (security_invoker); grant select on public.season_position_stats, public.game_inning_validation to anon;` | Seconds | Anyone with the publishable key can read every team's stats again |
| R6 (092) | `grant execute on function public.get_user_id_by_email(text) to anon, authenticated;` | Seconds | Email lookup open again |
| R5 + CI (app) | Vercel → Deployments → A6 target → **Instant Rollback**. Then `git revert` the R5 commit via PR. | ~1 min | After an Instant Rollback, Vercel stops auto-promoting `main` until you promote a deployment. The A6 target must be post-key-migration. |
| Whole release | App rollback first, then 092, then 091 | Minutes | All three findings re-open |

---

## 9. Effect on existing users

| Area | Change | Expected effect |
|---|---|---|
| **Rosters** | None | None. `players` isn't modified. |
| **Lineups** (edit, save, share) | None to writes. Desktop lineup's season-stats panel now reads the view under the coach's own RLS. | None for owners and accepted coaches (tested). Share links use the server client, so they're unaffected. |
| **Fairness page** | Same view, now under RLS | None for owners and accepted coaches. Pending (not yet accepted) coaches already couldn't read the base tables. |
| **Performance** | RLS is now evaluated inside the views | Negligible at current scale. Watch for a slower Fairness page. |
| **Team invites** | Server-side email lookup now explicitly `service_role` only | None. Uses the `sb_secret_` key, which maps to `service_role`. Validated in B5. |
| **Tryout invites: pending** | None | Links still work. Auto-accept on sign-in still works. |
| **Tryout: removed members** | Old link → **410** *"no longer active"*. Signing in no longer silently reinstates them. | Intended. They ask an org admin to reactivate or re-invite (Q8 shows how many). |
| **Tryout: used link, different account** | **409** *"already used"* | Same as before. The match is now by account ID instead of email. |
| **Tryout: active member, same account** | Accepted as already a member | Same as before, except a member whose login email changed is no longer wrongly told "already used". |
| **Anonymous / logged-out visitors** | Can no longer read the stats views or call the email lookup | No legitimate page relies on either. |
| **Open browser tabs** | No client-bundle change for R1/R6 | No refresh needed. |
