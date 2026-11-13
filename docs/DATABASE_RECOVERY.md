# Six43 — Database Recovery

How Six43's database is backed up, verified and restored. 🔎 marks a step that needs dashboard access.

---

## 1. Background

General Supabase characteristics (from Supabase's public documentation; check them against the current plan):
- Platform backups and Point-in-Time Recovery depend on the plan. The scripts below are an
  independent backup that works on any plan.
- **Restores replace the whole database** (dashboard restore). There's no per-table or per-row restore.
- **Storage objects** (files) are not included in database backups.

---

## 2. Manual backup procedures

The most data that can be lost is everything since the last successful backup.

### 2.1 The scripts
| Script | What it does | Touches production? |
|---|---|---|
| `scripts/db/backup.sh` | Read-only `supabase db dump` (CLI pinned to **3.1.0**) → roles, schema, data, migration history, plus `MANIFEST.txt` (row counts, object counts, extensions, SHA-256). Writes to `~/six43-backups/<UTC>-production/`. | **Reads only** (pg_dump) |
| `scripts/db/backup.sh --local` | Same thing against the local dev stack. Use it to rehearse. | No |
| `scripts/db/verify_restore.sh <folder>` | Restores a backup into a **throwaway, isolated** local stack, compares everything with the manifest, then deletes the stack. | **No** |

### 2.2 One-time setup (Ubuntu / WSL)
1. Docker Desktop running, with WSL integration enabled for Ubuntu (`docker ps` works in Ubuntu).
2. Node 22 in Ubuntu (`nvm install 22`), so `npx` works. Nothing else needs installing; `pg_dump` and `psql` run inside Docker.
3. Production connection string: Supabase Dashboard → **Connect** → **Session pooler** (port 5432, user `postgres.<project-ref>`). The *direct* connection is IPv6-only and usually fails from home networks or WSL. You need the **database password**. If the password contains special characters (`@ : / ? #`), they must be URL-encoded in the string.
   - Keep the password in a password manager. **Never** put it in `.env.local`, a script, the repo, docs, or chat.
   - Resetting the database password (Database → Settings) does not affect the app, which uses API keys. It would break any other tool that uses the old password.

### 2.3 Run a backup
```bash
# Ubuntu (WSL)
cd /mnt/c/Users/<you>/Projects/six43
bash scripts/db/backup.sh                               # paste the Session pooler string at the hidden prompt
bash scripts/db/verify_restore.sh ~/six43-backups/<folder printed above>
```
A backup counts only when `verify_restore.sh` prints **`RESULT: PASS`**.

### 2.4 Schedule
| When | What |
|---|---|
| **Weekly** (e.g. Sunday evening, outside game and tryout times) | `backup.sh` → `verify_restore.sh` → note the result in your log |
| **Before every production migration or security fix** | `backup.sh` → `verify_restore.sh`. The migration goes ahead only after `PASS`. Record the backup folder name in the PR. |
| **Monthly** (first weekly backup of the month) | Make an encrypted off-site copy (§2.6) |
| **Quarterly** | Restore drill: pick an older off-site copy, decrypt it, run `verify_restore.sh` on it |

**Retention:** the last 4 weekly backups, the last 3 monthly encrypted copies, and every pre-migration backup for 30 days. Delete older ones with `rm -rf` (local) and delete them from the off-site store.

### 2.5 Where backups live
- **Primary:** `~/six43-backups/` inside Ubuntu (Linux file system, outside every repo). The script creates folders as `0700` and files as `0600`, and **refuses to write inside a git repository**.
- **Never:** inside the six43 repo, a synced OneDrive/Dropbox folder, email, chat, or any unencrypted cloud storage.
- **Why it's sensitive:** the files contain coaches' emails, bcrypt password hashes, live session/refresh tokens, and children's names and evaluations. Treat a backup like the production database itself.

### 2.6 Monthly encrypted off-site copy
```bash
# Ubuntu (WSL). gpg is preinstalled on Ubuntu; it prompts for a passphrase (store it in your password manager)
cd ~/six43-backups
tar -czf - <folder> | gpg --symmetric --cipher-algo AES256 -o <folder>.tar.gz.gpg
sha256sum <folder>.tar.gz.gpg > <folder>.tar.gz.gpg.sha256
# copy BOTH files to the off-site location (external drive or a cloud folder), e.g.:
cp <folder>.tar.gz.gpg* <off-site location>/
# to restore later:  gpg -d <folder>.tar.gz.gpg | tar -xzf -
```
Losing the passphrase means losing the off-site copies. Keep it in the password manager, not next to the files.

### 2.7 What a backup contains, and what it doesn't
Verified by inspecting real dump output from the local stack with CLI 3.1.0.

| Captured ✅ | Notes |
|---|---|
| All `public` tables and rows (42 tables): teams, rosters, seasons, games, lineups, notes, tournaments, schedules, invites, plans, tryouts | `data.sql` |
| `auth` data: users, identities, sessions, refresh tokens, MFA, audit log | `data.sql`. Users can log in with their existing passwords after a restore. |
| Custom objects in `public`: functions (21), triggers (10), views (2), indexes (58), RLS policies (93), grants | `schema.sql` |
| Extensions: `pg_stat_statements`, `pgcrypto`, `supabase_vault`, `uuid-ossp` | `CREATE EXTENSION` statements in `schema.sql` |
| Role settings (e.g. statement timeouts) | `roles.sql` (no passwords) |
| Migration history (`supabase_migrations.schema_migrations`) | `migrations_history.sql`, **only if production has it**. The manifest says whether it was present. Kept as a record and not restored. |
| Storage *metadata* (`storage.buckets` / `storage.objects` rows) | `data.sql` |

| Not captured ❌ | How it's handled |
|---|---|
| **Custom objects in the `auth` schema**, i.e. the `on_auth_user_created` trigger on `auth.users` (migration `013`) | `verify_restore.sh` re-creates it. Any real restore must too (§4c). |
| **Storage file contents** | The app code doesn't use Supabase Storage. 🔎 Confirm Dashboard → Storage shows no buckets; if files are ever added, back them up separately. |
| **Auth configuration**: email confirmation, Site URL / redirect URLs, email templates, SMTP, rate limits | Screenshot these pages with each monthly backup. |
| **Secrets and keys**: API keys, JWT secret, database password, Vercel env vars | Not needed to recover data. Kept in the dashboards and your password manager. |
| Edge Functions, Realtime publications, Vault secrets, cron jobs, webhooks | **None are used** (checked in the repo). Re-check if that changes. |
| `storage.buckets_vectors`, `storage.vector_indexes` | Excluded per Supabase's documented command (unused). |
| Data written **after** the backup started | Inherent to point-in-time snapshots |

### 2.8 Safety properties of the scripts (reviewed)
- `backup.sh` only runs `pg_dump`, which reads. It can't modify the source database.
- **Credentials:**
  - The connection string is read with a hidden prompt, so it isn't echoed or saved in shell history.
  - It's never written to disk, masked in CLI output, and cleared on exit.
  - The script runs from an empty temp directory, so no linked project and no repo `config.toml` is used (no risk of `db push`).
  - It refuses placeholder passwords and local URLs in production mode.
  - It fails if anything resembling a password-bearing connection string ends up in the output files.
- **Repo isolation:**
  - Backups default to `~/six43-backups/`, and the script refuses any location inside a git repository. Nothing the scripts produce lands in the repo.
  - The scripts themselves contain no secrets.
- **Restore isolation** (`verify_restore.sh`):
  - It uses its own project id (`six43-restore-test`), its own Docker volumes, and its own port block (563xx, falling back to 573xx/583xx/553xx because Windows reserves random port ranges). It **never** uses the dev stack (`six43`, 543xx) and never contacts production.
  - No HTTP API is started (no Kong, PostgREST or Studio).
  - Every login role gets a random password before any data is loaded. The CLI publishes database ports on all interfaces, and the local default password is public knowledge.
  - The stack and its volumes are deleted when the script ends, **including on failure**. Teardown refuses to run unless the project id is `six43-restore-test`.
- **Only destructive command:** `supabase stop --no-backup`, guarded by that project-id check, and it only deletes the throwaway stack.
- **Known limitation:** the restore test uses the Auth version bundled with CLI 3.1.0. If production's Auth schema ever has columns this version lacks, the data load fails loudly. Fix by bumping the pinned CLI in both scripts (and the README), after testing.

### 2.9 Confirming a backup succeeded (checklist)
- [ ] `backup.sh` ends with `Backup complete: ~/six43-backups/<UTC>-production` and shows non-zero `auth.users` and `public.teams` rows.
- [ ] The folder holds `roles.sql`, `schema.sql`, `data.sql`, `MANIFEST.txt` (and `migrations_history.sql` if present). `ls -l` shows `-rw-------`.
- [ ] `MANIFEST.txt` row counts look plausible against the Supabase Table Editor (`auth.users` ≈ user count under Authentication → Users; `teams`, `players`, `games` roughly as expected).
- [ ] `MANIFEST.txt` lists 42 tables, 2 views, 93 policies (or more, if newer migrations add objects) and 4 extensions.
- [ ] `verify_restore.sh` prints `RESULT: PASS`, with "all N tables match" and every users/teams/structure line `OK`.
- [ ] Afterwards, `docker ps -a | grep restore-test` shows nothing.
- [ ] `git status` in the six43 repo shows no new files.
- [ ] Log the date, folder name and PASS in a private note.

---

## 3. Migration safety guidelines

- **Never edit a migration that has already run in production.** Add a new one.
- **Use expand → migrate → contract** for breaking changes:
  1. Add the new column or table (nullable or defaulted); deploy code that writes both.
  2. Backfill.
  3. Deploy code that reads the new shape.
  4. Drop the old column in a later release, after a backup.
- **Additive by default.** `CREATE TABLE`, `ADD COLUMN NULL`, `CREATE INDEX CONCURRENTLY`, new policies.
- **Requires a rollback script and explicit approval:** `DROP TABLE/COLUMN`, `TRUNCATE`, `DELETE`/`UPDATE` affecting more than a handful of rows, `ALTER COLUMN TYPE`, changing or dropping RLS policies, changing FK `ON DELETE` rules.
- **Data-fix migrations** (like `073` "repair blank first names"): first run the `SELECT` that identifies affected rows and record the count. Wrap the change in a transaction, and save the original values to a backup table first:
  ```sql
  begin;
  create table _backup_073_players as select * from players where <condition>;
  update players set ... where <condition>;
  -- check the row count matches the SELECT, then:
  commit;  -- or rollback;
  ```
- **RLS:** every new table gets `enable row level security` and its policies in the **same** migration. Every new view gets `with (security_invoker = on)`. Every new `SECURITY DEFINER` function: `revoke execute ... from public, anon` unless it is intentionally public, and check `auth.uid()` or a token inside.
- **Idempotency:** use `if not exists` / `drop ... if exists` where possible, so a partial run can be safely re-run.
- **Test locally** with `supabase db reset`, then on staging, before production.

---

## 4. Restore procedures

### 4a. Accidental deletion of a small amount of data (one team, some games)
**Preferred: targeted recovery. Don't restore the whole database.**
1. Stop the bleeding. If a code path is deleting data, roll back the app (Vercel Instant Rollback).
2. Identify exactly what was lost: table, IDs, and time window. Check `tryout_audit_log` where relevant.
3. Get a copy of the old data **without touching production**:
   - **Restore to a new project** from a backup or PITR timestamp just before the deletion. Supabase supports restoring into a separate project; 🔎 check availability on your plan. Alternatively, `pg_restore` your own logical dump into a scratch database.
4. Export only the affected rows from the scratch copy, respecting FK order: `teams → seasons → players → games → lineup_slots → ...`.
5. Review the rows, then insert them into production in a single transaction (approved SQL). Use the original UUIDs so references line up. Skip rows that already exist.
6. Verify with the affected coach, then delete the scratch project.

### 4b. Destructive migration (dropped column or table, bad UPDATE)
1. Roll back the app if the new code depends on the change, or if the old code breaks.
2. If the migration's own rollback script exists, review it and run it (approved).
3. If data was destroyed, follow 4a (restore to a side project, copy the lost data back).
4. Write a forward-fix migration so the repo, staging and production agree again.

### 4c. Full database restore (last resort)
Use only when the database as a whole is corrupted or compromised and targeted recovery is impossible.
1. Put the app into maintenance (for example, roll back to a deployment that shows a maintenance page, or pause the project).
2. Take a logical dump of the **current** state first, so nothing created since the backup is lost forever.
3. Restore a verified `scripts/db/backup.sh` backup (or use the dashboard restore, if the plan provides one).
   Use the same commands `verify_restore.sh` runs (`roles.sql` → `schema.sql` →
   `SET session_replication_role = replica` → `data.sql`, in one transaction), then re-create the
   `on_auth_user_created` trigger. Target a **new** Supabase project where possible, then repoint the app's env vars.
   Only after rehearsing on the throwaway stack, and only with explicit approval.
4. Replay any legitimate post-backup data from the dump in step 2, where possible.
5. Re-verify that migrations, RLS and Auth settings are as expected; run the isolation checks.

### Risks of a full restore while users are active
- **Every change made after the restore point is lost**, for **all** teams, not just the affected one: new accounts, lineups saved at games, stats entered, tryout scores, invite acceptances.
- New users who signed up after the restore point disappear from `auth.users`. Their sessions break and their data is gone.
- Emails already sent (invites, password resets) contain tokens or links that no longer exist.
- The restore causes downtime. Dashboard restores take minutes to hours depending on size.
- Restoring auth data can resurrect deleted accounts or revoked memberships.

That's why targeted recovery (4a) is the default.

---

## 5. Data-loss prevention practices
- An independent periodic `pg_dump` (§2), plus PITR where the plan provides it.
- Destructive UI actions (`tryouts/admin/reset`, account deletion, season delete) keep their confirmation steps.
- Admin and destructive routes write to an audit log (for example `tryout_audit_log`).
- No ad-hoc SQL in production. Run reviewed, saved scripts only.
- Staging uses synthetic data only.
