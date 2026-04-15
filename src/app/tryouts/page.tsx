'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface OrgMembership {
  org_id:   string
  role:     string
  org_name: string
  org_sport: string
  season_label: string | null
}

interface OwnedOrg {
  id:    string
  name:  string
  sport: string
  slug:  string
}

const SPORT_OPTIONS = ['Baseball', 'Softball', 'Soccer', 'Basketball', 'Lacrosse', 'Other']

export default function TryoutsHubPage() {
  const supabase = createClient()
  const router   = useRouter()

  const [user,        setUser]        = useState<any>(null)
  const [memberships, setMemberships] = useState<OrgMembership[]>([])
  const [ownedOrgs,   setOwnedOrgs]   = useState<OwnedOrg[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showCreate,  setShowCreate]  = useState(false)

  // Create form
  const [orgName,  setOrgName]  = useState('')
  const [sport,    setSport]    = useState('Baseball')
  const [slug,     setSlug]     = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => { loadData() }, [])

  // Auto-generate slug from org name
  useEffect(() => {
    setSlug(orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
  }, [orgName])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login?next=/tryouts'); return }
    setUser(user)

    // Orgs where this user is a member
    const { data: memberData } = await supabase
      .from('tryout_org_members')
      .select('org_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true)

    // Orgs this user created (admin_user_id)
    const { data: ownedData } = await supabase
      .from('tryout_orgs')
      .select('id, name, sport, slug')
      .eq('admin_user_id', user.id)

    setOwnedOrgs(ownedData ?? [])

    // Collect all org IDs to fetch names
    const memberOrgIds = (memberData ?? []).map((m: any) => m.org_id)
    const ownedOrgIds  = (ownedData ?? []).map((o: any) => o.id)
    const allOrgIds    = Array.from(new Set([...memberOrgIds, ...ownedOrgIds]))

    if (allOrgIds.length > 0) {
      const [{ data: orgsData }, { data: seasonsData }] = await Promise.all([
        supabase.from('tryout_orgs').select('id, name, sport').in('id', allOrgIds),
        supabase.from('tryout_seasons').select('org_id, label').in('org_id', allOrgIds).eq('is_active', true),
      ])

      const orgMap    = new Map((orgsData ?? []).map((o: any) => [o.id, o]))
      const seasonMap = new Map((seasonsData ?? []).map((s: any) => [s.org_id, s.label]))

      // Merge: owned orgs get org_admin role, member orgs get their actual role
      const memberMap = new Map((memberData ?? []).map((m: any) => [m.org_id, m.role]))
      const merged: OrgMembership[] = allOrgIds.map(id => {
        const org = orgMap.get(id)
        return {
          org_id:       id,
          role:         memberMap.get(id) ?? 'org_admin',
          org_name:     org?.name ?? 'Unknown',
          org_sport:    org?.sport ?? '',
          season_label: seasonMap.get(id) ?? null,
        }
      }).filter(m => m.org_name !== 'Unknown')

      setMemberships(merged)
    }

    setLoading(false)
  }

  async function createOrg() {
    if (!orgName.trim() || !slug.trim()) return
    setCreating(true)
    setCreateError(null)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login?next=/tryouts'); return }

    // Check slug availability
    const { data: existing } = await supabase
      .from('tryout_orgs').select('id').eq('slug', slug).maybeSingle()
    if (existing) {
      setCreateError('That URL slug is already taken. Try a different one.')
      setCreating(false)
      return
    }

    const { data: org, error } = await supabase
      .from('tryout_orgs')
      .insert({
        name:          orgName.trim(),
        sport:         sport,
        slug:          slug.trim(),
        admin_user_id: user.id,
      })
      .select('id')
      .single()

    if (error || !org) {
      setCreateError(error?.message ?? 'Failed to create organization.')
      setCreating(false)
      return
    }

    // Add creator as org_admin member record (so invite system works)
    await supabase.from('tryout_org_members').insert({
      org_id:    org.id,
      user_id:   user.id,
      email:     user.email,
      name:      user.user_metadata?.name ?? null,
      role:      'org_admin',
      is_active: true,
    })

    router.push(`/org/${org.id}/tryouts`)
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

  const ROLE_LABELS: Record<string, string> = {
    org_admin: 'Admin', head_coach: 'Head Coach', evaluator: 'Evaluator',
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)', fontFamily: 'sans-serif', maxWidth: '600px', margin: '0 auto', padding: '3rem 1.5rem 6rem' }}>

      <div style={{ fontSize: '24px', fontWeight: 800, marginBottom: '2rem' }}>
        Six<span style={{ color: 'var(--accent)' }}>43</span>
        <span style={{ fontSize: '16px', fontWeight: 400, color: s.muted, marginLeft: '10px' }}>Tryouts</span>
      </div>

      {/* Existing orgs */}
      {memberships.length > 0 && (
        <div style={{ marginBottom: '2.5rem' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: s.muted, marginBottom: '10px' }}>
            Your organizations
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {memberships.map(m => (
              <Link key={m.org_id} href={`/org/${m.org_id}/tryouts`} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                background: 'var(--bg-card)', border: '0.5px solid var(--border)',
                borderRadius: '12px', padding: '1rem 1.25rem', textDecoration: 'none', color: 'var(--fg)',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                    <span style={{ fontWeight: 700, fontSize: '16px' }}>{m.org_name}</span>
                    <span style={{ fontSize: '11px', padding: '1px 7px', borderRadius: '4px', background: 'rgba(var(--fg-rgb),0.07)', color: s.muted, fontWeight: 600 }}>
                      {ROLE_LABELS[m.role] ?? m.role}
                    </span>
                  </div>
                  <div style={{ fontSize: '12px', color: s.dim }}>
                    {m.org_sport}
                    {m.season_label ? ` · ${m.season_label}` : ''}
                  </div>
                </div>
                <span style={{ fontSize: '18px', color: s.dim }}>→</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* No orgs yet */}
      {memberships.length === 0 && !showCreate && (
        <div style={{ textAlign: 'center', padding: '2rem 0 2.5rem' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>No organizations yet</div>
          <div style={{ fontSize: '14px', color: s.muted, marginBottom: '1.5rem' }}>
            Create your organization to get started, or ask your director for an invite link.
          </div>
        </div>
      )}

      {/* Create org */}
      {!showCreate ? (
        <button onClick={() => setShowCreate(true)} style={{
          width: '100%', padding: '13px', borderRadius: '10px', border: '1px dashed var(--border-md)',
          background: 'transparent', color: s.muted, fontSize: '14px', cursor: 'pointer',
          fontFamily: 'sans-serif',
        }}>
          + Create new organization
        </button>
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '14px', padding: '1.5rem' }}>
          <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '1.25rem' }}>Create organization</div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Organization name</label>
            <input
              type="text" value={orgName} onChange={e => setOrgName(e.target.value)}
              placeholder="Hudson Baseball"
              autoFocus
              style={{ width: '100%', boxSizing: 'border-box', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '7px', padding: '10px 12px', fontSize: '15px', color: 'var(--fg)' }}
            />
          </div>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sport</label>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {SPORT_OPTIONS.map(s => (
                <button key={s} onClick={() => setSport(s)} style={{
                  padding: '6px 14px', borderRadius: '20px', border: '0.5px solid',
                  borderColor: sport === s ? 'var(--accent)' : 'var(--border-md)',
                  background: sport === s ? 'rgba(232,160,32,0.1)' : 'var(--bg-input)',
                  color: sport === s ? 'var(--accent)' : 'rgba(var(--fg-rgb),0.55)',
                  fontSize: '13px', fontWeight: sport === s ? 700 : 400, cursor: 'pointer',
                }}>{s}</button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '11px', color: s.dim, display: 'block', marginBottom: '4px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>URL slug</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0', background: 'var(--bg-input)', border: '0.5px solid var(--border-md)', borderRadius: '7px', overflow: 'hidden' }}>
              <span style={{ padding: '10px 10px 10px 12px', fontSize: '13px', color: s.dim, whiteSpace: 'nowrap', flexShrink: 0 }}>six43.com/org/</span>
              <input
                type="text" value={slug} onChange={e => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', padding: '10px 12px 10px 0', fontSize: '13px', color: 'var(--fg)' }}
              />
            </div>
          </div>

          {createError && (
            <div style={{ fontSize: '13px', color: '#E87060', background: 'rgba(192,57,43,0.08)', borderRadius: '6px', padding: '8px 12px', marginBottom: '12px' }}>
              {createError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={createOrg} disabled={creating || !orgName.trim() || !slug.trim()} style={{
              flex: 1, padding: '12px', borderRadius: '8px', border: 'none',
              background: 'var(--accent)', color: 'var(--accent-text)',
              fontSize: '14px', fontWeight: 700, cursor: 'pointer',
              opacity: creating || !orgName.trim() || !slug.trim() ? 0.6 : 1,
            }}>{creating ? 'Creating…' : 'Create organization'}</button>
            <button onClick={() => { setShowCreate(false); setCreateError(null) }} style={{
              padding: '12px 18px', borderRadius: '8px', border: '0.5px solid var(--border-md)',
              background: 'transparent', color: s.muted, fontSize: '14px', cursor: 'pointer',
            }}>Cancel</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '12px', color: s.dim }}>
        Signed in as {user?.email} ·{' '}
        <button onClick={() => supabase.auth.signOut().then(() => router.push('/login'))}
          style={{ background: 'none', border: 'none', color: s.dim, cursor: 'pointer', fontSize: '12px', textDecoration: 'underline', padding: 0 }}>
          Sign out
        </button>
      </div>
    </main>
  )
}
