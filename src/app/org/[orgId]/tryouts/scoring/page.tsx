'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'
import { GC_STAT_DEFS } from '../../../../../lib/tryouts/gcStatDefs'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Subcategory {
  key:    string
  label:  string
  weight: number
}

interface ScoringCategory {
  id:            string | null  // null = unsaved new row
  category:      string         // slug key
  label:         string
  weight:        number         // 0–1 fraction of total tryout score
  subcategories: Subcategory[]
  is_optional:   boolean
  sort_order:    number
  expanded:      boolean
}

interface EvalField {
  id:          string | null
  section:     string
  field_key:   string
  label:       string
  is_optional: boolean
  sort_order:  number
  weight:      number   // multiplier in computed score; 0 = excluded
}

interface Season {
  id:    string
  label: string
}

interface GcStatConfig {
  stat_key:  string
  included:  boolean
  weight:    number
}

const EVAL_SECTIONS = [
  { key: 'fielding_hitting',   label: 'Fielding & Hitting' },
  { key: 'pitching_catching',  label: 'Pitching & Catching' },
  { key: 'intangibles',        label: 'Intangibles' },
  { key: 'athleticism',        label: 'Athleticism' },
]

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
}

function pct(w: number) { return Math.round(w * 100) }

// ── Component ─────────────────────────────────────────────────────────────────

