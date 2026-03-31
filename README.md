# Six43 — Baseball Lineup Manager

> Build fair lineups. Fast.

---

## Getting started from scratch

Follow these steps in order. Each one should take 5–10 minutes.

---

### Step 1: Install the tools you need

You need Node.js and Docker installed on your computer.

- **Node.js**: Download from https://nodejs.org — get the "LTS" version
- **Docker Desktop**: Download from https://docker.com/products/docker-desktop
  - Docker is used to run Supabase locally (a local database on your machine)
  - Start Docker Desktop before running any `supabase` commands

Verify they installed correctly by opening Terminal and running:
```bash
node --version    # should print v20 or higher
docker --version  # should print something like Docker version 26.x
```

---

### Step 2: Get the code running locally

```bash
# 1. Clone or download this project, then navigate into it
cd six43

# 2. Install all dependencies (this reads package.json)
npm install

# 3. Start the local Supabase database
npx supabase start
```

After `supabase start` finishes, it will print something like:
```
API URL:    http://127.0.0.1:54321
DB URL:     postgresql://postgres:postgres@127.0.0.1:54322/postgres
Studio URL: http://127.0.0.1:54323    ← open this to see your local database
anon key:   eyJhbGc...                ← copy this
```

Keep that terminal open. Supabase runs in the background.

---

### Step 3: Set up your environment variables

```bash
# Copy the example file
cp .env.example .env.local
```

Open `.env.local` in any text editor and fill in the values printed by `supabase start`:
```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...  (the anon key from above)
```

---

### Step 4: Run the database migrations

This creates all the tables. Run each migration file in order:

```bash
# Open the Supabase Studio at http://127.0.0.1:54323
# Click "SQL Editor" in the left sidebar
# Paste and run each file in this order:

supabase/migrations/001_core_tables.sql
supabase/migrations/002_season_stats_view.sql
supabase/migrations/003_row_level_security.sql
```

**Don't run 004_seed_data.sql yet** — that needs your user account first.

---

### Step 5: Start the app

```bash
npm run dev
```

Open http://localhost:3000 in your browser. You should see the app.

---

### Step 6: Create your account and load sample data

1. Sign up with an email and password in the app
2. Go to Supabase Studio → Authentication → Users
3. Copy your user UUID (looks like `8f3a2b1c-...`)
4. Open `supabase/migrations/004_seed_data.sql`
5. Replace `'YOUR-USER-UUID-HERE'` with your UUID
6. Run it in SQL Editor

You'll now have the Blue Jays roster and 2 games loaded from the original spreadsheet.

---

## Project structure explained

```
six43/
├── supabase/
│   └── migrations/          # Database setup files — run these in order
│       ├── 001_core_tables.sql      # Creates all tables
│       ├── 002_season_stats_view.sql # The "Positions" sheet replacement
│       ├── 003_row_level_security.sql # Security rules
│       └── 004_seed_data.sql        # Sample data (dev only)
│
└── src/
    ├── types/
    │   └── index.ts          # TypeScript types for every table
    │
    ├── lib/
    │   ├── supabase.ts       # Database client setup
    │   └── queries.ts        # All database queries live here
    │
    ├── components/
    │   ├── ui/               # Reusable UI bits (buttons, inputs)
    │   ├── lineup/           # Lineup grid, position picker, etc.
    │   └── fairness/         # Bench % bars, fairness dashboard
    │
    └── app/                  # Next.js pages (one folder = one URL)
        ├── login/            # /login
        ├── dashboard/        # /dashboard — home screen
        ├── roster/           # /roster — manage players
        ├── games/
        │   ├── new/          # /games/new — create a game
        │   └── [gameId]/     # /games/abc123 — view a game
        │       ├── lineup/   # /games/abc123/lineup — build lineup
        │       └── postgame/ # /games/abc123/postgame — finalize
        └── fairness/         # /fairness — season stats
```

---

## Common commands

```bash
npm run dev          # Start the development server
npm run build        # Build for production
npx supabase start   # Start local database
npx supabase stop    # Stop local database
npm run db:types     # Regenerate TypeScript types from DB schema
```

---

## Deploying to production (when you're ready)

1. Create a free project at https://supabase.com
2. Run migrations 001–003 in Supabase's SQL Editor (not 004)
3. Create a Vercel account at https://vercel.com
4. Connect your GitHub repo to Vercel
5. Add your production Supabase URL and anon key as environment variables in Vercel
6. Deploy — Vercel builds and hosts automatically on every push

---

## Getting help

Every file in this project has comments explaining what it does and why.
When something isn't working, paste the error message into Claude and include
which file and which step you're on.
