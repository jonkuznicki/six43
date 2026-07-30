'use client'

import Link from 'next/link'
import React from 'react'

// Shared page header for Tryouts module screens: back-link, title, optional
// subtitle, optional right-aligned action. Extracted from the pattern
// already used on Data Hub / Rankings / Teams / Action Items so every
// screen stops hand-rolling its own header markup.

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel = '‹ Tryouts',
  action,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  backHref?: string
  backLabel?: string
  action?: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: '1.5rem' }}>
      {backHref && (
        <Link
          href={backHref}
          style={{
            fontSize: 13,
            color: 'rgba(var(--fg-rgb),0.35)',
            textDecoration: 'none',
            display: 'block',
            marginBottom: '0.9rem',
          }}
        >
          {backLabel}
        </Link>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, marginBottom: subtitle ? 2 : 0 }}>{title}</h1>
          {subtitle && <p style={{ fontSize: 13, color: 'rgba(var(--fg-rgb),0.55)', margin: 0 }}>{subtitle}</p>}
        </div>
        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>
    </div>
  )
}
