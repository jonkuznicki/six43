# Tryout & Team Formation Module
## Claude Code Build Specification
### For: six43.com

---

## FIRST STEP FOR CLAUDE CODE

Before writing any code, read the existing six43.com codebase and identify:
1. The exact tech stack (framework, ORM, auth library, UI component library, styling)
2. The existing folder/file structure and naming conventions
3. Any existing database schema (Prisma schema.prisma or equivalent)
4. Any existing auth setup (NextAuth, Clerk, Auth.js, custom, etc.)
5. Any existing component patterns and design system in use

Match everything you build to what already exists. Do not introduce new libraries
or patterns if the existing codebase already handles that concern.

---

## CONTEXT & GOAL

This is a **Tryout & Team Formation module for six43.com**.

**Primary user**: Hudson Baseball (a youth travel baseball organization in Hudson, OH)
is the first customer and the reference implementation. Hudson Baseball's current
process — described in detail below — is what this system replaces. However,
this module must be designed and built to work for **any sports organization**
that runs tryouts, not just Hudson Baseball.

**Product positioning**: This is a module within six43.com. Organizations that
already use six43.com for team management can activate this module and it
integrates with their existing teams, rosters, and player records. Organizations
that don't yet use six43.com can use this module standalone, and it becomes
the entry point for them adopting the broader platform.

---

## CURRENT PROCESS (what this replaces at Hudson Baseball)

Hudson Baseball currently runs tryouts using 5–8 disconnected spreadsheets,
reconciled manually each year. The files in `/docs/sample-data/` show exactly
what they use today.

### Source 1: Registration export
- Exported from an external registration platform
- Contains: player name, DOB, parent email/phone, grade, school, prior org/team,
  tryout age group
- ~249 players across all age groups (8U–12U) for 2026

### Source 2: End-of-season coach evaluations
- One spreadsheet per team, submitted by each head coach at end of season
- Scores each player 1–5 on 14 attributes:
  - **Fielding/Hitting**: Ground Balls, Fly Balls, Receiving Throws, Range/Footwork,
    Throwing, Hitting, Speed, Athleticism
  - **Pitching/Catching**: Pitching, Catching (null if not applicable)
  - **Intangibles**: In-Game Decision Making, Coachability, Attitude, Composure,
    Commitment, Leadership
- Includes freeform comments per player
- Currently: coaches fill out Excel templates and email them to the director

### Source 3: Tryout evaluation spreadsheets
- Multiple evaluators score players at stations during tryout days
- Stations: 60yd dash, Ground Balls (hands/range/arm), Fly Balls (judging/catching/arm),
  Hitting (contact/power), Pitching (velo/control), Catching (receiving/arm)
- Currently: paper scoring → manual entry into Excel after the fact
- Multiple tryout sessions per age group (Week 1 Day 1, Week 1 Day 2, etc.)
- Multiple evaluators per session (each has their own column block)

### Source 4: GameChanger season stats
- Exported from GameChanger as a CSV
- 157 columns covering batting, pitching, and fielding stats
- Multi-row header structure (section headers + stat names)
- Player identified by First + Last name columns

### Source 5: Team-making spreadsheet (the final artifact)
- Manually combines all of the above
- Calculates a combined score per player:
  - Tryout score: 40%
  - Coach eval score: 40%
  - Intangibles score: 10%
  - GC stat score: 10%
- Ranks players within each age group
- Director and coaches use this to assign players to teams

### Key pain points eliminated by this system:
- Player names don't match across sources ("Timmy Aqua" vs "Timothy Aqua")
- Coach evals are emailed as separate files, merged manually
- No real-time scoring during tryouts — paper scored, entered later
- No audit trail for team decisions
- Everything rebuilt from scratch each year
- No way for coaches to enter evaluations directly in the platform

---

## MULTI-ORGANIZATION DESIGN

Every entity in this module is scoped to an Organization. Use the Organization
model that already exists in six43.com. If it doesn't exist, define it.

