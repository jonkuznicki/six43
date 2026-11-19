/**
 * In-memory stand-in for the Supabase browser client, for screen-level tests.
 *
 * It understands the query-builder calls the lineup builders make, keeps
 * tables in memory and APPLIES writes (update / upsert / insert), so tests
 * assert what would actually be persisted — not which function was called.
 * Writes resolve after a short real delay, like a network round trip, which
 * lets React re-render in between (needed to reproduce timing bugs).
 */

type Row = Record<string, any>
type Tables = Record<string, Row[]>

export interface FakeSupabase {
  client: any
  db: Tables
  writes: Array<{ table: string; op: string; payload: any }>
  setWritesFail: (fail: boolean) => void
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

export function createFakeSupabase(seed: Tables, opts: { userId?: string; writeDelayMs?: number } = {}): FakeSupabase {
  const db: Tables = clone(seed)
  const writes: FakeSupabase['writes'] = []
  let failWrites = false
  const delay = opts.writeDelayMs ?? 15

  class Query implements PromiseLike<any> {
    private filters: Array<(r: Row) => boolean> = []
    private op: 'select' | 'update' | 'upsert' | 'insert' | 'delete' = 'select'
    private payload: any
    private one: 'single' | 'maybe' | null = null
    private head = false
    private limitN: number | null = null
    private orderBy: Array<{ col: string; asc: boolean }> = []

    constructor(private table: string) {}

    select(_cols?: string, o?: { count?: string; head?: boolean }) { if (o?.head) this.head = true; return this }
    eq(c: string, v: any) { this.filters.push(r => r[c] === v); return this }
    neq(c: string, v: any) { this.filters.push(r => r[c] !== v); return this }
    in(c: string, vs: any[]) { this.filters.push(r => vs.includes(r[c])); return this }
    not(c: string, opr: string, v: any) { this.filters.push(r => (opr === 'is' && v === null ? r[c] != null : r[c] !== v)); return this }
    lt(c: string, v: any) { this.filters.push(r => r[c] < v); return this }
    lte(c: string, v: any) { this.filters.push(r => r[c] <= v); return this }
    gt(c: string, v: any) { this.filters.push(r => r[c] > v); return this }
    gte(c: string, v: any) { this.filters.push(r => r[c] >= v); return this }
    order(col: string, o?: { ascending?: boolean }) { this.orderBy.push({ col, asc: o?.ascending !== false }); return this }
    limit(n: number) { this.limitN = n; return this }
    single() { this.one = 'single'; return this }
    maybeSingle() { this.one = 'maybe'; return this }
    update(v: Row) { this.op = 'update'; this.payload = v; return this }
    upsert(rows: Row | Row[]) { this.op = 'upsert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this }
    insert(rows: Row | Row[]) { this.op = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this }
    delete() { this.op = 'delete'; return this }

    private rows() {
      return (db[this.table] ??= []).filter(r => this.filters.every(f => f(r)))
    }

    private async run() {
      if (this.op === 'select') {
        let rows = this.rows()
        for (const { col, asc } of [...this.orderBy].reverse()) {
          rows = [...rows].sort((a, b) => (a[col] === b[col] ? 0 : (a[col] ?? Infinity) > (b[col] ?? Infinity) ? (asc ? 1 : -1) : (asc ? -1 : 1)))
        }
        if (this.limitN !== null) rows = rows.slice(0, this.limitN)
        if (this.head) return { data: null, error: null, count: rows.length }
        if (this.one) {
          if (rows.length === 0) return this.one === 'maybe' ? { data: null, error: null } : { data: null, error: { message: 'no rows' } }
          return { data: clone(rows[0]), error: null }
        }
        return { data: clone(rows), error: null }
      }

      await new Promise(r => setTimeout(r, delay))
      writes.push({ table: this.table, op: this.op, payload: clone(this.payload ?? null) })
      if (failWrites) return { data: null, error: { message: 'Failed to fetch', code: '' } }

      const table = (db[this.table] ??= [])
      if (this.op === 'update') {
        for (const r of this.rows()) Object.assign(r, clone(this.payload))
      } else if (this.op === 'upsert') {
        for (const row of this.payload) {
          const existing = table.find(r => r.id === row.id)
          if (existing) Object.assign(existing, clone(row))
          else table.push(clone(row))
        }
      } else if (this.op === 'insert') {
        for (const row of this.payload) table.push({ id: `new-${table.length + 1}`, ...clone(row) })
      } else if (this.op === 'delete') {
        db[this.table] = table.filter(r => !this.filters.every(f => f(r)))
      }
      return { data: null, error: null }
    }

    then<A = any, B = never>(ok?: ((v: any) => A | PromiseLike<A>) | null, bad?: ((e: any) => B | PromiseLike<B>) | null) {
      return this.run().then(ok, bad)
    }
  }

  const client = {
    from: (t: string) => new Query(t),
    auth: { getUser: async () => ({ data: { user: { id: opts.userId ?? 'owner-1' } }, error: null }) },
    rpc: async () => ({ data: null, error: null }),
  }

  return { client, db, writes, setWritesFail: (f: boolean) => { failWrites = f } }
}

/**
 * Node 22+ defines its own global `localStorage` (unusable without a flag),
 * which hides jsdom's. Install a simple in-memory Storage for screen tests.
 */
export function installLocalStorage() {
  const store = new Map<string, string>()
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size },
  }
  Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true })
}

