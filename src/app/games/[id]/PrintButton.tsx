'use client'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        fontSize: '13px', padding: '10px 16px', borderRadius: '8px',
        border: '0.5px solid var(--border-strong)', background: 'transparent',
        color: `rgba(var(--fg-rgb), 0.55)`, cursor: 'pointer', width: '100%',
      }}
    >
      🖨 Print lineup
    </button>
  )
}