Key principles:
- A Player belongs to an Organization
- A Season belongs to an Organization
- A Team belongs to a Season
- Evaluators/coaches only see data for their own organization
- Org admin manages all data within their org
- Platform admin (six43.com level) can see all orgs

Orgs configure their own:
- Age groups (8U, 9U, 10U, 11U, 12U, etc.)
- Tryout scoring categories and weights
- Coach eval rubric (fields, labels, scale)
- Team names and colors

Scoring category names, weights, and rubric fields must NOT be hardcoded —
they live in config tables per organization. Hudson Baseball is the reference
implementation, not the only valid configuration.

---

## USER ROLES & PERMISSIONS

### Platform level
- `platform_admin`: manages all organizations, users, billing

### Organization level
- `org_admin`: full access — manages seasons, teams, users, imports, settings.
  Hudson Baseball: Jon Berghoff.
- `head_coach`: views their team's data, enters end-of-season evaluations for
  their players, views tryout results for their age group
- `evaluator`: scores players during a live tryout session (mobile screen only),
  cannot see other evaluators' scores until session is closed
- `parent` / `player`: read-only access to their own player's development record
  (Phase 2 — not needed at MVP)

---

## ADMIN SCREENS REQUIRED

All accessible to `org_admin`. Build these as part of the module.

- **Organization settings**: name, logo, sport type, age groups
- **Season management**: create/edit seasons, set age groups, configure score weights
- **User management**: invite by email, assign roles, deactivate
- **Player management**: view all players, merge duplicates, edit records, audit trail
- **Team management**: create/edit teams per season, assign head coach, set color
- **Tryout session management**: create sessions (date, time, field, age group),
  assign evaluators, set status (scheduled → open → closed), monitor live scoring
- **Import center**: upload files, review match results, track import history
- **Scoring rubric config**: configure tryout categories/weights and coach eval
  fields per season. Changes apply to new seasons only.

---

## DATA MODEL

Extend the existing six43.com schema. Prefix all new tables with `tryout_`
to namespace them within the broader platform.

If Prisma is in use, add to existing schema.prisma. Match the ORM in use.

