import { createServerClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Link from 'next/link'
import TeamSelect from './TeamSelect'
import ScrollToToday from './ScrollToToday'
import GameCard from './GameCard'
import SyncPanel from './SyncPanel'

export const dynamic = 'force-dynamic'

export default async function GamesPage({
  searchParams,
}: {
  searchParams: { teamId?: string }
}) {
  const supabase = await createServerClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch teams and the selected-team cookie in parallel
  const [{ data: allTeams }, cookieStore] = await Promise.all([
    supabase.from('teams').select('id, name, is_active').order('created_at'),
    cookies(),
  ])

  const teams = (allTeams ?? []).filter(t => t.is_active !== false)

  // Brand-new user with no teams — send them through the setup wizard
  if (teams.length === 0) redirect('/setup')

  const cookieTeamId = cookieStore.get('selected_team_id')?.value ?? null

  const selectedTeamId =
    (searchParams.teamId && teams.find(t => t.id === searchParams.teamId))
      ? searchParams.teamId
      : (cookieTeamId && teams.find(t => t.id === cookieTeamId))
        ? cookieTeamId
        : teams[0]?.id ?? null

  const selectedTeam = teams.find(t => t.id === selectedTeamId) ?? null

  const { data: season } = selectedTeamId ? await supabase
    .from('seasons')
    .select('id, name, innings_per_game, webcal_url')
    .eq('team_id', selectedTeamId)
    .eq('is_active', true)
    .maybeSingle() : { data: null }

  // Fetch games, tournaments, and player count in parallel — all only need season.id
  const [
    { data: games },
    { data: tournaments },
    { count: playerCount },
  ] = await Promise.all([
    season
      ? supabase.from('games').select('*').eq('season_id', season.id)
          .order('game_date', { ascending: true })
          .order('game_type', { ascending: false, nullsFirst: false })
          .order('game_time', { ascending: true, nullsFirst: false })
      : Promise.resolve({ data: [] as any[], error: null }),
    season
      ? supabase.from('tournaments').select('id, name, start_date, end_date').eq('season_id', season.id)
      : Promise.resolve({ data: [] as any[], error: null }),
    season
      ? supabase.from('players').select('id', { count: 'exact', head: true }).eq('season_id', season.id).eq('status', 'active')
      : Promise.resolve({ count: 0, data: null, error: null }),
  ])

  const tournamentMap: Record<string, any> = Object.fromEntries(
    (tournaments ?? []).map((t: any) => [t.id, t])
  )

  const allGames = games ?? []
  const today = new Date().toISOString().split('T')[0]
  const firstUpcomingIdx = allGames.findIndex(g => g.game_date > today || (g.game_date === today && g.status !== 'final'))
  const teamName = selectedTeam?.name ?? 'Us'

  const showGettingStarted = teams.length === 0 || !season || allGames.length === 0

  const steps = [
    {
      label: 'Create your team',
      detail: 'Add your team name and set up positions in Settings.',
      done: teams.length > 0,
      href: '/settings',
      cta: 'Go to Settings',
    },
    {
      label: 'Activate a season',
      detail: 'Create a season for your team so you can schedule games.',
      done: !!season,
      href: '/settings',
      cta: 'Go to Settings',
    },
    {
      label: 'Add players to your roster',
      detail: 'Add each player so they appear in the lineup builder.',
      done: (playerCount ?? 0) > 0,
      href: '/roster',
      cta: 'Go to Roster',
    },
    {
      label: 'Schedule your first game',
      detail: 'Create a game and build your first lineup.',
      done: (games ?? []).length > 0,
      href: selectedTeamId ? `/games/new?teamId=${selectedTeamId}` : '/games/new',
      cta: 'New game',
    },
  ]

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', padding: '1.5rem 1.5rem 6rem',
      maxWidth: '480px', margin: '0 auto',
    }}>

      {/* Header */}
      {season && (
        <div style={{ marginBottom: '0.25rem' }}>
          <span style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)` }}>
            {season.name}
          </span>
        </div>
      )}

      <TeamSelect teams={teams} selectedTeamId={selectedTeamId} />

      {teams.length === 1 && (
        <p style={{ color: `rgba(var(--fg-rgb), 0.45)`, fontSize: '13px', marginBottom: '1.5rem' }}>
          {selectedTeam?.name} · {games?.length ?? 0} games
        </p>
      )}

      {/* Getting started */}
      {showGettingStarted && (
        <div style={{
          background: 'var(--bg-card)',
          border: '0.5px solid var(--border)',
          borderRadius: '12px',
          padding: '16px',
          marginBottom: '1.5rem',
        }}>
          <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '12px' }}>
            Getting started
          </div>
          {steps.map((step, i) => {
            const isNext = !step.done && steps.slice(0, i).every(s => s.done)
            return (
              <div key={step.label} style={{
                display: 'flex', gap: '10px', alignItems: 'flex-start',
                marginBottom: i < steps.length - 1 ? '12px' : 0,
                opacity: !step.done && !isNext ? 0.35 : 1,
              }}>
                {/* Step indicator */}
                <div style={{
                  width: '20px', height: '20px', borderRadius: '50%', flexShrink: 0,
                  marginTop: '1px',
                  background: step.done
                    ? 'rgba(109,184,117,0.2)'
                    : isNext ? 'rgba(232,160,32,0.15)' : 'var(--bg-input)',
                  border: `0.5px solid ${step.done ? '#6DB875' : isNext ? 'var(--accent)' : 'var(--border-md)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', fontWeight: 700,
                  color: step.done ? '#6DB875' : isNext ? 'var(--accent)' : `rgba(var(--fg-rgb), 0.3)`,
                }}>
                  {step.done ? '✓' : i + 1}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, marginBottom: '2px',
                    color: step.done ? `rgba(var(--fg-rgb), 0.5)` : 'var(--fg)',
                    textDecoration: step.done ? 'line-through' : 'none',
                  }}>
                    {step.label}
                  </div>
                  {!step.done && (
                    <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.45)`, marginBottom: isNext ? '6px' : 0 }}>
                      {step.detail}
                    </div>
                  )}
                  {isNext && (
                    <Link href={step.href} style={{
                      display: 'inline-block', fontSize: '11px', fontWeight: 700,
                      color: 'var(--accent-text)', background: 'var(--accent)',
                      padding: '4px 10px', borderRadius: '4px', textDecoration: 'none',
                    }}>
                      {step.cta} →
                    </Link>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {teams.length > 0 && (
        <>
          {/* No active season */}
          {!season && (
            <div style={{
              fontSize: '13px', color: '#E87060', background: 'rgba(192,57,43,0.10)',
              border: '0.5px solid rgba(192,57,43,0.25)', borderRadius: '8px',
              padding: '12px 14px', marginBottom: '1.25rem',
            }}>
              No active season for {selectedTeam?.name}.{' '}
              <Link href="/settings" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                Set one up in Settings →
              </Link>
            </div>
          )}

          {/* Buttons — sticky below app header */}
          {season && (
            <div id="games-sticky-bar" style={{
              position: 'sticky', top: 'var(--sticky-content-top)', zIndex: 30,
              background: 'var(--nav-bg)',
              backdropFilter: 'blur(14px)',
              WebkitBackdropFilter: 'blur(14px)',
              borderBottom: '0.5px solid var(--border)',
              paddingTop: '0.75rem', paddingBottom: '0.75rem',
              marginLeft: '-1.5rem', marginRight: '-1.5rem',
              paddingLeft: '1.5rem', paddingRight: '1.5rem',
              marginBottom: '0.75rem',
            }}>
              {/* Row 1: New game (full width) */}
              <div style={{ marginBottom: '8px' }}>
                <Link
                  href={`/games/new${selectedTeamId ? `?teamId=${selectedTeamId}` : ''}`}
                  style={{ textDecoration: 'none', display: 'block' }}
                >
                  <div style={{
                    background: 'var(--accent)', color: 'var(--accent-text)', borderRadius: '8px',
                    padding: '12px 16px', textAlign: 'center', fontWeight: 700, fontSize: '14px',
                  }}>+ New game</div>
                </Link>
              </div>

              {/* Row 2: Tournament + Playing time */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                <Link
                  href={`/tournaments/new${selectedTeamId ? `?teamId=${selectedTeamId}` : ''}`}
                  style={{ textDecoration: 'none', flex: 1 }}
                >
                  <div style={{
                    background: 'var(--bg-card)', color: `rgba(var(--fg-rgb), 0.7)`,
                    borderRadius: '8px', padding: '12px 16px', textAlign: 'center',
                    fontSize: '13px', border: '0.5px solid var(--border-md)', whiteSpace: 'nowrap',
                  }}>🏆 Tournament</div>
                </Link>
                <Link href="/fairness" style={{ textDecoration: 'none', flex: 1 }}>
                  <div style={{
                    background: 'var(--bg-card)', color: `rgba(var(--fg-rgb), 0.7)`,
                    borderRadius: '8px', padding: '12px 16px', textAlign: 'center',
                    fontSize: '13px', border: '0.5px solid var(--border-md)', whiteSpace: 'nowrap',
                  }}>Playing time</div>
                </Link>
              </div>

              {/* Row 2: GameChanger sync (if connected) or import link */}
              {(season as any).webcal_url ? (
                <SyncPanel seasonId={season.id} teamId={selectedTeamId} />
              ) : (
                <Link href={`/games/import${selectedTeamId ? `?teamId=${selectedTeamId}` : ''}`} style={{ textDecoration: 'none', display: 'block' }}>
                  <div style={{
                    borderRadius: '8px', padding: '10px 16px', textAlign: 'center',
                    fontSize: '13px', border: '0.5px solid var(--border-md)',
                    color: `rgba(var(--fg-rgb), 0.6)`, background: 'transparent',
                  }}>↓ Import / connect GameChanger</div>
                </Link>
              )}
            </div>
          )}

          {/* All games in chronological order, scroll to today on load */}
          {allGames.length > 0 && (
            <>
              <ScrollToToday hasPastGames={firstUpcomingIdx > 0} />
              {(() => {
                const shownTournamentIds = new Set<string>()
                // Pre-compute last index for each tournament so we can close the box
                const tournamentLastIdx: Record<string, number> = {}
                allGames.forEach((g, i) => {
                  if (g.tournament_id) tournamentLastIdx[g.tournament_id] = i
                })

                return allGames.map((g, idx) => {
                  const showTournamentHeader = g.tournament_id && !shownTournamentIds.has(g.tournament_id)
                  if (showTournamentHeader) shownTournamentIds.add(g.tournament_id)
                  const tournament = g.tournament_id ? tournamentMap[g.tournament_id] : null
                  const isLastInTournament = g.tournament_id && tournamentLastIdx[g.tournament_id] === idx

                  return (
                    <div key={g.id}>
                      {idx === firstUpcomingIdx && (
                        <div id="today-anchor" style={{
                          fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
                          textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`,
                          marginBottom: '8px',
                          marginTop: idx > 0 ? '1.5rem' : 0,
                        }}>
                          Upcoming
                        </div>
                      )}
                      {showTournamentHeader && tournament && (
                        <Link href={`/tournaments/${g.tournament_id}`} style={{ textDecoration: 'none', display: 'block' }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '8px 12px',
                            borderRadius: '8px 8px 0 0', marginBottom: '0',
                            marginTop: idx > 0 ? '0.5rem' : 0,
                            background: 'rgba(232,160,32,0.07)',
                            borderTop: '0.5px solid rgba(232,160,32,0.25)',
                            borderLeft: '0.5px solid rgba(232,160,32,0.25)',
                            borderRight: '0.5px solid rgba(232,160,32,0.25)',
                          }}>
                            <div>
                              <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent)',
                                textTransform: 'uppercase', letterSpacing: '0.07em', marginRight: '8px' }}>
                                Tournament
                              </span>
                              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--fg)' }}>
                                {tournament.name}
                              </span>
                            </div>
                            <span style={{ fontSize: '12px', color: 'var(--accent)' }}>›</span>
                          </div>
                        </Link>
                      )}
                      <div style={g.tournament_id ? {
                        borderLeft: '0.5px solid rgba(232,160,32,0.25)',
                        borderRight: '0.5px solid rgba(232,160,32,0.25)',
                        padding: '0 4px',
                      } : {}}>
                        <GameCard game={g} teamName={teamName} />
                      </div>
                      {isLastInTournament && tournament && (
                        <Link href={`/tournaments/${g.tournament_id}`} style={{ textDecoration: 'none', display: 'block' }}>
                          <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                            padding: '6px 12px',
                            borderRadius: '0 0 8px 8px',
                            background: 'rgba(232,160,32,0.04)',
                            borderBottom: '0.5px solid rgba(232,160,32,0.25)',
                            borderLeft: '0.5px solid rgba(232,160,32,0.25)',
                            borderRight: '0.5px solid rgba(232,160,32,0.25)',
                            marginBottom: '0.5rem',
                          }}>
                            <span style={{ fontSize: '11px', color: 'var(--accent)', fontWeight: 600 }}>
                              View tournament →
                            </span>
                          </div>
                        </Link>
                      )}
                    </div>
                  )
                })
              })()}
            </>
          )}
        </>
      )}
    </main>
  )
}
