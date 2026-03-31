import { createServerClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function Dashboard() {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: players } = await supabase
    .from('players')
    .select('first_name, last_name, jersey_number, primary_position')
    .order('batting_pref_order', { ascending: true, nullsFirst: false })

  return (
    <main style={{
      minHeight: '100vh',
      background: '#0B1F3A',
      color: '#F5F2EB',
      fontFamily: 'sans-serif',
      padding: '2rem',
    }}>
      <h1 style={{ fontSize: '32px', marginBottom: '0.25rem' }}>
        Six<span style={{ color: '#E8A020' }}>43</span>
      </h1>
      <p style={{ color: 'rgba(245,242,235,0.55)', marginBottom: '2rem' }}>
        Welcome back — you are logged in as {user.email}
      </p>

      <h2 style={{ fontSize: '18px', marginBottom: '1rem', color: '#E8A020' }}>
        Your roster ({players?.length ?? 0} players)
      </h2>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {players?.map(p => (
          <div key={p.jersey_number} style={{
            background: 'rgba(255,255,255,0.05)',
            border: '0.5px solid rgba(245,242,235,0.1)',
            borderRadius: '8px',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span>
              <span style={{ color: 'rgba(245,242,235,0.4)', marginRight: '8px', fontSize: '13px' }}>
                #{p.jersey_number}
              </span>
              {p.first_name} {p.last_name}
            </span>
            <span style={{
              fontSize: '12px',
              padding: '2px 8px',
              background: 'rgba(232,160,32,0.15)',
              border: '0.5px solid rgba(232,160,32,0.3)',
              borderRadius: '4px',
              color: '#E8A020',
            }}>
              {p.primary_position ?? '—'}
            </span>
          </div>
        ))}
      </div>
    </main>
  )
}