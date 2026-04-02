'use client'

import { useState } from 'react'
import { createClient } from '../../../lib/supabase'

export default function ShareButton({ gameId, initialToken }: {
  gameId: string
  initialToken: string | null
}) {
  const supabase = createClient()
  const [token, setToken] = useState(initialToken)
  const [generating, setGenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)

  const shareUrl = token
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/share/${token}`
    : null

  async function generate() {
    setGenerating(true)
    const newToken = crypto.randomUUID()
    await supabase.from('games').update({ share_token: newToken }).eq('id', gameId)
    setToken(newToken)
    setGenerating(false)
  }

  async function revoke() {
    await supabase.from('games').update({ share_token: null }).eq('id', gameId)
    setToken(null)
  }

  async function copy() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <>
      <button onClick={() => setOpen(true)} style={{
        fontSize: '13px', fontWeight: 600, padding: '7px 14px', borderRadius: '6px',
        border: '0.5px solid var(--border-strong)', background: 'transparent',
        color: token ? 'var(--accent)' : `rgba(var(--fg-rgb), 0.55)`,
        cursor: 'pointer',
      }}>
        {token ? '🔗 Shared' : '🔗 Share'}
      </button>

      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 200,
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'var(--bg2)', borderRadius: '16px 16px 0 0',
            padding: '1.25rem 1rem 2.5rem', width: '100%', maxWidth: '480px',
            border: '0.5px solid var(--border)',
          }}>
            <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '4px' }}>Share lineup</div>
            <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '1.25rem' }}>
              Anyone with the link can view the lineup without logging in.
            </div>

            {token ? (
              <>
                {/* URL display */}
                <div style={{
                  display: 'flex', gap: '8px', alignItems: 'center',
                  background: 'var(--bg-input)', border: '0.5px solid var(--border-md)',
                  borderRadius: '8px', padding: '10px 12px', marginBottom: '12px',
                }}>
                  <span style={{
                    fontSize: '12px', color: `rgba(var(--fg-rgb), 0.6)`,
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {typeof window !== 'undefined' ? window.location.origin : ''}/share/{token}
                  </span>
                  <button onClick={copy} style={{
                    fontSize: '12px', fontWeight: 600, padding: '5px 12px', borderRadius: '4px',
                    border: 'none', background: copied ? 'rgba(45,106,53,0.2)' : 'var(--accent)',
                    color: copied ? '#6DB875' : 'var(--accent-text)', cursor: 'pointer', flexShrink: 0,
                  }}>
                    {copied ? 'Copied!' : 'Copy'}
                  </button>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={revoke} style={{
                    flex: 1, padding: '11px', borderRadius: '6px',
                    border: '0.5px solid rgba(192,57,43,0.3)', background: 'transparent',
                    color: 'rgba(232,100,80,0.7)', fontSize: '13px', cursor: 'pointer',
                  }}>
                    Revoke link
                  </button>
                  <button onClick={() => setOpen(false)} style={{
                    flex: 2, padding: '11px', borderRadius: '6px',
                    border: 'none', background: 'var(--accent)', color: 'var(--accent-text)',
                    fontSize: '13px', fontWeight: 700, cursor: 'pointer',
                  }}>
                    Done
                  </button>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setOpen(false)} style={{
                  flex: 1, padding: '11px', borderRadius: '6px',
                  border: '0.5px solid var(--border-strong)', background: 'transparent',
                  color: `rgba(var(--fg-rgb), 0.6)`, fontSize: '13px', cursor: 'pointer',
                }}>Cancel</button>
                <button onClick={generate} disabled={generating} style={{
                  flex: 2, padding: '11px', borderRadius: '6px', border: 'none',
                  background: 'var(--accent)', color: 'var(--accent-text)',
                  fontSize: '13px', fontWeight: 700,
                  cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.7 : 1,
                }}>{generating ? 'Generating…' : 'Generate link'}</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
