'use client'

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '../../../../../lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

interface ImportJob {
  id:              string
  type:            string
  filename:        string
  status:          string
  rows_total:      number | null
  rows_matched:    number | null
  rows_suggested:  number | null
  rows_unresolved: number | null
  rows_created:    number | null
  created_at:      string
  completed_at:    string | null
}

interface Season {
  id:    string
  label: string
  year:  number
}

const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  complete:     { color: '#6DB875', label: 'Complete' },
  needs_review: { color: '#E8A020', label: 'Needs review' },
  processing:   { color: '#80B0E8', label: 'Processing' },
  error:        { color: '#E87060', label: 'Error' },
  pending:      { color: 'rgba(var(--fg-rgb),0.4)', label: 'Pending' },
}

const TYPE_LABELS: Record<string, string> = {
  registration:  'Tryout Registrations',
  roster:        'Team Roster',
  gc_stats:      'GameChanger Stats',
  coach_eval:    'Coach Evaluations',
  tryout_scores: 'Tryout Scores',
}

// Mode-specific config
const MODE_CONFIG: Record<string, {
  heading:    string
  subheading: string
  formatNote: React.ReactNode
}> = {
  registration: {
    heading:    'Import Tryout Registrations',
    subheading: 'Upload your registration spreadsheet exported from your sign-up platform.',
    formatNote: (
      <div>
        <div style={{ fontWeight: 700, marginBottom: '6px' }}>Expected columns</div>
        <div style={{ lineHeight: 1.8 }}>
          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>First Name</span>{' · '}
          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>Last Name</span>{' · '}
          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>Date of Birth</span>{' · '}
          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>Age Group</span>{' (or Division)'}
          <br />
          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>Parent Email</span>{' · '}
          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>Parent Phone</span>{' · '}
          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>Grade</span>{' · '}
          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>School</span>
          <br />
          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>Prior Organization</span>{' · '}
          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>Prior Team</span>{' · '}
          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>Preferred Tryout Date</span>
        </div>
        <div style={{ marginTop: '8px', opacity: 0.7 }}>Accepts .xlsx or .csv · Column names are flexible (case-insensitive)</div>
      </div>
    ),
  },
  gc_stats: {
    heading:    'Import GameChanger Season Stats',
    subheading: 'Upload a stats export from GameChanger for one team at a time.',
    formatNote: (
      <div>
        <div style={{ fontWeight: 700, marginBottom: '6px' }}>How to export from GameChanger</div>
        <div style={{ lineHeight: 1.8 }}>
          In the GameChanger app: <strong>Team → Stats → Export as CSV</strong>
        </div>
        <div style={{ marginTop: '8px', lineHeight: 1.8 }}>
          <strong>Team detection:</strong> The team name is read from the filename first
          (e.g. <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>Tigers 10U.csv</span>),
          then matched against players already in the database.
          Use the "Assign to team" dropdown below to override if needed.
        </div>
        <div style={{ marginTop: '8px', opacity: 0.7 }}>Accepts .csv only</div>
      </div>
    ),
  },
  rosters: {
    heading:    'Import Season Rosters',
    subheading: 'Upload your current season rosters to assign players to their teams.',
    formatNote: (
      <div>
        <div style={{ fontWeight: 700, marginBottom: '6px' }}>Expected columns</div>
        <div style={{ lineHeight: 1.8 }}>
          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>First Name</span>{' · '}
          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>Last Name</span>{' · '}
          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>DOB</span>{' · '}
          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>Team</span>{' · '}
          <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>Jersey #</span>{' (optional)'}
        </div>
        <div style={{ marginTop: '8px', lineHeight: 1.8 }}>
          <strong>What this does:</strong> Sets each player's current team assignment (Prior Team),
          which drives coach eval forms — coaches see exactly their team's roster.
          You can upload one file per team or a single combined file.
        </div>
        <div style={{ marginTop: '8px', opacity: 0.7 }}>Accepts .xlsx, .xls, or .csv · Players must be imported via Registrations first</div>
      </div>
    ),
  },
}

