import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../../lib/supabase-server'
import { createServiceClient } from '../../../../lib/supabase-service'

export async function POST(req: NextRequest) {
  // 1. Verify the caller is the admin
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail || !user || user.email !== adminEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // 2. Parse body
  const { userId, betaFeatures } = await req.json()
  if (!userId || typeof betaFeatures !== 'boolean') {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  }

  // 3. Upsert profiles row using service role (bypasses RLS)
  const service = createServiceClient()
  const { error } = await service
    .from('profiles')
    .upsert({
      user_id: userId,
      beta_features: betaFeatures,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
