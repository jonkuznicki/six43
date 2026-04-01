'use client'

import { useState } from 'react'
import { createClient } from '../../../lib/supabase'

const STATUS_CONFIG: Record<string, { bg: string; color: string; label: string; next: string }> = {
  scheduled:   { bg: 'var(--bg-card)', color: `rgba(var(--fg-rgb), 0.5)`, label: 'Planned',  next: 'final' },
  in_progress: { bg: 'rgba(232,160,32,0.2)',   color: '#E8A020',          label: 'Live',     next: 'final' },
  final:       { bg: 'rgba(45,106,53,0.2)',    color: '#6DB875',          label: 'Finished', next: 'scheduled' },
}

export default function GameStatusToggle({ gameId, initialStatus }: { gameId: string; initialStatus: string }) {
  const supabase = createClient()
  const [status, setStatus] = useState(initialStatus)
  const [saving, setSaving] = useState(false)

  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.scheduled

  async function toggle() {
    if (saving) return
    const next = cfg.next
    setSaving(true)
    setStatus(next)
    await supabase.from('games').update({ status: next }).eq('id', gameId)
    setSaving(false)
  }

  return (
    <button
      onClick={toggle}
      disabled={saving}
      title="Toggle game status"
      style={{
        fontSize: '11px',
        fontWeight: 500,
        padding: '3px 10px',
        borderRadius: '4px',
        background: cfg.bg,
        color: cfg.color,
        border: `0.5px solid ${cfg.color}44`,
        cursor: 'pointer',
        opacity: saving ? 0.6 : 1,
      }}
    >
      {cfg.label}
    </button>
  )
}
