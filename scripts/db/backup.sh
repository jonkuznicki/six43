#!/usr/bin/env bash
# =============================================================================
# Six43: read-only logical backup of a Supabase Postgres database.
#
# Run from Ubuntu (WSL):
#   bash scripts/db/backup.sh            # production: prompts for the connection string (hidden)
#   bash scripts/db/backup.sh --local    # rehearsal against the local dev stack (127.0.0.1:54322)
#
# Output: ~/six43-backups/<UTC timestamp>-<label>/   (override: SIX43_BACKUP_ROOT)
#   roles.sql               role settings (no passwords)
#   schema.sql              public schema: tables, views, functions, triggers, indexes,
#                           RLS policies, grants, CREATE EXTENSION statements
#   data.sql                all row data incl. auth.* (users, identities, sessions)
#                           and storage.* metadata
#   migrations_history.sql  supabase_migrations.schema_migrations (only if it exists)
#   MANIFEST.txt            CLI version, rows per table, object counts, extensions, SHA-256
#
# Safety properties:
#   * pg_dump only reads; nothing here can modify the source database.
#   * The connection string is read with `read -s` (not echoed, not in shell
#     history), never written to disk, masked in CLI output, and unset on exit.
#   * Runs from an empty temp directory, so no linked project or repo config.toml is used.
#   * Refuses to write backups inside any git repository.
#   * Output directories are 0700 and files 0600.
# =============================================================================
set -euo pipefail
umask 077

CLI_VERSION="3.1.0"   # pinned: same version as the local stack and verify_restore.sh
BACKUP_ROOT="${SIX43_BACKUP_ROOT:-$HOME/six43-backups}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RUNNER_DIR="$(mktemp -d /tmp/six43-backup-runner.XXXXXX)"
DB_URL=""

cleanup() { DB_URL=""; unset DB_URL; rm -rf "$RUNNER_DIR"; }
trap cleanup EXIT

command -v docker >/dev/null || { echo "docker not found (start Docker Desktop, enable WSL integration)"; exit 1; }
command -v npx    >/dev/null || { echo "npx not found (install Node 22 in Ubuntu, e.g. nvm install 22)"; exit 1; }
docker info >/dev/null 2>&1   || { echo "Docker is not running"; exit 1; }

# ---- Target -----------------------------------------------------------------
if [[ "${1:-}" == "--local" ]]; then
  DB_URL='postgresql://postgres:postgres@127.0.0.1:54322/postgres'   # public local default
  LABEL="local-rehearsal"
elif [[ -z "${1:-}" ]]; then
  echo "Paste the PRODUCTION *Session pooler* connection string (input is hidden):"
  IFS= read -rs DB_URL; echo
  [[ "$DB_URL" == postgres://* || "$DB_URL" == postgresql://* ]] || { echo "Not a postgres URL. Aborting."; exit 1; }
  [[ "$DB_URL" != *"[YOUR-PASSWORD]"* ]] || { echo "Replace [YOUR-PASSWORD] in the string first. Aborting."; exit 1; }
  [[ "$DB_URL" =~ @(127\.0\.0\.1|localhost)[:/] ]] && { echo "That is a local URL; use --local. Aborting."; exit 1; }
  LABEL="production"
else
  echo "Usage: bash scripts/db/backup.sh [--local]"; exit 1
fi

# ---- Output location (never inside a git repo) ---------------------------------
probe="$BACKUP_ROOT"; while [[ ! -d "$probe" ]]; do probe="$(dirname "$probe")"; done
if git -C "$probe" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Refusing: $BACKUP_ROOT is inside a git repository."; exit 1
fi
mkdir -p "$BACKUP_ROOT"; chmod 700 "$BACKUP_ROOT"
OUT="$BACKUP_ROOT/${STAMP}-${LABEL}"
mkdir "$OUT"; chmod 700 "$OUT"
cd "$RUNNER_DIR"

mask() { sed -E 's#(postgres(ql)?://[^:/@]+:)[^@]+@#\1[REDACTED]@#g'; }

dump() { # $1 = output file, remaining args = extra db dump flags. Returns non-zero on failure.
  local f="$1"; shift
  echo "-> $f"
  local rc
  set +e
  npx --yes "supabase@${CLI_VERSION}" db dump --remote="$DB_URL" -f "$OUT/$f" "$@" 2>&1 \
    | mask | grep -vE '^pg_dump: (warning|detail|hint): '
  rc=${PIPESTATUS[0]}
  set -e
  [[ $rc -eq 0 && -s "$OUT/$f" ]]
}

dump roles.sql  --role-only                                                       || { echo "FAILED: roles";  exit 1; }
dump schema.sql                                                                   || { echo "FAILED: schema"; exit 1; }
dump data.sql   --data-only --use-copy -x storage.buckets_vectors -x storage.vector_indexes \
                                                                                  || { echo "FAILED: data";   exit 1; }
if dump migrations_history.sql --data-only --use-copy --schema supabase_migrations; then
  HIST="present"
else
  rm -f "$OUT/migrations_history.sql"; HIST="absent (no supabase_migrations schema; migrations were applied manually)"
fi

# ---- Manifest ---------------------------------------------------------------
copy_counts() { # rows per COPY block
  awk '/^COPY /{t=$2; n=0; c=1; next} c && /^\\\.$/{printf "  %-55s %d\n", t, n; c=0; next} c{n++}' "$1"
}
{
  echo "Six43 backup  label=$LABEL  utc=$STAMP  supabase-cli=$CLI_VERSION"
  echo "migration history: $HIST"
  echo
  echo "Rows per table (data.sql):"
  copy_counts "$OUT/data.sql"
  echo
  echo "Schema objects (schema.sql):"
  grep -oE '^CREATE (OR REPLACE )?(TABLE|VIEW|FUNCTION|TRIGGER|POLICY|INDEX|UNIQUE INDEX|TYPE|SEQUENCE)' "$OUT/schema.sql" \
    | sed -E 's/ OR REPLACE//' | sort | uniq -c | sed 's/^/  /'
  echo
  echo "Extensions (schema.sql):"
  grep -oE '^CREATE EXTENSION IF NOT EXISTS "[^"]+"' "$OUT/schema.sql" | sed -E 's/.*"([^"]+)"/  \1/'
  if [[ -f "$OUT/migrations_history.sql" ]]; then
    echo; echo "Migration history rows:"; copy_counts "$OUT/migrations_history.sql"
  fi
  echo
  echo "SHA-256:"
  (cd "$OUT" && sha256sum *.sql)
} > "$OUT/MANIFEST.txt"
chmod 600 "$OUT"/*

# ---- Final safety checks ------------------------------------------------------
if grep -lE 'postgres(ql)?://[^:/@[:space:]]+:[^@[:space:]\[]+@' "$OUT"/*.sql "$OUT/MANIFEST.txt" >/dev/null 2>&1; then
  echo "WARNING: something that looks like a connection string with a password is in the output."
  echo "Inspect $OUT before keeping or copying it."; exit 1
fi
users=$(awk '$1=="\"auth\".\"users\""{print $2}' "$OUT/MANIFEST.txt")
teams=$(awk '$1=="\"public\".\"teams\""{print $2}'  "$OUT/MANIFEST.txt")
[[ -n "$users" && -n "$teams" ]] || { echo "ERROR: auth.users or public.teams missing from data.sql"; exit 1; }

echo
echo "Backup complete: $OUT"
echo "  auth.users rows: $users    public.teams rows: $teams"
echo "  migration history: $HIST"
echo "Next: bash scripts/db/verify_restore.sh \"$OUT\""
