# Six43 — Baseball Lineup Manager

> Build fair lineups. Fast.

---

## Local development setup (Windows + WSL + Docker)

Six43 runs as two pieces on your machine:

| Piece | Where it runs | URL |
|---|---|---|
| Next.js app | Windows (PowerShell) | http://localhost:3000 |
| Supabase (Postgres, Auth, API, Studio, Mailpit) | Docker containers, controlled from Ubuntu (WSL) | http://127.0.0.1:54321 |

Everything below uses **local-only** credentials. You never need production
keys to develop.

### 1. Install the tools (one time)

**Windows**
- **Node.js 22 LTS** (22.13 or newer). Several dev dependencies require
  `^20.19 || >=22.12`. Using a version manager such as
  [nvm-windows](https://github.com/coreybutler/nvm-windows) or
  [fnm](https://github.com/Schniz/fnm) makes switching easy.
- **Git**
- **Docker Desktop**, with *Settings → General → Use the WSL 2 based engine*
  on, and *Settings → Resources → WSL integration* enabled for **Ubuntu**.

**Ubuntu (WSL)**
- Install from PowerShell: `wsl --install -d Ubuntu`
- Inside Ubuntu, check Docker is reachable: `docker ps`
- Install **Node.js 22** inside Ubuntu (for example with
  [nvm](https://github.com/nvm-sh/nvm): `nvm install 22`). Ubuntu only needs
  Node for `npx`, which downloads and runs the Supabase CLI. Nothing else
  needs installing there.

> **Why run the Supabase CLI from WSL?** On this Windows setup, the Windows
> Supabase CLI (`node_modules\supabase\bin\supabase.exe`, from the `supabase`
> devDependency) is **blocked by Windows Device Guard**. Running the Linux CLI
> through `npx` inside Ubuntu avoids that and talks to Docker Desktop through
> WSL integration.

#### Pinning the Supabase CLI version

The commands below use `npx --yes supabase@<version>`. Each run downloads the
CLI version you name (cached after the first time), so there's no global
install to keep in sync.

- **Use an exact version, not `@latest`**, so every machine runs the same CLI
  and gets the same Docker image versions (Postgres, Auth, Mailpit, ...).
  The current pinned version is **`3.1.0`**:

  ```bash
  npx --yes supabase@3.1.0 start
  ```

- **To upgrade:** change the version in this README in a dedicated commit,
  then in Ubuntu run `npx --yes supabase@<new> stop` followed by
  `npx --yes supabase@<new> start`. Read the
  [CLI release notes](https://github.com/supabase/cli/releases) first, since
  major versions can change the local Docker images.
- **Optional shortcut:** add an alias to `~/.bashrc` in Ubuntu so you don't
  repeat the version:

  ```bash
  alias supabase='npx --yes supabase@3.1.0'
  ```

  The rest of this README writes `supabase …`, which means either the alias
  or the full `npx --yes supabase@3.1.0 …` command.

Verify on Windows:
```powershell
node --version     # v22.13+ recommended
docker --version
```

### 2. Get the code and install dependencies (Windows)

```powershell
git clone <repo-url> six43
cd six43
npm install
```

Run `npm install` from **Windows**, not WSL. `node_modules` contains
platform-specific binaries, so it must be installed by the same OS that runs
`npm run dev`.

### 3. Start local Supabase (Ubuntu / WSL)

Open Ubuntu and go to the project through the Windows mount:

```bash
cd /mnt/c/Users/<you>/Projects/six43
npx --yes supabase@3.1.0 start
```

The first run downloads the Docker images (several minutes). It then applies
every file in `supabase/migrations/` in order, so you do **not** need to run
migrations by hand.

When it finishes, show the local URLs and keys any time with:

```bash
supabase status
```

Local services:

| Service | URL |
|---|---|
| API | http://127.0.0.1:54321 |
| Postgres | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| Studio (database UI) | http://127.0.0.1:54323 |
| Mailpit (catches all local email) | http://127.0.0.1:54324 |

Local configuration lives in `supabase/config.toml` (committed). It applies
only to the local stack, never to production. Auth redirects are set up for
`http://localhost:3000` (with `127.0.0.1:3000` also allowed), and email
confirmation is off. After editing `config.toml`, restart with `stop` and then
`start`. The
migrations that load sample data (`004`, `032`) skip themselves on a fresh
database where their owner user doesn't exist.

### 4. Create `.env.local` (Windows, one time)

```powershell
copy .env.example .env.local
```

Fill it in with values from `supabase status` (the legacy JWT-style
`ANON_KEY` / `SERVICE_ROLE_KEY`, which start with `eyJ`):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY from supabase status>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY from supabase status>
NEXT_PUBLIC_APP_URL=http://localhost:3000
ADMIN_EMAIL=<the email you sign up with locally, for /admin>
```

Leave `RESEND_API_KEY`, `RESEND_AUDIENCE_ID` and `ANTHROPIC_API_KEY` unset
for local work. Features that send email or call Claude are skipped or
return an error without them.

`.env.local` and every other `.env*` file except `.env.example` are
git-ignored. **Never put production keys in `.env.local`.**

### 5. Start the app (Windows)

```powershell
npm run dev
```

Open http://localhost:3000 and sign up. With the current local config,
email confirmation is off, so new accounts are confirmed and signed in
immediately. Any email Auth does send shows up in Mailpit.

---

## Daily workflow

**Start**
1. Start **Docker Desktop** (wait until it says *Engine running*).
2. In **Ubuntu**: `cd /mnt/c/Users/<you>/Projects/six43 && npx --yes supabase@3.1.0 start`
3. In **PowerShell**: `cd C:\Users\<you>\Projects\six43; npm run dev`
4. Open http://localhost:3000

**Stop**
1. `Ctrl+C` in the PowerShell window running `npm run dev`.
2. In Ubuntu: `npx --yes supabase@3.1.0 stop`. Your local data is kept for next time.
3. Quit Docker Desktop if you want the memory back.

**Useful commands**

```bash
# Ubuntu / WSL  (supabase = alias for `npx --yes supabase@3.1.0`, see above)
supabase gen types typescript --local > src/lib/database.types.ts
                             # regenerate DB types (use this instead of `npm run db:types`,
                             # which calls the Device Guard-blocked Windows CLI)
supabase status              # URLs + local keys
supabase migration new name  # create a new migration file
supabase db reset            # ⚠ wipes local DB and re-runs all migrations (local only)
supabase stop --no-backup    # ⚠ stop AND delete local data
```

```powershell
# Windows
npm run dev        # dev server
npm test           # unit tests (vitest)
npx tsc --noEmit   # type-check
npm run build      # production build (stop `npm run dev` first; both use .next/)
```

Never run `supabase link`, `supabase db push`, or anything with
`--project-ref` against production from a dev machine unless you mean to.

---

## Project structure

```
six43/
├── supabase/
│   ├── config.toml          # Local Supabase settings (ports, auth, email)
│   └── migrations/          # Database schema, applied in order by `supabase start`
│
└── src/
    ├── types/               # TypeScript types
    ├── lib/                 # Supabase clients and queries
    ├── components/          # UI components
    └── app/                 # Next.js pages and API routes (one folder = one URL)
```

---

## Deploying to production

Production runs on a hosted Supabase project and Vercel. Production
credentials live only in Vercel's environment settings, never in this repo or
in `.env.local`. Vercel deploys automatically when changes are pushed to the
production branch.

---

## Getting help

When something isn't working, paste the error message into Claude and include
which file and which step you're on.
