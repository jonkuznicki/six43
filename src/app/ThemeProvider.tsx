'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '../lib/supabase'

type Theme = 'dark' | 'light'

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'dark',
  toggle: () => {},
})

export function useTheme() { return useContext(ThemeCtx) }

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>('dark')

  useEffect(() => {
    async function init() {
      // Apply localStorage immediately to avoid flash
      const local = localStorage.getItem('six43-theme') as Theme | null
      const localTheme = local ?? 'dark'
      setTheme(localTheme)
      document.documentElement.setAttribute('data-theme', localTheme)

      // Then check auth metadata — overrides localStorage so theme follows the user
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      const authTheme = user?.user_metadata?.theme as Theme | undefined
      if (authTheme && authTheme !== localTheme) {
        setTheme(authTheme)
        localStorage.setItem('six43-theme', authTheme)
        document.documentElement.setAttribute('data-theme', authTheme)
      }
    }
    init()
  }, [])

  function toggle() {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark'
      localStorage.setItem('six43-theme', next)
      document.documentElement.setAttribute('data-theme', next)
      // Persist to auth metadata (fire and forget — no need to await)
      const supabase = createClient()
      supabase.auth.updateUser({ data: { theme: next } })
      return next
    })
  }

  return (
    <ThemeCtx.Provider value={{ theme, toggle }}>
      {children}
    </ThemeCtx.Provider>
  )
}
