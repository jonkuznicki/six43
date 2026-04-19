'use client'

import { useState } from 'react'

export default function HowItWorks() {
  const [open, setOpen] = useState(false)

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', padding: '10px 14px', borderRadius: '8px',
          border: '0.5px solid var(--border)', background: 'var(--bg-card)',
          color: `rgba(var(--fg-rgb), 0.5)`, fontSize: '13px', fontWeight: 600,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          textAlign: 'left',
        }}
      >
        <span>How does this work?</span>
        <span style={{ fontSize: '10px', opacity: 0.6 }}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div style={{
          background: 'var(--bg-card)', border: '0.5px solid var(--border)',
          borderTop: 'none', borderRadius: '0 0 8px 8px',
          padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[
              { n: '1', label: 'Add placeholder game slots', body: 'Use the buttons below to add slots for pool play and bracket rounds — before the schedule is confirmed.' },
              { n: '2', label: 'Build lineups now', body: 'Tap "Lineup →" on any slot to start building. You don\'t need to know your opponent yet — the roster and innings are all set up.' },
              { n: '3', label: 'Swap when the bracket drops', body: 'Once you have real game details from GameChanger, tap "Swap with imported game." Your lineup carries over automatically.' },
            ].map(({ n, label, body }) => (
              <div key={n} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                  background: 'rgba(var(--fg-rgb), 0.07)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', fontWeight: 800, color: `rgba(var(--fg-rgb), 0.4)`,
                }}>{n}</div>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px' }}>{label}</div>
                  <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.5)`, lineHeight: 1.5 }}>{body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
