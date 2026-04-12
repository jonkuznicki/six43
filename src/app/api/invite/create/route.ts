import { NextResponse } from 'next/server'
import { createServiceClient } from '../../../../lib/supabase-service'
import { createServerClient } from '../../../../lib/supabase-server'
import { Resend } from 'resend'

// POST /api/invite/create
// Creates a team_members invite row. If the invited email already belongs to an
// existing auth user, the invite is immediately accepted (user_id + accepted_at set).
// Otherwise it's left pending for auto-accept on their next sign-in.
// Either way, a notification email is sent to the invited coach.
export async function POST(req: Request) {
  const authClient = await createServerClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { teamId, email } = body
  if (!teamId || !email) return NextResponse.json({ error: 'Missing teamId or email' }, { status: 400 })

  const normalizedEmail = email.trim().toLowerCase()
  const service = createServiceClient()

  // Verify the caller owns this team and get the team name
  const { data: team } = await service
    .from('teams')
    .select('id, user_id, name')
    .eq('id', teamId)
    .single()
  if (!team || team.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Check for an existing pending invite to this email on this team
  const { data: existing } = await service
    .from('team_members')
    .select('id')
    .eq('team_id', teamId)
    .eq('invite_email', normalizedEmail)
    .is('accepted_at', null)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'This email already has a pending invite.' }, { status: 409 })
  }

  // Look up whether this email belongs to an existing auth user
  const { data: existingUserId } = await service.rpc('get_user_id_by_email', { user_email: normalizedEmail })

  const token = crypto.randomUUID()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://six43.app'
  const adminName = user.email ?? 'Your team admin'
  const teamName = team.name

  let member: any = null
  let autoAccepted = false

  if (existingUserId) {
    // User already exists — create and immediately accept the invite
    const now = new Date().toISOString()
    const { data, error } = await service
      .from('team_members')
      .insert({
        team_id: teamId,
        invite_token: token,
        invite_email: normalizedEmail,
        role: 'coach',
        owner_user_id: user.id,
        user_id: existingUserId,
        accepted_at: now,
        email: normalizedEmail,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: 'Failed to create invite.' }, { status: 500 })
    member = data
    autoAccepted = true
  } else {
    // User doesn't exist yet — create pending invite, auto-accept on first sign-in
    const { data, error } = await service
      .from('team_members')
      .insert({
        team_id: teamId,
        invite_token: token,
        invite_email: normalizedEmail,
        role: 'coach',
        owner_user_id: user.id,
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: 'Failed to create invite.' }, { status: 500 })
    member = data
  }

  // Send notification email (fire-and-forget — don't fail the invite if email fails)
  if (process.env.RESEND_API_KEY) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY)
      const loginUrl = `${appUrl}/login`
      const subject = `You've been added to ${teamName} on Six43`
      const bodyText = autoAccepted
        ? `${adminName} added you as a coach for ${teamName} on Six43. Sign in to view the team: ${loginUrl}`
        : `${adminName} invited you to join ${teamName} as a coach on Six43. Create your account to get started: ${loginUrl}`
      const bodyHtml = `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <div style="font-size:22px;font-weight:800;margin-bottom:4px">
            Six<span style="color:#E8A020">43</span>
          </div>
          <p style="color:#666;font-size:13px;margin-top:2px">Youth baseball lineup manager</p>
          <hr style="border:none;border-top:1px solid #eee;margin:16px 0">
          <p style="font-size:16px;font-weight:700;margin-bottom:8px">
            ${autoAccepted ? `You've been added to ${teamName}` : `You're invited to join ${teamName}`}
          </p>
          <p style="font-size:14px;color:#444;line-height:1.6">
            ${adminName} ${autoAccepted ? 'added you as a coach for' : 'invited you to join'} <strong>${teamName}</strong> on Six43.
          </p>
          ${autoAccepted
            ? `<p style="font-size:14px;color:#444">Sign in to see your team's schedule, roster, and lineups.</p>`
            : `<p style="font-size:14px;color:#444">Create a free account to see the team's schedule, roster, and lineups.</p>`
          }
          <a href="${loginUrl}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#E8A020;color:#fff;text-decoration:none;border-radius:6px;font-weight:700;font-size:14px">
            ${autoAccepted ? 'Sign in to Six43' : 'Create your account'}
          </a>
        </div>
      `
      await resend.emails.send({
        from: 'Six43 <noreply@six43.app>',
        to: normalizedEmail,
        subject,
        html: bodyHtml,
        text: bodyText,
      })
    } catch {
      // Email failure doesn't block the invite
    }
  }

  return NextResponse.json({ member, autoAccepted })
}
