'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../../../../../lib/supabase'

interface Checkin {
  id: string; tryout_number: number; player_id: string | null
  is_write_in: boolean; write_in_name: string | null; write_in_age_group: string | null
}

interface Player {
  id: string; first_name: string; last_name: string
  jersey_number: string | null; prior_team: string | null
}

interface Session {
  id: string; label: string; age_group: string; session_date: string
  start_time: string | null; field: string | null
}

interface Org { name: string }

export default function RosterPrintPage({ params }: { params: { orgId: string; sessionId: string } }) {
  const supabase = createClient()
  const [session,  setSession]  = useState<Session | null>(null)
  const [org,      setOrg]      = useState<Org | null>(null)
  const [checkins, setCheckins] = useState<Checkin[]>([])
  const [players,  setPlayers]  = useState<Player[]>([])
  const [loading,  setLoading]  = useState(true)

  useEffect(() => {
    async function load() {
      const { data: sess } = await supabase
        .from('tryout_sessions').select('id, label, age_group, session_date, start_time, field')
        .eq('id', params.sessionId).single()
      setSession(sess)

      const [{ data: orgData }, { data: cData }, { data: pData }] = await Promise.all([
        supabase.from('tryout_orgs').select('name').eq('id', params.orgId).single(),
        supabase.from('tryout_checkins').select('*')
          .eq('session_id', params.sessionId).order('tryout_number'),
        supabase.from('tryout_players').select('id, first_name, last_name, jersey_number, prior_team')
          .eq('org_id', params.orgId).eq('is_active', true),
      ])
      setOrg(orgData)
      setCheckins(cData ?? [])
      setPlayers(pData ?? [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>Loading…</div>

  const playerMap = new Map(players.map(p => [p.id, p]))

  const dateStr = session
    ? new Date(session.session_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : ''

  return (
    <>
      <style>{`
        @media screen {
          body { background: #f5f5f5; }
          .print-page { background: white; max-width: 8.5in; margin: 20px auto; padding: 0.75in; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
          .no-print { display: block; margin: 16px auto; max-width: 8.5in; text-align: right; }
        }
        @media print {
          body { margin: 0; background: white; }
          .print-page { padding: 0.5in; }
          .no-print { display: none; }
        }
        table { width: 100%; border-collapse: collapse; font-family: 'Arial', sans-serif; }
        th { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; padding: 6px 8px; border-bottom: 2px solid black; text-align: left; }
        td { font-size: 13px; padding: 7px 8px; border-bottom: 1px solid #e0e0e0; }
        tr:nth-child(even) td { background: #fafafa; }
        .num { font-weight: 700; font-size: 15px; text-align: center; }
        .notes-col { width: 160px; }
        h1 { font-size: 20px; font-weight: 700; margin: 0 0 2px; }
        h2 { font-size: 14px; font-weight: 400; margin: 0 0 16px; color: #444; }
      `}</style>

      <div className="no-print">
        <button onClick={() => window.print()} style={{ padding: '8px 18px', borderRadius: '6px', background: '#222', color: 'white', border: 'none', cursor: 'pointer', fontSize: '14px' }}>
          ⎙ Print
        </button>
      </div>

      <div className="print-page">
        <div style={{ marginBottom: '20px' }}>
          <h1>{org?.name} — {session?.age_group} Tryouts</h1>
          <h2>
            {session?.label}
            {dateStr ? ` · ${dateStr}` : ''}
            {session?.start_time ? ` · ${session.start_time}` : ''}
            {session?.field ? ` · ${session.field}` : ''}
          </h2>
        </div>

        {checkins.length === 0 ? (
          <p style={{ color: '#666', fontStyle: 'italic' }}>No players checked in yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th style={{ width: '48px' }}>#</th>
                <th>Player Name</th>
                <th>Prior Team</th>
                <th className="notes-col">Notes</th>
              </tr>
            </thead>
            <tbody>
              {checkins.map(c => {
                const player = c.player_id ? playerMap.get(c.player_id) : null
                const name = c.is_write_in
                  ? `${c.write_in_name ?? ''} *`
                  : player ? `${player.first_name} ${player.last_name}` : '—'
                const team = c.is_write_in ? (c.write_in_age_group ?? '—') : (player?.prior_team ?? '—')
                return (
                  <tr key={c.id}>
                    <td className="num">{c.tryout_number}</td>
                    <td style={{ fontWeight: 600 }}>{name}</td>
                    <td style={{ color: '#555' }}>{team}</td>
                    <td className="notes-col"> </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}

        <div style={{ marginTop: '24px', fontSize: '10px', color: '#888' }}>
          {checkins.length} players · Generated {new Date().toLocaleDateString()}
          {checkins.some(c => c.is_write_in) && '  *Write-in (not pre-registered)'}
        </div>
      </div>
    </>
  )
}