```prisma
// ─── PLAYER IDENTITY EXTENSIONS ──────────────────────────────────
// Extend the existing Player model with these fields if not present:
// dateOfBirth, grade, school, parentEmail, parentPhone, priorOrg, priorTeam

model TryoutPlayerAlias {
  id          String   @id @default(cuid())
  playerId    String
  player      Player   @relation(fields: [playerId], references: [id])
  rawName     String   // name as it appeared in the source file
  source      String   // "registration"|"coach_eval"|"tryout"|"gamechanger"|"manual"
  confidence  Float    // 0.0–1.0
  confirmed   Boolean  @default(false)
  confirmedBy String?
  confirmedAt DateTime?
  createdAt   DateTime @default(now())
}

// ─── SEASON & CONFIGURATION ──────────────────────────────────────

model TryoutSeason {
  id          String       @id @default(cuid())
  orgId       String
  org         Organization @relation(fields: [orgId], references: [id])
  year        Int
  label       String       // "2026 Season"
  sport       String       @default("baseball")
  ageGroups   String[]     // ["8U","9U","10U","11U","12U"]
  isActive    Boolean      @default(true)

  // Score weights (sum to 1.0, configurable)
  tryoutWeight        Float @default(0.40)
  coachEvalWeight     Float @default(0.40)
  intangiblesWeight   Float @default(0.10)
  priorStatsWeight    Float @default(0.10)

  sessions        TryoutSession[]
  teams           TryoutTeam[]
  scoringConfig   TryoutScoringConfig[]
  evalConfig      TryoutCoachEvalConfig[]
  importJobs      TryoutImportJob[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model TryoutScoringConfig {
  // Configurable tryout scoring categories per season/org
  id            String       @id @default(cuid())
  seasonId      String
  season        TryoutSeason @relation(fields: [seasonId], references: [id])
  category      String       // "speed"|"ground_balls"|"fly_balls"|"hitting"|"pitching"|"catching"
  label         String       // "60-yard dash", "Ground Balls", etc.
  subcategories Json         // [{ key: "hands", label: "Hands", weight: 0.33 }, ...]
  weight        Float        // weight of category in overall tryout score
  isOptional    Boolean      @default(false)
  sortOrder     Int
}

model TryoutCoachEvalConfig {
  // Configurable coach eval rubric per season/org
  id        String        @id @default(cuid())
  orgId     String
  seasonId  String?       // null = org default
  section   String        // "fielding_hitting"|"pitching_catching"|"intangibles"
  fieldKey  String        // "fielding_ground_balls"|"throwing"|"coachability" etc.
  label     String
  isOptional Boolean      @default(false)
  sortOrder Int
}

// ─── TRYOUT SESSIONS ─────────────────────────────────────────────

model TryoutSession {
  id          String       @id @default(cuid())
  seasonId    String
  season      TryoutSeason @relation(fields: [seasonId], references: [id])
  ageGroup    String
  sessionDate DateTime
  startTime   String?      // "9:00 AM"
  endTime     String?      // "12:00 PM"
  field       String?      // "Hudson Memorial Field 1"
  label       String       // "Week 1 / Day 1"
  status      String       @default("scheduled") // "scheduled"|"open"|"closed"

  evaluators  TryoutSessionEvaluator[]
  scores      TryoutScore[]
}

model TryoutSessionEvaluator {
  id          String        @id @default(cuid())
  sessionId   String
  session     TryoutSession @relation(fields: [sessionId], references: [id])
  userId      String
  name        String
  station     String?
}

// ─── SCORING ─────────────────────────────────────────────────────

model TryoutScore {
  id              String        @id @default(cuid())
  playerId        String
  player          Player        @relation(fields: [playerId], references: [id])
  sessionId       String
  session         TryoutSession @relation(fields: [sessionId], references: [id])
  evaluatorId     String
  evaluatorName   String

  // Scores stored as JSON to support configurable categories
  // Shape: { "speed_60yd": 3.5, "gb_hands": 4, "gb_range": 3, ... }
  scores          Json

  // Computed rollups
  tryoutScore     Float?
  tryoutPitching  Float?
  tryoutCatching  Float?

  comments        String?
  submittedAt     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

// ─── COACH EVALUATIONS ───────────────────────────────────────────

model TryoutCoachEval {
  id              String   @id @default(cuid())
  playerId        String
  player          Player   @relation(fields: [playerId], references: [id])
  orgId           String
  seasonYear      String   // "2025" — the season being evaluated
  teamId          String?  // six43.com team ID if team exists
  teamLabel       String   // "10u Blue"
  coachUserId     String?
  coachName       String

  // Scores as JSON to support configurable rubric
  // Shape: { "fielding_ground_balls": 4, "throwing": 3, "coachability": 5, ... }
  scores          Json

  coachEvalScore    Float?
  coachEvalRank     Int?
  intangiblesScore  Float?
  intangiblesRank   Int?

  comments        String?
  status          String   @default("draft") // "draft"|"submitted"|"reviewed"|"finalized"
  submittedAt     DateTime?
  reviewedBy      String?
  reviewedAt      DateTime?

  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

// ─── GAMECHANGER / PRIOR STATS ───────────────────────────────────

model TryoutGCStat {
  id          String   @id @default(cuid())
  playerId    String
  player      Player   @relation(fields: [playerId], references: [id])
  orgId       String
  seasonYear  String
  teamLabel   String
  source      String   @default("gamechanger")

  // Batting
  gamesPlayed Int?
  pa          Int?
  ab          Int?
  avg         Float?
  obp         Float?
  ops         Float?
  slg         Float?
  h           Int?
  doubles     Int?
  triples     Int?
  hr          Int?
  rbi         Int?
  r           Int?
  bb          Int?
  so          Int?
  sb          Int?
  sbPct       Float?
  xbh         Int?
  qab         Int?
  qabPct      Float?

  // Pitching
  ip          Float?
  gs          Int?
  w           Int?
  l           Int?
  sv          Int?
  era         Float?
  whip        Float?
  strikePct   Float?

  // Fielding
  tc          Int?
  fpct        Float?
  errors      Int?

  rawJson     Json?
  createdAt   DateTime @default(now())
}

// ─── COMBINED SCORING & RANKINGS ─────────────────────────────────

model TryoutCombinedScore {
  id                String   @id @default(cuid())
  playerId          String   @unique
  player            Player   @relation(fields: [playerId], references: [id])
  orgId             String
  seasonId          String
  ageGroup          String

  // Component scores (normalized to 0–5 scale)
  tryoutScore       Float?
  coachEvalScore    Float?
  intangiblesScore  Float?
  priorStatScore    Float?

  // Weights snapshotted at calculation time
  tryoutWeight      Float
  coachEvalWeight   Float
  intangiblesWeight Float
  priorStatWeight   Float

  combinedScore     Float?
  combinedRank      Int?

  // Specialty scores
  pitchingScore     Float?
  catchingScore     Float?
  speedScore        Float?
  hittingScore      Float?

  adminNotes        String?
  lockedRank        Boolean  @default(false)

  calculatedAt      DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

// ─── TEAM FORMATION ──────────────────────────────────────────────

model TryoutTeam {
  id             String       @id @default(cuid())
  seasonId       String
  season         TryoutSeason @relation(fields: [seasonId], references: [id])
  orgId          String
  name           String       // "Blue", "White", "Gray"
  ageGroup       String
  color          String?
  coachName      String?
  coachUserId    String?
  platformTeamId String?      // link to six43.com Team once finalized

  players        TryoutTeamAssignment[]
  createdAt      DateTime @default(now())
}

model TryoutTeamAssignment {
  id          String     @id @default(cuid())
  playerId    String
  player      Player     @relation(fields: [playerId], references: [id])
  teamId      String
  team        TryoutTeam @relation(fields: [teamId], references: [id])
  isLocked    Boolean    @default(false)
  isCoachKid  Boolean    @default(false)
  assignedBy  String     // "auto"|"draft"|"manual"|userId
  notes       String?
  assignedAt  DateTime   @default(now())

  @@unique([playerId, teamId])
}

// ─── NOTES, IMPORTS, AUDIT ───────────────────────────────────────

model TryoutPlayerNote {
  id          String   @id @default(cuid())
  playerId    String
  player      Player   @relation(fields: [playerId], references: [id])
  orgId       String
  authorId    String
  authorName  String
  body        String
  source      String   // "coach_eval"|"tryout"|"admin"|"import"
  isPrivate   Boolean  @default(true)
  createdAt   DateTime @default(now())
}

model TryoutImportJob {
  id              String       @id @default(cuid())
  orgId           String
  seasonId        String
  season          TryoutSeason @relation(fields: [seasonId], references: [id])
  importedBy      String
  type            String       // "registration"|"coach_eval"|"tryout"|"gamechanger"
  filename        String
  status          String       // "pending"|"processing"|"needs_review"|"complete"|"error"
  rowsTotal       Int?
  rowsMatched     Int?
  rowsSuggested   Int?
  rowsUnresolved  Int?
  rowsCreated     Int?
  matchReport     Json?
  errorLog        String?
  createdAt       DateTime @default(now())
  completedAt     DateTime?
}

model TryoutAuditLog {
  id          String   @id @default(cuid())
  orgId       String
  actorId     String
  actorName   String
  action      String   // "player.merged"|"team.assigned"|"eval.submitted" etc.
  entityType  String
  entityId    String
  before      Json?
  after       Json?
  createdAt   DateTime @default(now())
}
```

