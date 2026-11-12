/**
 * R5: the auth-callback auto-accept must only pick up never-accepted invites,
 * never members an admin removed. Exercises the real query helper used by
 * src/app/auth/callback/route.ts against the local database.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { findPendingTryoutInviteIds } from '../../src/lib/tryouts/inviteAcceptance'
import { createUser, deleteUsers, serviceClient, type TestUser } from './helpers'

let admin: TestUser, removedCoach: TestUser
let orgId: string
let pendingEmail: string

beforeAll(async () => {
  const svc = serviceClient()
  admin = await createUser('tryout-admin')
  removedCoach = await createUser('removed-coach')
  pendingEmail = `rls-pending-${Date.now()}@example.test`

  const { data: org, error } = await svc.from('tryout_orgs')
    .insert({ name: 'RLS Synthetic Baseball', sport: 'baseball', slug: `rls-${Date.now()}`, admin_user_id: admin.id })
    .select('id').single()
  if (error) throw error
  orgId = org.id

  const { error: mErr } = await svc.from('tryout_org_members').insert([
    // removed: had accepted (user_id set), then an admin set is_active = false
    { org_id: orgId, email: removedCoach.email, user_id: removedCoach.id, role: 'org_admin', is_active: false },
    // pending: invited, never accepted
    { org_id: orgId, email: pendingEmail, user_id: null, role: 'evaluator', is_active: false },
  ])
  if (mErr) throw mErr
})

afterAll(async () => {
  if (orgId) await serviceClient().from('tryout_orgs').delete().eq('id', orgId)  // members cascade
  await deleteUsers([admin, removedCoach])
})

describe('R5 auth-callback auto-accept query', () => {
  it('does NOT return a removed member (signing in must not reactivate them)', async () => {
    expect(await findPendingTryoutInviteIds(serviceClient(), removedCoach.email)).toEqual([])
  })

  it('still returns a genuinely pending invite', async () => {
    expect(await findPendingTryoutInviteIds(serviceClient(), pendingEmail)).toHaveLength(1)
  })
})
