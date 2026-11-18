import { createServerClient } from '../lib/supabase-server'
import { Homepage } from '../components/marketing/Homepage'

// The marketing homepage. Page metadata (title, description, canonical URL,
// Open Graph and structured data) comes from the root layout, unchanged.
// Signed-in coaches see "Open app →" in the nav instead of the sign-up links.
export default async function HomePage() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  return <Homepage loggedIn={!!user} />
}
