#!/usr/bin/env bash
# =============================================================================
# Six43: prove a backup is complete and restorable.
#
# Restores into an ISOLATED, throwaway local Supabase stack:
#   * separate project id  : six43-restore-test   (dev stack is "six43")
#   * separate ports       : 563xx (falls back to 573xx, 583xx, 553xx); dev uses 543xx
#   * separate Docker volumes, deleted at the end (and on any failure)
#   * no HTTP API (Kong/PostgREST/Studio not started)
#   * every login role gets a random password right after start, so the
#     restored data isn't reachable with the well-known local default password
# It never contacts production and never touches the dev stack.
#
# Run from Ubuntu (WSL):
#   bash scripts/db/verify_restore.sh ~/six43-backups/<backup-folder>
# =============================================================================
set -euo pipefail

CLI_VERSION="3.1.0"          # must match backup.sh
CLI="npx --yes supabase@${CLI_VERSION}"
PROJECT_ID="six43-restore-test"
WORK="/tmp/${PROJECT_ID}"
DB="supabase_db_${PROJECT_ID}"

[[ $# -eq 1 && -d "$1" ]] || { echo "Usage: bash scripts/db/verify_restore.sh <backup-folder>"; exit 1; }
BACKUP="$(cd "$1" && pwd)"
for f in roles.sql schema.sql data.sql MANIFEST.txt; do
  [[ -s "$BACKUP/$f" ]] || { echo "Missing or empty: $BACKUP/$f"; exit 1; }
done
docker info >/dev/null 2>&1 || { echo "Docker is not running"; exit 1; }

teardown() {
  # Only ever stops the isolated project. Refuses if the id is not ours.
  if [[ -f "$WORK/supabase/config.toml" ]] && grep -q "^project_id = \"$PROJECT_ID\"$" "$WORK/supabase/config.toml"; then
    (cd "$WORK" && $CLI stop --no-backup >/dev/null 2>&1) || true
  fi
  rm -rf "$WORK"
}
trap teardown EXIT

sql()  { docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q "$@"; }
val()  { docker exec "$DB" psql -U postgres -d postgres -Atc "$1"; }

echo "== 1. Checksums"
(cd "$BACKUP" && awk '/^SHA-256:/{f=1;next} f&&NF' MANIFEST.txt | sha256sum -c --quiet -) && echo "   all files match MANIFEST"

echo "== 2. Starting isolated stack ($PROJECT_ID)"
teardown                                   # clear any leftover from an earlier failed run
mkdir -p "$WORK" && cd "$WORK"
$CLI init </dev/null >/dev/null 2>&1
cp supabase/config.toml supabase/config.toml.orig
# Windows/Hyper-V reserves random port blocks (they can move after a reboot), so try
# several isolated blocks. None of them is the dev stack's 543xx.
started=0
for prefix in 563 573 583 553; do
  sed -E "s/^project_id = .*/project_id = \"$PROJECT_ID\"/; s/\b543([0-9]{2})\b/${prefix}\1/g" \
    supabase/config.toml.orig > supabase/config.toml
  grep -q "^project_id = \"$PROJECT_ID\"$" supabase/config.toml || { echo "config rewrite failed"; exit 1; }
  if $CLI start -x kong,postgrest,studio,imgproxy,realtime,storage-api,edge-runtime,logflare,vector,supavisor,mailpit,postgres-meta \
       >/dev/null 2>"$WORK/start.err"; then
    echo "   started on ports ${prefix}xx"; started=1; break
  fi
  echo "   ports ${prefix}xx unavailable, trying next block"
  $CLI stop --no-backup >/dev/null 2>&1 || true
done
[[ $started -eq 1 ]] || { echo "Could not start isolated stack:"; cat "$WORK/start.err"; exit 1; }

echo "== 3. Locking down login roles with random passwords"
rotated=0
for r in $(val "select rolname from pg_roles where rolcanlogin and rolname not like 'pg\_%'"); do
  # supabase_admin is the only superuser (needed for reserved roles); local socket, no password
  docker exec -i "$DB" psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -q \
    -c "alter role \"$r\" password '$(head -c 24 /dev/urandom | base64 | tr -dc A-Za-z0-9)'"
  rotated=$((rotated+1))
done
echo "   rotated $rotated login roles"

echo "== 4. Restoring roles + schema + data (one transaction; triggers off during load)"
{
  cat "$BACKUP/roles.sql"
  cat "$BACKUP/schema.sql"
  echo "SET session_replication_role = replica;"
  cat "$BACKUP/data.sql"
} | sql --single-transaction >/dev/null

echo "== 5. Re-creating auth.users trigger (auth-schema objects aren't in schema.sql)"
sql -c "drop trigger if exists on_auth_user_created on auth.users;
        create trigger on_auth_user_created after insert on auth.users
        for each row execute function public.handle_new_user();" 2>/dev/null

fail=0
check() { # label expected actual
  if [[ "$2" == "$3" ]]; then printf "   OK    %-48s %s\n" "$1" "$3"
  else printf "   FAIL  %-48s expected=%s restored=%s\n" "$1" "$2" "$3"; fail=1; fi
}

echo "== 6. Row counts: every table in MANIFEST vs restored database"
n=0; bad=0
while read -r tbl expected; do
  actual=$(val "select count(*) from $tbl"); n=$((n+1))
  if [[ "$actual" != "$expected" ]]; then check "$tbl" "$expected" "$actual"; bad=1; fi
done < <(awk '/^Rows per table/{f=1;next} /^$/{f=0} f{print $1, $2}' "$BACKUP/MANIFEST.txt")
[[ $bad -eq 0 ]] && echo "   OK    all $n tables match"

echo "== 7. Users and teams"
m() { awk -v t="$1" '$1==t{print $2}' "$BACKUP/MANIFEST.txt"; }
check 'auth.users'                    "$(m '"auth"."users"')"          "$(val 'select count(*) from auth.users')"
check 'auth.identities'               "$(m '"auth"."identities"')"     "$(val 'select count(*) from auth.identities')"
check 'public.teams'                  "$(m '"public"."teams"')"        "$(val 'select count(*) from public.teams')"
check 'public.team_members'           "$(m '"public"."team_members"')" "$(val 'select count(*) from public.team_members')"
check 'public.players'                "$(m '"public"."players"')"      "$(val 'select count(*) from public.players')"
check 'public.games'                  "$(m '"public"."games"')"        "$(val 'select count(*) from public.games')"
check 'users without email'           0 "$(val 'select count(*) from auth.users where email is null and not is_anonymous')"
check 'teams whose owner is missing'  0 "$(val 'select count(*) from public.teams t where not exists (select 1 from auth.users u where u.id=t.user_id)')"
check 'accepted members, user missing' 0 "$(val 'select count(*) from public.team_members m where m.accepted_at is not null and m.user_id is not null and not exists (select 1 from auth.users u where u.id=m.user_id)')"
check 'tryout orgs whose admin missing' 0 "$(val 'select count(*) from public.tryout_orgs o where not exists (select 1 from auth.users u where u.id=o.admin_user_id)')"

echo "== 8. Structure"
mo() { awk -v k="$1" '/^Schema objects/{f=1;next} /^$/{f=0} f && $0 ~ ("CREATE " k "$") {print $1}' "$BACKUP/MANIFEST.txt"; }
check 'public tables'        "$(mo TABLE)"  "$(val "select count(*) from pg_tables where schemaname='public'")"
check 'public views'         "$(mo VIEW)"   "$(val "select count(*) from pg_views where schemaname='public'")"
check 'RLS policies'         "$(mo POLICY)" "$(val "select count(*) from pg_policies where schemaname='public'")"
check 'tables without RLS'   0              "$(val "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and not c.relrowsecurity")"
check 'auth.users trigger'   1              "$(val "select count(*) from pg_trigger where tgname='on_auth_user_created'")"
for ext in $(awk '/^Extensions/{f=1;next} /^$/{f=0} f{print $1}' "$BACKUP/MANIFEST.txt"); do
  check "extension $ext" 1 "$(val "select count(*) from pg_extension where extname='$ext'")"
done
if [[ -f "$BACKUP/migrations_history.sql" ]]; then
  echo "   info  migration history file present (kept as a record; not restored)"
else
  echo "   info  no migration history in this backup (migrations applied manually)"
fi

echo "== 9. Tearing down isolated stack and deleting its volumes"
teardown; trap - EXIT
[[ $fail -eq 0 ]] && echo "RESULT: PASS" || { echo "RESULT: FAIL (see FAIL lines above)"; exit 1; }
