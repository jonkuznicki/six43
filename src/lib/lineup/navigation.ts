/**
 * Leaving the lineup builder safely.
 *
 * Both helpers wait for pending lineup saves first and only navigate when
 * everything is saved; on failure they report why so the screen can show
 * Retry instead of silently dropping the coach's changes.
 */

export type LeaveResult =
  | { ok: true }
  | { ok: false; reason: 'lineup_not_saved' }
  | { ok: false; reason: 'status_not_saved'; message: string }

/** Save pending edits, then navigate. */
export async function saveThenNavigate(opts: {
  flush: () => Promise<boolean>
  navigate: () => void
}): Promise<LeaveResult> {
  if (!(await opts.flush())) return { ok: false, reason: 'lineup_not_saved' }
  opts.navigate()
  return { ok: true }
}

/**
 * Play Game: save pending lineup edits, then save the game status as
 * in_progress, then open the in-game view — in that order, each step only
 * after the previous one succeeded.
 */
export async function startGame(opts: {
  flush: () => Promise<boolean>
  currentStatus: string | null | undefined
  setStatusInProgress: () => PromiseLike<{ error: { message: string } | null }>
  navigate: () => void
}): Promise<LeaveResult> {
  if (!(await opts.flush())) return { ok: false, reason: 'lineup_not_saved' }
  if (opts.currentStatus !== 'in_progress') {
    const { error } = await opts.setStatusInProgress()
    if (error) return { ok: false, reason: 'status_not_saved', message: error.message }
  }
  opts.navigate()
  return { ok: true }
}

export function leaveMessage(r: LeaveResult): string | null {
  if (r.ok) return null
  return r.reason === 'lineup_not_saved'
    ? 'Your latest lineup changes haven’t saved yet, so you’re still on this page.'
    : 'Couldn’t start the game: the game status didn’t save. Try again.'
}
