'use client'

export default function PrintBtn() {
  return (
    <button
      className="print-btn no-print"
      onClick={() => window.print()}
    >
      🖨 Print / Save as PDF
    </button>
  )
}
