'use client'

export default function PrintControls() {
  function printSection(mode: 'lineup' | 'exchange' | 'both') {
    if (mode === 'both') {
      document.body.removeAttribute('data-print')
    } else {
      document.body.setAttribute('data-print', mode)
    }
    window.print()
    setTimeout(() => document.body.removeAttribute('data-print'), 1000)
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
    </div>
  )
}

function btnStyle(bg: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: '6px',
    background: bg, color: '#fff', border: 'none', borderRadius: '8px',
    padding: '11px 18px', fontSize: '13px', fontWeight: 700,
    cursor: 'pointer', letterSpacing: '0.02em',
  }
}
