import { NextResponse } from 'next/server'
import { createServerClient } from '../../../../lib/supabase-server'
import { createServiceClient } from '../../../../lib/supabase-service'

export async function GET() {
  // Verify admin
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  const adminEmail = process.env.ADMIN_EMAIL
  if (!adminEmail || !user || user.email !== adminEmail) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Fetch all auth users via service role
  const service = createServiceClient()
  const { data: authData, error: authError } = await service.auth.admin.listUsers({ perPage: 1000 })
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  // Fetch all user_plans rows
  const { data: plans } = await service.from('user_plans').select('*')
  const planMap: Record<string, any> = {}
  for (const p of plans ?? []) {
    planMap[p.user_id] = p
  }

  const users = authData.users.map(u => ({
    id: u.id,
    email: u.email ?? '',
    created_at: u.created_at,
    plan: planMap[u.id]?.plan ?? 'free',
    plan_updated_at: planMap[u.id]?.updated_at ?? null,
    plan_notes: planMap[u.id]?.notes ?? null,
  }))

  // Sort: pro first, then by join date desc
  users.sort((a, b) => {
    if (a.plan !== b.plan) return a.plan === 'pro' ? -1 : 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  return NextResponse.json({ users })
}