function ImportsInner({ params }: { params: { orgId: string } }) {
  const supabase      = createClient()
  const router        = useRouter()
  const fileRef       = useRef<HTMLInputElement>(null)
  const searchParams  = useSearchParams()
  const typeParam     = searchParams.get('type') as 'registration' | 'gc_stats' | 'rosters' | null

  // In focused mode, uploadType is fixed. In generic mode, user can switch.
  const [jobs,           setJobs]           = useState<ImportJob[]>([])
  const [seasons,        setSeasons]        = useState<Season[]>([])
  const [seasonId,       setSeasonId]       = useState('')
  const [seasonYear,     setSeasonYear]     = useState('')
  const [uploading,      setUploading]      = useState(false)
  const [uploadError,    setUploadError]    = useState<string | null>(null)
  const [loading,        setLoading]        = useState(true)
  const [gcTeamOverride, setGcTeamOverride] = useState('')
  const [priorTeams,     setPriorTeams]     = useState<string[]>([])
  const [uploadResult,   setUploadResult]   = useState<{ teamLabel: string | null; teamLabelSource: string | null } | null>(null)

  const uploadType = typeParam ?? 'registration'
  const mode = typeParam ? MODE_CONFIG[typeParam] : null

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: jobData }, { data: seasonData }] = await Promise.all([
      supabase
        .from('tryout_import_jobs')
        .select('*')
        .eq('org_id', params.orgId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('tryout_seasons')
        .select('id, label, year')
        .eq('org_id', params.orgId)
        .order('year', { ascending: false }),
    ])

    setJobs(jobData ?? [])
    const s = seasonData ?? []
    setSeasons(s)
    if (s.length > 0) {
      setSeasonId(s[0].id)
      setSeasonYear(String(s[0].year - 1))
    }

    const { data: teamRows } = await supabase
      .from('tryout_players')
      .select('prior_team')
      .eq('org_id', params.orgId)
      .eq('is_active', true)
      .not('prior_team', 'is', null)
    const teams = Array.from(new Set((teamRows ?? []).map((r: any) => r.prior_team as string).filter(Boolean))).sort()
    setPriorTeams(teams)

    setLoading(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)
    setUploadResult(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('orgId', params.orgId)
    formData.append('seasonId', seasonId)
    if (uploadType === 'gc_stats') {
      formData.append('seasonYear', seasonYear)
    }
    if (uploadType === 'gc_stats' && gcTeamOverride.trim()) {
      formData.append('overrideTeamLabel', gcTeamOverride.trim())
    }

    const endpoint =
      uploadType === 'registration' ? '/api/tryouts/imports/registration' :
      uploadType === 'gc_stats'     ? '/api/tryouts/imports/gc-stats'      :
      uploadType === 'rosters'      ? '/api/tryouts/imports/roster'        :
                                      '/api/tryouts/imports/registration'

    const res = await fetch(endpoint, { method: 'POST', body: formData })
    const json = await res.json()

    if (!res.ok) {
      setUploadError(json.error ?? 'Upload failed')
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
      return
    }

    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''

    if (uploadType === 'gc_stats') {
      setUploadResult({ teamLabel: json.teamLabel ?? null, teamLabelSource: json.teamLabelSource ?? null })
    }

    if (json.jobId && (json.suggested > 0 || json.unresolved > 0)) {
      router.push(`/org/${params.orgId}/tryouts/imports/${json.jobId}`)
    } else {
      await loadData()
    }
  }

  const s = {
    muted: `rgba(var(--fg-rgb), 0.55)` as const,
    dim:   `rgba(var(--fg-rgb), 0.35)` as const,
  }

  if (loading) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading…
    </main>
  )

  // In focused mode, only show history for this import type
  const visibleJobs = typeParam
    ? jobs.filter(j => j.type === (
        typeParam === 'gc_stats' ? 'gc_stats' :
        typeParam === 'rosters'  ? 'roster'   :
        'registration'
      ))
    : jobs

  return (
    <main className="page-wide" style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem',
    }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{
        fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem',
      }}>‹ Tryouts</Link>

      <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '0.25rem' }}>
        {mode?.heading ?? 'Import center'}
      </h1>
      <p style={{ fontSize: '14px', color: s.muted, marginBottom: '2rem', margin: '0 0 2rem' }}>
        {mode?.subheading ?? 'Upload registration exports, coach evaluations, and tryout score files.'}
      </p>

      {/* ── Format hint (focused mode only) ── */}
      {mode && (
        <div style={{
          background: 'rgba(80,160,232,0.05)', border: '0.5px solid rgba(80,160,232,0.2)',
          borderRadius: '10px', padding: '1rem 1.25rem', marginBottom: '1.5rem',
          fontSize: '12px', color: s.muted, lineHeight: 1.6,
        }}>
          {mode.formatNote}
        </div>
      )}

      {/* ── Upload panel ── */}
      <div style={{
        background: 'var(--bg-card)', border: '0.5px solid var(--border)',
        borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem',
      }}>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '1rem' }}>
          {typeParam ? 'Upload file' : 'Upload a file'}
        </div>

        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '1rem', alignItems: 'flex-end' }}>
          {/* Season selector */}
          <div>
            <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Season
            </label>
            <select value={seasonId} onChange={e => setSeasonId(e.target.value)} style={{
              background: 'var(--bg-input)', border: '0.5px solid var(--border-md)',
              borderRadius: '6px', padding: '7px 12px', fontSize: '13px',
              color: 'var(--fg)', cursor: 'pointer',
            }}>
              {seasons.map(season => (
                <option key={season.id} value={season.id}>{season.label}</option>
              ))}
            </select>
          </div>

          {/* Stats year — GC only */}
          {uploadType === 'gc_stats' && (
            <div>
              <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Stats season year
              </label>
              <input
                type="text" value={seasonYear}
                onChange={e => setSeasonYear(e.target.value)}
                placeholder="2025"
                style={{
                  background: 'var(--bg-input)', border: '0.5px solid var(--border-md)',
                  borderRadius: '6px', padding: '7px 12px', fontSize: '13px',
                  color: 'var(--fg)', width: '80px',
                }}
              />
            </div>
          )}

          {/* Team override — GC only */}
          {uploadType === 'gc_stats' && (
            <div>
              <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Assign to team
              </label>
              {priorTeams.length > 0 ? (
                <select
                  value={gcTeamOverride}
                  onChange={e => setGcTeamOverride(e.target.value)}
                  style={{
                    background: 'var(--bg-input)', border: '0.5px solid var(--border-md)',
                    borderRadius: '6px', padding: '7px 12px', fontSize: '13px',
                    color: gcTeamOverride ? 'var(--fg)' : s.dim, cursor: 'pointer',
                  }}
                >
                  <option value="">Auto-detect from filename / matches</option>
                  {priorTeams.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              ) : (
                <input
                  type="text" value={gcTeamOverride}
                  onChange={e => setGcTeamOverride(e.target.value)}
                  placeholder="Auto-detect from filename"
                  style={{
                    background: 'var(--bg-input)', border: '0.5px solid var(--border-md)',
                    borderRadius: '6px', padding: '7px 12px', fontSize: '13px',
                    color: 'var(--fg)', width: '220px',
                  }}
                />
              )}
            </div>
          )}
        </div>

        {/* Team detection result */}
        {uploadResult && uploadType === 'gc_stats' && (
          <div style={{ marginBottom: '10px', fontSize: '12px', color: s.muted }}>
            Team assigned:{' '}
            <strong style={{ color: 'var(--fg)' }}>{uploadResult.teamLabel ?? '(none detected)'}</strong>
            {uploadResult.teamLabelSource && (
              <span style={{ marginLeft: '6px', color: s.dim }}>
                ({uploadResult.teamLabelSource === 'override' ? 'manually set' :
                  uploadResult.teamLabelSource === 'file' ? 'from filename' : 'from player matches'})
              </span>
            )}
          </div>
        )}

        <input
          ref={fileRef}
          type="file"
          accept={uploadType === 'gc_stats' ? '.csv' : '.xlsx,.xls,.csv'}
          style={{ display: 'none' }}
          onChange={handleUpload}
        />
        <button onClick={() => fileRef.current?.click()} disabled={!seasonId || uploading} style={{
          padding: '10px 24px', borderRadius: '7px', border: 'none',
          background: 'var(--accent)', color: 'var(--accent-text)',
          fontSize: '14px', fontWeight: 700,
          cursor: !seasonId || uploading ? 'not-allowed' : 'pointer',
          opacity: !seasonId || uploading ? 0.6 : 1,
        }}>
          {uploading ? 'Uploading…' : '↑ Choose file'}
        </button>

        {uploadError && (
          <div style={{ marginTop: '10px', fontSize: '13px', color: '#E87060' }}>
            {uploadError}
          </div>
        )}
      </div>

      {/* ── Import history ── */}
      <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '0.75rem' }}>
        Import history
      </div>

      {visibleJobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '14px' }}>
          No imports yet.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {visibleJobs.map(job => {
            const st = STATUS_STYLES[job.status] ?? STATUS_STYLES.pending
            const needsReview = job.status === 'needs_review'
            return (
              <div key={job.id} style={{
                background: 'var(--bg-card)', border: '0.5px solid var(--border)',
                borderRadius: '10px', padding: '12px 16px',
                display: 'flex', alignItems: 'center', gap: '12px',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700 }}>{job.filename}</span>
                    {!typeParam && (
                      <span style={{ fontSize: '11px', color: s.dim }}>
                        {TYPE_LABELS[job.type] ?? job.type}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: s.dim }}>
                    {job.rows_total ?? '?'} rows
                    {job.rows_matched != null ? ` · ${job.rows_matched} matched` : ''}
                    {job.rows_suggested ? ` · ${job.rows_suggested} suggested` : ''}
                    {job.rows_unresolved ? ` · ${job.rows_unresolved} unresolved` : ''}
                    {job.rows_created ? ` · ${job.rows_created} new` : ''}
                    {' · '}{new Date(job.created_at).toLocaleDateString()}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  <span style={{
                    fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '20px',
                    background: `${st.color}18`, color: st.color,
                    border: `0.5px solid ${st.color}55`,
                  }}>{st.label}</span>
                  {needsReview && (
                    <Link href={`/org/${params.orgId}/tryouts/imports/${job.id}`} style={{
                      fontSize: '12px', fontWeight: 700, padding: '5px 14px', borderRadius: '5px',
                      background: 'rgba(232,160,32,0.12)', color: '#E8A020',
                      border: '0.5px solid rgba(232,160,32,0.35)', textDecoration: 'none',
                    }}>Review</Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}

export default function ImportsPage({ params }: { params: { orgId: string } }) {
  return (
    <Suspense fallback={
      <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Loading…
      </main>
    }>
      <ImportsInner params={params} />
    </Suspense>
  )
}
