import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSaveQueue } from '../saveQueue'

type Row = { id: string; v: string }

function setup(opts: { fail?: () => boolean; delayMs?: number } = {}) {
  const rows = new Map<string, Row>()
  const writes: Row[][] = []
  const resolvers: Array<() => void> = []
  let manual = false
  const q = createSaveQueue<Row, { message: string }>({
    snapshot: ids => ids.map(id => ({ ...rows.get(id)! })),
    write: rows => {
      writes.push(rows)
      const result = () => (opts.fail?.() ? { error: { message: 'offline' } } : { error: null })
      if (!manual) return Promise.resolve(result())
      return new Promise(res => resolvers.push(() => res(result())))
    },
    delayMs: opts.delayMs ?? 500,
  })
  const edit = (id: string, v: string) => { rows.set(id, { id, v }); q.markDirty([id]) }
  return { q, rows, writes, edit, holdWrites: () => { manual = true }, release: () => resolvers.shift()?.() }
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('save queue', () => {
  it('rapid edits to different players inside the delay are all written (desktop bug #1)', async () => {
    const { q, writes, edit } = setup()
    edit('jake', 'P')
    await vi.advanceTimersByTimeAsync(200)
    edit('noah', 'C')               // second player, still inside the 500 ms delay
    await vi.advanceTimersByTimeAsync(600)
    expect(writes).toHaveLength(1)
    expect(writes[0].map(r => r.id).sort()).toEqual(['jake', 'noah'])
    expect(q.getState().status).toBe('saved')
  })

  it('writes the latest contents of a row edited several times', async () => {
    const { writes, edit } = setup()
    edit('jake', 'P'); edit('jake', 'SS')
    await vi.advanceTimersByTimeAsync(600)
    expect(writes).toEqual([[{ id: 'jake', v: 'SS' }]])
  })

  it('keeps rows pending and reports an error when a save fails; retry saves them', async () => {
    let failing = true
    const { q, writes, edit } = setup({ fail: () => failing })
    edit('jake', 'P')
    await vi.advanceTimersByTimeAsync(600)
    expect(q.getState()).toMatchObject({ status: 'error', pendingCount: 1, error: { message: 'offline' } })
    failing = false
    expect(await q.retry()).toBe(true)
    expect(writes.at(-1)!.map(r => r.id)).toEqual(['jake'])
    expect(q.getState()).toMatchObject({ status: 'saved', error: null, pendingCount: 0 })
  })

  it('a later edit after a failure retries the failed rows too', async () => {
    let failing = true
    const { writes, edit } = setup({ fail: () => failing })
    edit('jake', 'P')
    await vi.advanceTimersByTimeAsync(600)
    failing = false
    edit('noah', 'C')
    await vi.advanceTimersByTimeAsync(600)
    expect(writes.at(-1)!.map(r => r.id).sort()).toEqual(['jake', 'noah'])
  })

  it('flush writes immediately without waiting for the delay', async () => {
    const { q, writes, edit } = setup()
    edit('jake', 'P')
    expect(await q.flush()).toBe(true)
    expect(writes).toHaveLength(1)
  })

  it('flush resolves false when the save fails (navigation must not proceed)', async () => {
    const { q, edit } = setup({ fail: () => true })
    edit('jake', 'P')
    expect(await q.flush()).toBe(false)
    expect(q.hasPending()).toBe(true)
  })

  it('never runs two writes at once; edits made during a write are saved afterwards', async () => {
    const s = setup()
    s.holdWrites()
    s.edit('jake', 'P')
    const first = s.q.flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(s.q.getState().status).toBe('saving')
    s.edit('noah', 'C')                                   // during the write
    const second = s.q.flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(s.writes).toHaveLength(1)                      // still only one in flight
    s.release()
    await vi.advanceTimersByTimeAsync(0)
    s.release()
    expect(await first).toBe(true)
    expect(await second).toBe(true)
    expect(s.writes.map(w => w.map(r => r.id))).toEqual([['jake'], ['noah']])
    expect(s.q.getState().status).toBe('saved')
  })

  it('a row edited again during its write stays pending until written again', async () => {
    const s = setup()
    s.holdWrites()
    s.edit('jake', 'P')
    const done = s.q.flush()
    await vi.advanceTimersByTimeAsync(0)
    s.edit('jake', 'SS')                                  // changed while saving
    s.release()
    await vi.advanceTimersByTimeAsync(0)
    s.release()
    expect(await done).toBe(true)
    expect(s.writes.map(w => w[0].v)).toEqual(['P', 'SS'])
  })

  it('flush with nothing pending resolves true without writing', async () => {
    const { q, writes } = setup()
    expect(await q.flush()).toBe(true)
    expect(writes).toHaveLength(0)
  })
})
