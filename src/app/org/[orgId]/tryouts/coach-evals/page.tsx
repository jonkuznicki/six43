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
  team_label:    string
  coach_name:    string | null
  submitted_at:  string | null
  player_count:  number
  overall_notes: string | null
}

interface Player {
  id:         string
  first_name: string
  last_name:  string
  age_group:  string
  prior_team: string | null
}

interface Season {
  id:         string
  label:      string
  year:       number
  age_groups: string[]
}

interface EvalMeta {
  status:       'draft' | 'submitted'
  coach_name:   string | null
  submitted_at: string | null
  comments:     string | null
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

  // Per-team link management
  const [newTeamLabel, setNewTeamLabel] = useState('')

  // Admin edit of submission notes
  const [editingTeam,     setEditingTeam]     = useState<string | null>(null)
  const [editingTeamText, setEditingTeamText] = useState('')
  const [savingTeamNote,  setSavingTeamNote]  = useState(false)
  const [editingPlayerNote,     setEditingPlayerNote]     = useState<string | null>(null)
  const [editingPlayerNoteText, setEditingPlayerNoteText] = useState('')
  const [savingPlayerNote,      setSavingPlayerNote]      = useState(false)

  // Keyboard-driven cell selection
  const [selected, setSelected] = useState<{ rowIdx: number; colIdx: number } | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const historyRef = useRef<Array<Record<string, Record<string, number | null>>>>([{}])
  const histIdxRef = useRef(0)

  // Column fill picker
  const [colFill, setColFill] = useState<string | null>(null)
  // Row fill picker
  const [rowFill, setRowFill] = useState<string | null>(null)

