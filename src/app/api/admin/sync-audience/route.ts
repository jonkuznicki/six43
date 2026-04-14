import { NextResponse } from 'next/server'
import { createServerClient } from '../../../../lib/supabase-server'
import { createServiceClient } from '../../../../lib/supabase-service'
import { Resend } from 'resend'

// POST /api/admin/sync-audience
// Adds all current users to the Resend Audience.
// Safe to run multiple times — Resend deduplicates by email.

export async function POST() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail || !user || user.email !== adminEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const apiKey     = process.env.RESEND_API_KEY
  const audienceId = process.env.RESEND_AUDIENCE_ID
  if (!apiKey)     return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })
  if (!audienceId) return NextResponse.json({ error: 'RESEND_AUDIENCE_ID not set — add it to your environment variables' }, { status: 500 })

  const service = createServiceClient()
  const { data: authData, error: authError } = await service.auth.admin.listUsers({ perPage: 1000 })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 500 })

  const emails = (authData.users ?? [])
    .map(u => u.email)
    .filter((e): e is string => !!e)

  const resend = new Resend(apiKey)
  let synced = 0
  let failed = 0

  // Resend contacts API doesn't have a bulk endpoint — add sequentially
  // but run up to 5 in parallel to keep it reasonably fast
  const CONCURRENCY = 5
  for (let i = 0; i < emails.length; i += CONCURRENCY) {
    const batch = emails.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      batch.map(email =>
        resend.contacts.create({ audienceId, email, unsubscribed: false })
      )
    )
    for (const r of results) {
      if (r.status === 'fulfilled') synced++
      else failed++
    }
  }

  return NextResponse.json({ synced, failed, total: emails.length })
}
