'use client'

import { useEffect } from 'react'

export default function AutoPrint() {
  useEffect(() => {
    // Small delay so styles are applied before print dialog opens
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [])

  return null
}
