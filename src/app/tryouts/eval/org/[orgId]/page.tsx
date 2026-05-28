'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../../../lib/supabase'

interface TeamEntry {
  team_label: string
  token:      string
}

interface PortalData {
  org_name:     string
  season_label: string | null
  teams:        TeamEntry[]
}

function sortTeams(teams: TeamEntry[]): TeamEntry[] {
  return [...teams].sort((a, b) => {
    const na = parseInt(a.team_label.match(/^(\d+)/)?.[1] ?? '999')
    const nb = parseInt(b.team_label.match(/^(\d+)/)?.[1] ?? '999')
    return na !== nb ? na - nb : a.team_label.localeCompare(b.team_label)
  })
}

export default function CoachEvalPortal({ params }: { params: { orgId: string } }) {
  const router = useRouter()
  const [data,     setData]     = useState<PortalData | null>(null)
  const [selected, setSelected] = useState('')
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)

  useEffect(() => {
    document.body.classList.add('eval-standalone')
    return () => document.body.classList.remove('eval-standalone')
  }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase
      .rpc('tryout_coach_eval_portal', { p_org_id: params.orgId })
      .then(({ data: result, error: err }) => {
        if (err || !result) { setError('Could not load portal.'); setLoading(false); return }
        const portal = result as PortalData
        portal.teams = sortTeams(portal.teams)
        setData(portal)
        if (portal.teams.length === 1) setSelected(portal.teams[0].team_label)
        setLoading(false)
      })
  }, [params.orgId])

  function handleOpen() {
    const team = data?.teams.find(t => t.team_label === selected)
    if (team) router.push(`/tryouts/eval/team/${team.token}`)
  }

  // ── Styles ──────────────────────────────────────────────────────────────────

  const wrap: React.CSSProperties = {
    minHeight: '100vh',
    background: '#f8fafc',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'flex-start',
    padding: '3rem 1.25rem 4rem',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  }

  const card: React.CSSProperties = {
    background: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '16px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
    padding: '2.25rem 2rem',
    width: '100%',
    maxWidth: '460px',
  }

  const label: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: '#4a5568',
    marginBottom: '6px',
  }

  const select: React.CSSProperties = {
    width: '100%',
    padding: '11px 14px',
    fontSize: '15px',
    borderRadius: '8px',
    border: '1.5px solid #cbd5e0',
    background: '#ffffff',
    color: '#1a202c',
    marginBottom: '1rem',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%234a5568' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 14px center',
    paddingRight: '36px',
    cursor: 'pointer',
  }

  const btn: React.CSSProperties = {
    width: '100%',
    padding: '13px',
    fontSize: '15px',
    fontWeight: 700,
    borderRadius: '8px',
    border: 'none',
    background: selected ? '#1a365d' : '#a0aec0',
    color: '#ffffff',
    cursor: selected ? 'pointer' : 'not-allowed',
    transition: 'background 0.15s',
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) return (
    <div style={wrap}>
      <div style={{ color: '#718096', fontSize: '14px', marginTop: '4rem' }}>Loading…</div>
    </div>
  )

  if (error || !data) return (
    <div style={wrap}>
      <div style={{ ...card, textAlign: 'center', color: '#e53e3e' }}>
        {error ?? 'Something went wrong.'}
      </div>
    </div>
  )

  const { org_name, season_label, teams } = data

  return (
    <div style={wrap}>
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem', maxWidth: '460px' }}>
        <div style={{ fontSize: '13px', fontWeight: 600, color: '#718096', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          {org_name}
        </div>
        <h1 style={{ margin: 0, fontSize: '26px', fontWeight: 800, color: '#1a202c', lineHeight: 1.2 }}>
          Coach Evaluations
        </h1>
        {season_label && (
          <div style={{ marginTop: '6px', fontSize: '14px', color: '#718096' }}>{season_label}</div>
        )}
      </div>

      <div style={card}>
        {teams.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#718096', fontSize: '14px', padding: '1rem 0' }}>
            No evaluation forms are available yet.
            <br />
            <span style={{ fontSize: '12px' }}>Check back soon or contact your administrator.</span>
          </div>
        ) : (
          <>
            <p style={{ margin: '0 0 1.5rem', fontSize: '14px', color: '#4a5568', lineHeight: 1.6 }}>
              Select your team below to open your coach evaluation form.
            </p>

            <label style={label} htmlFor="team-select">Your team</label>
            <select
              id="team-select"
              style={select}
              value={selected}
              onChange={e => setSelected(e.target.value)}
            >
              {teams.length > 1 && (
                <option value="" disabled>— Select a team —</option>
              )}
              {teams.map(t => (
                <option key={t.token} value={t.team_label}>{t.team_label}</option>
              ))}
            </select>

            <button style={btn} disabled={!selected} onClick={handleOpen}>
              Open Evaluation Form →
            </button>
          </>
        )}
      </div>

      <div style={{ marginTop: '1.5rem', fontSize: '12px', color: '#a0aec0', textAlign: 'center', maxWidth: '360px' }}>
        Your progress saves automatically. Once submitted, contact your administrator to make changes.
      </div>
    </div>
  )
}
