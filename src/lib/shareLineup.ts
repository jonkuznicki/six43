/**
 * Captures a DOM element as a PDF and either shares it via the native share
 * sheet (Web Share API with files, supported on iOS 15+ and Android) or falls
 * back to a direct download.
 *
 * html2canvas and jsPDF are loaded dynamically so they don't bloat the initial
 * bundle — they only load when the coach taps "Share Lineup".
 */

export async function shareLineupPdf(
  element: HTMLElement,
  filename: string,
): Promise<void> {
  // Temporarily move the element on-screen (off to the left) so html2canvas
  // can measure and render it. It's normally display:none for print-only use.
  const savedStyle = element.getAttribute('style') ?? ''
  element.setAttribute(
    'style',
    [
      savedStyle,
      'position:fixed !important',
      'left:-9999px !important',
      'top:0 !important',
      'display:block !important',
      'width:680px !important',
      'background:#fff !important',
      'z-index:-9999 !important',
    ].join(';'),
  )

  try {
    const html2canvas = (await import('html2canvas')).default
    const canvas = await html2canvas(element, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    })

    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' })

    const pageW = pdf.internal.pageSize.getWidth()
    const pageH = pdf.internal.pageSize.getHeight()
    const imgH = (canvas.height / canvas.width) * pageW
    // Scale down if content is taller than one letter page
    const scale = imgH > pageH ? pageH / imgH : 1
    const finalW = pageW * scale
    const finalH = imgH * scale
    const xOff = (pageW - finalW) / 2

    pdf.addImage(canvas.toDataURL('image/png'), 'PNG', xOff, 0, finalW, finalH)

    const pdfBlob = pdf.output('blob')
    const pdfFile = new File([pdfBlob], filename, { type: 'application/pdf' })

    // Use the native share sheet when available (iOS Safari 15+, Android Chrome)
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [pdfFile] })
    ) {
      await navigator.share({ files: [pdfFile], title: 'Game Lineup' })
      return
    }

    // Fallback: trigger a file download
    const url = URL.createObjectURL(pdfBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } finally {
    element.setAttribute('style', savedStyle)
  }
}

export function makeLineupFilename(teamName: string, opponent: string, gameDate: string | null): string {
  const date = gameDate ? gameDate.slice(0, 10) : new Date().toISOString().slice(0, 10)
  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `lineup-${slug(teamName || 'team')}-vs-${slug(opponent || 'opponent')}-${date}.pdf`
}