  // Sorting
  const [sortConfig, setSortConfig] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null)

  // Expanded notes row
  const [expandedNote, setExpandedNote] = useState<string | null>(null)

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
      supabase.from('tryout_seasons').select('id, label, year, age_groups').eq('org_id', params.orgId).eq('is_active', true).maybeSingle(),
      user ? supabase.from('tryout_org_members').select('id, name, email, role').eq('org_id', params.orgId).eq('user_id', user.id).maybeSingle() : Promise.resolve({ data: null }),
      user ? supabase.from('tryout_orgs').select('admin_user_id').eq('id', params.orgId).maybeSingle() : Promise.resolve({ data: null }),
    ])

    setSeason(seasonData)

    // Try fetching with weight column; fall back without it if column not yet migrated
    let rawFields: any[] | null = null
    if (seasonData) {
      const { data: fd1, error: fe1 } = await supabase
        .from('tryout_coach_eval_config')
        .select('field_key, label, section, sort_order, weight')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id).order('sort_order')
      if (fe1) {
        const { data: fd2 } = await supabase
          .from('tryout_coach_eval_config')
          .select('field_key, label, section, sort_order')
          .eq('org_id', params.orgId).eq('season_id', seasonData.id).order('sort_order')
        rawFields = fd2
      } else {
        rawFields = fd1
      }
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

    const [{ data: evalData }, { data: playerData }, { data: submissionData }] = await Promise.all([
      supabase.from('tryout_coach_evals')
        .select('player_id, coach_name, team_label, season_year, status, scores, comments, submitted_at')
        .eq('org_id', params.orgId)
        .order('submitted_at', { ascending: false }),
      supabase.from('tryout_players')
        .select('id, first_name, last_name, age_group, prior_team')
        .eq('org_id', params.orgId).eq('is_active', true)
        .order('last_name').order('first_name'),
      supabase.from('tryout_coach_eval_submissions')
        .select('team_label, overall_notes')
        .eq('org_id', params.orgId),
    ])

    setPlayers(playerData ?? [])

    const scores: Record<string, Record<string, number | null>> = {}
    const meta: Record<string, EvalMeta> = {}
    for (const ev of (evalData ?? [])) {
      scores[ev.player_id] = ev.scores ?? {}
      meta[ev.player_id] = { status: ev.status, coach_name: ev.coach_name, submitted_at: ev.submitted_at, comments: ev.comments ?? null }
    }
    for (const p of (playerData ?? [])) {
      if (!scores[p.id]) scores[p.id] = {}
    }
    setGridScores(scores)
    setEvalMeta(meta)

    // Build submission summary: one row per team that has submitted evals
    const overallNotesMap = new Map((submissionData ?? []).map((s: any) => [s.team_label, s.overall_notes as string | null]))
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
      overall_notes: overallNotesMap.get(team) ?? null,
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

  async function saveTeamOverallNotes(teamLabel: string) {
    if (!season) return
    setSavingTeamNote(true)
    await supabase.from('tryout_coach_eval_submissions').upsert({
      org_id:      params.orgId,
      season_year: String(evalYear),
      team_label:  teamLabel,
      overall_notes: editingTeamText.trim() || null,
    }, { onConflict: 'org_id,season_year,team_label' })
    setSubmissions(prev => prev.map(s =>
      s.team_label === teamLabel ? { ...s, overall_notes: editingTeamText.trim() || null } : s
    ))
    setEditingTeam(null)
    setSavingTeamNote(false)
  }

  async function savePlayerNote(player: Player) {
    if (!season) return
    setSavingPlayerNote(true)
    const text = editingPlayerNoteText.trim() || null
    await supabase.from('tryout_coach_evals').upsert({
      player_id:   player.id,
      org_id:      params.orgId,
      season_year: String(evalYear),
      team_label:  player.prior_team ?? '',
      coach_name:  evalMeta[player.id]?.coach_name || myName || 'Admin',
      status:      evalMeta[player.id]?.status ?? 'draft',
      scores:      gridScores[player.id] ?? {},
      comments:    text,
    }, { onConflict: 'player_id,org_id,season_year' })
    setEvalMeta(prev => ({ ...prev, [player.id]: { ...(prev[player.id] ?? { status: 'draft', coach_name: null, submitted_at: null }), comments: text } }))
    setEditingPlayerNote(null)
    setSavingPlayerNote(false)
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

  function toggleSort(col: string) {
    setSortConfig(prev =>
      prev?.col === col
        ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { col, dir: 'asc' }
    )
  }

  function sortIndicator(col: string) {
    if (sortConfig?.col !== col) return <span style={{ opacity: 0.25, fontSize: '9px', marginLeft: '3px' }}>↕</span>
    return <span style={{ fontSize: '9px', marginLeft: '3px' }}>{sortConfig.dir === 'asc' ? '↑' : '↓'}</span>
  }

  const filteredPlayers = players.filter(p => {
    if (search && !`${p.first_name} ${p.last_name}`.toLowerCase().includes(search.toLowerCase())) return false
    if (ageFilter !== 'all' && p.age_group !== ageFilter) return false
    if (teamFilter && !(p.prior_team ?? '').toLowerCase().includes(teamFilter.toLowerCase())) return false
    return true
  })

  const sortedFilteredPlayers = sortConfig ? [...filteredPlayers].sort((a, b) => {
    const dir = sortConfig.dir === 'asc' ? 1 : -1
    const col = sortConfig.col
    if (col === 'name') return dir * (`${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`))
    if (col === 'age')  return dir * (a.age_group ?? '').localeCompare(b.age_group ?? '')
    if (col === 'team') return dir * ((a.prior_team ?? '').localeCompare(b.prior_team ?? ''))
    if (col === 'score') {
      const sa = computeScore(gridScores[a.id] ?? {}, fields) ?? -1
      const sb = computeScore(gridScores[b.id] ?? {}, fields) ?? -1
      return dir * (sa - sb)
    }
    if (col === 'status') {
      const sa = evalMeta[a.id]?.status ?? ''
      const sb = evalMeta[b.id]?.status ?? ''
      return dir * sa.localeCompare(sb)
    }
    if (col.startsWith('sec_')) {
      const sec = col.slice(4)
      const sa = computeSectionScore(gridScores[a.id] ?? {}, fields, sec) ?? -1
      const sb = computeSectionScore(gridScores[b.id] ?? {}, fields, sec) ?? -1
      return dir * (sa - sb)
    }
    // field key
    const va = gridScores[a.id]?.[col] ?? -1
    const vb = gridScores[b.id]?.[col] ?? -1
    return dir * (va - vb)
  }) : filteredPlayers

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>
  )

  const filteredIds = sortedFilteredPlayers.map(p => p.id)

  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '10px' }}>
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

      {/* Team eval links — admin only */}
      {isAdmin && season && (() => {
        const teamsFromPlayers = players.map(p => p.prior_team).filter(Boolean) as string[]
        const teamsFromTokens  = Object.keys(teamTokens)
        const teams = Array.from(new Set(teamsFromPlayers.concat(teamsFromTokens)))
          .sort((a, b) => {
            const na = parseInt(a.match(/^(\d+)/)?.[1] ?? '999')
            const nb = parseInt(b.match(/^(\d+)/)?.[1] ?? '999')
            return na !== nb ? na - nb : a.localeCompare(b)
          })
        return (
          <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '12px', padding: '1.25rem', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '4px' }}>Team eval links</div>
            <div style={{ fontSize: '12px', color: s.muted, marginBottom: '12px' }}>
              Each link locks the form to that team's roster. Copy and send to the coach — no account required.
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {teams.map(team => {
                const token   = teamTokens[team]
                const isBusy  = tokenBusy === team
                const isCopied = copiedTeam === team
                const link    = token ? `${typeof window !== 'undefined' ? window.location.origin : ''}/tryouts/eval/team/${token}` : null
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

              {/* Add a new team manually */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px', paddingTop: '8px', borderTop: '0.5px solid var(--border)' }}>
                <input
                  type="text"
                  value={newTeamLabel}
                  onChange={e => setNewTeamLabel(e.target.value)}
                  placeholder="New team name (e.g. 12U Gold)"
                  onKeyDown={e => { if (e.key === 'Enter' && newTeamLabel.trim()) { generateTeamToken(newTeamLabel.trim(), false); setNewTeamLabel('') } }}
                  style={{ flex: 1, background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '6px', padding: '7px 12px', fontSize: '13px', color: 'var(--fg)' }}
                />
                <button
                  onClick={() => { if (newTeamLabel.trim()) { generateTeamToken(newTeamLabel.trim(), false); setNewTeamLabel('') } }}
                  disabled={!newTeamLabel.trim() || !!tokenBusy}
                  style={{ padding: '7px 16px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '13px', fontWeight: 700, cursor: 'pointer', flexShrink: 0, opacity: !newTeamLabel.trim() ? 0.5 : 1 }}
                >
                  + Add team
                </button>
              </div>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {submissions.map(sub => {
              const isEditing = editingTeam === sub.team_label
              return (
                <div key={sub.team_label} style={{ borderRadius: '8px', background: 'rgba(109,184,117,0.06)', border: '0.5px solid rgba(109,184,117,0.2)', overflow: 'hidden' }}>
                  {/* Summary row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, flex: 1 }}>{sub.team_label}</span>
                    {sub.coach_name && <span style={{ fontSize: '12px', color: s.muted }}>{sub.coach_name}</span>}
                    <span style={{ fontSize: '11px', color: s.dim }}>{sub.player_count} player{sub.player_count !== 1 ? 's' : ''}</span>
                    {sub.submitted_at && (
                      <span style={{ fontSize: '11px', color: s.dim }}>
                        {new Date(sub.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    <span style={{ fontSize: '11px', color: '#6DB875', fontWeight: 700 }}>✓</span>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          if (isEditing) { setEditingTeam(null) }
                          else { setEditingTeam(sub.team_label); setEditingTeamText(sub.overall_notes ?? '') }
                        }}
                        style={{ padding: '3px 10px', borderRadius: '5px', border: '0.5px solid var(--border-md)', background: 'transparent', color: s.dim, fontSize: '11px', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
                      >
                        {isEditing ? 'Cancel' : '✎ Edit notes'}
                      </button>
                    )}
                  </div>

                  {/* Overall notes display (when not editing) */}
                  {!isEditing && sub.overall_notes && (
                    <div style={{ padding: '0 10px 10px', fontSize: '12px', color: s.muted, lineHeight: 1.6, whiteSpace: 'pre-wrap', borderTop: '0.5px solid rgba(109,184,117,0.15)', paddingTop: '8px' }}>
                      {sub.overall_notes}
                    </div>
                  )}

                  {/* Edit panel */}
                  {isEditing && (
                    <div style={{ padding: '0 10px 10px', borderTop: '0.5px solid rgba(109,184,117,0.2)' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: s.dim, margin: '8px 0 6px' }}>Overall season notes</div>
                      <textarea
                        value={editingTeamText}
                        onChange={e => setEditingTeamText(e.target.value)}
                        placeholder="Coach's overall season notes…"
                        rows={3}
                        style={{ width: '100%', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '7px', padding: '8px 10px', fontSize: '13px', color: 'var(--fg)', fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical', boxSizing: 'border-box' }}
                      />
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button
                          onClick={() => saveTeamOverallNotes(sub.team_label)}
                          disabled={savingTeamNote}
                          style={{ padding: '6px 16px', borderRadius: '6px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '12px', fontWeight: 700, cursor: 'pointer', opacity: savingTeamNote ? 0.6 : 1 }}
                        >
                          {savingTeamNote ? 'Saving…' : 'Save'}
                        </button>
                        <button onClick={() => setEditingTeam(null)} style={{ padding: '6px 12px', borderRadius: '6px', border: '0.5px solid var(--border-md)', background: 'transparent', color: s.dim, fontSize: '12px', cursor: 'pointer' }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
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
        <span style={{ fontSize: '12px', color: s.dim, marginLeft: 'auto' }}>{sortedFilteredPlayers.length} players</span>
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
          onKeyDown={e => handleGridKeyDown(e, sortedFilteredPlayers.length, fields.length, sortedFilteredPlayers)}
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
                <th colSpan={4} style={{ background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', borderLeft: '1px solid var(--border)', padding: 0 }} />
              </tr>

              {/* ── Column label row ── */}
              <tr>
                {/* Sticky player column */}
                <th onClick={() => toggleSort('name')} style={{
                  padding: '8px 12px', textAlign: 'left', whiteSpace: 'nowrap',
                  background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)',
                  position: 'sticky', left: 0, zIndex: 3,
                  fontSize: '11px', fontWeight: 700, color: s.muted,
                  boxShadow: '2px 0 4px rgba(0,0,0,0.06)', cursor: 'pointer', userSelect: 'none',
                }}>Player{sortIndicator('name')}</th>
                <th onClick={() => toggleSort('age')} style={{ padding: '8px 8px', background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', fontSize: '11px', fontWeight: 600, color: s.dim, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>Age{sortIndicator('age')}</th>
                <th onClick={() => toggleSort('team')} style={{ padding: '8px 8px', background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', fontSize: '11px', fontWeight: 600, color: s.dim, whiteSpace: 'nowrap', minWidth: '100px', cursor: 'pointer', userSelect: 'none' }}>Prior Team{sortIndicator('team')}</th>

                {fields.map((field, fi) => {
                  const isFirstInSection = fi === 0 || fields[fi - 1].section !== field.section
                  return (
                    <th key={field.key} onClick={() => toggleSort(field.key)} style={{
                      padding: '4px 4px 6px', textAlign: 'center', verticalAlign: 'bottom',
                      background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)',
                      borderLeft: isFirstInSection ? '1px solid var(--border)' : '0.5px solid rgba(var(--fg-rgb),0.06)',
                      minWidth: '52px', maxWidth: '64px', cursor: 'pointer', userSelect: 'none',
                    }}>
                      {/* Rotated label */}
                      <div style={{
                        writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                        height: '72px', overflow: 'hidden',
                        fontSize: '10px', fontWeight: sortConfig?.col === field.key ? 800 : 600,
                        color: sortConfig?.col === field.key ? 'var(--accent)' : s.muted,
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
                  <th key={`sechdr_${sec}`} onClick={() => toggleSort(`sec_${sec}`)} style={{
                    padding: '8px 6px', textAlign: 'center',
                    background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)',
                    borderLeft: i === 0 ? '1px solid var(--border)' : '0.5px solid rgba(var(--fg-rgb),0.08)',
                    fontSize: '11px', fontWeight: 700,
                    color: sortConfig?.col === `sec_${sec}` ? 'var(--accent)' : s.muted,
                    whiteSpace: 'nowrap', minWidth: '56px', cursor: 'pointer', userSelect: 'none',
                  }}>
                    {SECTION_SHORT[sec] ?? sec}{sortIndicator(`sec_${sec}`)}
                  </th>
                ))}

                {/* Overall score */}
                <th onClick={() => toggleSort('score')} style={{ padding: '8px 6px', textAlign: 'center', background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', borderLeft: '1px solid var(--border)', fontSize: '11px', fontWeight: 700, color: sortConfig?.col === 'score' ? 'var(--accent)' : s.muted, whiteSpace: 'nowrap', minWidth: '60px', cursor: 'pointer', userSelect: 'none' }}>Score{sortIndicator('score')}</th>
                {/* Status */}
                <th onClick={() => toggleSort('status')} style={{ padding: '8px 6px', textAlign: 'center', background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', fontSize: '11px', fontWeight: 600, color: s.dim, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' }}>Status{sortIndicator('status')}</th>
                {/* Notes */}
                <th style={{ padding: '8px 6px', textAlign: 'left', background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', borderLeft: '0.5px solid var(--border)', fontSize: '11px', fontWeight: 600, color: s.dim, whiteSpace: 'nowrap', minWidth: '160px' }}>Notes</th>
                {/* Row fill */}
                <th style={{ padding: '8px 6px', background: 'var(--bg-card)', borderBottom: '0.5px solid var(--border)', minWidth: '48px' }} />
              </tr>
            </thead>

            <tbody>
              {sortedFilteredPlayers.length === 0 && (
                <tr>
                  <td colSpan={3 + fields.length + scoredSections.length + 4} style={{ padding: '2.5rem', textAlign: 'center', color: s.dim, fontSize: '13px' }}>
                    No players match your filters.
                  </td>
                </tr>
              )}

              {sortedFilteredPlayers.map((player, pi) => {
                const pScores    = gridScores[player.id] ?? {}
                const computed  = computeScore(pScores, fields)
                const meta      = evalMeta[player.id]
                const isDirty   = dirty.has(player.id)
                const rowBg     = pi % 2 === 0 ? 'var(--bg)' : 'rgba(var(--fg-rgb),0.02)'
                const note      = meta?.comments ?? null
                const noteOpen  = expandedNote === player.id

                return (
                  <>
                  <tr key={player.id}>
                    {/* Player name — sticky */}
                    <td style={{
                      padding: '5px 12px',
                      borderBottom: noteOpen ? 'none' : '0.5px solid var(--border)',
                      borderLeft: isDirty ? '2px solid var(--accent)' : '2px solid transparent',
                      fontWeight: 600, fontSize: '13px', whiteSpace: 'nowrap',
                      position: 'sticky', left: 0, zIndex: 1,
                      background: rowBg,
                      boxShadow: '2px 0 4px rgba(0,0,0,0.04)',
                    }}>
                      {player.first_name} {player.last_name}
                    </td>
                    <td style={{ padding: '5px 8px', borderBottom: noteOpen ? 'none' : '0.5px solid var(--border)', color: s.dim, fontSize: '11px', whiteSpace: 'nowrap', background: rowBg }}>
                      {player.age_group}
                    </td>
                    <td style={{ padding: '5px 8px', borderBottom: noteOpen ? 'none' : '0.5px solid var(--border)', color: s.dim, fontSize: '11px', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', background: rowBg }}>
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
                            borderBottom: noteOpen ? 'none' : '0.5px solid var(--border)',
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
                          padding: '5px 6px', borderBottom: noteOpen ? 'none' : '0.5px solid var(--border)',
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
                    <td style={{ padding: '5px 8px', borderBottom: noteOpen ? 'none' : '0.5px solid var(--border)', borderLeft: '1px solid var(--border)', textAlign: 'center', fontWeight: 800, fontSize: '13px', color: computed != null ? scoreColor(computed) : s.dim, whiteSpace: 'nowrap' }}>
                      {computed != null ? computed.toFixed(2) : '—'}
                    </td>

                    {/* Status badge */}
                    <td style={{ padding: '5px 6px', borderBottom: noteOpen ? 'none' : '0.5px solid var(--border)', textAlign: 'center' }}>
                      {meta ? (
                        <span style={{
                          fontSize: '10px', padding: '2px 7px', borderRadius: '20px', fontWeight: 700, whiteSpace: 'nowrap',
                          background: meta.status === 'submitted' ? 'rgba(109,184,117,0.12)' : 'rgba(232,160,32,0.10)',
                          color: meta.status === 'submitted' ? '#6DB875' : 'var(--accent)',
                        }}>{meta.status}</span>
                      ) : <span style={{ fontSize: '11px', color: s.dim }}>—</span>}
                    </td>

                    {/* Notes cell */}
                    <td style={{ padding: '4px 8px', borderBottom: noteOpen ? 'none' : '0.5px solid var(--border)', borderLeft: '0.5px solid var(--border)', minWidth: '160px', maxWidth: '260px' }}>
                      {editingPlayerNote === player.id ? (
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'flex-start' }}>
                          <textarea
                            autoFocus
                            value={editingPlayerNoteText}
                            onChange={e => setEditingPlayerNoteText(e.target.value)}
                            rows={2}
                            style={{ flex: 1, background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '5px', padding: '4px 8px', fontSize: '12px', color: 'var(--fg)', fontFamily: 'inherit', resize: 'vertical' }}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flexShrink: 0 }}>
                            <button onClick={() => savePlayerNote(player)} disabled={savingPlayerNote} style={{ padding: '3px 8px', borderRadius: '4px', border: 'none', background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '11px', fontWeight: 700, cursor: 'pointer' }}>
                              {savingPlayerNote ? '…' : '✓'}
                            </button>
                            <button onClick={() => setEditingPlayerNote(null)} style={{ padding: '3px 8px', borderRadius: '4px', border: '0.5px solid var(--border-md)', background: 'transparent', color: s.dim, fontSize: '11px', cursor: 'pointer' }}>✕</button>
                          </div>
                        </div>
                      ) : note ? (
                        <button onClick={() => { setExpandedNote(noteOpen ? null : player.id) }} onDoubleClick={() => { setEditingPlayerNote(player.id); setEditingPlayerNoteText(note ?? '') }} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                          <span style={{ fontSize: '12px', color: noteOpen ? 'var(--fg)' : s.muted, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }}>
                            {note}
                          </span>
                        </button>
                      ) : isAdmin ? (
                        <button onClick={() => { setEditingPlayerNote(player.id); setEditingPlayerNoteText('') }} style={{ fontSize: '11px', color: s.dim, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontStyle: 'italic' }}>+ add note</button>
                      ) : (
                        <span style={{ fontSize: '11px', color: s.dim, fontStyle: 'italic' }}>—</span>
                      )}
                    </td>

                    {/* Row fill */}
                    <td style={{ padding: '4px 6px', borderBottom: noteOpen ? 'none' : '0.5px solid var(--border)', textAlign: 'center' }}>
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

                  {/* Expanded notes row */}
                  {noteOpen && note && (
                    <tr key={`${player.id}_note`}>
                      <td colSpan={3 + fields.length + scoredSections.length + 4} style={{ padding: '8px 16px 12px 16px', borderBottom: '0.5px solid var(--border)', background: rowBg }}>
                        <div style={{ fontSize: '12px', color: s.muted, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxWidth: '800px' }}>{note}</div>
                        <button onClick={() => setExpandedNote(null)} style={{ marginTop: '6px', fontSize: '11px', color: s.dim, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>↑ collapse</button>
                      </td>
                    </tr>
                  )}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

    </main>
  )
}
