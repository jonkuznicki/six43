import { createServerClient } from '../../../lib/supabase-server'
import { createServiceClient } from '../../../lib/supabase-service'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createServerClient()
    await supabase.auth.exchangeCodeForSession(code)

    // Auto-accept any pending email invites for this user
    const { data: { user } } = await supabase.auth.getUser()
    if (user?.email) {
      const service = createServiceClient()
      const { data: pending } = await service
        .from('team_members')
        .select('id, team_id')
        .eq('invite_email', user.email)
        .is('accepted_at', null)

      if (pending && pending.length > 0) {
        await service
          .from('team_members')
          .update({
            user_id: user.id,
            accepted_at: new Date().toISOString(),
          })
          .in('id', pending.map((r: any) => r.id))
      }
    }
  }

  // Notify support when a brand-new account confirms their email.
  // "New" = created_at within the last 10 minutes, which covers any
  // reasonable delay between signing up and clicking the confirm link.
  if (user?.email && user?.created_at && process.env.RESEND_API_KEY) {
    const ageMs = Date.now() - new Date(user.created_at).getTime()
    const isNewSignup = ageMs < 10 * 60 * 1000
    if (isNewSignup) {
      try {
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: 'Six43 <noreply@six43.com>',
          to: 'support@six43.com',
          subject: `New signup: ${user.email}`,
          html: `
            <div style="font-family:sans-serif;max-width:480px;padding:24px">
              <div style="font-size:22px;font-weight:800;margin-bottom:16px">
                Six<span style="color:#E8A020">43</span>
              </div>
              <p style="font-size:15px;font-weight:700;margin-bottom:8px">New user signed up</p>
              <p style="font-size:14px;color:#444;margin-bottom:4px">
                <strong>Email:</strong> ${user.email}
              </p>
              <p style="font-size:14px;color:#444;margin-bottom:4px">
                <strong>User ID:</strong> ${user.id}
              </p>
              <p style="font-size:14px;color:#444">
                <strong>Signed up:</strong> ${new Date(user.created_at).toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
              </p>
            </div>
          `,
          text: `New Six43 signup\nEmail: ${user.email}\nUser ID: ${user.id}\nSigned up: ${user.created_at}`,
        })
      } catch {
        // Don't block the redirect if the notification fails
      }
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