---

## IMPORT & PARSING

Use whatever file parsing library already exists in six43.com.
If none, add `xlsx` (npm) for Excel and `papaparse` for CSV.

### Registration Import
- Row 0 = date header (skip), Row 1 = actual column headers
- Read with `header: 1` offset

Key columns:
```
"Full Name"                        → split to firstName + lastName
"First Name" / "Last Name"         → firstName / lastName
"Date of Birth"                    → dateOfBirth
"Tryout Age Group"                 → ageGroup
"Account Email" OR "Email"         → parentEmail
"Guardian Phone"                   → parentPhone
"2025 Organization"                → priorOrg
"2025 Team"                        → priorTeam
"Grade"                            → grade
"School Attending in Fall 2025?"   → school
```

Registration = identity source of record. Every player gets a canonical
Player record. All subsequent imports match against these.

### Coach Eval Import — Two Formats

**Format A: Individual team file**
- Sheet: `2025 Coach Eval`
- Header row at index 8, data starts at index 9
- Team name in cell B1, coach name in cell B2

**Format B: Combined file** (preferred)
- Sheet: `2026 - Coach Evaluations`
- Row 0 is the data header

Column mappings (both formats):
```
"Team"                        → teamLabel
"Player Name"                 → rawName (needs identity resolution)
"Fielding Ground Balls"       → scores.fielding_ground_balls
"Catching Fly Balls"          → scores.catching_fly_balls
"Receiving Throws"            → scores.receiving_throws
"Range/Footwork"              → scores.range_footwork
"Throwing"                    → scores.throwing
"Hitting"                     → scores.hitting
"Speed"                       → scores.speed
"Athleticism"                 → scores.athleticism
"Pitching"                    → scores.pitching        (nullable)
"Catching"                    → scores.catching        (nullable)
"In Game Decision Making"     → scores.in_game_decision_making
"Coachability"                → scores.coachability
"Attitude"                    → scores.attitude
"Composure"                   → scores.composure
"Commitement" OR "Commitment" → scores.commitment      (handle both spellings)
"Leadership"                  → scores.leadership
"Coach Evaluation Score"      → coachEvalScore
"Coach Eval Rank on Team"     → coachEvalRank
"Intangibles Score"           → intangiblesScore
"Intangibles Rank on Team"    → intangiblesRank
"Comments & Needs to Improve" → comments
```

