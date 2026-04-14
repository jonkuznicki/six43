import { NextResponse } from 'next/server'
import { createServerClient } from '../../../../lib/supabase-server'
import { createServiceClient } from '../../../../lib/supabase-service'
import { Resend } from 'resend'
import { currentBroadcast } from '../../../../lib/email-templates/broadcast'

// POST /api/admin/broadcast
// Body: { dryRun?: boolean }
//   dryRun=true  → returns the recipient list and email preview without sending
//   dryRun=false → sends to all users in batches of 100

export async function POST(req: Request) {
  // Verify admin
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail || !user || user.email !== adminEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const dryRun = body.dryRun !== false   // default to dry run for safety

  const service = createServiceClient()

  // Fetch all auth users
  const { data: authData, error: authError } = await service.auth.admin.listUsers({ perPage: 1000 })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

  const emails = (authData.users ?? [])
    .map(u => u.email)
    .filter((e): e is string => !!e)

  const { subject, html, text } = currentBroadcast()

  if (dryRun) {
    return NextResponse.json({
      dryRun: true,
      recipientCount: emails.length,
      recipients: emails,
      subject,
      htmlPreview: html,
    })
  }

  // Live send — Resend batch API allows up to 100 per call
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const BATCH = 100
  let sent = 0
  let failed = 0

  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH).map(to => ({
      from: 'Jon at Six43 <jon@six43.com>',
      to,
      subject,
      html,
      text,
    }))
    try {
      await resend.batch.send(batch)
      sent += batch.length
    } catch (e: any) {
      console.error('[broadcast] batch error:', e?.message)
      failed += batch.length
    }
  }

  return NextResponse.json({ sent, failed, total: emails.length })
}
