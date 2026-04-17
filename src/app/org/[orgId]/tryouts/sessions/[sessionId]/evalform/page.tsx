'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../../../../../lib/supabase'
import Link from 'next/link'

interface Session {
  id: string; label: string; age_group: string; season_id: string; session_date: string
}

interface OrgData { name: string }
interface SeasonData { label: string }

interface Checkin {
  id: string; tryout_number: number; player_id: string | null
  is_write_in: boolean; write_in_name: string | null
  player: { first_name: string; last_name: string } | null
}

interface Category {
  category: string; label: string; weight: number
  is_optional: boolean; is_tiebreaker: boolean
  subcategories: Array<{ key: string; label: string; weight: number }>
  sort_order: number
}

interface Evaluator { id: string; name: string | null; email: string }

export default function EvalFormPage({ params }: { params: { orgId: string; sessionId: string } }) {
  const supabase = createClient()

  const [session,    setSession]    = useState<Session | null>(null)
  const [org,        setOrg]        = useState<OrgData | null>(null)
  const [season,     setSeason]     = useState<SeasonData | null>(null)
  const [checkins,   setCheckins]   = useState<Checkin[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [evaluators, setEvaluators] = useState<Evaluator[]>([])
  const [loading,    setLoading]    = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: sess } = await supabase
      .from('tryout_sessions')
      .select('id, label, age_group, season_id, session_date')
      .eq('id', params.sessionId).single()
    setSession(sess)
    if (!sess) { setLoading(false); return }

    const [{ data: orgData }, { data: seasonData }, { data: checkinData }, { data: catData }, { data: evalData }] = await Promise.all([
      supabase.from('tryout_orgs').select('name').eq('id', params.orgId).single(),
      supabase.from('tryout_seasons').select('label').eq('id', sess.season_id).single(),
      supabase.from('tryout_checkins')
        .select('id, tryout_number, player_id, is_write_in, write_in_name, tryout_players(first_name, last_name)')
        .eq('session_id', params.sessionId).order('tryout_number'),
      supabase.from('tryout_scoring_config')
        .select('category, label, weight, is_optional, is_tiebreaker, subcategories, sort_order')
        .eq('season_id', sess.season_id).order('sort_order'),
      supabase.from('tryout_session_evaluators')
        .select('id, name, email').eq('session_id', params.sessionId),
    ])

    setOrg(orgData)
    setSeason(seasonData)
    setCheckins((checkinData ?? []).map((c: any) => ({
      id: c.id, tryout_number: c.tryout_number, player_id: c.player_id,
      is_write_in: c.is_write_in, write_in_name: c.write_in_name,
      player: c.tryout_players ?? null,
    })))
    setCategories((catData ?? []).map((c: any) => ({
      category: c.category, label: c.label, weight: c.weight,
      is_optional: c.is_optional, is_tiebreaker: c.is_tiebreaker ?? false,
      subcategories: c.subcategories ?? [], sort_order: c.sort_order,
    })))
    setEvaluators(evalData ?? [])
    setLoading(false)
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading…
    </main>
  )

  if (!session) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Session not found.
    </main>
  )

  const sessionDate = new Date(session.session_date + 'T12:00:00')
    .toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  // All subcategory columns, in order
  const allCols: Array<{ catKey: string; catLabel: string; subKey: string; subLabel: string; isTiebreaker: boolean; isOptional: boolean }> = []
  for (const cat of categories) {
    for (const sub of cat.subcategories) {
      allCols.push({
        catKey: cat.category, catLabel: cat.label,
        subKey: sub.key, subLabel: sub.label,
        isTiebreaker: cat.is_tiebreaker, isOptional: cat.is_optional,
      })
    }
  }

  // Group columns by category for the colspan header
  const catColGroups = categories.map(cat => ({
    key: cat.category, label: cat.label,
    isTiebreaker: cat.is_tiebreaker, isOptional: cat.is_optional,
    count: cat.subcategories.length,
  })).filter(g => g.count > 0)

  // Show placeholder form if no evaluators assigned
  const evalList = evaluators.length > 0 ? evaluators : [{ id: 'blank', name: null, email: '' }]

  return (
    <>
      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
          .eval-sheet { page-break-after: always; }
          .eval-sheet:last-child { page-break-after: auto; }
          table { font-size: 10px !important; }
          th, td { border: 0.5px solid #aaa !important; }
        }
        @media screen {
          .eval-sheet {
            margin-bottom: 3rem;
            padding-bottom: 2rem;
            border-bottom: 2px dashed rgba(var(--fg-rgb),0.12);
          }
          .eval-sheet:last-child { border-bottom: none; }
        }
      `}</style>

      <main style={{ background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '1.5rem 1.5rem 4rem', minHeight: '100vh' }}>

        {/* Nav + print button — hidden when printing */}
        <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '10px' }}>
          <Link href={`/org/${params.orgId}/tryouts/sessions/${params.sessionId}`} style={{ fontSize: '13px', color: `rgba(var(--fg-rgb),0.35)`, textDecoration: 'none' }}>
            ‹ Session
          </Link>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', color: `rgba(var(--fg-rgb),0.4)` }}>
              {evalList.length === 1 && !evaluators.length ? '1 blank sheet' : `${evalList.length} sheet${evalList.length !== 1 ? 's' : ''}`}
            </span>
            <button
              onClick={() => window.print()}
              style={{
                padding: '8px 20px', borderRadius: '6px', border: 'none',
                background: 'var(--accent)', color: 'var(--accent-text)',
                fontSize: '13px', fontWeight: 700, cursor: 'pointer',
              }}
            >
              Print all sheets
            </button>
          </div>
        </div>

        {checkins.length === 0 && (
          <div className="no-print" style={{ padding: '2rem', textAlign: 'center', color: `rgba(var(--fg-rgb),0.4)`, fontSize: '13px', background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '10px', marginBottom: '2rem' }}>
            No players checked in yet.{' '}
            <Link href={`/org/${params.orgId}/tryouts/sessions/${params.sessionId}/checkin`} style={{ color: 'var(--accent)' }}>
              Check in players first →
            </Link>
          </div>
        )}

        {/* One sheet per evaluator */}
        {evalList.map((ev, sheetIdx) => (
          <div key={ev.id} className="eval-sheet">

            {/* Sheet header */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ fontSize: '13px', fontWeight: 800, letterSpacing: '0.04em', marginBottom: '2px' }}>
                {org?.name ?? 'Organization'} — {season?.label ?? ''}
              </div>
              <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb),0.55)`, marginBottom: '10px' }}>
                {session.age_group} · {session.label} · {sessionDate}
              </div>
              <div style={{ display: 'flex', gap: '32px', fontSize: '12px' }}>
                <div>
                  <span style={{ fontWeight: 700 }}>Evaluator: </span>
                  {ev.name
                    ? <span>{ev.name}</span>
                    : <span style={{ display: 'inline-block', borderBottom: '1px solid currentColor', width: '160px' }}>&nbsp;</span>
                  }
                </div>
                <div>
                  <span style={{ fontWeight: 700 }}>Sheet </span>
                  <span>{sheetIdx + 1} of {evalList.length}</span>
                </div>
              </div>
            </div>

            {/* Score grid */}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '11px' }}>
                <thead>
                  {/* Category header row */}
                  <tr>
                    <th rowSpan={2} style={{
                      padding: '4px 6px', textAlign: 'left', border: '0.5px solid var(--border)',
                      background: `rgba(var(--fg-rgb),0.04)`, fontWeight: 700, fontSize: '11px',
                      minWidth: '20px', whiteSpace: 'nowrap',
                    }}>#</th>
                    <th rowSpan={2} style={{
                      padding: '4px 8px', textAlign: 'left', border: '0.5px solid var(--border)',
                      background: `rgba(var(--fg-rgb),0.04)`, fontWeight: 700, fontSize: '11px',
                      minWidth: '130px',
                    }}>Player</th>
                    {catColGroups.map(grp => (
                      <th key={grp.key} colSpan={grp.count} style={{
                        padding: '4px 6px', textAlign: 'center', border: '0.5px solid var(--border)',
                        background: grp.isTiebreaker
                          ? `rgba(var(--fg-rgb),0.03)`
                          : grp.isOptional
                            ? `rgba(80,160,232,0.07)`
                            : `rgba(var(--fg-rgb),0.04)`,
                        fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em',
                        whiteSpace: 'nowrap',
                        color: grp.isTiebreaker ? `rgba(var(--fg-rgb),0.4)` : 'inherit',
                      }}>
                        {grp.label}
                        {grp.isTiebreaker ? ' (sec, lower=better)' : ''}
                        {grp.isOptional && !grp.isTiebreaker ? ' *' : ''}
                      </th>
                    ))}
                    <th rowSpan={2} style={{
                      padding: '4px 6px', textAlign: 'center', border: '0.5px solid var(--border)',
                      background: `rgba(var(--fg-rgb),0.04)`, fontSize: '10px', fontWeight: 700,
                      minWidth: '80px',
                    }}>Comments</th>
                  </tr>
                  {/* Subcategory header row */}
                  <tr>
                    {allCols.map((col, i) => (
                      <th key={`${col.catKey}-${col.subKey}`} style={{
                        padding: '3px 4px', textAlign: 'center', border: '0.5px solid var(--border)',
                        background: col.isTiebreaker
                          ? `rgba(var(--fg-rgb),0.03)`
                          : col.isOptional
                            ? `rgba(80,160,232,0.05)`
                            : `rgba(var(--fg-rgb),0.03)`,
                        fontSize: '9px', fontWeight: 600,
                        color: col.isTiebreaker ? `rgba(var(--fg-rgb),0.4)` : `rgba(var(--fg-rgb),0.6)`,
                        whiteSpace: 'nowrap', minWidth: col.isTiebreaker ? '42px' : '28px',
                      }}>
                        {col.subLabel}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {checkins.length === 0 ? (
                    // Blank rows for printing when no one is checked in yet
                    Array.from({ length: 20 }).map((_, i) => (
                      <tr key={i}>
                        <td style={{ padding: '6px 6px', border: '0.5px solid var(--border)', textAlign: 'center', color: `rgba(var(--fg-rgb),0.3)`, fontSize: '10px' }}>{i + 1}</td>
                        <td style={{ padding: '6px 8px', border: '0.5px solid var(--border)' }}>&nbsp;</td>
                        {allCols.map((col, ci) => (
                          <td key={ci} style={{ padding: '6px 4px', border: '0.5px solid var(--border)', minWidth: col.isTiebreaker ? '42px' : '28px' }}>&nbsp;</td>
                        ))}
                        <td style={{ padding: '6px 6px', border: '0.5px solid var(--border)' }}>&nbsp;</td>
                      </tr>
                    ))
                  ) : (
                    checkins.map(c => {
                      const name = c.is_write_in
                        ? (c.write_in_name ?? 'Write-in')
                        : c.player
                          ? `${c.player.last_name}, ${c.player.first_name}`
                          : 'Unknown'
                      return (
                        <tr key={c.id}>
                          <td style={{ padding: '5px 6px', border: '0.5px solid var(--border)', textAlign: 'center', fontWeight: 700, fontSize: '11px' }}>
                            {c.tryout_number}
                          </td>
                          <td style={{ padding: '5px 8px', border: '0.5px solid var(--border)', fontWeight: 600, whiteSpace: 'nowrap', fontSize: '11px' }}>
                            {name}
                          </td>
                          {allCols.map((col, ci) => (
                            <td key={ci} style={{
                              padding: '5px 4px', border: '0.5px solid var(--border)',
                              minWidth: col.isTiebreaker ? '42px' : '28px',
                              background: col.isTiebreaker ? `rgba(var(--fg-rgb),0.015)` : 'transparent',
                            }}>&nbsp;</td>
                          ))}
                          <td style={{ padding: '5px 6px', border: '0.5px solid var(--border)' }}>&nbsp;</td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer note */}
            <div style={{ marginTop: '8px', fontSize: '10px', color: `rgba(var(--fg-rgb),0.35)` }}>
              {categories.some(c => c.is_optional && !c.is_tiebreaker) && (
                <span>* Optional (not all players) · </span>
              )}
              Regular scores: 1–5 scale · Speed: raw seconds (lower is better)
            </div>

          </div>
        ))}
      </main>
    </>
  )
}