### Tryout Score Import
- From combined file, sheet: `2026 - Tryout Results`
- Row 0 is the data header

```
"Age Group"         → ageGroup
"Player Name"       → rawName
"Tryout Date"       → sessionDate
"Speed-60yds"       → scores.speed_60yd
"GB Hands"          → scores.gb_hands
"GB Range"          → scores.gb_range
"GB Arm"            → scores.gb_arm
"FB Judging"        → scores.fb_judging
"FB Catching"       → scores.fb_catching
"FB Arm"            → scores.fb_arm
"Hit-Contact"       → scores.hit_contact
"Hit-Power"         → scores.hit_power
"Pitch-Velo"        → scores.pitch_velo
"Pitch-Control"     → scores.pitch_control
"Catcher-Receiving" → scores.catcher_receiving
"Catcher-Arm"       → scores.catcher_arm
"Tryout Score"      → tryoutScore (pre-calculated)
"Evaluator Comments"→ comments
```

### GameChanger Stats Import
- CSV, Row 0 = actual header
- Section markers ("Batting", "Pitching", "Fielding") appear in the header row
  as column names — skip them, use positional index
- Cols 0–2: Number, Last, First
- Batting: cols 3–53 | Pitching: cols 54–141 | Fielding: cols 142–156
- Player name: `First + " " + Last` → rawName for matching
- Store full row as `rawJson`

---

## IDENTITY RESOLUTION

The most critical feature. Real examples from Hudson Baseball's actual data:
- `"Timmy Aqua"` ↔ `"Timothy Aqua"` — same player, different sheets
- `"Chase  Arena"` — double space
- `"Kaizen  Berghoff"` — double space, coach's son
- `"Grant Pleasant Jr."` — suffix may be dropped in some sources
- `"Henry Sajovie "` — trailing space + possible spelling variant
- `"Drew Staniszewski"` — long name, high typo likelihood