export default function ScoringConfigPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()

  const [season,     setSeason]     = useState<Season | null>(null)
  const [categories, setCategories] = useState<ScoringCategory[]>([])
  const [evalFields, setEvalFields] = useState<EvalField[]>([])
  const [loading,    setLoading]    = useState(true)
  const [savingTryout, setSavingTryout] = useState(false)
  const [savingEval,   setSavingEval]   = useState(false)
  const [tryoutMsg,    setTryoutMsg]    = useState<string | null>(null)
  const [evalMsg,      setEvalMsg]      = useState<string | null>(null)

  // GC stat scoring
  const [ageGroups,    setAgeGroups]    = useState<string[]>([])
  const [gcAgeGroup,   setGcAgeGroup]   = useState<string>('')
  // Map: ageGroup → stat_key → config
  const [gcConfig,     setGcConfig]     = useState<Record<string, Record<string, GcStatConfig>>>({})
  const [savingGc,     setSavingGc]     = useState(false)
  const [gcMsg,        setGcMsg]        = useState<string | null>(null)
  const [recomputing,  setRecomputing]  = useState(false)
  const [recomputeMsg, setRecomputeMsg] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: seasonData } = await supabase
      .from('tryout_seasons').select('id, label')
      .eq('org_id', params.orgId).eq('is_active', true).maybeSingle()
    setSeason(seasonData)

    if (!seasonData) { setLoading(false); return }

    const [{ data: scoreCfg }, { data: evalCfg }, { data: gcCfgRows }, { data: playerRows }] = await Promise.all([
      supabase.from('tryout_scoring_config')
        .select('id, category, label, weight, subcategories, is_optional, sort_order')
        .eq('season_id', seasonData.id)
        .order('sort_order'),
      supabase.from('tryout_coach_eval_config')
        .select('id, section, field_key, label, is_optional, sort_order, weight')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id)
        .order('sort_order'),
      supabase.from('tryout_gc_scoring_config')
        .select('age_group, stat_key, included, weight')
        .eq('org_id', params.orgId)
        .eq('season_id', seasonData.id),
      supabase.from('tryout_players')
        .select('age_group')
        .eq('org_id', params.orgId)
        .eq('is_active', true)
        .not('age_group', 'is', null),
    ])

    // Distinct sorted age groups
    const groups = Array.from(new Set((playerRows ?? []).map((p: any) => p.age_group as string).filter(Boolean))).sort()
    setAgeGroups(groups)
    if (groups.length > 0) setGcAgeGroup(prev => prev || groups[0])

    // Build GC config map: ageGroup → stat_key → config
    // Start with defaults, overlay with DB rows
    const cfgMap: Record<string, Record<string, GcStatConfig>> = {}
    for (const group of groups) {
      cfgMap[group] = {}
      for (const def of GC_STAT_DEFS) {
        cfgMap[group][def.key] = { stat_key: def.key, included: def.defaultIncluded, weight: def.defaultWeight }
      }
    }
    for (const row of gcCfgRows ?? []) {
      if (!cfgMap[row.age_group]) {
        cfgMap[row.age_group] = {}
        for (const def of GC_STAT_DEFS) {
          cfgMap[row.age_group][def.key] = { stat_key: def.key, included: def.defaultIncluded, weight: def.defaultWeight }
        }
      }
      cfgMap[row.age_group][row.stat_key] = { stat_key: row.stat_key, included: row.included, weight: row.weight }
    }
    setGcConfig(cfgMap)

    setCategories(
      (scoreCfg ?? []).map((c: any) => ({
        id:            c.id,
        category:      c.category,
        label:         c.label,
        weight:        c.weight,
        subcategories: c.subcategories ?? [],
        is_optional:   c.is_optional,
        sort_order:    c.sort_order,
        expanded:      false,
      }))
    )
    setEvalFields(
      (evalCfg ?? []).map((f: any) => ({
        id:          f.id,
        section:     f.section,
        field_key:   f.field_key,
        label:       f.label,
        is_optional: f.is_optional,
        sort_order:  f.sort_order,
        weight:      f.weight ?? 1.0,
      }))
    )
    setLoading(false)
  }

  // ── Tryout scoring helpers ────────────────────────────────────────────────

  function updateCat(idx: number, patch: Partial<ScoringCategory>) {
    setCategories(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c))
  }

  function updateSub(catIdx: number, subIdx: number, patch: Partial<Subcategory>) {
    setCategories(prev => prev.map((c, i) => {
      if (i !== catIdx) return c
      return { ...c, subcategories: c.subcategories.map((s, j) => j === subIdx ? { ...s, ...patch } : s) }
    }))
  }

  function addCategory() {
    setCategories(prev => [...prev, {
      id: null, category: '', label: '', weight: 0.1,
      subcategories: [{ key: '', label: '', weight: 1.0 }],
      is_optional: false, sort_order: prev.length + 1, expanded: true,
    }])
  }

  function removeCategory(idx: number) {
    setCategories(prev => prev.filter((_, i) => i !== idx))
  }

  function moveCat(idx: number, dir: -1 | 1) {
    setCategories(prev => {
      const next = [...prev]
      const target = idx + dir
      if (target < 0 || target >= next.length) return prev
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return next
    })
  }

  function addSubcategory(catIdx: number) {
    setCategories(prev => prev.map((c, i) => {
      if (i !== catIdx) return c
      return { ...c, subcategories: [...c.subcategories, { key: '', label: '', weight: 0 }] }
    }))
  }

  function removeSubcategory(catIdx: number, subIdx: number) {
    setCategories(prev => prev.map((c, i) => {
      if (i !== catIdx) return c
      return { ...c, subcategories: c.subcategories.filter((_, j) => j !== subIdx) }
    }))
  }

  async function saveTryoutScoring() {
    if (!season) return
    setSavingTryout(true)
    setTryoutMsg(null)

    // Auto-assign keys and normalize sub-weights
    const toSave = categories.map((c, i) => {
      const catKey = c.category || slugify(c.label) || `cat_${i + 1}`
      const subTotal = c.subcategories.reduce((sum, s) => sum + (s.weight || 0), 0) || 1
      const subs = c.subcategories.map(s => ({
        key:    s.key || slugify(s.label) || `sub_${Math.random().toString(36).slice(2, 6)}`,
        label:  s.label,
        weight: parseFloat((s.weight / subTotal).toFixed(4)),
      }))
      return { ...c, category: catKey, subcategories: subs, sort_order: i + 1 }
    })

    // Normalize category weights to sum to 1.0
    const wTotal = toSave.reduce((sum, c) => sum + (c.weight || 0), 0) || 1
    const normalized = toSave.map(c => ({
      ...c,
      weight: parseFloat((c.weight / wTotal).toFixed(4)),
    }))

    // Delete existing, re-insert
    await supabase.from('tryout_scoring_config').delete().eq('season_id', season.id)

    const inserts = normalized.map(c => ({
      season_id:     season.id,
      category:      c.category,
      label:         c.label,
      weight:        c.weight,
      subcategories: c.subcategories,
      is_optional:   c.is_optional,
      sort_order:    c.sort_order,
    }))

    const { error } = await supabase.from('tryout_scoring_config').insert(inserts)
    if (error) {
      setTryoutMsg(`Error: ${error.message}`)
    } else {
      setTryoutMsg('Saved.')
      await loadData()
    }
    setSavingTryout(false)
  }

  // ── Eval config helpers ───────────────────────────────────────────────────

  function updateEval(idx: number, patch: Partial<EvalField>) {
    setEvalFields(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f))
  }

  function addEvalField(section: string) {
    const sectionFields = evalFields.filter(f => f.section === section)
    const defaultWeight = section === 'pitching_catching' ? 0 : 1.0
    setEvalFields(prev => [...prev, {
      id: null, section, field_key: '', label: '',
      is_optional: false, sort_order: sectionFields.length + 1,
      weight: defaultWeight,
    }])
  }

  function removeEvalField(idx: number) {
    setEvalFields(prev => prev.filter((_, i) => i !== idx))
  }

  function moveEval(idx: number, dir: -1 | 1) {
    // Only swap within same section
    setEvalFields(prev => {
      const section = prev[idx].section
      const sectionIdxs = prev.map((f, i) => f.section === section ? i : -1).filter(i => i >= 0)
      const posInSection = sectionIdxs.indexOf(idx)
      const targetPos = posInSection + dir
      if (targetPos < 0 || targetPos >= sectionIdxs.length) return prev
      const targetIdx = sectionIdxs[targetPos]
      const next = [...prev]
      ;[next[idx], next[targetIdx]] = [next[targetIdx], next[idx]]
      return next
    })
  }

  async function saveEvalConfig() {
    if (!season) return
    setSavingEval(true)
    setEvalMsg(null)

    // Assign keys for new fields, re-number sort orders per section
    const sectionCounters: Record<string, number> = {}
    const toSave = evalFields.map(f => {
      sectionCounters[f.section] = (sectionCounters[f.section] ?? 0) + 1
      return {
        ...f,
        field_key:  f.field_key || slugify(f.label) || `field_${Math.random().toString(36).slice(2, 6)}`,
        sort_order: sectionCounters[f.section],
      }
    })

    // Pre-validate: check for duplicate field_key values before hitting the DB
    const keysSeen = new Set<string>()
    const dupes: string[] = []
    for (const f of toSave) {
      if (!f.field_key) continue
      if (keysSeen.has(f.field_key)) dupes.push(f.field_key)
      else keysSeen.add(f.field_key)
    }
    if (dupes.length > 0) {
      setEvalMsg(`Duplicate field name: "${dupes[0]}" is used more than once. Give each field a unique name (e.g. add a number like "Pitching 2").`)
      setSavingEval(false)
      return
    }

    await supabase.from('tryout_coach_eval_config')
      .delete().eq('org_id', params.orgId).eq('season_id', season.id)

    const inserts = toSave.map(f => ({
      org_id:      params.orgId,
      season_id:   season.id,
      section:     f.section,
      field_key:   f.field_key,
      label:       f.label,
      is_optional: f.is_optional,
      sort_order:  f.sort_order,
      weight:      f.weight,
    }))

    const { error } = await supabase.from('tryout_coach_eval_config').insert(inserts)
    if (error) {
      // Detect unique-constraint violations and show a user-friendly message
      if (error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
        const keyMatch = error.message.match(/\(field_key\)=\(([^)]+)\)/)
        const keyName  = keyMatch?.[1] ?? 'a field'
        setEvalMsg(`Name conflict: the key "${keyName}" is already in use. Rename the duplicate field or choose a different name.`)
      } else {
        setEvalMsg(`Error: ${error.message}`)
      }
    } else {
      setEvalMsg('Saved.')
      await loadData()
    }
    setSavingEval(false)
  }

  // ── GC scoring helpers ────────────────────────────────────────────────────

  function updateGcStat(ageGroup: string, statKey: string, patch: Partial<GcStatConfig>) {
    setGcConfig(prev => ({
      ...prev,
      [ageGroup]: {
        ...prev[ageGroup],
        [statKey]: { ...(prev[ageGroup]?.[statKey] ?? { stat_key: statKey, included: false, weight: 1.0 }), ...patch },
      },
    }))
  }

  async function saveGcConfig() {
    if (!season) return
    setSavingGc(true)
    setGcMsg(null)

    const rows: Array<{ org_id: string; season_id: string; age_group: string; stat_key: string; included: boolean; weight: number }> = []
    for (const [ageGroup, statMap] of Object.entries(gcConfig)) {
      for (const [, cfg] of Object.entries(statMap)) {
        rows.push({
          org_id:    params.orgId,
          season_id: season.id,
          age_group: ageGroup,
          stat_key:  cfg.stat_key,
          included:  cfg.included,
          weight:    cfg.weight,
        })
      }
    }

    const { error } = await supabase
      .from('tryout_gc_scoring_config')
      .upsert(rows, { onConflict: 'org_id,season_id,age_group,stat_key' })

    if (error) {
      setGcMsg(`Error: ${error.message}`)
    } else {
      setGcMsg('Saved.')
    }
    setSavingGc(false)
  }

  async function recomputeGcScores() {
    if (!season) return
    setRecomputing(true)
    setRecomputeMsg(null)

    // Need a season year — fetch from seasons table
    const { data: seasonData } = await supabase
      .from('tryout_seasons')
      .select('year')
      .eq('id', season.id)
      .single()

    const seasonYear = seasonData ? String(seasonData.year - 1) : null
    if (!seasonYear) { setRecomputeMsg('Could not determine season year.'); setRecomputing(false); return }

    const res = await fetch('/api/tryouts/gc-stats/compute-scores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId: params.orgId, seasonId: season.id, seasonYear }),
    })
    const json = await res.json()
    if (!res.ok) {
      setRecomputeMsg(`Error: ${json.error ?? 'Unknown error'}`)
    } else if (json.message) {
      setRecomputeMsg(json.message)
    } else {
      setRecomputeMsg(`Done — updated ${json.updated} player scores.`)
    }
    setRecomputing(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  const inputStyle = {
    background: 'var(--bg-input)', border: '0.5px solid var(--border-md)',
    borderRadius: '5px', padding: '5px 8px', fontSize: '13px',
    color: 'var(--fg)',
  } as const

  const totalCatWeight = categories.reduce((sum, c) => sum + (c.weight || 0), 0)
  const weightOk = Math.abs(totalCatWeight - 1.0) < 0.02

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading…
    </main>
  )

  if (!season) return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>
      <div style={{ textAlign: 'center', padding: '4rem', color: s.dim }}>
        No active season. <Link href={`/org/${params.orgId}/tryouts/seasons`} style={{ color: 'var(--accent)' }}>Set one up →</Link>
      </div>
    </main>
  )

  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>

      <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '2px' }}>Scoring Setup</h1>
      <p style={{ fontSize: '14px', color: s.muted, marginBottom: '2.5rem' }}>{season.label}</p>

      {/* ── Tryout Scoring Categories ───────────────────────────────────────── */}
      <div style={{ marginBottom: '3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700 }}>Tryout Scoring</div>
            <div style={{ fontSize: '12px', color: s.dim, marginTop: '2px' }}>
              Categories and their subcategories scored during tryouts (1–5 scale)
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{
              fontSize: '12px', fontWeight: 700,
              color: weightOk ? '#6DB875' : '#E8A020',
            }}>
              {Math.round(totalCatWeight * 100)}% total
              {!weightOk && ' (will auto-normalize on save)'}
            </span>
            <button onClick={addCategory} style={{
              padding: '6px 14px', borderRadius: '6px', border: '0.5px solid var(--border-md)',
              background: 'var(--bg-input)', color: s.muted, fontSize: '12px', cursor: 'pointer',
            }}>+ Category</button>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {categories.map((cat, catIdx) => {
            const subTotal = cat.subcategories.reduce((sum, s) => sum + (s.weight || 0), 0)
            const subOk    = Math.abs(subTotal - 1.0) < 0.02

            return (
              <div key={catIdx} style={{
                background: 'var(--bg-card)', border: '0.5px solid var(--border)',
                borderRadius: '10px', overflow: 'hidden',
              }}>
                {/* Category row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px' }}>
                  {/* Expand toggle */}
                  <button onClick={() => updateCat(catIdx, { expanded: !cat.expanded })} style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontSize: '12px', color: s.dim, padding: '0 2px', flexShrink: 0,
                  }}>{cat.expanded ? '▾' : '▸'}</button>

                  {/* Label */}
                  <input
                    value={cat.label}
                    onChange={e => updateCat(catIdx, { label: e.target.value })}
                    placeholder="Category name"
                    style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                  />

                  {/* Weight */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
                    <input
                      type="number" min={0} max={100} step={1}
                      value={pct(cat.weight)}
                      onChange={e => updateCat(catIdx, { weight: Number(e.target.value) / 100 })}
                      style={{ ...inputStyle, width: '52px', textAlign: 'right' }}
                    />
                    <span style={{ fontSize: '12px', color: s.dim }}>%</span>
                  </div>

                  {/* Optional toggle */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: s.muted, cursor: 'pointer', flexShrink: 0 }}>
                    <input type="checkbox" checked={cat.is_optional} onChange={e => updateCat(catIdx, { is_optional: e.target.checked })} />
                    opt.
                  </label>

                  {/* Move / delete */}
                  <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                    <button onClick={() => moveCat(catIdx, -1)} disabled={catIdx === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.dim, fontSize: '14px', padding: '0 3px', opacity: catIdx === 0 ? 0.3 : 1 }}>↑</button>
                    <button onClick={() => moveCat(catIdx, 1)} disabled={catIdx === categories.length - 1} style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.dim, fontSize: '14px', padding: '0 3px', opacity: catIdx === categories.length - 1 ? 0.3 : 1 }}>↓</button>
                    <button onClick={() => removeCategory(catIdx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#E87060', fontSize: '14px', padding: '0 4px' }}>×</button>
                  </div>
                </div>

                {/* Key display */}
                {cat.category && (
                  <div style={{ paddingLeft: '42px', paddingBottom: '4px', fontSize: '10px', color: s.dim }}>
                    key: {cat.category}
                  </div>
                )}

                {/* Subcategories */}
                {cat.expanded && (
                  <div style={{ borderTop: '0.5px solid var(--border)', padding: '10px 12px 12px 40px', background: 'rgba(var(--fg-rgb),0.02)' }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: s.dim, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      Subcategories
                      {!subOk && <span style={{ color: '#E8A020', marginLeft: '8px' }}>({Math.round(subTotal * 100)}% — will normalize)</span>}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {cat.subcategories.map((sub, subIdx) => (
                        <div key={subIdx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            value={sub.label}
                            onChange={e => updateSub(catIdx, subIdx, { label: e.target.value })}
                            placeholder="Subcategory name"
                            style={{ ...inputStyle, flex: 1 }}
                          />
                          <input
                            type="number" min={0} max={100} step={1}
                            value={pct(sub.weight)}
                            onChange={e => updateSub(catIdx, subIdx, { weight: Number(e.target.value) / 100 })}
                            style={{ ...inputStyle, width: '52px', textAlign: 'right' }}
                          />
                          <span style={{ fontSize: '12px', color: s.dim }}>%</span>
                          {sub.key && <span style={{ fontSize: '10px', color: s.dim, minWidth: '60px' }}>{sub.key}</span>}
                          <button onClick={() => removeSubcategory(catIdx, subIdx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#E87060', fontSize: '14px', padding: '0 2px' }}>×</button>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => addSubcategory(catIdx)} style={{
                      marginTop: '8px', padding: '4px 12px', borderRadius: '5px',
                      border: '0.5px solid var(--border-md)', background: 'none',
                      color: s.dim, fontSize: '12px', cursor: 'pointer',
                    }}>+ Subcategory</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Save tryout scoring */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
          <button onClick={saveTryoutScoring} disabled={savingTryout} style={{
            padding: '9px 22px', borderRadius: '7px', border: 'none',
            background: 'var(--accent)', color: 'var(--accent-text)',
            fontSize: '13px', fontWeight: 700, cursor: savingTryout ? 'not-allowed' : 'pointer',
            opacity: savingTryout ? 0.6 : 1,
          }}>{savingTryout ? 'Saving…' : 'Save Tryout Scoring'}</button>
          {tryoutMsg && <span style={{ fontSize: '12px', color: tryoutMsg.startsWith('Error') ? '#E87060' : '#6DB875' }}>{tryoutMsg}</span>}
        </div>
      </div>

      {/* ── Coach Eval Config ───────────────────────────────────────────────── */}
      <div>
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>Coach Evaluations</div>
          <div style={{ fontSize: '12px', color: s.dim, marginTop: '2px' }}>
            Fields coaches score on the 1–5 scale when submitting end-of-season evals.
            The <strong style={{ color: 'var(--fg)' }}>Weight</strong> column controls each field's contribution to the computed score —
            set to <strong style={{ color: 'var(--fg)' }}>0</strong> to exclude it. Pitching &amp; Catching fields default to 0.
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {EVAL_SECTIONS.map(sec => {
            const fields = evalFields.filter(f => f.section === sec.key)

            return (
              <div key={sec.key} style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700 }}>{sec.label}</span>
                  <button onClick={() => addEvalField(sec.key)} style={{
                    padding: '4px 12px', borderRadius: '5px', border: '0.5px solid var(--border-md)',
                    background: 'none', color: s.dim, fontSize: '12px', cursor: 'pointer',
                  }}>+ Field</button>
                </div>

                {fields.length === 0 ? (
                  <div style={{ padding: '16px', fontSize: '13px', color: s.dim, textAlign: 'center' }}>
                    No fields. Click + Field to add one.
                  </div>
                ) : (
                  <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {fields.map(field => {
                      const idx = evalFields.indexOf(field)
                      const sectionFields = evalFields.filter(f => f.section === sec.key)
                      const posInSection  = sectionFields.indexOf(field)

                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            value={field.label}
                            onChange={e => updateEval(idx, { label: e.target.value })}
                            placeholder="Field name"
                            style={{ ...inputStyle, flex: 1 }}
                          />
                          {field.field_key && (
                            <span style={{ fontSize: '10px', color: s.dim, minWidth: '80px' }}>{field.field_key}</span>
                          )}
                          {/* Weight */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0 }}>
                            <span style={{ fontSize: '10px', color: s.dim }}>wt</span>
                            <input
                              type="number" min={0} max={10} step={0.5}
                              value={field.weight}
                              onChange={e => updateEval(idx, { weight: parseFloat(e.target.value) || 0 })}
                              style={{ ...inputStyle, width: '46px', textAlign: 'right', padding: '4px 6px', fontSize: '12px',
                                color: field.weight === 0 ? s.dim : 'var(--fg)',
                              }}
                              title="Weight in computed score. Set to 0 to exclude."
                            />
                          </div>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', color: s.muted, cursor: 'pointer', flexShrink: 0 }}>
                            <input type="checkbox" checked={field.is_optional} onChange={e => updateEval(idx, { is_optional: e.target.checked })} />
                            opt.
                          </label>
                          <button onClick={() => moveEval(idx, -1)} disabled={posInSection === 0} style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.dim, fontSize: '14px', padding: '0 2px', opacity: posInSection === 0 ? 0.3 : 1 }}>↑</button>
                          <button onClick={() => moveEval(idx, 1)} disabled={posInSection === sectionFields.length - 1} style={{ background: 'none', border: 'none', cursor: 'pointer', color: s.dim, fontSize: '14px', padding: '0 2px', opacity: posInSection === sectionFields.length - 1 ? 0.3 : 1 }}>↓</button>
                          <button onClick={() => removeEvalField(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#E87060', fontSize: '14px', padding: '0 2px' }}>×</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Save eval config */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '12px' }}>
          <button onClick={saveEvalConfig} disabled={savingEval} style={{
            padding: '9px 22px', borderRadius: '7px', border: 'none',
            background: 'var(--accent)', color: 'var(--accent-text)',
            fontSize: '13px', fontWeight: 700, cursor: savingEval ? 'not-allowed' : 'pointer',
            opacity: savingEval ? 0.6 : 1,
          }}>{savingEval ? 'Saving…' : 'Save Eval Config'}</button>
          {evalMsg && <span style={{ fontSize: '12px', color: evalMsg.startsWith('Error') ? '#E87060' : '#6DB875' }}>{evalMsg}</span>}
        </div>
      </div>

      {/* ── GC Stat Scoring ─────────────────────────────────────────────────── */}
      <div style={{ marginTop: '3rem' }}>
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>GameChanger Stat Scoring</div>
          <div style={{ fontSize: '12px', color: s.dim, marginTop: '2px' }}>
            Configure which GC stats contribute to a player's calculated 1–5 score, per age group.
            Scores are percentile-ranked within each age group.
          </div>
        </div>

        {ageGroups.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: s.dim, fontSize: '13px' }}>
            No players found. Import registration first.
          </div>
        ) : (
          <>
            {/* Age group tabs */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '1rem' }}>
              {ageGroups.map(g => (
                <button key={g} onClick={() => setGcAgeGroup(g)} style={{
                  padding: '6px 14px', borderRadius: '20px', border: '0.5px solid',
                  borderColor: gcAgeGroup === g ? 'var(--accent)' : 'var(--border)',
                  background: gcAgeGroup === g ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
                  color: gcAgeGroup === g ? 'var(--accent)' : s.muted,
                  fontSize: '12px', fontWeight: gcAgeGroup === g ? 700 : 400,
                  cursor: 'pointer',
                }}>{g}</button>
              ))}
            </div>

            {/* Stat grid for selected age group */}
            {gcAgeGroup && gcConfig[gcAgeGroup] && (
              <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '10px', overflow: 'hidden' }}>
                {(['batting', 'pitching'] as const).map(cat => {
                  const defs = GC_STAT_DEFS.filter(d => d.category === cat)
                  return (
                    <div key={cat}>
                      <div style={{ padding: '8px 14px', background: 'rgba(var(--fg-rgb),0.03)', borderBottom: '0.5px solid var(--border)', fontSize: '11px', fontWeight: 700, color: s.dim, textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                        {cat === 'batting' ? 'Batting' : 'Pitching'}
                      </div>
                      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {defs.map(def => {
                          const cfg = gcConfig[gcAgeGroup]?.[def.key] ?? { stat_key: def.key, included: def.defaultIncluded, weight: def.defaultWeight }
                          return (
                            <div key={def.key} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '4px 0' }}>
                              <input
                                type="checkbox"
                                checked={cfg.included}
                                onChange={e => updateGcStat(gcAgeGroup, def.key, { included: e.target.checked })}
                              />
                              <span style={{ flex: 1, fontSize: '13px', color: cfg.included ? 'var(--fg)' : s.dim }}>
                                {def.label}
                                {!def.higherBetter && <span style={{ fontSize: '10px', color: s.dim, marginLeft: '4px' }}>(lower=better)</span>}
                              </span>
                              <span style={{ fontSize: '10px', color: s.dim, minWidth: '40px' }}>{def.key}</span>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '3px', flexShrink: 0, opacity: cfg.included ? 1 : 0.4 }}>
                                <span style={{ fontSize: '10px', color: s.dim }}>wt</span>
                                <input
                                  type="number" min={0} max={10} step={0.5}
                                  value={cfg.weight}
                                  disabled={!cfg.included}
                                  onChange={e => updateGcStat(gcAgeGroup, def.key, { weight: parseFloat(e.target.value) || 0 })}
                                  style={{ ...inputStyle, width: '52px', textAlign: 'right', padding: '4px 6px', fontSize: '12px' }}
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
              <button onClick={saveGcConfig} disabled={savingGc} style={{
                padding: '9px 22px', borderRadius: '7px', border: 'none',
                background: 'var(--accent)', color: 'var(--accent-text)',
                fontSize: '13px', fontWeight: 700, cursor: savingGc ? 'not-allowed' : 'pointer',
                opacity: savingGc ? 0.6 : 1,
              }}>{savingGc ? 'Saving…' : 'Save GC Config'}</button>

              {ageGroups.length > 1 && gcAgeGroup && (
                <button
                  onClick={() => {
                    const source = gcConfig[gcAgeGroup]
                    if (!source) return
                    setGcConfig(prev => {
                      const next = { ...prev }
                      for (const g of ageGroups) {
                        if (g === gcAgeGroup) continue
                        next[g] = { ...source }
                      }
                      return next
                    })
                    setGcMsg(`Config from ${gcAgeGroup} copied to all age groups — click Save to apply.`)
                  }}
                  style={{
                    padding: '9px 22px', borderRadius: '7px',
                    border: '0.5px solid var(--border-md)',
                    background: 'var(--bg-input)', color: s.muted,
                    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Copy {gcAgeGroup} → all ages
                </button>
              )}

              <button onClick={recomputeGcScores} disabled={recomputing} style={{
                padding: '9px 22px', borderRadius: '7px',
                border: '0.5px solid var(--border-md)',
                background: 'var(--bg-input)', color: s.muted,
                fontSize: '13px', fontWeight: 600, cursor: recomputing ? 'not-allowed' : 'pointer',
                opacity: recomputing ? 0.6 : 1,
              }}>{recomputing ? 'Recomputing…' : 'Recompute All Scores'}</button>

              {gcMsg && <span style={{ fontSize: '12px', color: gcMsg.startsWith('Error') ? '#E87060' : '#6DB875' }}>{gcMsg}</span>}
              {recomputeMsg && <span style={{ fontSize: '12px', color: recomputeMsg.startsWith('Error') ? '#E87060' : '#6DB875' }}>{recomputeMsg}</span>}
            </div>
          </>
        )}
      </div>
    </main>
  )
}
