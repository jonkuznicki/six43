'use client'

import { useEffect } from 'react'

export default function TryoutsLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    document.body.classList.add('tryout-fullscreen')
    return () => document.body.classList.remove('tryout-fullscreen')
  }, [])

  return <>{children}</>
}