### Normalization (always apply first)
```typescript
function normalizeName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\s*(jr\.?|sr\.?|ii|iii|iv)\s*$/i, '')
    .toLowerCase();
}

const NICKNAME_MAP: Record<string, string> = {
  'tim': 'timothy', 'timmy': 'timothy',
  'ben': 'benjamin', 'benny': 'benjamin',
  'will': 'william', 'billy': 'william',
  'jake': 'jacob', 'alex': 'alexander',
  'andy': 'andrew', 'matt': 'matthew',
  'chris': 'christopher', 'mike': 'michael',
  'joe': 'joseph', 'joey': 'joseph',
  'nick': 'nicholas', 'tony': 'anthony',
  'zach': 'zachary', 'zack': 'zachary',
  'cam': 'cameron', 'brad': 'bradley',
};
```

### Matching Algorithm
```typescript
// Returns top 3 candidates sorted by confidence descending
function resolvePlayer(rawName, ageGroup, dob?, email?, candidates): MatchCandidate[] {
  // 1. Exact normalized match              → score 1.0
  // 2. DOB match + fuzzy name             → score 0.95
  // 3. Parent email match                 → score 0.95
  // 4. Nickname expansion match           → score 0.88
  // 5. Levenshtein on normalized name     → score 0.50–0.85
  // Filter candidates to same ageGroup before matching
}
```

### Confidence Thresholds
```
≥ 0.90  → Auto-match (log to audit, no review needed)
0.70–0.89 → Suggest (1-click confirm in review queue)
< 0.70  → Unresolved (manual selection required)
```

### Match Review Screen
After every import, show review screen grouped into:
- ✅ Auto-matched (collapsed by default)
- ⚠️ Needs confirmation (expanded, 1-click confirm or "Pick different")
- ❌ Unresolved (search dropdown or "Create New Player")

Import not marked "complete" until all unresolved rows are handled.

---

## SCORING LOGIC

### Coach Eval Score
```
coachEvalScore = mean(fielding_ground_balls, catching_fly_balls, receiving_throws,
                      range_footwork, throwing, hitting, speed, athleticism)
// Exclude null/n/a — don't penalize for inapplicable fields

intangiblesScore = mean(in_game_decision_making, coachability, attitude,
                        composure, commitment, leadership)
```

### Tryout Score
Weights come from `TryoutScoringConfig`. Default (Hudson Baseball):
```
speed: 11%, ground_balls: 11%, fly_balls: 11%,
hitting: 17%, pitching: 17% (null if didn't pitch → redistribute)
```

### GC Stat → Score
```
Percentile rank within age group → scale to 1–5
Components: OPS 35%, AVG 20%, OBP 15%, ERA (inverted, if IP≥3) 15%, FPCT 15%
Only apply if player has PA ≥ 20
```

### Combined Score
```
combinedScore =
  (tryoutScore       × season.tryoutWeight)     +
  (coachEvalScore    × season.coachEvalWeight)  +
  (intangiblesScore  × season.intangiblesWeight)+
  (priorStatScore    × season.priorStatsWeight)

// If component missing → redistribute that weight proportionally to others
```

---

## TEAM FORMATION

### Auto-Balance (Snake Draft)
```
1. Pre-assign locked players and coach kids
2. Snake draft remaining players by combinedScore desc
   3 teams: A→B→C→C→B→A→A→B→C...
3. Post-draft: enforce pitcher/catcher coverage (swap if needed)
4. Return balance report: avgScore, scoreSpread, pitcherCount, catcherCount
```

### Manual Drag & Drop
- Columns = teams, player cards draggable between columns
- Lock toggle on each card
- Balance metrics update live
- Undo stack (last 10 moves)
- "Run Auto-Balance on Unlocked" button

---

## UI / UX

### Mobile Evaluator Screen
Route: `/tryout/[sessionId]/evaluate`
Used on phones at the field. Must work offline in full sun.

