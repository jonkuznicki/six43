'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

const HIDDEN_PATHS = ['/', '/login']
const DISMISSED_KEY = 'six43-install-dismissed'

export default function InstallPrompt() {
  const pathname = usePathname()
  const [show, setShow] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null)

  useEffect(() => {
    // Already installed or dismissed
    if (localStorage.getItem(DISMISSED_KEY)) return
    // Already running as standalone
    if (window.matchMedia('(display-mode: standalone)').matches) return
    // iOS Safari detection
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream
    const safari = /safari/i.test(navigator.userAgent) && !/chrome/i.test(navigator.userAgent)
    if (ios && safari) {
      setIsIOS(true)
      setShow(true)
      return
    }
    // Android Chrome — wait for beforeinstallprompt
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShow(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1')
    setShow(false)
  }

  async function install() {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setShow(false)
    setDeferredPrompt(null)
  }

  if (HIDDEN_PATHS.includes(pathname) || !show) return null

  return (
    <div style={{
      position: 'fixed', bottom: '72px', left: '50%', transform: 'translateX(-50%)',
      width: 'calc(100% - 2rem)', maxWidth: '440px',
      background: 'var(--bg2)', border: '0.5px solid var(--border-md)',
      borderRadius: '12px', padding: '12px 14px',
      display: 'flex', alignItems: 'center', gap: '10px',
      zIndex: 90, boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
    }}>
      <div style={{ fontSize: '24px', flexShrink: 0 }}>⚾</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '2px' }}>
          Add Six43 to your home screen
        </div>
        <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.5)`, lineHeight: 1.4 }}>
          {isIOS
            ? 'Tap the Share button below, then "Add to Home Screen"'
            : 'Install for quick access on game day'}
        </div>
      </div>
      {!isIOS && deferredPrompt && (
        <button onClick={install} style={{
          flexShrink: 0, padding: '7px 14px', borderRadius: '6px', border: 'none',
          background: 'var(--accent)', color: 'var(--accent-text)',
          fontSize: '12px', fontWeight: 700, cursor: 'pointer',
        }}>Install</button>
      )}
      <button onClick={dismiss} style={{
        flexShrink: 0, background: 'transparent', border: 'none',
        color: `rgba(var(--fg-rgb), 0.35)`, fontSize: '18px',
        cursor: 'pointer', padding: '4px', lineHeight: 1,
      }}>✕</button>
    </div>
  )
}
