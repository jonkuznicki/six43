/**
 * Decides whether a signed-in user may accept a tryout org invite token.
 *
 * A tryout_org_members row is in one of these states:
 *   pending  : is_active = false, user_id = null  (invited, never accepted)
 *   active   : is_active = true,  user_id = set
 *   removed  : is_active = false, user_id = set   (an admin removed them)
 *
 * Security (finding R5): a REMOVED member must not be able to reactivate
 * themselves (or let someone else take over the row) by replaying the
 * original invite link. Only an org admin can restore them (Members page →
 * reactivate, or a fresh invite).
 */
export interface InviteMemberRow {
  user_id: string | null
  email: string | null
  is_active: boolean
}

export type InviteDecision =
  | { ok: true; alreadyMember: boolean }
  | { ok: false; status: 409 | 410; error: string }

const norm = (e: string | null | undefined) => (e ?? '').trim().toLowerCase()

/**
 * Pending (never-accepted) tryout invites for an email, used by the auth callback
 * to auto-accept after sign-in. Inactive rows that already have a user_id are
 * REMOVED members and are deliberately excluded (R5).
 */
export async function findPendingTryoutInviteIds(
  service: { from: (t: string) => any },
  email: string,
): Promise<string[]> {
  const { data } = await service
    .from('tryout_org_members')
    .select('id')
    .eq('email', email)
    .eq('is_active', false)
    .is('user_id', null)
  return (data ?? []).map((r: { id: string }) => r.id)
}

export function decideTryoutInviteAcceptance(
  member: InviteMemberRow,
  user: { id: string; email?: string | null },
): InviteDecision {
  if (!member.is_active && member.user_id) {
    return {
      ok: false,
      status: 410,
      error: 'This invite is no longer active. Ask an organization admin to invite you again.',
    }
  }
  if (member.is_active && member.user_id) {
    return member.user_id === user.id
      ? { ok: true, alreadyMember: true }
      : { ok: false, status: 409, error: 'This invite has already been used.' }
  }
  if (member.is_active && !member.user_id && norm(member.email) !== norm(user.email)) {
    // Active placeholder row reserved for a specific email: only that person may claim it.
    return { ok: false, status: 409, error: 'This invite has already been used.' }
  }
  // Pending invite (or active placeholder claimed by its own email): accept.
  return { ok: true, alreadyMember: false }
}
