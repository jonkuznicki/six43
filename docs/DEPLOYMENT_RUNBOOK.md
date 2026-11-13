# Six43 — Deployment Runbook

How a change gets from a laptop to six43.com, and how to undo it.
🔎 marks a step that needs dashboard access (Vercel / Supabase / GitHub).

---

## 0. Overview

- **App:** merging to `main` triggers a Vercel production build that goes live on six43.com.
  Other branches get Vercel **Preview** deployments.
- **Database:** migrations are **not** deployed with the app. They are applied separately
  (Supabase SQL Editor), in the order described in Step 7.
- **CI:** `.github/workflows/ci.yml` runs on every pull request (§4).
- **Rollback:** Vercel Instant Rollback for the app (§3a). Migrations carry their own rollback SQL (§3c).

---

## 1. Target release process

```
feature branch → local Supabase → checks → PR review → preview + staging DB
   → explicit approval → (DB migration on prod, if any) → merge to main → verify → monitor
```

### Step 1 — Branch
```powershell
git switch main; git pull
git switch -c feat/<short-name>
```

### Step 2 — Develop against local Supabase only
- `.env.local` points at `http://127.0.0.1:54321` (see README).
- Schema changes go in a **new** migration file. Never edit a migration that has already been applied to production.
  ```bash
  # Ubuntu / WSL
  npx --yes supabase@3.1.0 migration new <name>
  npx --yes supabase@3.1.0 db reset   # local only: proves the full chain applies cleanly
  ```

### Step 3 — Local checks (all must pass)
```powershell
npm test
npx tsc --noEmit
npm run test:rls    # cross-team / anonymous access tests (needs local Supabase running)
npm run lint        # after ESLint is configured (currently not set up)
npm run build       # stop `npm run dev` first
```

### Step 4 — Pull request and review
- Open a PR into `main`. The PR description includes:
  - What changed, and how it was tested.
  - **Database impact:** none / additive / destructive. Link the migration file(s).
  - **Rollback plan:** "revert the PR", or the specific SQL to undo the migration.
  - For any new service-role code: the authorization check it performs.
- Required checks (once CI exists): tests, type-check, lint, build, migration-applies-cleanly.

### Step 5 — Preview + staging
- Vercel builds a Preview for the PR. Preview env vars point at the **staging** Supabase project (never production).
- If the PR has a migration, apply it to **staging** first and exercise the feature on the preview URL.
- Run the RLS isolation checks (§5) against staging.

### Step 6 — Approval gate (required)
Before anything touches production, the owner (Jon) explicitly approves in the PR:
> "Approved for production: <PR #>, migration <file> (or: no DB change)."

No merge to `main` and no production SQL happens without this.

### Step 7 — Production deploy
**Order matters.** Migrations must be **backward-compatible** with the currently live code.

1. Record the current production deployment ID and commit SHA (Vercel → Deployments). This is your rollback target.
2. If there's a migration:
   1. Confirm a fresh backup or restore point exists (`DATABASE_RECOVERY.md` §2).
   2. Apply the migration to production (SQL Editor, or the CLI once adopted) **before** merging the code. The old code must keep working against the new schema.
   3. Record it as applied (file name, date and time) in your private release log.
3. Merge the PR into `main` (squash merge). Vercel builds and promotes it to production.
4. Watch the Vercel build log until the deployment is *Ready* and assigned to six43.com.

### Step 8 — Verify (within 15 minutes)
- [ ] Vercel shows the new deployment as **Production / Current**, with the expected commit SHA.
- [ ] https://six43.com loads; log in with a real coach account.
- [ ] Dashboard shows teams; open a roster, a game lineup, and the fairness page.
- [ ] The changed feature works as intended.
- [ ] Log in as a **second team's** account (or a test account) and confirm you see none of the first team's data.
- [ ] Vercel → Logs: no new 5xx errors. Supabase → Logs (API / Postgres): no new errors.
- [ ] If invites or email changed: send one to yourself.

Keep monitoring Vercel and Supabase logs for at least 24 hours after any DB change.

### Step 9 — Roll back if needed (§3)

---

## 2. Pre-deployment checklist

