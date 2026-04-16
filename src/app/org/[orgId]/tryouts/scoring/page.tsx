'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'

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

const EVAL_SECTIONS = [
  { key: 'fielding_hitting',   label: 'Fielding & Hitting' },
  { key: 'pitching_catching',  label: 'Pitching & Catching' },
  { key: 'intangibles',        label: 'Intangibles' },
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

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: seasonData } = await supabase
      .from('tryout_seasons').select('id, label')
      .eq('org_id', params.orgId).eq('is_active', true).maybeSingle()
    setSeason(seasonData)

    if (!seasonData) { setLoading(false); return }

    const [{ data: scoreCfg }, { data: evalCfg }] = await Promise.all([
      supabase.from('tryout_scoring_config')
        .select('id, category, label, weight, subcategories, is_optional, sort_order')
        .eq('season_id', seasonData.id)
        .order('sort_order'),
      supabase.from('tryout_coach_eval_config')
        .select('id, section, field_key, label, is_optional, sort_order, weight')
        .eq('org_id', params.orgId).eq('season_id', seasonData.id)
        .order('sort_order'),
    ])

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
      setEvalMsg(`Error: ${error.message}`)
    } else {
      setEvalMsg('Saved.')
      await loadData()
    }
    setSavingEval(false)
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
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', maxWidth: '820px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ Tryouts</Link>
      <div style={{ textAlign: 'center', padding: '4rem', color: s.dim }}>
        No active season. <Link href={`/org/${params.orgId}/tryouts/seasons`} style={{ color: 'var(--accent)' }}>Set one up →</Link>
      </div>
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', maxWidth: '820px', margin: '0 auto', padding: '2rem 1.5rem 6rem' }}>
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
    </main>
  )
}
