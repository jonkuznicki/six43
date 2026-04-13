import { NextResponse } from 'next/server'
import { createServerClient } from '../../../../lib/supabase-server'
import { createServiceClient } from '../../../../lib/supabase-service'
import { Resend } from 'resend'

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.email !== process.env.ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { userId, email } = await req.json()
  if (!userId || !email) return NextResponse.json({ error: 'Missing userId or email' }, { status: 400 })

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'Email not configured' }, { status: 500 })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://six43.com'
  const resend = new Resend(process.env.RESEND_API_KEY)

  // Use the service client to generate a password reset link
  const service = createServiceClient()
  const { data, error } = await service.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${appUrl}/auth/reset-password` },
  })

  if (error || !data?.properties?.action_link) {
    return NextResponse.json({ error: error?.message ?? 'Failed to generate link' }, { status: 500 })
  }

  await resend.emails.send({
    from: 'Six43 <noreply@six43.com>',
    to: email,
    subject: 'Reset your Six43 password',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#0B1F3A;border-radius:14px">
        <div style="font-size:22px;font-weight:800;color:#F5F2EB;margin-bottom:16px">
          Six<span style="color:#E8A020">43</span>
        </div>
        <p style="color:rgba(245,242,235,0.6);font-size:14px;line-height:1.6">
          A password reset was requested for your Six43 account. Click below to choose a new password.
        </p>
        <a href="${data.properties.action_link}" style="display:inline-block;margin-top:16px;padding:12px 24px;background:#E8A020;color:#0B1F3A;text-decoration:none;border-radius:6px;font-weight:700;font-size:14px">
          Reset password
        </a>
        <p style="margin-top:24px;font-size:12px;color:rgba(245,242,235,0.3)">
          If you didn't request this, you can ignore this email.
        </p>
      </div>
    `,
  })

  return NextResponse.json({ ok: true })
}
