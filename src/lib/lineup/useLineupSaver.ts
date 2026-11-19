'use client'

/**
 * React binding for the lineup save queue, shared by both builders.
 *
 *  - markDirty(ids): queue rows for saving (latest state is read at write time)
 *  - flush(): save now; resolves true when everything is saved
 *  - state: saved / pending / saving / error, for the save indicator
 *
 * While anything is unsaved or a save failed, closing or reloading the tab
 * shows the browser's "Leave site?" prompt. Hiding the page (switching apps,
 * locking the phone) and unmounting the builder both trigger a save.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createSaveQueue, type SaveState } from './saveQueue'
import { toSlotRow, writeLineupRows, type WriteError } from './persist'

type Client = Parameters<typeof writeLineupRows>[0]

export function useLineupSaver(opts: {
  client: Client
  getSlots: () => Array<Record<string, any>>
  delayMs: number
}) {
  const getSlots = useRef(opts.getSlots)
  getSlots.current = opts.getSlots
  const client = useRef(opts.client)
  client.current = opts.client

  const [state, setState] = useState<SaveState<WriteError>>({ status: 'saved', error: null, pendingCount: 0 })

  const queue = useMemo(() => createSaveQueue<ReturnType<typeof toSlotRow>, WriteError>({
    snapshot: ids => {
      const want = new Set(ids)
      return getSlots.current().filter(s => want.has(s.id)).map(toSlotRow)
    },
    write: rows => writeLineupRows(client.current, rows),
    delayMs: opts.delayMs,
    onChange: setState,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [])

  // Save when the page is hidden; save (best effort) when the builder unmounts.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden' && queue.hasPending()) void queue.flush() }
    const onPageHide = () => { if (queue.hasPending()) void queue.flush() }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      // Not disposed: React may remount (Strict Mode), and a pending save
      // should still complete after the builder closes.
      if (queue.hasPending()) void queue.flush()
    }
  }, [queue])

  // Warn before closing/reloading with unsaved or failed changes.
  const unsaved = state.status !== 'saved'
  useEffect(() => {
    if (!unsaved) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [unsaved])

  return {
    state,
    markDirty: queue.markDirty,
    flush: queue.flush,
    retry: queue.retry,
    hasPending: queue.hasPending,
  }
}

export function saveLabel(s: SaveState<unknown>): string {
  switch (s.status) {
    case 'saving': case 'pending': return 'Saving…'
    case 'error': return 'Not saved'
    default: return 'Saved'
  }
}
