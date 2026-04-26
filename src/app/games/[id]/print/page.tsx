import { createServerClient } from '../../../../lib/supabase-server'
import { redirect } from 'next/navigation'
import PrintLineupCard from '../PrintLineupCard'
import ExchangeCardLayout from '../ExchangeCardLayout'
import PrintControls from './PrintControls'

export default async function PrintPage({ params }: { params: { id: string } }) {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: game }, { data: slots }] = await Promise.all([
    supabase.from('games').select('*, season:seasons(team:teams(name))').eq('id', params.id).single(),
    supabase.from('lineup_slots').select('*, player:players(first_name, last_name, jersey_number)')
      .eq('game_id', params.id).order('batting_order', { ascending: true, nullsFirst: false }),
  ])

  if (!game) redirect('/games')

  const teamName: string = (game as any)?.season?.team?.name ?? 'Us'
  const inningCount = game.innings_played ?? 6
  const innings = Array.from({ length: inningCount }, (_, i) => i)
  const activeSlots = (slots ?? []).filter((s: any) => s.availability !== 'absent')

  return (
    <html>
      <head>
        <title>Lineup — {teamName} vs {game.opponent}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff; font-family: Arial, Helvetica, sans-serif; }

          @media screen {
            body { padding: 20px; background: #f0f2f5; }
            .page-wrap { max-width: 720px; margin: 0 auto; }
            .section-label {
              font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
              text-transform: uppercase; color: #999; margin-bottom: 10px; margin-top: 32px;
            }
          }

          @media print {
            body { padding: 0; background: #fff; }
            .no-print { display: none !important; }
            .page-wrap { max-width: 100%; }
            @page { size: letter portrait; margin: 0.3in 0.35in; }
            .section-label { display: none; }
            .page-break { page-break-before: always; }

            /* Selective printing via data-print attribute */
            body[data-print="lineup"]   .section-exchange { display: none !important; }
            body[data-print="exchange"] .section-lineup   { display: none !important; }
          }
        `}</style>
      </head>
      <body>
        <div className="page-wrap">
          <div className="no-print" style={{ marginBottom: '16px' }}>
            <a href={`/games/${params.id}`} style={{ fontSize: '13px', color: '#888', textDecoration: 'none' }}>
              ‹ Back to game
            </a>
          </div>

          {/* Print controls — two separate buttons */}
          <PrintControls />

          {/* Page 1: Lineup sheet */}
          <div className="section-lineup">
            <div className="section-label no-print">Lineup sheet</div>
            <PrintLineupCard
              game={game}
              activeSlots={activeSlots}
              innings={innings}
              teamName={teamName}
            />
          </div>

          {/* Page 2: Exchange card */}
          <div className="section-exchange page-break">
            <div className="section-label no-print">Exchange card — hand to opposing coach</div>
            <ExchangeCardLayout
              game={game}
              activeSlots={activeSlots}
              teamName={teamName}
            />
          </div>
        </div>
      </body>
    </html>
  )
}
