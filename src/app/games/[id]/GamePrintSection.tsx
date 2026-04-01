'use client'

import PrintLineupCard from './PrintLineupCard'

// Renders ONLY the style block + hidden print sheet.
// The print button lives inside <main> as PrintButton.tsx.
export default function GamePrintSection({ game, slots, teamName }: {
  game: any
  slots: any[]
  teamName?: string
}) {
  const inningCount = game?.innings_played ?? 6
  const innings = Array.from({ length: inningCount }, (_, i) => i)
  const activeSlots = slots.filter((s: any) => s.availability !== 'absent')

  return (
    <>
      <style>{`
        .game-print-sheet { display: none; }
        @media print {
          .game-screen-only { display: none !important; }
          .game-print-sheet { display: block !important; }
          @page { size: letter portrait; margin: 0.3in 0.35in; }
          body { background: white !important; }
        }
      `}</style>
      <div className="game-print-sheet">
        <PrintLineupCard
          game={game}
          activeSlots={activeSlots}
          innings={innings}
          teamName={teamName}
        />
      </div>
    </>
  )
}
