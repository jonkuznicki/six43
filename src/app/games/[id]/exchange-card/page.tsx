import { createServerClient } from '../../../../lib/supabase-server'
import { redirect } from 'next/navigation'
import ExchangeCardLayout from '../ExchangeCardLayout'
import AutoPrint from './AutoPrint'
import PrintBtn from './PrintBtn'

export default async function ExchangeCardPage({ params }: { params: { id: string } }) {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: game } = await supabase
    .from('games')
    .select('*, season:seasons(team:teams(name))')
    .eq('id', params.id)
    .single()

  if (!game) redirect('/games')

  const teamName: string = (game as any)?.season?.team?.name ?? 'Us'

  const { data: slots } = await supabase
    .from('lineup_slots')
    .select('*, player:players(first_name, last_name, jersey_number)')
    .eq('game_id', params.id)
    .order('batting_order', { ascending: true, nullsFirst: false })

  const activeSlots = (slots ?? []).filter((s: any) => s.availability !== 'absent')

  return (
    <html>
      <head>
        <title>Exchange Card — {teamName} vs {game.opponent}</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          body { background: #fff; font-family: Arial, Helvetica, sans-serif; }
          @media screen {
            body { padding: 24px; background: #f0f2f5; }
            .page-wrap { max-width: 480px; margin: 0 auto; }
            .print-btn {
              display: flex; align-items: center; justify-content: center; gap: 8px;
              background: #0B1F3A; color: #fff; border: none; border-radius: 8px;
              padding: 12px 20px; font-size: 14px; font-weight: 700;
              cursor: pointer; width: 100%; margin-bottom: 20px; letter-spacing: 0.02em;
            }
            .print-btn:hover { background: #162e52; }
          }
          @media print {
            body { padding: 0; background: #fff; }
            .no-print { display: none !important; }
            .page-wrap { max-width: 100%; }
            @page { size: letter portrait; margin: 0.5in 0.6in; }
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
          <ExchangeCardLayout
            game={game}
            activeSlots={activeSlots}
            teamName={teamName}
          />
        </div>
      </body>
    </html>
  )
}
