/**
 * Save queue for the lineup builders.
 *
 * - Every edit marks its rows dirty. Dirty ids ACCUMULATE until written — a
 *   new edit never replaces an earlier, unsaved one (the desktop bug this
 *   fixes: only the last edit's rows were saved).
 * - After a short delay, all dirty rows are written together in one atomic
 *   write. Row contents are read at write time, so the latest state is saved.
 * - One write at a time; edits made during a write are saved by the next one,
 *   so responses can't land out of order.
 * - A failed write keeps its rows dirty and reports an error until a retry
 *   (or a later edit) succeeds.
 * - flush() saves everything now and resolves when nothing is pending, so
 *   navigation can wait for it.
 */

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error'

export interface SaveState<E = unknown> {
  status: SaveStatus
  error: E | null
  pendingCount: number
}

export interface SaveQueueOptions<Row, E> {
  /** Current contents of the given rows (called at write time). */
  snapshot: (ids: string[]) => Row[]
  /** Persist rows atomically. Resolve with { error } — do not throw. */
  write: (rows: Row[]) => Promise<{ error: E | null }>
  /** Debounce before an automatic write, in ms. */
  delayMs: number
  onChange?: (state: SaveState<E>) => void
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export interface SaveQueue<E = unknown> {
  markDirty: (ids: string[]) => void
  /** Write everything pending now. Resolves true when all saved, false on error. */
  flush: () => Promise<boolean>
  /** Same as flush, for a Retry button. */
  retry: () => Promise<boolean>
  hasPending: () => boolean
  getState: () => SaveState<E>
  dispose: () => void
}

export function createSaveQueue<Row, E = unknown>(opts: SaveQueueOptions<Row, E>): SaveQueue<E> {
  const setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms))
  const clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))

  // id -> edit version; a row is clean again only if not edited during its write
  const dirty = new Map<string, number>()
  let version = 0
  let timer: unknown = null
  let inFlight: Promise<boolean> | null = null
  let error: E | null = null
  let disposed = false
  let last: SaveState<E> = { status: 'saved', error: null, pendingCount: 0 }

  function state(): SaveState<E> {
    const status: SaveStatus = inFlight ? 'saving' : error ? 'error' : dirty.size ? 'pending' : 'saved'
    return { status, error, pendingCount: dirty.size }
  }

  function emit() {
    const s = state()
    if (s.status === last.status && s.error === last.error && s.pendingCount === last.pendingCount) return
    last = s
    opts.onChange?.(s)
  }

  function cancelTimer() {
    if (timer !== null) { clearTimer(timer); timer = null }
  }

  function schedule() {
    cancelTimer()
    if (disposed) return
    timer = setTimer(() => { timer = null; void writeOnce() }, opts.delayMs)
  }

  /** One write of the rows dirty right now. Chains after any write in flight. */
  async function writeOnce(): Promise<boolean> {
    // Wait for any write in progress (loop: several callers may be waiting).
    while (inFlight) await inFlight
    if (!dirty.size) { emit(); return error === null }
    const batch = new Map(dirty)
    const ids = Array.from(batch.keys())
    const run = (async () => {
      let ok = false
      try {
        const res = await opts.write(opts.snapshot(ids))
        if (res.error) {
          error = res.error
        } else {
          error = null
          ok = true
          batch.forEach((v, id) => { if (dirty.get(id) === v) dirty.delete(id) })
        }
      } catch (e) {
        error = (e ?? new Error('write failed')) as E
      }
      return ok
    })()
    inFlight = run
    emit()
    const ok = await run
    inFlight = null
    emit()
    // Edits made during the write: save them on the normal schedule.
    if (ok && dirty.size && timer === null && !disposed) schedule()
    return ok
  }

  async function flush(): Promise<boolean> {
    cancelTimer()
    // Keep writing until nothing is pending, stopping on the first error.
    for (let i = 0; i < 10; i++) {
      const ok = await writeOnce()
      if (!ok) return false
      if (!dirty.size && !inFlight) return true
    }
    return dirty.size === 0
  }

  return {
    markDirty(ids) {
      if (disposed || !ids.length) return
      version++
      for (const id of ids) dirty.set(id, version)
      emit()
      schedule()
    },
    flush,
    retry: flush,
    hasPending: () => dirty.size > 0 || inFlight !== null,
    getState: state,
    dispose() { disposed = true; cancelTimer() },
  }
}
