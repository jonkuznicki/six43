'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'

interface EvalField {
  key:        string
  label:      string
  section:    string
  sort_order: number
  weight:     number  // defaults to 1 if column not yet migrated
}

interface Submission {
  team_label:  string
  coach_name:  string | null
  submitted_at: string | null
  player_count: number
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
  athleticism:       'Athleticism',
}

const SECTION_SHORT: Record<string, string> = {
  fielding_hitting:  'F & H',
  pitching_catching: 'P & C',
  intangibles:       'Intang.',
  athleticism:       'Ath.',
}

function computeSectionScore(
  scores: Record<string, number | null>,
  fields: EvalField[],
  sectionKey: string,
): number | null {
  const eligible = fields.filter(f => f.section === sectionKey && f.weight > 0 && scores[f.key] != null)
  if (eligible.length === 0) return null
  const wSum   = eligible.reduce((s, f) => s + f.weight, 0)
  const wScore = eligible.reduce((s, f) => s + (scores[f.key]! * f.weight), 0)
  return Math.round(wScore / wSum * 100) / 100
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
  const [submissions, setSubmissions] = useState<Submission[]>([])

  // Filters
  const [search,      setSearch]      = useState('')
  const [ageFilter,   setAgeFilter]   = useState('all')
  const [teamFilter,  setTeamFilter]  = useState('')

  // Share token
  const [shareToken,  setShareToken]  = useState<string | null>(null)
  const [shareBusy,   setShareBusy]   = useState(false)
  const [shareCopied, setShareCopied] = useState(false)

  // Keyboard-driven cell selection
  const [selected, setSelected] = useState<{ rowIdx: number; colIdx: number } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<Array<Record<string, Record<string, number | null>>>>([{}])
  const histIdxRef = useRef(0)

  // Column fill picker
  const [colFill, setColFill] = useState<string | null>(null)
  // Row fill picker
  const [rowFill, setRowFill] = useState<string | null>(null)

  // Team eval tokens (per-team unique links)
  const [teamTokens,   setTeamTokens]   = useState<Record<string, string>>({}) // team_label → token uuid
  const [tokenBusy,    setTokenBusy]    = useState<string | null>(null)         // team_label currently generating
  const [copiedTeam,   setCopiedTeam]   = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()

    const [
      { data: seasonData },
      { data: memberData },
      { data: orgData },
    ] = await Promise.all([
      supabase.from('tryout_seasons').select('id, label, year, age_groups, eval_share_token').eq('org_id', params.orgId).eq('is_active', true).maybeSingle(),
      user ? supabase.from('tryout_org_members').select('id, name, email, role').eq('org_id', params.orgId).eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      user ? supabase.from('tryout_orgs').select('admin_user_id').eq('id', params.orgId).maybeSingle() : Promise.resolve({ data: null }),
    ])

    setSeason(seasonData)
    setShareToken(seasonData?.eval_share_token ?? null)

    // Try fetching with weight column; fall back without it if column not yet migrated
    let rawFields: any[] | null = null
    const { data: fd1, error: fe1 } = await supabase
      .from('tryout_coach_eval_config')
      .select('field_key, label, section, sort_order, weight')
      .eq('org_id', params.orgId).order('sort_order')
    if (fe1) {
      const { data: fd2 } = await supabase
        .from('tryout_coach_eval_config')
        .select('field_key, label, section, sort_order')
        .eq('org_id', params.orgId).order('sort_order')
      rawFields = fd2
    } else {
      rawFields = fd1
    }

    const loadedFields: EvalField[] = (rawFields ?? []).map((f: any) => ({
      key: f.field_key, label: f.label, section: f.section, sort_order: f.sort_order,
      weight: f.weight ?? 1,
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

    // Build submission summary: one row per team that has submitted evals
    const submittedEvs = (evalData ?? []).filter((e: any) => e.status === 'submitted')
    const subMap = new Map<string, { coach: string | null; at: string | null; count: number }>()
    for (const ev of submittedEvs) {
      const key = ev.team_label ?? 'Unknown'
      const cur = subMap.get(key) ?? { coach: ev.coach_name, at: ev.submitted_at, count: 0 }
      cur.count++
      if (ev.submitted_at && (!cur.at || ev.submitted_at > cur.at)) cur.at = ev.submitted_at
      subMap.set(key, cur)
    }
    setSubmissions(Array.from(subMap.entries()).map(([team, v]) => ({
      team_label: team, coach_name: v.coach, submitted_at: v.at, player_count: v.count,
    })).sort((a, b) => (b.submitted_at ?? '').localeCompare(a.submitted_at ?? '')))

    // Load existing team tokens if season is available
    if (seasonData) {
      const { data: tokenRows } = await supabase
        .from('tryout_eval_team_tokens')
        .select('team_label, token')
        .eq('org_id', params.orgId)
        .eq('season_id', seasonData.id)
      if (tokenRows) {
        const map: Record<string, string> = {}
        for (const row of tokenRows) map[row.team_label] = row.token
        setTeamTokens(map)
      }
    }

    setLoading(false)
  }

  function pushHistory(next: Record<string, Record<string, number | null>>) {
    historyRef.current = historyRef.current.slice(0, histIdxRef.current + 1)
    historyRef.current.push(next)
    histIdxRef.current = historyRef.current.length - 1
  }

  function commitScore(playerId: string, fieldKey: string, value: number | null) {
    setGridScores(prev => {
      const next = { ...prev, [playerId]: { ...(prev[playerId] ?? {}), [fieldKey]: value } }
      pushHistory(next)
      return next
    })
    setDirty(prev => new Set(prev).add(playerId))
  }

  function undo() {
    if (histIdxRef.current <= 0) return
    histIdxRef.current--
    setGridScores(historyRef.current[histIdxRef.current])
  }

  function redo() {
    if (histIdxRef.current >= historyRef.current.length - 1) return
    histIdxRef.current++
    setGridScores(historyRef.current[histIdxRef.current])
  }

  function moveSelected(dRow: number, dCol: number, numRows: number, numCols: number) {
    setSelected(prev => {
      if (!prev) return prev
      let { rowIdx, colIdx } = prev
      colIdx += dCol
      rowIdx += dRow
      if (colIdx >= numCols) { colIdx = 0; rowIdx++ }
      if (colIdx < 0)        { colIdx = numCols - 1; rowIdx-- }
      rowIdx = Math.max(0, Math.min(numRows - 1, rowIdx))
      colIdx = Math.max(0, Math.min(numCols - 1, colIdx))
      return { rowIdx, colIdx }
    })
  }

  function fillColumn(fieldKey: string, value: number, visiblePlayerIds: string[]) {
    setGridScores(prev => {
      const next = { ...prev }
      for (const pid of visiblePlayerIds) {
        if ((next[pid]?.[fieldKey] ?? null) == null) {
          next[pid] = { ...(next[pid] ?? {}), [fieldKey]: value }
        }
      }
      pushHistory(next)
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
      const next = { ...prev, [playerId]: { ...cur, ...patch } }
      pushHistory(next)
      return next
    })
    setDirty(prev => new Set(prev).add(playerId))
    setRowFill(null)
  }

  function handleGridKeyDown(e: React.KeyboardEvent, numRows: number, numCols: number, fp: Player[]) {
    if (!selected) return
    const player = fp[selected.rowIdx]
    const field  = fields[selected.colIdx]
    if (!player || !field) return

    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return }
    if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo(); return }

    if (e.key >= '1' && e.key <= '5') {
      e.preventDefault()
      commitScore(player.id, field.key, parseInt(e.key))
      moveSelected(0, 1, numRows, numCols)
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      commitScore(player.id, field.key, null)
      return
    }
    if (e.key === 'Tab')        { e.preventDefault(); moveSelected(0, e.shiftKey ? -1 : 1, numRows, numCols); return }
    if (e.key === 'Enter')      { e.preventDefault(); moveSelected(1, 0, numRows, numCols); return }
    if (e.key === 'ArrowRight') { e.preventDefault(); moveSelected(0, 1, numRows, numCols); return }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); moveSelected(0, -1, numRows, numCols); return }
    if (e.key === 'ArrowDown')  { e.preventDefault(); moveSelected(1, 0, numRows, numCols); return }
    if (e.key === 'ArrowUp')    { e.preventDefault(); moveSelected(-1, 0, numRows, numCols); return }
    if (e.key === 'Escape')     { setSelected(null); return }
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

  async function generateTeamToken(teamLabel: string, regenerate: boolean) {
    if (!season) return
    setTokenBusy(teamLabel)
    const fn = regenerate ? 'tryout_regenerate_team_eval_token' : 'tryout_upsert_team_eval_token'
    const { data } = await supabase.rpc(fn, {
      p_org_id:     params.orgId,
      p_season_id:  season.id,
      p_team_label: teamLabel,
    })
    if (data) setTeamTokens(prev => ({ ...prev, [teamLabel]: data }))
    setTokenBusy(null)
  }

  function copyTeamLink(teamLabel: string) {
    const token = teamTokens[teamLabel]
    if (!token) return
    navigator.clipboard.writeText(`${window.location.origin}/tryouts/eval/team/${token}`)
    setCopiedTeam(teamLabel)
    setTimeout(() => setCopiedTeam(null), 2000)
  }

  const sections = Array.from(new Set(fields.map(f => f.section)))
  // Sections that have at least one weighted field — get their own score column
  const scoredSections = sections.filter(sec => fields.some(f => f.section === sec && f.weight > 0))

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
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>
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

      {/* Team eval links — admin only */}
      {isAdmin && season && (() => {
        const teams = Array.from(new Set(players.map(p => p.prior_team).filter(Boolean) as string[]))
          .sort((a, b) => {
            const na = parseInt(a.match(/^(\d+)/)?.[1] ?? '999')
            const nb = parseInt(b.match(/^(\d+)/)?.[1] ?? '999')
            return na !== nb ? na - nb : a.localeCompare(b)
          })
        if (teams.length === 0) return null
        return (
          <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>Team eval links</div>
            <div style={{ fontSize: '12px', color: s.muted, marginBottom: '12px' }}>
              Each team gets a unique link that locks the form to their roster. Copy and send directly to the coach.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {teams.map(team => {
                const token = teamTokens[team]
                const isBusy = tokenBusy === team
                const isCopied = copiedTeam === team
                const link = token ? `${typeof window !== 'undefined' ? window.location.origin : ''}/tryouts/eval/team/${token}` : null
                return (
                  <div key={team} style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', padding: '8px 10px', borderRadius: '8px', background: 'var(--bg-card-alt)', border: '0.5px solid var(--border-subtle)' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, minWidth: '90px' }}>{team}</span>
                    {link ? (
                      <>
                        <code style={{ fontSize: '11px', color: s.muted, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '4px', padding: '3px 8px' }}>
                          {link}
                        </code>
                        <button onClick={() => copyTeamLink(team)} style={{ padding: '5px 12px', borderRadius: '5px', border: '0.5px solid var(--border-md)', background: isCopied ? 'rgba(109,184,117,0.12)' : 'var(--bg-input)', color: isCopied ? '#6DB875' : s.muted, fontSize: '12px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
                          {isCopied ? '✓ Copied' : '⎘ Copy'}
                        </button>
                        <button onClick={() => generateTeamToken(team, true)} disabled={isBusy} style={{ padding: '5px 10px', borderRadius: '5px', border: '0.5px solid var(--border-md)', background: 'transparent', color: s.dim, fontSize: '11px', cursor: 'pointer', flexShrink: 0, opacity: isBusy ? 0.5 : 1 }}>
                          {isBusy ? '…' : '↺ New link'}
                        </button>
                      </>
                    ) : (
                      <button onClick={() => generateTeamToken(team, false)} disabled={isBusy} style={{ padding: '6px 14px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: isBusy ? 0.6 : 1 }}>
                        {isBusy ? 'Generating…' : 'Generate link'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Submission summary */}
      {submissions.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>
            Submissions received
            <span style={{ marginLeft: '8px', fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '20px', background: 'rgba(109,184,117,0.12)', color: '#6DB875' }}>
              {submissions.length} team{submissions.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {submissions.map(sub => (
              <div key={sub.team_label} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '7px 10px', borderRadius: '8px', background: 'rgba(109,184,117,0.06)', border: '0.5px solid rgba(109,184,117,0.2)' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, flex: 1 }}>{sub.team_label}</span>
                {sub.coach_name && <span style={{ fontSize: '12px', color: s.muted }}>{sub.coach_name}</span>}
                <span style={{ fontSize: '11px', color: s.dim }}>{sub.player_count} player{sub.player_count !== 1 ? 's' : ''}</span>
                {sub.submitted_at && (
                  <span style={{ fontSize: '11px', color: s.dim }}>
                    {new Date(sub.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
                <span style={{ fontSize: '11px', color: '#6DB875', fontWeight: 700 }}>✓</span>
              </div>
            ))}
          </div>
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
        <div
          ref={gridRef}
          tabIndex={0}
          onKeyDown={e => handleGridKeyDown(e, filteredPlayers.length, fields.length, filteredPlayers)}
          style={{ outline: 'none', overflowX: 'auto', borderRadius: '10px', border: '0.5px solid var(--border)', position: 'relative' }}
        >
          <div style={{ fontSize: '11px', color: s.dim, padding: '6px 12px 4px', borderBottom: '0.5px solid var(--border)', background: 'var(--bg-card)', display: 'flex', gap: '16px', alignItems: 'center' }}>
            <span>Click a cell to select · type <strong>1–5</strong> · <strong>Tab</strong>/arrows to move · <strong>Del</strong> to clear · <strong>Ctrl+Z</strong>/<strong>Y</strong> undo/redo</span>
          </div>
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
                {/* Section score group + Score + Status + Fill headers */}
                {scoredSections.length > 0 && (
                  <th colSpan={scoredSections.length} style={{
                    padding: '6px 8px', textAlign: 'center',
                    background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)',
                    borderLeft: '1px solid var(--border)',
                    fontSize: '10px', fontWeight: 700, letterSpacing: '0.07em',
                    textTransform: 'uppercase', color: s.muted, whiteSpace: 'nowrap',
                  }}>Section Scores</th>
                )}
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

                {/* Per-section score columns */}
                {scoredSections.map((sec, i) => (
                  <th key={`sechdr_${sec}`} style={{
                    padding: '8px 6px', textAlign: 'center',
                    background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)',
                    borderLeft: i === 0 ? '1px solid var(--border)' : '0.5px solid rgba(var(--fg-rgb),0.08)',
                    fontSize: '11px', fontWeight: 700, color: s.muted, whiteSpace: 'nowrap', minWidth: '56px',
                  }}>
                    {SECTION_SHORT[sec] ?? sec}
                  </th>
                ))}

                {/* Overall score */}
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
                      const val        = pScores[field.key] ?? null
                      const isFirstSec = fi === 0 || fields[fi - 1].section !== field.section
                      const isSelected = selected?.rowIdx === pi && selected?.colIdx === fi

                      return (
                        <td key={field.key}
                          onClick={() => {
                            setSelected({ rowIdx: pi, colIdx: fi })
                            setColFill(null)
                            setRowFill(null)
                            gridRef.current?.focus()
                          }}
                          style={{
                            padding: '5px 4px',
                            borderBottom: '0.5px solid var(--border)',
                            borderLeft: isFirstSec ? '1px solid var(--border)' : '0.5px solid rgba(var(--fg-rgb),0.06)',
                            textAlign: 'center', cursor: 'pointer',
                            background: isSelected ? 'rgba(80,160,232,0.12)' : cellBg(val),
                            outline: isSelected ? '2px solid rgba(80,160,232,0.7)' : 'none',
                            outlineOffset: '-2px',
                            userSelect: 'none',
                            position: 'relative',
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

                    {/* Per-section scores */}
                    {scoredSections.map((sec, i) => {
                      const secScore = computeSectionScore(pScores, fields, sec)
                      return (
                        <td key={`sec_${sec}`} style={{
                          padding: '5px 6px', borderBottom: '0.5px solid var(--border)',
                          borderLeft: i === 0 ? '1px solid var(--border)' : '0.5px solid rgba(var(--fg-rgb),0.06)',
                          textAlign: 'center', fontSize: '12px', fontWeight: 700,
                          color: secScore != null ? scoreColor(secScore) : s.dim,
                          whiteSpace: 'nowrap',
                        }}>
                          {secScore != null ? secScore.toFixed(2) : '—'}
                        </td>
                      )
                    })}

                    {/* Overall computed score */}
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
                        <button onClick={() => { setRowFill(player.id); setColFill(null) }}
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

    </main>
  )
}