- Score buttons: large tap targets (≥48px), numbered 1–5
- Selected score: filled/highlighted
- No keyboard needed (comment field optional, collapsed by default)
- "Save & Next" auto-advances to next player
- Swipe left/right to navigate
- Shows progress: "Player 4 of 23"
- Offline queue: save to IndexedDB/localStorage, sync on reconnect
- Pre-load full player list at session open

### Coach Evaluation Web Form
Route: `/org/[orgId]/team/[teamId]/season-eval`
- Table view on desktop (one row per player, columns = eval categories)
- Single-player form on mobile
- Auto-saves draft every 30 seconds
- "Submit for Director Review" triggers notification to org_admin
- Director sees submission status per coach in the Evaluations tab

### Admin Dashboard
Route: `/org/[orgId]/tryouts`

Tabs:
1. **Overview** — season summary, upcoming sessions, quick stats
2. **Players** — master list, search, filter by age group
3. **Sessions** — manage sessions, assign evaluators, live scoring monitor
4. **Evaluations** — coach eval submissions, who has/hasn't submitted
5. **Rankings** — combined score table, weight controls, export
6. **Team Builder** — drag/drop formation
7. **Imports** — upload history, pending reviews
8. **Settings** — org config, rubric, users, teams

### Rankings Table
Columns: `Rank | Player | Age Group | 2025 Team | Combined | Tryout | Coach Eval | Intangibles | Pitching | Speed | 2026 Team | Notes`
- Filter by age group
- Color-coded rows by 2026 team once assigned
- Inline team assignment (click cell → dropdown)
- Inline notes editing
- Export: CSV + print-optimized PDF per age group

---

## API ROUTES

Namespace under `/api/tryouts/`.

```
# Seasons
GET/POST   /api/tryouts/seasons
GET/PUT    /api/tryouts/seasons/[id]

# Sessions
GET/POST   /api/tryouts/sessions
GET/PUT    /api/tryouts/sessions/[id]
POST       /api/tryouts/sessions/[id]/open
POST       /api/tryouts/sessions/[id]/close

# Scoring (mobile)
GET        /api/tryouts/sessions/[id]/players   ← pre-load for offline
POST       /api/tryouts/scores
PUT        /api/tryouts/scores/[id]

# Coach Evals
GET/POST   /api/tryouts/coach-evals
GET/PUT    /api/tryouts/coach-evals/[id]
POST       /api/tryouts/coach-evals/[id]/submit
POST       /api/tryouts/coach-evals/[id]/review

# Players
GET        /api/tryouts/players
GET/PUT    /api/tryouts/players/[id]
POST       /api/tryouts/players/merge

# Imports
POST       /api/tryouts/imports/registration
POST       /api/tryouts/imports/coach-eval
POST       /api/tryouts/imports/tryout-scores
POST       /api/tryouts/imports/gamechanger
GET        /api/tryouts/imports/[jobId]
GET        /api/tryouts/imports/[jobId]/review
POST       /api/tryouts/imports/[jobId]/confirm-match
POST       /api/tryouts/imports/[jobId]/confirm-all-suggested

# Rankings
GET        /api/tryouts/rankings
POST       /api/tryouts/rankings/recalculate
PUT        /api/tryouts/rankings/weights

# Team Formation
GET        /api/tryouts/teams
POST       /api/tryouts/teams
POST       /api/tryouts/teams/auto-balance
PUT        /api/tryouts/teams/assignments
POST       /api/tryouts/teams/[id]/finalize

# Export
GET        /api/tryouts/export/rankings/[seasonId]/[ageGroup]
GET        /api/tryouts/export/team-sheet/[teamId]
GET        /api/tryouts/export/eval-summary/[playerId]
```

---

## FILE STRUCTURE

Follow six43.com's existing conventions. Suggested structure:

