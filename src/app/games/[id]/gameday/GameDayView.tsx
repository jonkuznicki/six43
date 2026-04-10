'use client'

import { useState } from 'react'
import Link from 'next/link'

const POS_COLORS: Record<string, { bg: string; color: string }> = {
  P:    { bg: '#7C4D00', color: '#FFC040' },
  C:    { bg: '#6B1040', color: '#FFB0D0' },
  '1B': { bg: '#0F3070', color: '#80C0FF' },
  '2B': { bg: '#0F3070', color: '#80C0FF' },
  SS:   { bg: '#0F3070', color: '#80C0FF' },
  '3B': { bg: '#0F3070', color: '#80C0FF' },
  LF:   { bg: '#0D4020', color: '#60D080' },
  CF:   { bg: '#0D4020', color: '#60D080' },
  LC:   { bg: '#0D4020', color: '#60D080' },
  RC:   { bg: '#0D4020', color: '#60D080' },
  RF:   { bg: '#0D4020', color: '#60D080' },
}

export default function GameDayView({
  game, slots, inningCount, teamName,
}: {
  game: any
  slots: any[]
  inningCount: number
  teamName: string
}) {
  const [inning, setInning] = useState(0)

  return (
    <div style={{
      minHeight: '100vh',
      background: '#050D1A',
      color: '#F0F4FF',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      display: 'flex',
      flexDirection: 'column',
    }}>

      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0,
      }}>
        <Link href={`/games/${game.id}`} style={{
          fontSize: '13px', color: 'rgba(255,255,255,0.35)',
          textDecoration: 'none', padding: '6px 0',
        }}>
          ‹ Back
        </Link>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#F0F4FF', letterSpacing: '0.03em' }}>
            {teamName} vs {game.opponent}
          </div>
        </div>
        <div style={{ width: '40px' }} />
      </div>

      {/* Inning selector */}
      <div style={{
        display: 'flex', gap: '6px', padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        flexShrink: 0, overflowX: 'auto',
      }}>
        {Array.from({ length: inningCount }, (_, i) => (
          <button
            key={i}
            onClick={() => setInning(i)}
            style={{
              minWidth: '48px', height: '44px',
              borderRadius: '8px', border: 'none',
              background: inning === i ? '#E8A020' : 'rgba(255,255,255,0.07)',
              color: inning === i ? '#050D1A' : 'rgba(255,255,255,0.5)',
              fontSize: '16px', fontWeight: 800,
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            {i + 1}
          </button>
        ))}
      </div>

      {/* Inning label */}
      <div style={{
        padding: '10px 16px 4px',
        fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
        flexShrink: 0,
      }}>
        Inning {inning + 1} — batting order
      </div>

      {/* Player list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 24px' }}>
        {slots.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.25)', padding: '4rem 0', fontSize: '15px' }}>
            No lineup built yet.
          </div>
        ) : (
          slots.map((slot: any, idx: number) => {
            const player = slot.player
            const pos: string | null = slot.inning_positions?.[inning] ?? null
            const isBench = pos === 'Bench' || pos === null
            const pc = pos && !isBench ? (POS_COLORS[pos] ?? null) : null

            return (
              <div
                key={slot.id}
                style={{
                  display: 'flex', alignItems: 'center', gap: '14px',
                  padding: '12px 10px', marginBottom: '4px',
                  borderRadius: '10px',
                  background: isBench
                    ? 'rgba(255,255,255,0.02)'
                    : 'rgba(255,255,255,0.05)',
                  opacity: isBench ? 0.45 : 1,
                  border: `1px solid ${isBench ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.09)'}`,
                }}
              >
                {/* Batting order */}
                <div style={{
                  width: '24px', textAlign: 'center', flexShrink: 0,
                  fontSize: '12px', fontWeight: 700, color: 'rgba(255,255,255,0.25)',
                }}>
                  {idx + 1}
                </div>

                {/* Jersey */}
                <div style={{
                  width: '32px', textAlign: 'center', flexShrink: 0,
                  fontSize: '13px', fontWeight: 700,
                  color: isBench ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.4)',
                }}>
                  {player?.jersey_number ?? '—'}
                </div>

                {/* Name */}
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontSize: '22px', fontWeight: 700, lineHeight: 1.1,
                    color: isBench ? 'rgba(255,255,255,0.3)' : '#F0F4FF',
                    letterSpacing: '-0.3px',
                  }}>
                    {player?.first_name} {player?.last_name}
                  </div>
                </div>

                {/* Position badge */}
                <div style={{ flexShrink: 0 }}>
                  {isBench ? (
                    <span style={{
                      fontSize: '12px', fontWeight: 700, padding: '5px 10px',
                      borderRadius: '6px', background: 'rgba(255,255,255,0.05)',
                      color: 'rgba(255,255,255,0.2)', letterSpacing: '0.05em',
                    }}>
                      {pos === 'Bench' ? 'BENCH' : '—'}
                    </span>
                  ) : (
                    <span style={{
                      fontSize: '18px', fontWeight: 800, padding: '6px 12px',
                      borderRadius: '8px',
                      background: pc ? pc.bg : 'rgba(255,255,255,0.1)',
                      color: pc ? pc.color : '#F0F4FF',
                      minWidth: '52px', textAlign: 'center', display: 'inline-block',
                      letterSpacing: '0.02em',
                    }}>
                      {pos}
                    </span>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
