import { NextResponse } from 'next/server'
import { createServerClient } from '../../../../lib/supabase-server'
import { createServiceClient } from '../../../../lib/supabase-service'
import { Resend } from 'resend'
import { buildBroadcastEmail, BroadcastPayload } from '../../../../lib/email-templates/broadcast'

// POST /api/admin/broadcast
// Body: BroadcastPayload & { dryRun?: boolean }
// dryRun=true  → returns html preview + recipient count, no email sent
// dryRun=false → sends to all users via Resend batch

export async function POST(req: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail || !user || user.email !== adminEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { dryRun = true, ...payload } = body as BroadcastPayload & { dryRun?: boolean }

  const { html, text } = buildBroadcastEmail(payload)

  if (dryRun) {
    return NextResponse.json({ html, text })
  }

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })
  }

  const service = createServiceClient()
  const { data: authData, error: authError } = await service.auth.admin.listUsers({ perPage: 1000 })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

  const emails = (authData.users ?? [])
    .map(u => u.email)
    .filter((e): e is string => !!e)

  const resend = new Resend(process.env.RESEND_API_KEY)
  const BATCH = 100
  let sent = 0
  let failed = 0

  for (let i = 0; i < emails.length; i += BATCH) {
    const batch = emails.slice(i, i + BATCH).map(to => ({
      from: 'Jon at Six43 <support@six43.com>',
      to,
      subject: payload.subject,
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