- [ ] PR approved by the owner, with the approval written in the PR.
- [ ] Tests, type-check, lint and build all pass.
- [ ] Migration reviewed: additive or backward-compatible; destructive steps have a rollback script.
- [ ] Migration applied and tested on staging; the preview was exercised.
- [ ] RLS isolation checks pass on staging.
- [ ] No secrets in the diff; no new `NEXT_PUBLIC_` variable holds a secret.
- [ ] New service-role usage has an explicit authorization check.
- [ ] Production backup or restore point confirmed (if there's a DB change).
- [ ] Current production deployment ID and SHA recorded.
- [ ] Deploy at a low-traffic time (not on a game day or tryout day).

---

## 3. Rollback procedure

### 3a. Application rollback in Vercel (fastest, about 1 minute)
1. Vercel → Project → **Deployments**.
2. Find the last known-good **Production** deployment (the ID and SHA you recorded in Step 7.1).
3. Open its **⋯** menu → **Instant Rollback**, or **Promote to Production**. 🔎 Plan limits may restrict how far back Instant Rollback can go.
4. **Important** (per Vercel's docs; 🔎 confirm the current behavior): after an Instant Rollback, Vercel stops automatically promoting new `main` builds until you undo the rollback or promote a deployment manually. Expect this, and don't be surprised when the next merge doesn't go live.
5. Verify: run through the Step 8 checklist and confirm the deployment page shows the old SHA.

### 3b. Git rollback (makes the fix permanent)
```powershell
git switch main; git pull
git revert <bad-merge-sha>        # use -m 1 for a merge commit
# open a PR with the revert → checks → approval → merge
```

| | Vercel rollback | Git revert |
|---|---|---|
| Speed | Seconds; no build | A full build (minutes) |
| What changes | Which already-built deployment serves traffic | The source code on `main` |
| Env vars | Uses the env vars **from when that deployment was built** | Builds with today's env vars |
| Database | **Untouched** | **Untouched** |
| Permanence | Temporary. The next promoted build replaces it | Permanent and visible in history |
| Use when | Immediate damage control | Following up a Vercel rollback, or for non-urgent fixes |

Do both in an incident: Vercel rollback first to stop the damage, then git revert so `main` matches what's live.

### 3c. Database rollback
**Neither app rollback undoes a migration or restores data.** If the bad release changed
the schema or data, follow `DATABASE_RECOVERY.md` §4. Prefer a forward-fix migration over a restore.
Because migrations must be backward-compatible (Step 7.2), rolling back the app alone
should normally be safe.

---

## 4. Configuration

### GitHub — branch protection for `main`
- Require a pull request before merging. One approval is fine as a solo developer if you
  also allow yourself to bypass only in emergencies; otherwise require the PR without approvals.
- Require status checks: `test`, `typecheck`, `lint`, `build` (from a GitHub Actions workflow).
- Require branches to be up to date; require linear history (squash merges).
- Block force pushes and deletion of `main`.

### GitHub Actions CI (`.github/workflows/ci.yml`)
- **`Tests, type-check, build`:** `npm ci`, `npm test`, `npx tsc --noEmit`, `npm run build`
  (with placeholder `NEXT_PUBLIC_*` values; **no real secrets in CI**).
- **`Migrations + cross-team access tests`:** starts a throwaway local Supabase stack in the
  runner, applies every migration from scratch, and runs `npm run test:rls`.
- Lint will be added once ESLint is configured.

### Vercel
- Production Branch: `main`.
- **Production** env: production Supabase URL, anon key, service-role key, Resend, Anthropic, `ADMIN_EMAIL`, `NEXT_PUBLIC_APP_URL=https://six43.com`.
- **Preview** env: **staging** Supabase URL, anon key and service-role key; `NEXT_PUBLIC_APP_URL` unset or the preview URL; no Resend key (or a test key); no Anthropic key, or a capped one.
- **Development** env: nothing (local uses `.env.local`).
- Deployment Protection: Vercel Authentication on Preview deployments.

### Supabase staging
- Create a second Supabase project, `six43-staging`. Free tier is fine.
- Apply all 90 migrations to it, then apply each new migration there first.
- Use only synthetic data. **Never copy production user data into staging.**
- Email confirmation on, matching production. Redirect URLs: the Vercel preview domain.

### Migration process
- Adopt the Supabase CLI migration history (`supabase_migrations.schema_migrations`) for staging and production, once production's actual state is reconciled with the repo.
- Apply with `supabase db push` against staging from a deliberate, separate shell. For production, only after approval and only from a dedicated session that is unlinked afterwards. Alternatively, keep using the SQL Editor, but record every applied file.

---
## 5. RLS and multi-team isolation tests

`tests/rls/` runs against the **local** stack only; the helpers refuse any non-local URL.
Run with `npm run test:rls`. Coverage to keep extending:
1. Create users A and B. A owns Team A; B owns Team B.
2. As B, attempt to read and write Team A's `teams`, `seasons`, `players`, `games`, `lineup_slots`, `player_eval_notes`, `tournaments`, `team_members`. Expect 0 rows or permission denied.
3. As `anon`, every table and view in `public` returns 0 rows or permission denied.
4. As `anon`, call each SECURITY DEFINER RPC with a random UUID and with another org's ID. Expect no data.
5. Tryout orgs: a member of Org A cannot read Org B's `tryout_*` rows; a removed member cannot re-activate themselves.
6. Service-role API routes: as user B, call each route with Team A / Org A identifiers. Expect 403.
