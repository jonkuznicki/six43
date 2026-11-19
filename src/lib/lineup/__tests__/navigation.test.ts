import { describe, expect, it, vi } from 'vitest'
import { leaveMessage, saveThenNavigate, startGame } from '../navigation'

describe('saveThenNavigate', () => {
  it('navigates only after pending saves finish', async () => {
    const order: string[] = []
    const r = await saveThenNavigate({
      flush: async () => { order.push('flush'); return true },
      navigate: () => order.push('navigate'),
    })
    expect(r).toEqual({ ok: true })
    expect(order).toEqual(['flush', 'navigate'])
  })

  it('stays on the page when the save fails', async () => {
    const navigate = vi.fn()
    const r = await saveThenNavigate({ flush: async () => false, navigate })
    expect(r).toEqual({ ok: false, reason: 'lineup_not_saved' })
    expect(navigate).not.toHaveBeenCalled()
    expect(leaveMessage(r)).toMatch(/haven’t saved/)
  })
})

describe('startGame', () => {
  it('saves the lineup, then the status, then opens the in-game view', async () => {
    const order: string[] = []
    const r = await startGame({
      flush: async () => { order.push('flush'); return true },
      currentStatus: 'lineup_ready',
      setStatusInProgress: async () => { order.push('status'); return { error: null } },
      navigate: () => order.push('navigate'),
    })
    expect(r.ok).toBe(true)
    expect(order).toEqual(['flush', 'status', 'navigate'])
  })

  it('does not navigate if the status update fails', async () => {
    const navigate = vi.fn()
    const r = await startGame({
      flush: async () => true,
      currentStatus: 'scheduled',
      setStatusInProgress: async () => ({ error: { message: 'network' } }),
      navigate,
    })
    expect(r).toEqual({ ok: false, reason: 'status_not_saved', message: 'network' })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('does not update the status or navigate if the lineup did not save', async () => {
    const setStatus = vi.fn()
    const navigate = vi.fn()
    const r = await startGame({ flush: async () => false, currentStatus: 'scheduled', setStatusInProgress: setStatus, navigate })
    expect(r.ok).toBe(false)
    expect(setStatus).not.toHaveBeenCalled()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('skips the status update for a game already in progress', async () => {
    const setStatus = vi.fn()
    const navigate = vi.fn()
    await startGame({ flush: async () => true, currentStatus: 'in_progress', setStatusInProgress: setStatus, navigate })
    expect(setStatus).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalled()
  })
})
