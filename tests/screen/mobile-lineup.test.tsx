// @vitest-environment jsdom
/**
 * Screen-level regression tests for the MOBILE lineup builder, rendered with
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
vi.mock('../../src/lib/shareLineup', () => ({ shareLineupPdf: vi.fn(), makeLineupFilename: () => 'lineup.pdf' }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/games/game-1/lineup',
}))
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => <a href={href} {...rest}>{children}</a>,
}))

import LineupBuilder from '../../src/app/games/[id]/lineup/page'

const saved = (slotId: string, inning: number) =>
  fake.current.db.lineup_slots.find(s => s.id === slotId)!.inning_positions[inning]
const tapCell = (name: string, inning: number) =>
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}, inning ${inning}:`) }))
const pick = (label: string) => fireEvent.click(screen.getByRole('button', { name: label }))

async function open() {
  fake.current = createFakeSupabase(lineupFixture())
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
  render(<LineupBuilder params={{ id: 'game-1' }} />)
  await screen.findByText('vs Eastside Tigers')
}

beforeEach(() => push.mockReset())
afterEach(() => cleanup())

describe('mobile lineup builder — saving', () => {
  it('taking an occupied position saves BOTH players: no duplicate in the database (bug #2)', async () => {
    await open()
    tapCell('Eli Turner', 1)   // Eli is C in the 1st; Jake is P
    pick('P')
    await waitFor(() => expect(saved('slot-1', 0)).toBe('P'), { timeout: 3000 })
    await new Promise(r => setTimeout(r, 600))
    expect(dbDuplicates(fake.current.db)).toEqual([])
  })

  it('the previous holder becomes unassigned (not benched), on screen and in the database', async () => {
    await open()
    tapCell('Eli Turner', 1)
    pick('P')
    await waitFor(() => expect(saved('slot-1', 0)).toBe('P'), { timeout: 3000 })
    await waitFor(() => expect(saved('slot-0', 0)).toBeNull(), { timeout: 3000 })
    expect(screen.getByRole('button', { name: /^Jake Morales, inning 1: empty/ })).toBeTruthy()
  })

  it('rapid taps on different players are all saved', async () => {
    await open()
    tapCell('Jake Morales', 2); pick('P')
    tapCell('Eli Turner', 2); pick('C')
    tapCell('Mason Lee', 2); pick('1B')
    await waitFor(() => {
      expect(saved('slot-0', 1)).toBe('P')
      expect(saved('slot-1', 1)).toBe('C')
      expect(saved('slot-2', 1)).toBe('1B')
    }, { timeout: 3000 })
  })

  it('enforces the bench limit like desktop', async () => {
    await open()
    tapCell('Jake Morales', 1)
    pick('Bench')             // 1st inning already has 2 on the bench
    await screen.findByText(/bench is already full/i)
    await new Promise(r => setTimeout(r, 600))
    expect(saved('slot-0', 0)).toBe('P')
  })

  it('shows a save failure with Retry, and Retry saves the change', async () => {
    await open()
    fake.current.setWritesFail(true)
    tapCell('Jake Morales', 2); pick('P')
    await screen.findByText(/wasn’t saved/i, undefined, { timeout: 3000 })
    fake.current.setWritesFail(false)
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(saved('slot-0', 1)).toBe('P'), { timeout: 3000 })
  })
})

describe('mobile lineup builder — navigation', () => {
  it('“All games” waits for the pending save before navigating', async () => {
    await open()
    let savedAtNavigation: unknown = 'not navigated'
    push.mockImplementation(() => { savedAtNavigation = saved('slot-0', 1) })
    tapCell('Jake Morales', 2); pick('P')
    fireEvent.click(screen.getByText('‹ All games'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/games'), { timeout: 3000 })
    expect(savedAtNavigation).toBe('P')
  })

  it('Play Game saves the lineup and the game status before opening the in-game view', async () => {
    await open()
    let stateAtNavigation: unknown = null
    push.mockImplementation(() => {
      stateAtNavigation = { status: fake.current.db.games[0].status, pos: saved('slot-0', 1) }
    })
    tapCell('Jake Morales', 2); pick('P')
    fireEvent.click(screen.getByText('▶ Play Game'))
    await waitFor(() => expect(push).toHaveBeenCalledWith('/games/game-1/in-game'), { timeout: 3000 })
    expect(stateAtNavigation).toEqual({ status: 'in_progress', pos: 'P' })
  })
})
