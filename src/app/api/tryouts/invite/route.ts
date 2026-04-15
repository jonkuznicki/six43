/**
 * POST /api/tryouts/invite
 * Creates a tryout_org_members record and sends an invite email.
 * If the invited email already has a Supabase user, auto-accepts immediately.
 */

import { NextResponse } from 'next/server'
import { createServerClient } from '../../../../lib/supabase-server'
import { createServiceClient } from '../../../../lib/supabase-service'
import { Resend } from 'resend'

const ROLE_LABELS: Record<string, string> = {
  org_admin:   'Organization Admin',
  head_coach:  'Head Coach',
  evaluator:   'Evaluator',
}

export async function POST(req: Request) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { orgId, email, name, role, teamId } = body as { orgId: string; email: string; name?: string; role: string; teamId?: string }

  if (!orgId || !email || !role) {
    return NextResponse.json({ error: 'Missing orgId, email, or role' }, { status: 400 })
  }
  if (!['org_admin', 'head_coach', 'evaluator'].includes(role)) {
    return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
  }

  const service = createServiceClient()

  // Verify caller is an org_admin for this org
  const { data: isMember } = await authClient.rpc('tryout_is_member', {
    p_org_id: orgId, p_roles: ['org_admin'],
  })
  if (!isMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Get org name
  const { data: org } = await service
    .from('tryout_orgs').select('name').eq('id', orgId).single()

  const normalizedEmail = email.trim().toLowerCase()

  // Check for existing active member
  const { data: existing } = await service
    .from('tryout_org_members')
    .select('id, is_active')
    .eq('org_id', orgId)
    .eq('email', normalizedEmail)
    .maybeSingle()

  if (existing?.is_active) {
    return NextResponse.json({ error: 'This person is already an active member.' }, { status: 409 })
  }

  // Check if email belongs to an existing auth user
  const { data: existingUserId } = await service.rpc('get_user_id_by_email', {
    user_email: normalizedEmail,
  })

  const token = crypto.randomUUID()

  let member: any
  if (existingUserId) {
    // Auto-accept immediately
    const upsertPayload: any = {
      org_id:       orgId,
      email:        normalizedEmail,
      name:         name?.trim() || null,
      role,
      team_id:      teamId || null,
      invited_by:   user.id,
      invite_token: token,
      invited_at:   new Date().toISOString(),
      user_id:      existingUserId,
      is_active:    true,
    }
    if (existing) {
      const { data } = await service.from('tryout_org_members')
        .update(upsertPayload).eq('id', existing.id).select().single()
      member = data
    } else {
      const { data } = await service.from('tryout_org_members')
        .insert(upsertPayload).select().single()
      member = data
    }
  } else {
    // Pending — will be accepted on sign-in or via join link
    const insertPayload: any = {
      org_id:       orgId,
      email:        normalizedEmail,
      name:         name?.trim() || null,
      role,
      team_id:      teamId || null,
      invited_by:   user.id,
      invite_token: token,
      invited_at:   new Date().toISOString(),
      is_active:    false,
    }
    if (existing) {
      const { data } = await service.from('tryout_org_members')
        .update(insertPayload).eq('id', existing.id).select().single()
      member = data
    } else {
      const { data } = await service.from('tryout_org_members')
        .insert(insertPayload).select().single()
      member = data
    }
  }

  // Send invite email
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://six43.com'
  const joinUrl = `${appUrl}/tryouts/join?token=${token}`
  const orgName  = org?.name ?? 'Hudson Baseball'
  const roleLabel = ROLE_LABELS[role] ?? role
  const autoAccepted = !!existingUserId

  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      await resend.emails.send({
        from: 'Six43 <noreply@six43.com>',
        to: normalizedEmail,
        subject: `You've been invited to ${orgName} tryouts on Six43`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
            <div style="font-size:22px;font-weight:800;margin-bottom:4px">
              Six<span style="color:#E8A020">43</span>
            </div>
            <p style="color:#666;font-size:13px;margin-top:2px">Youth baseball</p>
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
            <p style="font-size:16px;font-weight:700;margin-bottom:8px">
              You're invited to ${orgName}
            </p>
            <p style="font-size:14px;color:#444;line-height:1.6;margin-bottom:4px">
              You've been added as <strong>${roleLabel}</strong> for the ${orgName} tryout program.
            </p>
            ${autoAccepted
              ? `<p style="font-size:14px;color:#444">Sign in to access the tryout tools.</p>`
              : `<p style="font-size:14px;color:#444">Click the button below to accept your invitation and get started.</p>`
            }
            <a href="${joinUrl}" style="display:inline-block;margin-top:20px;padding:12px 28px;background:#E8A020;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:15px;">
              ${autoAccepted ? 'Sign in to Six43' : 'Accept invitation'}
            </a>
            <p style="font-size:12px;color:#999;margin-top:24px">
              Or paste this link: ${joinUrl}
            </p>
          </div>
        `,
        text: `You've been invited to ${orgName} as ${roleLabel}.\n\nAccept your invitation: ${joinUrl}`,
      })
    } catch {
      // Don't fail the invite if email fails
    }
  }

  return NextResponse.json({ member, autoAccepted, joinUrl })
}
