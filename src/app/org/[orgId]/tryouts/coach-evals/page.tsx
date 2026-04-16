'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'

interface EvalField {
  key:        string
  label:      string
  section:    string
  sort_order: number
  weight:     number
}

interface Player {
  id:         string
  first_name: string
  last_name:  string
  age_group:  string
  prior_team: string | null
}

interface Season {
  id:               string
  label:            string
  year:             number
  age_groups:       string[]
  eval_share_token: string | null
}

interface EvalMeta {
  status:       'draft' | 'submitted'
  coach_name:   string | null
  submitted_at: string | null
}

const SECTION_LABELS: Record<string, string> = {
  fielding_hitting:  'Fielding & Hitting',
  pitching_catching: 'Pitching & Catching',
  intangibles:       'Intangibles',
}

function computeScore(scores: Record<string, number | null>, fields: EvalField[]): number | null {
  const eligible = fields.filter(f => f.weight > 0 && scores[f.key] != null)
  if (eligible.length === 0) return null
  const wSum   = eligible.reduce((s, f) => s + f.weight, 0)
  const wScore = eligible.reduce((s, f) => s + (scores[f.key]! * f.weight), 0)
  return Math.round(wScore / wSum * 100) / 100
}

function scoreColor(v: number): string {
  if (v >= 4.5) return '#6DB875'
  if (v >= 3.5) return 'rgba(109,184,117,0.85)'
  if (v >= 2.5) return 'var(--fg)'
  if (v >= 1.5) return '#e0a020'
  return '#e05252'
}

