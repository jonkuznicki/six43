import { createServerClient } from '../../../../lib/supabase-server'
import { redirect } from 'next/navigation'
import PrintLineupCard from '../PrintLineupCard'
import ExchangeCardLayout from '../ExchangeCardLayout'
import AutoPrint from '../exchange-card/AutoPrint'
import PrintBtn from '../exchange-card/PrintBtn'

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
            .print-btn {
              display: flex; align-items: center; justify-content: center; gap: 8px;
              background: #0B1F3A; color: #fff; border: none; border-radius: 8px;
              padding: 12px 20px; font-size: 14px; font-weight: 700;
              cursor: pointer; width: 100%; margin-bottom: 20px; letter-spacing: 0.02em;
            }
            .print-btn:hover { background: #162e52; }
            .section-label {
              font-size: 10px; font-weight: 700; letter-spacing: 0.1em;
              text-transform: uppercase; color: #999; margin-bottom: 10px;
            }
            .section-gap { margin-top: 32px; }
          }
          @media print {
            body { padding: 0; background: #fff; }
            .no-print { display: none !important; }
            .page-wrap { max-width: 100%; }
            @page { size: letter portrait; margin: 0.3in 0.35in; }
            .page-break { page-break-before: always; margin-top: 0; }
            .section-label { display: none; }
          }
        `}</style>
      </head>
      <body>
        <AutoPrint />
        <div className="page-wrap">
          <div className="no-print" style={{ marginBottom: '16px' }}>
            <a href={`/games/${params.id}`} style={{ fontSize: '13px', color: '#888', textDecoration: 'none' }}>
              ‹ Back to game
            </a>
          </div>
          <PrintBtn />

          {/* Page 1: Full lineup sheet */}
          <PrintLineupCard
            game={game}
            activeSlots={activeSlots}
            innings={innings}
            teamName={teamName}
          />

          {/* Page 2: Exchange card */}
          <div className="page-break section-gap">
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
