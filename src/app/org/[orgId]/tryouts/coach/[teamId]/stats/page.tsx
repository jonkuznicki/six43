'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '../../../../../../../lib/supabase'
import Link from 'next/link'

interface Team { id: string; name: string; age_group: string }
interface Season { id: string; label: string; year: number }
interface ImportJob {
  id: string; status: string; rows_total: number | null
  rows_matched: number | null; rows_unresolved: number | null
  filename: string; completed_at: string | null; created_at: string
}

export default function CoachStatsPage({ params }: { params: { orgId: string; teamId: string } }) {
  const supabase = createClient()
  const fileRef  = useRef<HTMLInputElement>(null)

  const [team,       setTeam]       = useState<Team | null>(null)
  const [season,     setSeason]     = useState<Season | null>(null)
  const [latestJob,  setLatestJob]  = useState<ImportJob | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [uploading,  setUploading]  = useState(false)
  const [dragOver,   setDragOver]   = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: teamData }, { data: seasonData }] = await Promise.all([
      supabase.from('tryout_teams').select('id, name, age_group').eq('id', params.teamId).single(),
      supabase.from('tryout_seasons').select('id, label, year').eq('org_id', params.orgId).eq('is_active', true).maybeSingle(),
    ])
    setTeam(teamData)
    setSeason(seasonData)

    if (teamData) {
      const { data: jobData } = await supabase
        .from('tryout_import_jobs').select('id, status, rows_total, rows_matched, rows_unresolved, filename, completed_at, created_at')
        .eq('org_id', params.orgId).eq('type', 'gc_stats').eq('team_id', params.teamId)
        .order('created_at', { ascending: false }).limit(1).maybeSingle()
      setLatestJob(jobData)
    }
    setLoading(false)
  }

  async function handleFile(file: File) {
    if (!file || !season) return
    if (!file.name.match(/\.(csv|xlsx|xls)$/i)) {
      setUploadError('Please upload a .csv, .xlsx, or .xls file.')
      return
    }
    setUploading(true)
    setUploadError(null)

    const formData = new FormData()
    formData.append('file', file)
    formData.append('orgId', params.orgId)
    formData.append('seasonId', season.id)
    formData.append('seasonYear', String(season.year - 1))
    formData.append('teamId', params.teamId)

    const res  = await fetch('/api/tryouts/imports/gc-stats', { method: 'POST', body: formData })
    const json = await res.json()

    if (!res.ok) {
      setUploadError(json.error ?? 'Upload failed')
    } else {
      await loadData()
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  const statusColor = latestJob?.status === 'complete' ? '#6DB875' : latestJob?.status === 'needs_review' ? '#E8A020' : '#E87060'
  const statusLabel = latestJob?.status === 'complete' ? `✅ Submitted — ${new Date(latestJob.completed_at ?? latestJob.created_at).toLocaleDateString()}` :
                      latestJob?.status === 'needs_review' ? `🟡 Uploaded, needs review (${latestJob.rows_unresolved ?? 0} unresolved)` :
                      latestJob?.status === 'processing' ? '⏳ Processing…' :
                      latestJob ? '❌ Upload failed' : '⬜ Not submitted'

  const s = { muted: `rgba(var(--fg-rgb),0.55)`, dim: `rgba(var(--fg-rgb),0.35)` }

  if (loading) return <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading…</main>

  return (
    <main className="page-wide" style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', padding: '2rem 1.5rem 6rem' }}>
      <Link href={`/org/${params.orgId}/tryouts/coach/${params.teamId}`} style={{ fontSize: '13px', color: s.dim, textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>‹ My Team</Link>

      <h1 style={{ fontSize: '22px', fontWeight: 800, marginBottom: '2px' }}>Season Stats Upload</h1>
      <div style={{ fontSize: '13px', color: s.muted, marginBottom: '2rem' }}>{team?.name} · {season?.label}</div>

      {/* Status */}
      <div style={{
        background: 'var(--bg-card)', border: '0.5px solid var(--border)',
        borderRadius: '10px', padding: '14px 16px', marginBottom: '1.5rem',
        fontSize: '13px', fontWeight: 700,
        color: latestJob ? statusColor : s.dim,
      }}>
        {statusLabel}
        {latestJob && (
          <div style={{ fontSize: '12px', fontWeight: 400, color: s.dim, marginTop: '4px' }}>
            {latestJob.filename}
            {latestJob.rows_total != null ? ` · ${latestJob.rows_total} players` : ''}
            {latestJob.rows_matched != null ? ` · ${latestJob.rows_matched} matched` : ''}
          </div>
        )}
      </div>

      {/* Upload area */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => !uploading && fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border-md)'}`,
          borderRadius: '12px', padding: '3rem 2rem', textAlign: 'center',
          background: dragOver ? 'rgba(232,160,32,0.06)' : 'var(--bg-card)',
          cursor: uploading ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s',
          marginBottom: '1rem',
        }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>📊</div>
        <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>
          {uploading ? 'Uploading…' : 'Drop your GameChanger export here'}
        </div>
        <div style={{ fontSize: '13px', color: s.muted }}>
          or click to choose a .csv or .xlsx file
        </div>
        {uploading && (
          <div style={{ marginTop: '16px', fontSize: '12px', color: s.muted }}>Parsing and matching players…</div>
        )}
      </div>

      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
      />

      {uploadError && (
        <div style={{ padding: '10px 14px', background: 'rgba(232,112,96,0.1)', border: '0.5px solid rgba(232,112,96,0.3)', borderRadius: '8px', fontSize: '13px', color: '#E87060', marginBottom: '1rem' }}>
          {uploadError}
        </div>
      )}

      {latestJob?.status === 'needs_review' && (
        <Link href={`/org/${params.orgId}/tryouts/imports/${latestJob.id}`} style={{
          display: 'block', padding: '12px 16px', borderRadius: '8px',
          background: 'rgba(232,160,32,0.1)', border: '0.5px solid rgba(232,160,32,0.35)',
          color: '#E8A020', textDecoration: 'none', fontWeight: 700, fontSize: '14px',
          textAlign: 'center',
        }}>
          Review unresolved matches →
        </Link>
      )}

      <div style={{ marginTop: '2rem', padding: '14px 16px', background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '10px' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>How to export from GameChanger</div>
        <ol style={{ fontSize: '12px', color: s.muted, margin: 0, paddingLeft: '16px', lineHeight: 1.8 }}>
          <li>Open GameChanger for your team</li>
          <li>Go to Stats → Season stats</li>
          <li>Tap the share/export icon</li>
          <li>Export as CSV</li>
          <li>Upload the file here</li>
        </ol>
      </div>
    </main>
  )
}