function cellBg(v: number | null): string {
  if (v == null) return 'transparent'
  if (v >= 4.5) return 'rgba(109,184,117,0.18)'
  if (v >= 3.5) return 'rgba(109,184,117,0.09)'
  if (v >= 2.5) return 'transparent'
  if (v >= 1.5) return 'rgba(232,160,32,0.12)'
  return 'rgba(224,82,82,0.12)'
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CoachEvalsPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()

  const [season,      setSeason]      = useState<Season | null>(null)
  const [fields,      setFields]      = useState<EvalField[]>([])
  const [players,     setPlayers]     = useState<Player[]>([])
  const [gridScores,  setGridScores]  = useState<Record<string, Record<string, number | null>>>({})
  const [evalMeta,    setEvalMeta]    = useState<Record<string, EvalMeta>>({})
  const [dirty,       setDirty]       = useState<Set<string>>(new Set())
  const [saving,      setSaving]      = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [isAdmin,     setIsAdmin]     = useState(false)
  const [myName,      setMyName]      = useState('')
  const [evalYear,    setEvalYear]    = useState(new Date().getFullYear() - 1)

  // Filters
  const [search,      setSearch]      = useState('')
  const [ageFilter,   setAgeFilter]   = useState('all')
  const [teamFilter,  setTeamFilter]  = useState('')

  // Share token
  const [shareToken,  setShareToken]  = useState<string | null>(null)
  const [shareBusy,   setShareBusy]   = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  // Cell picker (fixed-position popover)
  const [picker, setPicker] = useState<{ playerId: string; fieldKey: string; x: number; y: number } | null>(null)
  // Column fill picker
  const [colFill, setColFill] = useState<string | null>(null)
  // Row fill picker
  const [rowFill, setRowFill] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  // Close picker on click outside
  useEffect(() => {
    if (!picker) return
    function handler(e: MouseEvent) {
      const t = e.target as HTMLElement
      if (!t.closest('[data-picker]') && !t.closest('[data-cell]')) setPicker(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [picker])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()

    const [
      { data: seasonData },
      { data: memberData },
      { data: fieldData },
      { data: orgData },
    ] = await Promise.all([
      supabase.from('tryout_seasons').select('id, label, year, age_groups, eval_share_token').eq('org_id', params.orgId).eq('is_active', true).maybeSingle(),
      user ? supabase.from('tryout_org_members').select('id, name, email, role').eq('org_id', params.orgId).eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      supabase.from('tryout_coach_eval_config').select('field_key, label, section, sort_order, weight').eq('org_id', params.orgId).order('sort_order'),
      user ? supabase.from('tryout_orgs').select('admin_user_id').eq('id', params.orgId).maybeSingle() : Promise.resolve({ data: null }),
    ])

    setSeason(seasonData)
    setShareToken(seasonData?.eval_share_token ?? null)

    const loadedFields: EvalField[] = (fieldData ?? []).map((f: any) => ({
      key: f.field_key, label: f.label, section: f.section, sort_order: f.sort_order, weight: f.weight ?? 0,
    }))
    setFields(loadedFields)

    const isOrgCreator = !!(user && orgData?.admin_user_id === user.id)
    if (memberData) {
      setMyName(memberData.name ?? memberData.email ?? '')
      setIsAdmin(memberData.role === 'org_admin' || isOrgCreator)
    } else if (isOrgCreator) {
      setMyName(user?.email ?? '')
      setIsAdmin(true)
    }

    if (!seasonData) { setLoading(false); return }

    const [{ data: evalData }, { data: playerData }] = await Promise.all([
      supabase.from('tryout_coach_evals')
        .select('player_id, coach_name, team_label, season_year, status, scores, submitted_at')
        .eq('org_id', params.orgId)
        .order('submitted_at', { ascending: false }),
      supabase.from('tryout_players')
        .select('id, first_name, last_name, age_group, prior_team')
        .eq('org_id', params.orgId).eq('is_active', true)
        .order('last_name').order('first_name'),
    ])

    setPlayers(playerData ?? [])

    const scores: Record<string, Record<string, number | null>> = {}
    const meta: Record<string, EvalMeta> = {}
    for (const ev of (evalData ?? [])) {
      scores[ev.player_id] = ev.scores ?? {}
      meta[ev.player_id] = { status: ev.status, coach_name: ev.coach_name, submitted_at: ev.submitted_at }
    }
    for (const p of (playerData ?? [])) {
      if (!scores[p.id]) scores[p.id] = {}
    }
    setGridScores(scores)
    setEvalMeta(meta)
    setLoading(false)
  }

  function setScore(playerId: string, fieldKey: string, value: number | null) {
    setGridScores(prev => ({ ...prev, [playerId]: { ...prev[playerId], [fieldKey]: value } }))
    setDirty(prev => new Set(prev).add(playerId))
    setPicker(null)
  }

  function fillColumn(fieldKey: string, value: number, visiblePlayerIds: string[]) {
    setGridScores(prev => {
      const next = { ...prev }
      for (const pid of visiblePlayerIds) {
        if ((next[pid]?.[fieldKey] ?? null) == null) {
          next[pid] = { ...(next[pid] ?? {}), [fieldKey]: value }
        }
      }
      return next
    })
    setDirty(prev => {
      const n = new Set(prev)
      for (const pid of visiblePlayerIds) n.add(pid)
      return n
    })
    setColFill(null)
  }

  function fillRow(playerId: string, value: number) {
    setGridScores(prev => {
      const cur = prev[playerId] ?? {}
      const patch: Record<string, number | null> = {}
      for (const f of fields) {
        if ((cur[f.key] ?? null) == null) patch[f.key] = value
      }
      return { ...prev, [playerId]: { ...cur, ...patch } }
    })
    setDirty(prev => new Set(prev).add(playerId))
    setRowFill(null)
  }

  async function saveAll() {
    if (!season || dirty.size === 0) return
    setSaving(true)
    const playerMap = new Map(players.map(p => [p.id, p]))
    const toSave = Array.from(dirty).filter(pid => playerMap.has(pid))

    await Promise.all(toSave.map(pid => {
      const p = playerMap.get(pid)!
      const scores = gridScores[pid] ?? {}
      const computed = computeScore(scores, fields)
      return supabase.from('tryout_coach_evals').upsert({
        player_id:    pid,
        org_id:       params.orgId,
        season_id:    season.id,
        season_year:  String(evalYear),
        team_label:   p.prior_team ?? '',
        coach_name:   myName || 'Admin',
        status:       evalMeta[pid]?.status ?? 'draft',
        scores,
        computed_score: computed,
      }, { onConflict: 'player_id,org_id,season_year' })
    }))

    setDirty(new Set())
    setSaving(false)
  }

  async function handleShare(action: 'generate' | 'revoke') {
    if (!season) return
    setShareBusy(true)
    const res = await fetch('/api/tryouts/eval-share', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seasonId: season.id, orgId: params.orgId, action }),
    })
    const data = await res.json()
    setShareToken(data.token ?? null)
    setShareBusy(false)
  }

  function copyShareLink() {
    if (!shareToken) return
    navigator.clipboard.writeText(`${window.location.origin}/tryouts/eval/${shareToken}`)
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 2000)
  }

  const sections = Array.from(new Set(fields.map(f => f.section)))

  const filteredPlayers = players.filter(p => {
    if (search && !`${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase())) return false
    if (ageFilter !== 'all' && p.age_group !== ageFilter) return false
    if (teamFilter && !(p.prior_team ?? '').toLowerCase().includes(teamFilter.toLowerCase())) return false
    return true
  })

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>
  )

  const filteredIds = filteredPlayers.map(p => p.id)

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', maxWidth: '1400px', margin: '0 auto', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800 }}>Coach Evaluations</h1>
          {season && <div style={{ fontSize: '13px', color: s.muted, marginTop: '2px' }}>{season.label}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label style={{ fontSize: '11px', color: s.dim, whiteSpace: 'nowrap' }}>Eval year</label>
            <input type="number" value={evalYear} onChange={e => setEvalYear(Number(e.target.value))}
              style={{ background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '5px 8px', fontSize: '13px', color: 'var(--fg)', width: '72px' }}
            />
          </div>
          {dirty.size > 0 && (
            <span style={{ fontSize: '12px', color: 'var(--accent)', fontWeight: 600 }}>{dirty.size} unsaved</span>
          )}
          <button onClick={saveAll} disabled={saving || dirty.size === 0}
            style={{
              padding: '8px 20px', borderRadius: '8px', border: 'none',
              background: dirty.size > 0 ? 'var(--accent)' : 'var(--bg-input)',
              color: dirty.size > 0 ? 'var(--accent-text)' : s.dim,
              fontSize: '13px', fontWeight: 700,
              cursor: dirty.size > 0 && !saving ? 'pointer' : 'default',
              opacity: saving ? 0.6 : 1,
            }}>{saving ? 'Saving…' : 'Save all'}</button>
        </div>
      </div>

      {/* Share link — admin only */}
      {isAdmin && season && (
        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>Coach eval form link</div>
          <div style={{ fontSize: '12px', color: s.muted, marginBottom: '12px' }}>
            Send this to coaches — they pick their team, rate players (1–5), and submit without an account.
          </div>
          {shareToken ? (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <code style={{ fontSize: '11px', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '5px', padding: '5px 10px', color: s.muted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {typeof window !== 'undefined' ? `${window.location.origin}/tryouts/eval/${shareToken}` : `/tryouts/eval/${shareToken}`}
              </code>
              <button onClick={copyShareLink} style={{ padding: '6px 14px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: shareCopied ? 'rgba(109,184,117,0.12)' : 'var(--bg-input)', color: shareCopied ? '#6DB875' : s.muted, fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                {shareCopied ? '✓ Copied' : '⎘ Copy'}
              </button>
              <button onClick={() => handleShare('revoke')} disabled={shareBusy} style={{ padding: '6px 12px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'transparent', color: s.dim, fontSize: '12px', cursor: 'pointer', flexShrink: 0 }}>Revoke</button>
            </div>
          ) : (
            <button onClick={() => handleShare('generate')} disabled={shareBusy}
              style={{ padding: '8px 18px', borderRadius: '7px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', opacity: shareBusy ? 0.6 : 1 }}>
              {shareBusy ? 'Generating…' : 'Generate eval form link'}
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search player…"
          style={{ background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '6px 12px', fontSize: '13px', color: 'var(--fg)', width: '180px' }}
        />
        <input type="text" value={teamFilter} onChange={e => setTeamFilter(e.target.value)}
          placeholder="Filter by team…"
          style={{ background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '6px 12px', fontSize: '13px', color: 'var(--fg)', width: '180px' }}
        />
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {['all', ...(season?.age_groups ?? [])].map(ag => (
            <button key={ag} onClick={() => setAgeFilter(ag)} style={{
              padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              background: ageFilter === ag ? 'var(--accent)' : 'var(--bg-input)',
              color:      ageFilter === ag ? 'var(--accent-text)' : s.muted,
              border:     `0.5px solid ${ageFilter === ag ? 'var(--accent)' : 'var(--border-md)'}`,
            }}>{ag === 'all' ? 'All ages' : ag}</button>
          ))}
        </div>
        <span style={{ fontSize: '12px', color: s.dim, marginLeft: 'auto' }}>{filteredPlayers.length} players</span>
      </div>

      {/* No fields configured */}
      {fields.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '14px' }}>
          No eval fields configured. <Link href={`/org/${params.orgId}/tryouts/scoring`} style={{ color: 'var(--accent)' }}>Set up scoring →</Link>
        </div>
      )}

      {/* Grid */}
      {fields.length > 0 && (
        <div style={{ overflowX: 'auto', borderRadius: '10px', border: '0.5px solid var(--border)', position: 'relative' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12px' }}>
            <thead>
              {/* ── Section label row ── */}
              <tr>
                <th colSpan={3} style={{ background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', padding: '0' }} />
                {sections.map(section => {
                  const count = fields.filter(f => f.section === section).length
                  return (
                    <th key={section} colSpan={count} style={{
                      padding: '6px 8px', textAlign: 'center',
                      background: 'var(--bg-card)',
                      borderBottom: '0.5px solid var(--border)',
                      borderLeft: '1px solid var(--border)',
                      fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em',
                      textTransform: 'uppercase', color: s.muted, whiteSpace: 'nowrap',
                    }}>{SECTION_LABELS[section] ?? section}</th>
                  )
                })}
                {/* Score + Status + Fill headers */}
                <th colSpan={3} style={{ background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', borderLeft: '1px solid var(--border)', padding: 0 }} />
              </tr>

              {/* ── Column label row ── */}
              <tr>
                {/* Sticky player column */}
                <th style={{
                  padding: '8px 12px', textAlign: 'left', whiteSpace: 'nowrap',
                  background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)',
                  position: 'sticky', left: 0, zIndex: 3,
                  fontSize: '11px', fontWeight: 700, color: s.muted,
                  boxShadow: '2px 0 4px rgba(0,0,0,0.06)',
                }}>Player</th>
                <th style={{ padding: '8px 8px', background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', fontSize: '11px', fontWeight: 600, color: s.dim, whiteSpace: 'nowrap' }}>Age</th>
                <th style={{ padding: '8px 8px', background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', fontSize: '11px', fontWeight: 600, color: s.dim, whiteSpace: 'nowrap', minWidth: '100px' }}>Prior Team</th>

                {fields.map((field, fi) => {
                  const isFirstInSection = fi === 0 || fields[fi - 1].section !== field.section
                  return (
                    <th key={field.key} style={{
                      padding: '4px 4px 6px', textAlign: 'center', verticalAlign: 'bottom',
                      background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)',
                      borderLeft: isFirstInSection ? '1px solid var(--border)' : '0.5px solid rgba(var(--fg-rgb),0.06)',
                      minWidth: '52px', maxWidth: '64px',
                    }}>
                      {/* Rotated label */}
                      <div style={{
                        writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                        height: '72px', overflow: 'hidden',
                        fontSize: '10px', fontWeight: 600, color: s.muted,
                        textAlign: 'left', paddingBottom: '4px',
                      }}>{field.label}</div>

                      {/* Column fill control */}
                      {colFill === field.key ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'center', marginTop: '4px' }}>
                          {[1,2,3,4,5].map(v => (
                            <button key={v} onClick={() => fillColumn(field.key, v, filteredIds)}
                              style={{ width: '28px', height: '20px', borderRadius: '3px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}>{v}</button>
                          ))}
                          <button onClick={() => setColFill(null)} style={{ width: '28px', height: '16px', borderRadius: '3px', border: '0.5px solid var(--border-md)', background: 'transparent', color: s.dim, fontSize: '10px', cursor: 'pointer', padding: 0 }}>×</button>
                        </div>
                      ) : (
                        <button onClick={() => { setColFill(field.key); setRowFill(null) }}
                          style={{ marginTop: '4px', fontSize: '9px', padding: '2px 5px', borderRadius: '3px', border: '0.5px solid var(--border-md)', background: 'transparent', color: s.dim, cursor: 'pointer', whiteSpace: 'nowrap' }}
                          title={`Fill empty cells in "${field.label}"`}>fill ↓</button>
                      )}
                    </th>
                  )
                })}

                {/* Score */}
                <th style={{ padding: '8px 6px', textAlign: 'center', background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', borderLeft: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: s.muted, whiteSpace: 'nowrap', minWidth: '60px' }}>Score</th>
                {/* Status */}
                <th style={{ padding: '8px 6px', textAlign: 'center', background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', fontSize: '11px', fontWeight: 600, color: s.dim, whiteSpace: 'nowrap' }}>Status</th>
                {/* Row fill */}
                <th style={{ padding: '8px 6px', background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', minWidth: '48px' }} />
              </tr>
            </thead>

            <tbody>
              {filteredPlayers.length === 0 && (
                <tr>
                  <td colSpan={3 + fields.length + 3} style={{ padding: '2.5rem', textAlign: 'center', color: s.dim, fontSize: '13px' }}>
                    No players match your filters.
                  </td>
                </tr>
              )}

              {filteredPlayers.map((player, pi) => {
                const pScores  = gridScores[player.id] ?? {}
                const computed = computeScore(pScores, fields)
                const meta     = evalMeta[player.id]
                const isDirty  = dirty.has(player.id)
                const rowBg    = pi % 2 === 0 ? 'var(--bg)' : 'rgba(var(--fg-rgb),0.02)'

                return (
                  <tr key={player.id}>
                    {/* Player name — sticky */}
                    <td style={{
                      padding: '5px 12px',
                      borderBottom: '0.5px solid var(--border)',
                      borderLeft: isDirty ? '2px solid var(--accent)' : '2px solid transparent',
                      fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap',
                      position: 'sticky', left: 0, zIndex: 1,
                      background: rowBg,
                      boxShadow: '2px 0 4px rgba(0,0,0,0.04)',
                    }}>
                      {player.first_name} {player.last_name}
                    </td>
                    <td style={{ padding: '5px 8px', borderBottom: '0.5px solid var(--border)', color: s.dim, fontSize: '11px', whiteSpace: 'nowrap', background: rowBg }}>
                      {player.age_group}
                    </td>
                    <td style={{ padding: '5px 8px', borderBottom: '0.5px solid var(--border)', color: s.dim, fontSize: '11px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: rowBg }}>
                      {player.prior_team ?? '—'}
                    </td>

                    {/* Score cells */}
                    {fields.map((field, fi) => {
                      const val         = pScores[field.key] ?? null
                      const isFirstSec  = fi === 0 || fields[fi - 1].section !== field.section
                      const isPickerCell = picker?.playerId === player.id && picker?.fieldKey === field.key

                      return (
                        <td key={field.key}
                          data-cell="1"
                          onClick={e => {
                            if (isPickerCell) { setPicker(null); return }
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
                            setPicker({ playerId: player.id, fieldKey: field.key, x: rect.left, y: rect.bottom + 4 })
                            setColFill(null)
                            setRowFill(null)
                          }}
                          style={{
                            padding: '5px 4px',
                            borderBottom: '0.5px solid var(--border)',
                            borderLeft: isFirstSec ? '1px solid var(--border)' : '0.5px solid rgba(var(--fg-rgb),0.06)',
                            textAlign: 'center', cursor: 'pointer',
                            background: isPickerCell ? 'rgba(var(--fg-rgb),0.08)' : cellBg(val),
                            userSelect: 'none',
                          }}
                        >
                          <span style={{
                            fontSize: '13px', fontWeight: val != null ? 700 : 400,
                            color: val != null ? scoreColor(val) : 'rgba(var(--fg-rgb),0.2)',
                          }}>
                            {val ?? '·'}
                          </span>
                        </td>
                      )
                    })}

                    {/* Computed score */}
                    <td style={{ padding: '5px 8px', borderBottom: '0.5px solid var(--border)', borderLeft: '1px solid var(--border)', textAlign: 'center', fontWeight: 800, fontSize: '13px', color: computed != null ? scoreColor(computed) : s.dim, whiteSpace: 'nowrap' }}>
                      {computed != null ? computed.toFixed(2) : '—'}
                    </td>

                    {/* Status badge */}
                    <td style={{ padding: '5px 6px', borderBottom: '0.5px solid var(--border)', textAlign: 'center' }}>
                      {meta ? (
                        <span style={{
                          fontSize: '10px', padding: '2px 7px', borderRadius: '20px', fontWeight: 700, whiteSpace: 'nowrap',
                          background: meta.status === 'submitted' ? 'rgba(109,184,117,0.12)' : 'rgba(232,160,32,0.10)',
                          color: meta.status === 'submitted' ? '#6DB875' : 'var(--accent)',
                        }}>{meta.status}</span>
                      ) : <span style={{ fontSize: '11px', color: s.dim }}>—</span>}
                    </td>

                    {/* Row fill */}
                    <td style={{ padding: '4px 6px', borderBottom: '0.5px solid var(--border)', textAlign: 'center' }}>
                      {rowFill === player.id ? (
                        <div style={{ display: 'flex', gap: '2px', justifyContent: 'center' }}>
                          {[1,2,3,4,5].map(v => (
                            <button key={v} onClick={() => fillRow(player.id, v)}
                              style={{ width: '22px', height: '22px', borderRadius: '4px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '11px', fontWeight: 700, cursor: 'pointer', padding: 0 }}>{v}</button>
                          ))}
                          <button onClick={() => setRowFill(null)}
                            style={{ width: '22px', height: '22px', borderRadius: '4px', border: '0.5px solid var(--border-md)', background: 'transparent', color: s.dim, fontSize: '11px', cursor: 'pointer', padding: 0 }}>×</button>
                        </div>
                      ) : (
                        <button onClick={() => { setRowFill(player.id); setColFill(null); setPicker(null) }}
                          style={{ fontSize: '9px', padding: '2px 6px', borderRadius: '3px', border: '0.5px solid var(--border-md)', background: 'transparent', color: s.dim, cursor: 'pointer', whiteSpace: 'nowrap' }}
                          title="Fill empty fields for this player">fill →</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Floating cell picker */}
      {picker && (() => {
        const val = gridScores[picker.playerId]?.[picker.fieldKey] ?? null
        return (
          <div data-picker="1" style={{
            position: 'fixed',
            top:  picker.y,
            left: Math.min(picker.x, window.innerWidth - 220),
            zIndex: 1000,
            background: 'var(--bg-card)',
            border: '0.5px solid var(--border-md)',
            borderRadius: '8px',
            padding: '6px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
            display: 'flex', gap: '4px', alignItems: 'center',
          }}>
            {[1,2,3,4,5].map(v => (
              <button key={v} onClick={() => setScore(picker.playerId, picker.fieldKey, v)}
                style={{
                  width: '36px', height: '36px', borderRadius: '6px', border: 'none',
                  background: val === v ? 'var(--accent)' : 'var(--bg-input)',
                  color: val === v ? 'var(--accent-text)' : 'var(--fg)',
                  fontSize: '15px', fontWeight: 800, cursor: 'pointer',
                  outline: val === v ? 'none' : '0.5px solid var(--border-md)',
                }}>{v}</button>
            ))}
            {val != null && (
              <button onClick={() => setScore(picker.playerId, picker.fieldKey, null)}
                style={{ width: '32px', height: '36px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'transparent', color: s.dim, fontSize: '14px', cursor: 'pointer', marginLeft: '2px' }}>×</button>
            )}
          </div>
        )
      })()}
    </main>
  )
}