```
src/
  app/
    (org)/
      org/[orgId]/
        tryouts/
          page.tsx                 ← overview
          players/page.tsx
          sessions/
            page.tsx
            [sessionId]/page.tsx
          evaluations/page.tsx
          rankings/page.tsx
          team-builder/page.tsx
          imports/
            page.tsx
            [jobId]/review/page.tsx
          settings/
            rubric/page.tsx
            users/page.tsx
            teams/page.tsx
        team/[teamId]/
          season-eval/page.tsx     ← coach eval entry
    tryout/
      [sessionId]/
        evaluate/page.tsx          ← mobile evaluator screen

  components/
    tryouts/
      ScoreInput.tsx
      PlayerCard.tsx
      RankingsTable.tsx
      TeamBuilder.tsx
      ImportReview.tsx
      MatchReviewRow.tsx
      CoachEvalForm.tsx
      EvalSubmissionStatus.tsx

  lib/
    tryouts/
      import/
        parseRegistration.ts
        parseCoachEval.ts
        parseTryoutScores.ts
        parseGameChanger.ts
        identityResolver.ts
        levenshtein.ts
        nameNormalization.ts
      scoring/
        calculateTryoutScore.ts
        calculateCoachEvalScore.ts
        normalizeGCStats.ts
        calculateCombinedScore.ts
      teamFormation/
        autoBalance.ts
        snakeDraft.ts
      export/
        rankingsCSV.ts
        teamSheetPDF.ts
```

---

## MVP BUILD SEQUENCE

### Phase 1 — Foundation (Weeks 1–2)
- [ ] Schema additions + migrations
- [ ] Registration import + player list view
- [ ] Identity resolver (normalization + levenshtein + nickname map)
- [ ] Import review screen (green/yellow/red rows)
- [ ] Basic player CRUD + admin player management screen

### Phase 2 — Coach Evaluations (Weeks 3–4)
- [ ] Coach eval import (both file formats)
- [ ] Coach eval web form for direct coach entry
- [ ] Eval submission workflow (draft → submitted → reviewed)
- [ ] Director eval review screen + submission status per coach

### Phase 3 — Live Tryout Scoring (Weeks 5–7)
- [ ] Tryout session management (create, open, close)
- [ ] Session management admin screen
- [ ] Mobile evaluator screen (offline-capable)
- [ ] Tryout score import (historical data)
- [ ] Live scoring monitor for admin

### Phase 4 — Rankings (Week 8)
- [ ] Combined score calculation
- [ ] GC stats import + normalization
- [ ] Rankings table with weight controls
- [ ] CSV export

### Phase 5 — Team Formation (Weeks 9–10)
- [ ] Auto-balance algorithm (snake draft + constraints)
- [ ] Drag/drop team builder
- [ ] Lock/coach-kid constraints
- [ ] Team finalization → push to platform

### Phase 6 — Admin & Polish (Weeks 11–12)
- [ ] Full admin screens (users, rubric config, org settings)
- [ ] PDF export (team sheets, eval summaries)
- [ ] Audit log viewer
- [ ] Multi-org isolation testing

---

## IMPORTANT CONSTRAINTS

1. **Non-destructive imports** — importing never overwrites existing records.
   New records are created and linked. CombinedScore is recalculated after import.

2. **Weight changes are non-destructive** — store weights per season, recalculate
   on demand. Never bake specific weights into stored score records.

3. **Never hard-delete players** — use `isActive: Boolean`. Player records are
   organizational memory that spans seasons.

4. **Offline scoring is required** — evaluators in the field have bad wifi. The
   mobile scoring screen must queue submissions locally (IndexedDB or localStorage)
   and sync on reconnect.

5. **Multi-org data isolation** — every query scoped to orgId. No data leakage
   between organizations.

6. **Audit everything** — log every import, every match confirm/override, every
   team assignment, every eval submission. Store in TryoutAuditLog.

7. **Configurable rubric** — scoring fields must not be hardcoded. They come from
   TryoutScoringConfig and TryoutCoachEvalConfig. Hudson Baseball is the reference
   implementation, not the only valid config.

8. **Tech stack alignment** — read the existing six43.com codebase first.
   Match the framework, ORM, auth, component library, and folder conventions
   exactly. Do not introduce new patterns without flagging them first.
