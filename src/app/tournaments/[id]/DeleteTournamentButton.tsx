'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase'

export default function DeleteTournamentButton({ tournamentId }: { tournamentId: string }) {
  const supabase = createClient()
  const router   = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [deleting,   setDeleting]   = useState(false)
  const [error,      setError]      = useState('')

  async function doDelete() {
    setDeleting(true)
    setError('')
    const { error: err } = await supabase
      .from('tournaments')
      .delete()
      .eq('id', tournamentId)
    if (err) {
      setError(err.message)
      setDeleting(false)
      return
    }
    router.push('/games')
    router.refresh()
  }

  if (!confirming) {
    return (
      <button
        onClick={() => setConfirming(true)}
        style={{
          fontSize: '13px', fontWeight: 600, padding: '8px 14px',
          borderRadius: '7px', cursor: 'pointer',
          border: '0.5px solid rgba(232,112,96,0.35)',
          background: 'transparent', color: 'rgba(232,112,96,0.8)',
        }}
      >
        Delete tournament
      </button>
    )
  }

  return (
    <div style={{
      background: 'rgba(232,112,96,0.07)', border: '0.5px solid rgba(232,112,96,0.3)',
      borderRadius: '10px', padding: '14px 16px',
    }}>
      <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '4px', color: '#E87060' }}>
        Delete this tournament?
      </div>
      <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.5)`, marginBottom: '14px', lineHeight: 1.5 }}>
        All placeholder game slots and any associated lineup work will be permanently removed. This cannot be undone.
      </div>
      {error && (
        <div style={{ fontSize: '12px', color: '#E87060', marginBottom: '10px' }}>{error}</div>
      )}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={() => setConfirming(false)}
          disabled={deleting}
          style={{
            flex: 1, padding: '9px', borderRadius: '6px',
            border: '0.5px solid var(--border-md)', background: 'transparent',
            color: `rgba(var(--fg-rgb), 0.5)`, fontSize: '13px', cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={doDelete}
          disabled={deleting}
          style={{
            flex: 2, padding: '9px', borderRadius: '6px', border: 'none',
            background: '#E87060', color: '#fff',
            fontSize: '13px', fontWeight: 700,
            cursor: deleting ? 'not-allowed' : 'pointer',
            opacity: deleting ? 0.7 : 1,
          }}
        >
          {deleting ? 'Deleting…' : 'Yes, delete'}
        </button>
      </div>
    </div>
  )
}