/** Shared fixture: one game, 11 available players + 1 absent, inning 1 fully set. */
export function lineupFixture() {
  const names = ['Jake Morales', 'Eli Turner', 'Mason Lee', 'Ava Chen', 'Noah Kim', 'Leo Park', 'Liam Ortiz', 'Maya Patel', 'Caleb Wright', 'Zoe Martin', 'Ben Harris']
  const first = ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF', 'Bench', 'Bench']
  const lineup_slots = names.map((n, i) => {
    const [first_name, last_name] = n.split(' ')
    const inning_positions = Array(9).fill(null)
    inning_positions[0] = first[i]
    return {
      id: `slot-${i}`, game_id: 'game-1', player_id: `player-${i}`, batting_order: i + 1,
      availability: 'available', inning_positions, planned_positions: null,
      player: { first_name, last_name, jersey_number: i + 1, innings_target: null },
    }
  })
  lineup_slots.push({
    id: 'slot-11', game_id: 'game-1', player_id: 'player-11', batting_order: 12, availability: 'absent',
    inning_positions: Array(9).fill(null), planned_positions: null,
    player: { first_name: 'Owen', last_name: 'Brooks', jersey_number: 12, innings_target: null },
  })
  return {
    games: [{
      id: 'game-1', season_id: 'season-1', opponent: 'Eastside Tigers', game_date: '2026-04-18', game_time: '10:00',
      status: 'scheduled', location: 'Home', innings_played: 6, notes: null, locked: false,
      season: { innings_per_game: 6, team_id: 'team-1', team: { name: 'Hawks', positions: null, user_id: 'owner-1' } },
    }],
    lineup_slots,
    team_members: [],
    season_position_stats: [],
    depth_chart: [],
    players: [],
  }
}

/** Field positions held by more than one active player in an inning, from the fake DB. */
export function dbDuplicates(db: Tables, innings = 6) {
  const out: string[] = []
  const slots = db.lineup_slots.filter(s => s.availability !== 'absent')
  for (let i = 0; i < innings; i++) {
    const seen = new Map<string, number>()
    for (const s of slots) {
      const p = s.inning_positions[i]
      if (p && p !== 'Bench') seen.set(p, (seen.get(p) ?? 0) + 1)
    }
    seen.forEach((n, p) => { if (n > 1) out.push(`inning ${i + 1}: ${p} ×${n}`) })
  }
  return out
}
