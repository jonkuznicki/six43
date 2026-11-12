/**
 * R6: get_user_id_by_email must not be callable by browsers (anon or signed-in
 * users). Only the server (service role, used by /api/invite/create and
 * /api/tryouts/invite) may resolve an email to a user id.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { anonClient, createUser, deleteUsers, serviceClient, type TestUser } from './helpers'

let target: TestUser, other: TestUser

beforeAll(async () => {
  target = await createUser('lookup-target')
  other = await createUser('lookup-caller')
})
afterAll(async () => { await deleteUsers([target, other]) })

describe('R6 get_user_id_by_email', () => {
  it('anonymous visitors cannot look up an email', async () => {
    const { data, error } = await anonClient().rpc('get_user_id_by_email', { user_email: target.email })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
  })

  it('signed-in users cannot look up another user', async () => {
    const { data, error } = await other.client.rpc('get_user_id_by_email', { user_email: target.email })
    expect(data).toBeNull()
    expect(error).not.toBeNull()
  })

  it('the server (service role) can still resolve emails for invites', async () => {
    const { data, error } = await serviceClient().rpc('get_user_id_by_email', { user_email: target.email })
    expect(error).toBeNull()
    expect(data).toBe(target.id)
  })
})
