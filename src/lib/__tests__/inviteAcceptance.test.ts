import { describe, expect, it } from 'vitest'
import { decideTryoutInviteAcceptance } from '../tryouts/inviteAcceptance'

const alice = { id: 'user-alice', email: 'alice@example.test' }
const mallory = { id: 'user-mallory', email: 'mallory@example.test' }

describe('decideTryoutInviteAcceptance (R5)', () => {
  it('accepts a pending invite (never accepted, no account linked)', () => {
    const r = decideTryoutInviteAcceptance({ user_id: null, email: 'alice@example.test', is_active: false }, alice)
    expect(r).toEqual({ ok: true, alreadyMember: false })
  })

  it('pending invite links stay shareable (bearer link, as before)', () => {
    const r = decideTryoutInviteAcceptance({ user_id: null, email: 'alice@example.test', is_active: false }, mallory)
    expect(r.ok).toBe(true)
  })

  it('REFUSES a removed member replaying their old invite link', () => {
    const r = decideTryoutInviteAcceptance({ user_id: alice.id, email: alice.email, is_active: false }, alice)
    expect(r).toMatchObject({ ok: false, status: 410 })
  })

  it('REFUSES someone else taking over a removed member row', () => {
    const r = decideTryoutInviteAcceptance({ user_id: alice.id, email: alice.email, is_active: false }, mallory)
    expect(r).toMatchObject({ ok: false, status: 410 })
  })

  it('an active member re-opening their own link is a harmless no-op', () => {
    const r = decideTryoutInviteAcceptance({ user_id: alice.id, email: alice.email, is_active: true }, alice)
    expect(r).toEqual({ ok: true, alreadyMember: true })
  })

  it("refuses another user claiming an active member's link", () => {
    const r = decideTryoutInviteAcceptance({ user_id: alice.id, email: alice.email, is_active: true }, mallory)
    expect(r).toMatchObject({ ok: false, status: 409 })
  })

  it('active placeholder row (no user yet) can be claimed only by its own email, case-insensitively', () => {
    const row = { user_id: null, email: 'Alice@Example.test', is_active: true }
    expect(decideTryoutInviteAcceptance(row, alice).ok).toBe(true)
    expect(decideTryoutInviteAcceptance(row, mallory)).toMatchObject({ ok: false, status: 409 })
  })
})
