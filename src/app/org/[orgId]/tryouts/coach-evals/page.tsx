'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'

interface CoachEval {
  id:          string
  player_id:   string
  coach_id:    string
  coach_name:  string | null
  prior_team:  string | null
  season_year: number
  status:      'draft' | 'submitted'
  scores:      Record<string, number> | null
  comments:    string | null
  submitted_at: string | null
  player_name?: string
}

interface Player {
  id:         string
  first_name: string
  last_name:  string
  age_group:  string
  prior_team: string | null
}

interface EvalField {
  key:      string
  label:    string
  section:  string
  sort_order: number
}

interface Season {
  id:         string
  label:      string
  year:       number
  age_groups: string[]
}

const SECTION_LABELS: Record<string, string> = {
  fielding_hitting:  'Fielding & Hitting',
  pitching_catching: 'Pitching & Catching',
  intangibles:       'Intangibles',
}

export default function CoachEvalsPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()

  const [season,      setSeason]      = useState<Season | null>(null)
  const [fields,      setFields]      = useState<EvalField[]>([])
  const [evals,       setEvals]       = useState<CoachEval[]>([])
  const [players,     setPlayers]     = useState<Player[]>([])
  const [myTeam,      setMyTeam]      = useState('')
  const [ageFilter,   setAgeFilter]   = useState('all')
  const [loading,     setLoading]     = useState(true)
  const [activeEval,  setActiveEval]  = useState<string | null>(null)  // player_id being edited
  const [scores,      setScores]      = useState<Record<string, number>>({})
  const [comments,    setComments]    = useState('')
  const [saving,      setSaving]      = useState(false)
  const [myMemberId,  setMyMemberId]  = useState<string | null>(null)
  const [myName,      setMyName]      = useState('')
  const [isAdmin,     setIsAdmin]     = useState(false)
  const [viewAll,     setViewAll]     = useState(false)
  const [evalYear,    setEvalYear]    = useState(new Date().getFullYear() - 1)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()

    const [
      { data: seasonData },
      { data: memberData },
      { data: fieldData },
    ] = await Promise.all([
      supabase.from('tryout_seasons').select('id, label, year, age_groups').eq('org_id', params.orgId).eq('is_active', true).maybeSingle(),
      user ? supabase.from('tryout_org_members').select('id, name, email, role').eq('org_id', params.orgId).eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('tryout_coach_eval_config').select('field_key, label, section, sort_order').eq('org_id', params.orgId).order('sort_order'),
    ])

    setSeason(seasonData)
    setFields((fieldData ?? []).map((f: any) => ({ key: f.field_key, label: f.label, section: f.section, sort_order: f.sort_order })))

    if (memberData) {
      setMyMemberId(memberData.id)
      setMyName(memberData.name ?? memberData.email ?? '')
      setIsAdmin(memberData.role === 'org_admin')
    }

    if (!seasonData) { setLoading(false); return }

    const [{ data: evalData }, { data: playerData }] = await Promise.all([
      supabase.from('tryout_coach_evals').select('id, player_id, coach_id, coach_name, prior_team, season_year, status, scores, comments, submitted_at')
        .eq('org_id', params.orgId)
        .order('submitted_at', { ascending: false }),
      supabase.from('tryout_players').select('id, first_name, last_name, age_group, prior_team')
        .eq('org_id', params.orgId).eq('is_active', true)
        .order('last_name').order('first_name'),
    ])

    const playerMap = new Map((playerData ?? []).map((p: any) => [p.id, `${p.first_name} ${p.last_name}`]))
    setEvals((evalData ?? []).map((e: any) => ({ ...e, player_name: playerMap.get(e.player_id) ?? 'Unknown' })))
    setPlayers(playerData ?? [])
    setLoading(false)
  }

  // Players visible to this coach (matching their prior_team) or all if admin
  const visiblePlayers = players.filter(p => {
    if (isAdmin && viewAll) return true
    if (myTeam && p.prior_team) return p.prior_team.toLowerCase().includes(myTeam.toLowerCase())
    return false
  }).filter(p => ageFilter === 'all' || p.age_group === ageFilter)

  // Map player_id → eval by current user
  const myEvalMap = new Map(
    evals.filter(e => e.coach_id === myMemberId).map(e => [e.player_id, e])
  )

  function openEval(playerId: string) {
    const existing = myEvalMap.get(playerId)
    setScores(existing?.scores ?? {})
    setComments(existing?.comments ?? '')
    setActiveEval(playerId)
  }

  function closeEval() {
    setActiveEval(null)
    setScores({})
    setComments('')
  }

  async function saveEval(submit: boolean) {
    if (!activeEval || !season) return
    const player = players.find(p => p.id === activeEval)
    if (!player) return
    setSaving(true)

    const existing = myEvalMap.get(activeEval)
    const payload = {
      org_id:      params.orgId,
      season_id:   season.id,
      player_id:   activeEval,
      coach_id:    myMemberId,
      coach_name:  myName,
      prior_team:  player.prior_team,
      season_year: evalYear,
      scores,
      comments:    comments.trim() || null,
      status:      submit ? 'submitted' : 'draft',
      ...(submit ? { submitted_at: new Date().toISOString() } : {}),
    }

    let saved: any
    if (existing) {
      const { data } = await supabase.from('tryout_coach_evals').update(payload).eq('id', existing.id).select().single()
      saved = data
    } else {
      const { data } = await supabase.from('tryout_coach_evals').insert(payload).select().single()
      saved = data
    }

    if (saved) {
      const playerName = `${player.first_name} ${player.last_name}`
      setEvals(prev => {
        const without = prev.filter(e => e.id !== saved.id)
        return [{ ...saved, player_name: playerName }, ...without]
      })
    }

    setSaving(false)
    if (submit) closeEval()
  }

  const sections = Array.from(new Set(fields.map(f => f.section)))

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading…
    </main>
  )

  // Eval form overlay
  if (activeEval) {
    const player = players.find(p => p.id === activeEval)
    const existing = myEvalMap.get(activeEval)
    const isSubmitted = existing?.status === 'submitted'

    return (
      <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto', padding: '2rem 1.5rem 6rem' }}>
        <button onClick={closeEval} style={{ fontSize: '13px', color: s.dim, background: 'none', border: 'none', cursor: 'pointer', padding: '0', marginBottom: '1.5rem', display: 'block' }}>
          ‹ Back
        </button>

        <div style={{ marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '20px', fontWeight: 800 }}>{player?.first_name} {player?.last_name}</h1>
          <div style={{ fontSize: '13px', color: s.muted, marginTop: '2px' }}>
            {player?.age_group}
            {player?.prior_team ? ` · ${player.prior_team}` : ''}
          </div>
          {isSubmitted && (
            <div style={{ marginTop: '8px', fontSize: '12px', padding: '5px 12px', borderRadius: '6px', background: 'rgba(109,184,117,0.12)', color: '#6DB875', display: 'inline-block', fontWeight: 700 }}>
              Submitted
            </div>
          )}
        </div>

        {/* Year being evaluated */}
        <div style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ fontSize: '12px', color: s.dim, fontWeight: 600 }}>Evaluating season year:</label>
          <input type="number" value={evalYear} onChange={e => setEvalYear(Number(e.target.value))}
            style={{ background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '5px 10px', fontSize: '13px', color: 'var(--fg)', width: '80px' }}
          />
        </div>

        {sections.map(section => {
          const sectionFields = fields.filter(f => f.section === section)
          return (
            <div key={section} style={{ marginBottom: '1.75rem' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: s.muted, marginBottom: '0.75rem' }}>
                {SECTION_LABELS[section] ?? section}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {sectionFields.map(field => (
                  <div key={field.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: 600 }}>{field.label}</label>
                      <span style={{ fontSize: '13px', fontWeight: 700, color: scores[field.key] != null ? 'var(--accent)' : s.dim }}>
                        {scores[field.key] ?? '–'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[1, 2, 3, 4, 5].map(v => (
                        <button key={v} onClick={() => !isSubmitted && setScores(prev => ({ ...prev, [field.key]: v }))}
                          style={{
                            flex: 1, padding: '12px 0', borderRadius: '7px',
                            border: scores[field.key] === v ? '2px solid var(--accent)' : '1.5px solid var(--border-md)',
                            background: scores[field.key] === v ? 'rgba(232,160,32,0.15)' : 'var(--bg-input)',
                            color: scores[field.key] === v ? 'var(--accent)' : s.muted,
                            fontSize: '15px', fontWeight: 800,
                            cursor: isSubmitted ? 'default' : 'pointer',
                            opacity: isSubmitted ? 0.7 : 1,
                          }}>{v}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        {/* Comments */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Comments</label>
          <textarea
            value={comments}
            onChange={e => !isSubmitted && setComments(e.target.value)}
            placeholder="Character, coachability, improvement over the season…"
            rows={3}
            readOnly={isSubmitted}
            style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '8px', padding: '10px 12px', fontSize: '14px', color: 'var(--fg)', resize: 'vertical', fontFamily: 'sans-serif', opacity: isSubmitted ? 0.7 : 1 }}
          />
        </div>

        {!isSubmitted && (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={() => saveEval(false)} disabled={saving} style={{
              flex: 1, padding: '13px', borderRadius: '8px',
              border: '0.5px solid var(--border-md)', background: 'var(--bg-input)',
              color: s.muted, fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              opacity: saving ? 0.6 : 1,
            }}>{saving ? 'Saving…' : 'Save draft'}</button>
            <button onClick={() => saveEval(true)} disabled={saving} style={{
              flex: 2, padding: '13px', borderRadius: '8px', border: 'none',
              background: 'var(--accent)', color: 'var(--accent-text)',
              fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              opacity: saving ? 0.6 : 1,
            }}>{saving ? 'Submitting…' : 'Submit evaluation ✓'}</button>
          </div>
        )}
      </main>
    )
  }

  // All submitted evals (admin view)
  const submittedEvals  = evals.filter(e => e.status === 'submitted')
  const draftEvals      = evals.filter(e => e.status === 'draft' && e.coach_id === myMemberId)

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', maxWidth: '820px', margin: '0 auto', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>

      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800 }}>Coach Evaluations</h1>
        {season && <div style={{ fontSize: '13px', color: s.muted, marginTop: '2px' }}>{season.label}</div>}
      </div>

      {/* Stats */}
      {(submittedEvals.length > 0 || draftEvals.length > 0) && (
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
          {submittedEvals.length > 0 && (
            <div style={{ padding: '10px 18px', borderRadius: '8px', background: 'rgba(109,184,117,0.1)', border: '0.5px solid rgba(109,184,117,0.3)' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#6DB875' }}>{submittedEvals.length}</div>
              <div style={{ fontSize: '11px', color: s.muted }}>Submitted</div>
            </div>
          )}
          {draftEvals.length > 0 && (
            <div style={{ padding: '10px 18px', borderRadius: '8px', background: 'rgba(232,160,32,0.1)', border: '0.5px solid rgba(232,160,32,0.3)' }}>
              <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--accent)' }}>{draftEvals.length}</div>
              <div style={{ fontSize: '11px', color: s.muted }}>My drafts</div>
            </div>
          )}
        </div>
      )}

      {/* Team filter for coaches */}
      <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '0.75rem' }}>Find your players</div>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Your team name (from prior season)</label>
            <input type="text" value={myTeam} onChange={e => setMyTeam(e.target.value)}
              placeholder="e.g. Hudson Cubs, Team 3…"
              style={{ background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '7px 12px', fontSize: '13px', color: 'var(--fg)', width: '240px' }}
            />
          </div>
          <div>
            <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '3px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Age group</label>
            <select value={ageFilter} onChange={e => setAgeFilter(e.target.value)} style={{
              background: 'var(--bg-input)', border: '0.5px solid var(--border-md)',
              borderRadius: '6px', padding: '7px 12px', fontSize: '13px', color: 'var(--fg)',
            }}>
              <option value="all">All</option>
              {(season?.age_groups ?? []).map(ag => <option key={ag} value={ag}>{ag}</option>)}
            </select>
          </div>
          {isAdmin && (
            <button onClick={() => setViewAll(v => !v)} style={{
              padding: '7px 14px', borderRadius: '6px',
              border: `0.5px solid ${viewAll ? 'var(--accent)' : 'var(--border-md)'}`,
              background: viewAll ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
              color: viewAll ? 'var(--accent)' : s.muted,
              fontSize: '12px', fontWeight: viewAll ? 700 : 400, cursor: 'pointer',
            }}>View all players</button>
          )}
        </div>
      </div>

      {/* Player list */}
      {(myTeam || (isAdmin && viewAll)) && visiblePlayers.length === 0 && (
        <div style={{ textAlign: 'center', padding: '2rem', color: s.dim, fontSize: '14px' }}>
          No players found matching "{myTeam}". Check the team name or ask your director.
        </div>
      )}

      {!myTeam && !(isAdmin && viewAll) && (
        <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '14px' }}>
          Enter your team name above to find the players you coached last season.
        </div>
      )}

      {visiblePlayers.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '2rem' }}>
          <div style={{ fontSize: '13px', color: s.muted, marginBottom: '4px' }}>
            {visiblePlayers.length} player{visiblePlayers.length !== 1 ? 's' : ''} — click to evaluate
          </div>
          {visiblePlayers.map(player => {
            const myEval = myEvalMap.get(player.id)
            return (
              <div key={player.id}
                onClick={() => openEval(player.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px', cursor: 'pointer' }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '14px' }}>{player.first_name} {player.last_name}</span>
                    <span style={{ fontSize: '11px', padding: '1px 6px', borderRadius: '4px', background: 'rgba(var(--fg-rgb),0.07)', color: s.muted, fontWeight: 600 }}>{player.age_group}</span>
                  </div>
                  {player.prior_team && (
                    <div style={{ fontSize: '12px', color: s.dim, marginTop: '1px' }}>{player.prior_team}</div>
                  )}
                </div>
                {myEval ? (
                  <span style={{
                    fontSize: '11px', padding: '2px 8px', borderRadius: '20px', fontWeight: 700,
                    background: myEval.status === 'submitted' ? 'rgba(109,184,117,0.12)' : 'rgba(232,160,32,0.1)',
                    color: myEval.status === 'submitted' ? '#6DB875' : 'var(--accent)',
                    border: `0.5px solid ${myEval.status === 'submitted' ? 'rgba(109,184,117,0.3)' : 'rgba(232,160,32,0.3)'}`,
                  }}>
                    {myEval.status === 'submitted' ? 'Submitted' : 'Draft'}
                  </span>
                ) : (
                  <span style={{ fontSize: '12px', color: s.dim }}>Evaluate →</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Admin: all submitted evals */}
      {isAdmin && submittedEvals.length > 0 && (
        <div>
          <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '0.75rem' }}>All submitted evaluations</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {submittedEvals.map(ev => (
              <div key={ev.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '10px', padding: '12px 14px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: '13px' }}>{ev.player_name}</div>
                  <div style={{ fontSize: '12px', color: s.dim }}>
                    by {ev.coach_name ?? 'Unknown coach'}
                    {ev.submitted_at ? ` · ${new Date(ev.submitted_at).toLocaleDateString()}` : ''}
                    {ev.prior_team ? ` · ${ev.prior_team}` : ''}
                  </div>
                </div>
                <button onClick={() => openEval(ev.player_id)} style={{
                  fontSize: '12px', padding: '4px 10px', borderRadius: '5px',
                  border: '0.5px solid var(--border-md)', background: 'var(--bg-input)',
                  color: s.muted, cursor: 'pointer',
                }}>View</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
