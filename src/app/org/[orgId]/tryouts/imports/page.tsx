'use client'

import { useState, useEffect, useRef } from 'react'
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

const TYPE_OPTIONS = [
  { value: 'registration',  label: 'Registration',       hint: 'Player sign-up export (xlsx/csv)' },
  { value: 'gc_stats',      label: 'GameChanger Stats',  hint: 'Batting/pitching stats export (csv)' },
  { value: 'coach_eval',    label: 'Coach Evaluations',  hint: 'End-of-season coach eval sheet (xlsx)' },
  { value: 'tryout_scores', label: 'Tryout Scores',      hint: 'Tryout results file (xlsx/csv)' },
]

const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  complete:     { color: '#6DB875', label: 'Complete' },
  needs_review: { color: '#E8A020', label: 'Needs review' },
  processing:   { color: '#80B0E8', label: 'Processing' },
  error:        { color: '#E87060', label: 'Error' },
  pending:      { color: 'rgba(var(--fg-rgb),0.4)', label: 'Pending' },
}

export default function ImportsPage({ params }: { params: { orgId: string } }) {
  const supabase = createClient()
  const router   = useRouter()
  const fileRef  = useRef<HTMLInputElement>(null)

  const [jobs,       setJobs]       = useState<ImportJob[]>([])
  const [seasons,    setSeasons]    = useState<Season[]>([])
  const [seasonId,   setSeasonId]   = useState('')
  const [seasonYear, setSeasonYear] = useState('')
  const [uploadType, setUploadType] = useState('registration')
  const [uploading,  setUploading]  = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [loading,    setLoading]    = useState(true)

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
      setSeasonYear(String(s[0].year - 1))  // default eval year = previous year
    }
    setLoading(false)
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadError(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('orgId', params.orgId)
    formData.append('seasonId', seasonId)
    if (uploadType === 'coach_eval' || uploadType === 'gc_stats') {
      formData.append('seasonYear', seasonYear)
    }

    const endpoint =
      uploadType === 'registration'  ? '/api/tryouts/imports/registration'  :
      uploadType === 'coach_eval'    ? '/api/tryouts/imports/coach-eval'    :
      uploadType === 'gc_stats'      ? '/api/tryouts/imports/gc-stats'      :
                                       '/api/tryouts/imports/tryout-scores'

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

    // Navigate directly to review screen if there's anything to review
    if (json.jobId && (json.suggested > 0 || json.unresolved > 0)) {
      router.push(`/org/${params.orgId}/tryouts/imports/${json.jobId}`)
    } else {
      // All auto-matched — just reload job list
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

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '820px', margin: '0 auto',
      padding: '2rem 1.5rem 6rem',
    }}>
      <Link href={`/org/${params.orgId}/tryouts`} style={{
        fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem',
      }}>‹ Tryouts</Link>

      <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '0.25rem' }}>Import center</h1>
      <p style={{ fontSize: '14px', color: s.muted, marginBottom: '2rem' }}>
        Upload registration exports, coach evaluations, and tryout score files.
      </p>

      {/* ── Upload panel ── */}
      <div style={{
        background: 'var(--bg-card)', border: '0.5px solid var(--border)',
        borderRadius: '12px', padding: '1.5rem', marginBottom: '2rem',
      }}>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '1rem' }}>Upload a file</div>

        {/* Season selector */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <div>
            <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Season
            </label>
            <select value={seasonId} onChange={e => setSeasonId(e.target.value)} style={{
              background: 'var(--bg-input)', border: '0.5px solid var(--border-md)',
              borderRadius: '6px', padding: '7px 12px', fontSize: '13px',
              color: 'var(--fg)', cursor: 'pointer',
            }}>
              {seasons.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </div>

          {/* Stats year — for coach_eval and gc_stats */}
          {(uploadType === 'coach_eval' || uploadType === 'gc_stats') && (
            <div>
              <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {uploadType === 'gc_stats' ? 'Stats season year' : 'Year being evaluated'}
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
        </div>

        {/* Type selector */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem' }}>
          {TYPE_OPTIONS.map(opt => (
            <button key={opt.value} onClick={() => setUploadType(opt.value)} style={{
              padding: '8px 16px', borderRadius: '8px', border: '0.5px solid',
              borderColor: uploadType === opt.value ? 'var(--accent)' : 'var(--border)',
              background: uploadType === opt.value ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
              color: uploadType === opt.value ? 'var(--accent)' : s.muted,
              fontSize: '13px', fontWeight: uploadType === opt.value ? 700 : 400,
              cursor: 'pointer', textAlign: 'left',
            }}>
              <div>{opt.label}</div>
              <div style={{ fontSize: '11px', opacity: 0.7, marginTop: '1px' }}>{opt.hint}</div>
            </button>
          ))}
        </div>

        {/* Upload button */}
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleUpload} />
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
      <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '0.75rem' }}>Import history</div>

      {jobs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: s.dim, fontSize: '14px' }}>
          No imports yet. Upload your registration file to get started.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {jobs.map(job => {
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
                    <span style={{ fontSize: '11px', color: s.dim }}>
                      {job.type?.replace('_', ' ')}
                    </span>
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
