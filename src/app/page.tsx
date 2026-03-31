import { createServerClient } from '../lib/supabase'

export default async function Home() {
  const supabase = await createServerClient()
  const { data: players } = await supabase
    .from('players')
    .select('first_name, last_name, jersey_number')
    .order('jersey_number')

  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Six43 — database test</h1>
      <p>Players loaded: {players?.length ?? 0}</p>
      <ul>
        {players?.map(p => (
          <li key={p.jersey_number}>
            #{p.jersey_number} {p.first_name} {p.last_name}
          </li>
        ))}
      </ul>
    </main>
  )
}