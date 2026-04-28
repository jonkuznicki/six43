'use client'

import { useEffect } from 'react'

export default function ScrollToToday({ hasPastGames }: { hasPastGames: boolean }) {
  useEffect(() => {
    if (!hasPastGames) return
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById('today-anchor')
      if (!el) return
      const sticky = document.getElementById('games-sticky-bar')
      const offset = sticky ? sticky.offsetHeight : 0
      const top = el.getBoundingClientRect().top + window.scrollY - offset
      window.scrollTo({ top, behavior: 'instant' })
    }))
  }, [hasPastGames])
  return null
}
