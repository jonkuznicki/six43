'use client'

import { useState } from 'react'
import { shareLineupPdf } from '../../../../lib/shareLineup'

export default function PrintControls({ filename }: { filename: string }) {
  const [sharing, setSharing] = useState(false)

  function printSection(mode: 'lineup' | 'exchange' | 'both') {
    if (mode === 'both') {
      document.body.removeAttribute('data-print')
    } else {
      document.body.setAttribute('data-print', mode)
    }
    window.print()
    setTimeout(() => document.body.removeAttribute('data-print'), 1000)
  }

  async function handleShare() {
    const el = document.querySelector<HTMLElement>('.section-lineup')
    if (!el) return
    setSharing(true)
    try {
      await shareLineupPdf(el, filename)
    } catch (err: any) {
      if (err?.name !== 'AbortError') console.error('Share failed:', err)
    } finally {
      setSharing(false)
    }
  }

  return (
    <div className="no-print" style={{
      display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap',
    }}>
      <button onClick={() => printSection('lineup')} style={btnStyle('#0B1F3A')}>
        🖨 Print Lineup Sheet
      </button>
      <button onClick={() => printSection('exchange')} style={btnStyle('#1a5c20')}>
        🖨 Print Exchange Card
      </button>
      <button onClick={() => printSection('both')} style={btnStyle('#555')}>
        🖨 Print Both
      </button>
      <button onClick={handleShare} disabled={sharing} style={btnStyle('#1a4a7a', sharing)}>
        {sharing ? '…' : '⬆ Share Lineup'}
      </button>
    </div>
  )
}

function btnStyle(bg: string, disabled = false): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: '6px',
    background: disabled ? '#888' : bg,
    color: '#fff', border: 'none', borderRadius: '8px',
    padding: '11px 18px', fontSize: '13px', fontWeight: 700,
    cursor: disabled ? 'default' : 'pointer', letterSpacing: '0.02em',
    opacity: disabled ? 0.7 : 1,
  }
}
