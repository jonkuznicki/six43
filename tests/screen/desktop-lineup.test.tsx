// @vitest-environment jsdom
/**
 * Screen-level regression tests for the DESKTOP lineup builder, rendered with
 * an in-memory Supabase (tests/screen/fakeSupabase.ts). Assertions check the
 * fake database — what would actually be persisted.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createFakeSupabase, dbDuplicates, installLocalStorage, lineupFixture, type FakeSupabase } from './fakeSupabase'

installLocalStorage()

const fake: { current: FakeSupabase } = { current: null as any }
const push = vi.fn()
vi.mock('../../src/lib/supabase', () => ({ createClient: () => fake.current.client }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/games/game-1/lineup/desktop',
}))

import DesktopLineupEditor from '../../src/app/games/[id]/lineup/desktop/page'

const cell = (si: number, ii: number) => document.querySelector(`[data-cell="${si}-${ii}"]`) as HTMLElement
const select = (si: number, ii: number) => fireEvent.mouseDown(cell(si, ii), { button: 0 })
const key = (k: string, extra: Record<string, unknown> = {}) => fireEvent.keyDown(window, { key: k, ...extra })
const saved = (slotId: string, inning: number) =>
  fake.current.db.lineup_slots.find(s => s.id === slotId)!.inning_positions[inning]

async function open() {
  fake.current = createFakeSupabase(lineupFixture())
  render(<DesktopLineupEditor params={{ id: 'game-1' }} />)
  await screen.findByText('vs Eastside Tigers')
  await waitFor(() => expect(cell(0, 0)).toBeTruthy())
}

beforeEach(() => { push.mockReset(); localStorage.clear() })
afterEach(() => cleanup())

describe('desktop lineup builder — saving', () => {
  it('rapid edits to two different players are both saved (bug #1)', async () => {
    await open()
    select(0, 1); key('p')   // Jake → P in the 2nd
    select(4, 1); key('c')   // Noah → C in the 2nd, well inside the 500 ms save delay
    await waitFor(() => {
      expect(saved('slot-0', 1)).toBe('P')
      expect(saved('slot-4', 1)).toBe('C')
    }, { timeout: 3000 })
  })

  it('taking an occupied position leaves the previous holder unassigned, saved in one write', async () => {
    await open()
    select(9, 0); key('p')   // bench player takes P in the 1st; Jake held it
    await waitFor(() => expect(saved('slot-9', 0)).toBe('P'), { timeout: 3000 })
    expect(saved('slot-0', 0)).toBeNull()
    expect(dbDuplicates(fake.current.db)).toEqual([])
    const lineupWrites = fake.current.writes.filter(w => w.table === 'lineup_slots')
    expect(lineupWrites).toHaveLength(1)
    expect(lineupWrites[0].payload.map((r: any) => r.id).sort()).toEqual(['slot-0', 'slot-9'])
  })

  it('blocks a bench assignment when the inning’s bench is full', async () => {
    await open()
    select(0, 0); key('b')   // 1st inning already has 2 on the bench
    await screen.findByText(/bench is already full/i)
    await new Promise(r => setTimeout(r, 700))
    expect(saved('slot-0', 0)).toBe('P')
    expect(fake.current.writes.filter(w => w.table === 'lineup_slots')).toHaveLength(0)
  })

  it('undo restores the previous lineup in the database', async () => {
    await open()
    select(9, 0); key('p')
    await waitFor(() => expect(saved('slot-9', 0)).toBe('P'), { timeout: 3000 })
    key('z', { ctrlKey: true })
    await waitFor(() => {
      expect(saved('slot-0', 0)).toBe('P')
      expect(saved('slot-9', 0)).toBe('Bench')
    }, { timeout: 3000 })
  })

  it('undo after marking a player absent restores their availability in the database', async () => {
    await open()
    fireEvent.click(screen.getAllByTitle('Mark absent')[2])   // Mason Lee
    await waitFor(() => expect(fake.current.db.lineup_slots.find(s => s.id === 'slot-2')!.availability).toBe('absent'), { timeout: 3000 })
    key('z', { ctrlKey: true })
    await waitFor(() => {
      const row = fake.current.db.lineup_slots.find(s => s.id === 'slot-2')!
      expect(row.availability).toBe('available')
      expect(row.inning_positions[0]).toBe('1B')
    }, { timeout: 3000 })
  })

  it('shows a save failure with Retry, and Retry saves the change', async () => {
    await open()
    fake.current.setWritesFail(true)
    select(0, 1); key('p')
    await screen.findByText(/not saved/i, undefined, { timeout: 3000 })
    expect(saved('slot-0', 1)).toBeNull()
    fake.current.setWritesFail(false)
    fireEvent.click(screen.getAllByRole('button', { name: /retry/i })[0])
    await waitFor(() => expect(saved('slot-0', 1)).toBe('P'), { timeout: 3000 })
    await waitFor(() => expect(screen.queryByText(/not saved/i)).toBeNull())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('desktop lineup builder — navigation', () => {
  it('“Games” waits for the pending save before navigating', async () => {
    await open()
    let savedAtNavigation: unknown = 'not navigated'
    push.mockImplementation(() => { savedAtNavigation = saved('slot-0', 1) })
    select(0, 1); key('p')
    fireEvent.click(screen.getByText('← Games'))   // immediately, inside the save delay
    await waitFor(() => expect(push).toHaveBeenCalledWith('/games'), { timeout: 3000 })
    expect(savedAtNavigation).toBe('P')
  })

  it('does not leave when the pending save fails', async () => {
    await open()
    fake.current.setWritesFail(true)
    select(0, 1); key('p')
    fireEvent.click(screen.getByText('← Games'))
    await screen.findByText(/still on this page/i, undefined, { timeout: 3000 })
    expect(push).not.toHaveBeenCalled()
  })

  it('Play Game saves the lineup and the game status before opening the in-game view', async () => {
    await open()
    let stateAtNavigation: unknown = null
    push.mockImplementation(() => {
      stateAtNavigation = { status: fake.current.db.games[0].status, pos: saved('slot-0', 1) }
    })
    select(0, 1); key('p')
    fireEvent.click(screen.getByText('▶ Play Game'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/games/game-1/in-game'), { timeout: 3000 })
    expect(stateAtNavigation).toEqual({ status: 'in_progress', pos: 'P' })
  })

  it('Play Game stays put and explains when the status can’t be saved', async () => {
    await open()
    fake.current.setWritesFail(true)
    fireEvent.click(screen.getByText('▶ Play Game'))
    await screen.findByText(/couldn’t start the game/i, undefined, { timeout: 3000 })
    expect(push).not.toHaveBeenCalled()
    expect(fake.current.db.games[0].status).toBe('scheduled')
  })
})
