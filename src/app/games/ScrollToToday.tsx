'use client'

import { useEffect } from 'react'

export default function ScrollToToday({ hasPastGames }: { hasPastGames: boolean }) {
  useEffect(() => {
    if (!hasPastGames) return
    const el = document.getElementById('today-anchor')
    if (el) el.scrollIntoView({ block: 'start' })
  }, [hasPastGames])
  return null
}
