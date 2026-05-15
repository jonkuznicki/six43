import type { Metadata } from 'next'
import { createServiceClient } from '../../../../../../../lib/supabase-service'

interface Props {
  params: { orgId: string; sessionId: string }
  children: React.ReactNode
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const supabase = createServiceClient()
  const { data: session } = await supabase
    .from('tryout_sessions')
    .select('label, age_group, session_date')
    .eq('id', params.sessionId)
    .single()

  if (!session) {
    return { title: 'Tryout Scoring · Six43' }
  }

  const date = new Date(session.session_date + 'T12:00:00').toLocaleDateString('en-US', {
    month: 'long', day: 'numeric',
  })
  const title = `${session.label} – ${session.age_group} Scoring`
  const description = `Score players at the ${session.label} tryout session · ${session.age_group} · ${date}`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: 'Six43',
    },
    twitter: {
      card: 'summary',
      title,
      description,
    },
  }
}

export default function ScoreLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
