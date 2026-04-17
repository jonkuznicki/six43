'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../../../../lib/supabase'
import Link from 'next/link'

export default function CoachLandingPage({ params }: { params: { orgId: string; teamId: string } }) {
  const supabase = createClient()
  const [team,    setTeam]    = useState<any>(null)
  const [season,  setSeason]  = useState<any>(null)
  const [statsJob, setStatsJob] = useState<any>(null)
  const [evalStatus, setEvalStatus] = useState<string>('not_started')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [{ data: t }, { data: s }] = await Promise.all([
        supabase.from('tryout_teams').select('id, name, age_group').eq('id', params.teamId).single(),
        supabase.from('tryout_seasons').select('id, label, year').eq('org_id', params.orgId).eq('is_active', true).maybeSingle(),
      ])
      setTeam(t); setSeason(s)

      if (t && s) {
        const [{ data: job }, { data: evals }] = await Promise.all([
          supabase.from('tryout_import_jobs').select('id, status, rows_total, rows_matched, created_at')
            .eq('org_id', params.orgId).eq('type', 'gc_stats').eq('team_id', params.teamId)
            .order('created_at', { ascending: false }).limit(1).maybeSingle(),
          supabase.from('tryout_coach_evals').select('status')
            .eq('org_id', params.orgId).eq('season_id', s.id).eq('team_label', t.name).limit(1),
        ])
        setStatsJob(job)
        if (evals?.some((e: any) => e.status === 'submitted')) setEvalStatus('submitted')
        else if (evals && evals.length > 0) setEvalStatus('in_progress')
      }
      setLoading(false)
    }
    load()
  }, [])

  const s = { muted: `rgba(var(--fg-rgb),0.55)`, dim: `rgba(var(--fg-rgb),0.35)` }

  if (loading) return <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>

  const statsStatus = statsJob?.status === 'complete' ? '✅ Submitted' : statsJob?.status === 'needs_review' ? '🟡 Needs review' : statsJob ? '⚠ Issue' : '⬜ Not submitted'
  const evalLabel   = evalStatus === 'submitted' ? '✅ Submitted' : evalStatus === 'in_progress' ? '🟡 In progress' : '⬜ Not started'

  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '4px' }}>Coach Portal</div>
      <h1 style={{ fontSize: '24px', fontWeight: 800, marginBottom: '2px' }}>{team?.name}</h1>
      <div style={{ fontSize: '13px', color: s.muted, marginBottom: '2rem' }}>{season?.label} · {team?.age_group}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {[
          { href: 'stats', icon: '📊', label: 'Season Stats', desc: 'Upload your GameChanger season stats export', status: statsStatus },
          { href: 'eval',  icon: '📝', label: 'Player Evaluations', desc: 'Score each player on your roster', status: evalLabel },
        ].map(item => (
          <Link key={item.href} href={`/org/${params.orgId}/tryouts/coach/${params.teamId}/${item.href}`} style={{
            display: 'block', padding: '1.25rem', borderRadius: '12px',
            background: 'var(--bg-card)', border: '0.5px solid var(--border)',
            textDecoration: 'none', color: 'var(--fg)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: '20px', marginBottom: '6px' }}>{item.icon}</div>
                <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>{item.label}</div>
                <div style={{ fontSize: '12px', color: s.muted }}>{item.desc}</div>
              </div>
              <div style={{ fontSize: '12px', color: s.muted, fontWeight: 600, flexShrink: 0, marginLeft: '12px' }}>{item.status}</div>
            </div>
          </Link>
        ))}
      </div>
    </main>
  )
}
