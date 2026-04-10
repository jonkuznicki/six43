'use client'

import { useEffect } from 'react'

export default function ScrollToToday() {
  useEffect(() => {
    const el = document.getElementById('today-anchor')
    if (el) el.scrollIntoView({ block: 'start' })
  }, [])
  return null
}
