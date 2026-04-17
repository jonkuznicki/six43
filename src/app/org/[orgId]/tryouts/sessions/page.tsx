'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'

interface Session {
  id:           string
  age_group:    string
  session_date: string
  start_time:   string | null
  end_time:     string | null
  field:        string | null
  label:        string
  status:       'scheduled' | 'open' | 'closed'
  season_id:    string
  _scoreCount?: number
}
interface Season {
  id:         string
  label:      string
  year:       number
  age_groups: string[]
}
interface OrgMember {
  id:      string
  name:    string | null
  email:   string
  role:    string
  user_id: string | null
}

const STATUS_STYLES = {
  scheduled: { label: 'Scheduled', color: `rgba(var(--fg-rgb),0.4)`,  bg: `rgba(var(--fg-rgb),0.06)` },
  open:      { label: 'Open',      color: '#6DB875',                  bg: 'rgba(45,106,53,0.12)' },
  closed:    { label: 'Closed',    color: `rgba(var(--fg-rgb),0.35)`, bg: `rgba(var(--fg-rgb),0.04)` },
}

const BLANK_SESSION = {
  age_group: '', session_date: '', start_time: '', end_time: '', field: '', label: '',
}

export default function SessionsPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()

  const [sessions, setSessions] = useState<Session[]>([])
  const [season,   setSeason]   = useState<Season | null>(null)
  const [members,  setMembers]  = useState<OrgMember[]>([])
  const [loading,  setLoading]  = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form,     setForm]     = useState(BLANK_SESSION)
  const [saving,   setSaving]   = useState(false)
  const [statusChanging, setStatusChanging] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: seasonData } = await supabase
      .from('tryout_seasons').select('id, label, year, age_groups')
      .eq('org_id', params.orgId).eq('is_active', true).maybeSingle()
    setSeason(seasonData)

    if (!seasonData) { setLoading(false); return }

    const [{ data: sessionData }, { data: memberData }] = await Promise.all([
      supabase.from('tryout_sessions').select('*')
        .eq('season_id', seasonData.id).order('session_date').order('age_group'),
      supabase.from('tryout_org_members').select('id, name, email, role, user_id')
        .eq('org_id', params.orgId).eq('is_active', true),
    ])

    // Get score counts per session
    const ids = (sessionData ?? []).map((s: any) => s.id)
    let scoreCounts: Record<string, number> = {}
    if (ids.length > 0) {
      const { data: scores } = await supabase
        .from('tryout_scores').select('session_id')
        .in('session_id', ids)
      for (const s of scores ?? []) {
        scoreCounts[s.session_id] = (scoreCounts[s.session_id] ?? 0) + 1
      }
    }

    setSessions((sessionData ?? []).map((s: any) => ({ ...s, _scoreCount: scoreCounts[s.id] ?? 0 })))
    setMembers(memberData ?? [])
    setLoading(false)
  }

  async function createSession() {
    if (!season || !form.age_group || !form.session_date || !form.label) return
    setSaving(true)
    const { data } = await supabase.from('tryout_sessions').insert({
      season_id:    season.id,
      org_id:       params.orgId,
      age_group:    form.age_group,
      session_date: form.session_date,
      start_time:   form.start_time || null,
      end_time:     form.end_time   || null,
      field:        form.field      || null,
      label:        form.label,
      status:       'scheduled',
    }).select().single()
    if (data) setSessions(prev => [...prev, { ...data, _scoreCount: 0 }])
    setForm(BLANK_SESSION)
    setShowForm(false)
    setSaving(false)
  }

  async function setStatus(sessionId: string, status: Session['status']) {
    setStatusChanging(sessionId)
    await supabase.from('tryout_sessions').update({ status }).eq('id', sessionId)
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, status } : s))
    setStatusChanging(null)
  }

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  if (loading) return <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>

  const grouped = (season?.age_groups ?? []).map(ag => ({
    ageGroup: ag,
    sessions: sessions.filter(s => s.age_group === ag),
  })).filter(g => g.sessions.length > 0 || true)

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800 }}>Tryout Sessions</h1>
          {season && <div style={{ fontSize: '13px', color: s.muted, marginTop: '2px' }}>{season.label}</div>}
        </div>
        <button onClick={() => setShowForm(v => !v)} style={{
          padding: '8px 18px', borderRadius: '7px', border: 'none',
          background: 'var(--accent)', color: 'var(--accent-text)',
          fontSize: '13px', fontWeight: 700, cursor: 'pointer',
        }}>+ New session</button>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '1rem' }}>New session</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px', marginBottom: '12px' }}>
            {[
              { key: 'label', label: 'Label', placeholder: 'Week 1 / Day 1' },
              { key: 'session_date', label: 'Date', type: 'date' },
              { key: 'start_time', label: 'Start time', placeholder: '9:00 AM' },
              { key: 'end_time',   label: 'End time',   placeholder: '12:00 PM' },
              { key: 'field',      label: 'Field',      placeholder: 'Memorial Field 1' },
            ].map(({ key, label, placeholder, type }) => (
              <div key={key}>
                <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
                <input type={type ?? 'text'} value={(form as any)[key]} placeholder={placeholder}
                  onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '7px 10px', fontSize: '13px', color: 'var(--fg)' }}
                />
              </div>
            ))}
            <div>
              <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Age group</label>
              <select value={form.age_group} onChange={e => setForm(f => ({ ...f, age_group: e.target.value }))}
                style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '7px 10px', fontSize: '13px', color: 'var(--fg)' }}>
                <option value="">Select…</option>
                {(season?.age_groups ?? []).map(ag => <option key={ag} value={ag}>{ag}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={createSession} disabled={saving || !form.age_group || !form.session_date || !form.label} style={{
              padding: '8px 18px', borderRadius: '6px', border: 'none',
              background: 'var(--accent)', color: 'var(--accent-text)',
              fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1,
            }}>{saving ? 'Saving…' : 'Create session'}</button>
            <button onClick={() => { setShowForm(false); setForm(BLANK_SESSION) }} style={{
              padding: '8px 18px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
              background: 'transparent', color: s.muted, fontSize: '13px', cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Session list */}
      {sessions.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: '4rem', color: s.dim, fontSize: '14px' }}>
          No sessions yet. Create your first session above.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {sessions.map(session => {
            const st = STATUS_STYLES[session.status]
            const changing = statusChanging === session.id
            return (
              <div key={session.id} style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                      <span style={{ fontWeight: 700, fontSize: '15px' }}>{session.label}</span>
                      <span style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '4px', background: 'rgba(var(--fg-rgb),0.07)', color: s.muted, fontWeight: 600 }}>{session.age_group}</span>
                      <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '20px', background: st.bg, color: st.color, fontWeight: 700 }}>{st.label}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: s.dim }}>
                      {new Date(session.session_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {session.start_time ? ` · ${session.start_time}` : ''}
                      {session.end_time ? `–${session.end_time}` : ''}
                      {session.field ? ` · ${session.field}` : ''}
                      {session._scoreCount ? ` · ${session._scoreCount} scores` : ''}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                    {/* Status transitions */}
                    {session.status === 'scheduled' && (
                      <button onClick={() => setStatus(session.id, 'open')} disabled={changing} style={{ padding: '5px 12px', borderRadius: '5px', border: 'none', background: 'rgba(45,106,53,0.15)', color: '#6DB875', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                        Open for scoring
                      </button>
                    )}
                    {session.status === 'open' && (
                      <button onClick={() => setStatus(session.id, 'closed')} disabled={changing} style={{ padding: '5px 12px', borderRadius: '5px', border: 'none', background: 'rgba(var(--fg-rgb),0.07)', color: s.muted, fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
                        Close session
                      </button>
                    )}
                    {/* Score link — always accessible for admin */}
                    <Link href={`/org/${params.orgId}/tryouts/sessions/${session.id}`} style={{
                      padding: '5px 12px', borderRadius: '5px', border: '0.5px solid var(--border-md)',
                      background: 'var(--bg-input)', color: s.muted, fontSize: '12px', fontWeight: 600,
                      textDecoration: 'none',
                    }}>
                      Manage →
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
