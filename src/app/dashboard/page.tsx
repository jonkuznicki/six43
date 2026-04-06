import { createServerClient } from '../../lib/supabase-server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { formatTime } from '../../lib/formatTime'

function parseRecord(games: any[]): { w: number; l: number } {
  let w = 0, l = 0
  for (const game of games) {
    if (game.status !== 'final') continue
    try {
      const box = JSON.parse(game.notes ?? '{}')._box
      if (!box) continue
      const us   = (box.us   ?? []).reduce((a: number, v: number | null) => a + (v ?? 0), 0)
      const them = (box.them ?? []).reduce((a: number, v: number | null) => a + (v ?? 0), 0)
      if (us > them) w++
      else if (them > us) l++
    } catch {}
  }
  return { w, l }
}

function getBoxScore(game: any): { us: number; them: number } | null {
  try {
    const box = JSON.parse(game.notes ?? '{}')._box
    if (!box) return null
    return {
      us:   (box.us   ?? []).reduce((a: number, v: number | null) => a + (v ?? 0), 0),
      them: (box.them ?? []).reduce((a: number, v: number | null) => a + (v ?? 0), 0),
    }
  } catch { return null }
}

function formatDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export default async function Dashboard() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: season } = await supabase
    .from('seasons')
    .select('id, name, innings_per_game, teams(id, name)')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const team = (season as any)?.teams ?? null

  const { data: games } = season ? await supabase
    .from('games')
    .select('id, opponent, game_date, game_time, location, status, notes')
    .eq('season_id', season.id)
    .order('game_date', { ascending: true }) : { data: [] }

  const today = new Date().toISOString().split('T')[0]
  const nextGame = (games ?? []).find(g => g.status === 'scheduled' && g.game_date >= today)
  const recentGames = [...(games ?? [])].filter(g => g.status === 'final').reverse().slice(0, 3)
  const record = parseRecord(games ?? [])
  const upcomingCount = (games ?? []).filter(g => g.status === 'scheduled').length

  const { count: rosterCount } = season ? await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('season_id', season.id)
    .eq('status', 'active') : { count: 0 }

  return (
    <main style={{
      minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '480px', margin: '0 auto',
      padding: '1.5rem 1.5rem 6rem',
    }}>

      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href="/" style={{ textDecoration: 'none', color: 'var(--fg)' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 900, letterSpacing: '-1px', marginBottom: '4px' }}>
            Six<span style={{ color: 'var(--accent)' }}>43</span>
          </h1>
        </Link>
        {team ? (
          <div style={{ fontSize: '14px', color: `rgba(var(--fg-rgb), 0.5)` }}>
            {team.name} · {season?.name}
          </div>
        ) : (
          <Link href="/settings" style={{ fontSize: '13px', color: 'var(--accent)', textDecoration: 'none' }}>
            Set up your team →
          </Link>
        )}
      </div>

      {/* Next game */}
      {nextGame ? (
        <Link href={`/games/${nextGame.id}`} style={{ textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>
          <div style={{
            background: 'linear-gradient(135deg, rgba(232,160,32,0.14), rgba(232,160,32,0.04))',
            border: '0.5px solid rgba(232,160,32,0.35)',
            borderRadius: '14px', padding: '16px 18px',
          }}>
            <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em',
              textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '6px' }}>
              Next game
            </div>
            <div style={{ fontSize: '22px', fontWeight: 800, marginBottom: '4px', letterSpacing: '-0.5px' }}>
              vs {nextGame.opponent}
            </div>
            <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.55)` }}>
              {formatDate(nextGame.game_date)}
              {nextGame.location ? ` · ${nextGame.location}` : ''}
              {nextGame.game_time ? ` · ${formatTime(nextGame.game_time)}` : ''}
            </div>
          </div>
        </Link>
      ) : (
        <Link href="/games/new" style={{ textDecoration: 'none', display: 'block', marginBottom: '1.25rem' }}>
          <div style={{
            background: 'var(--bg-card)', border: '0.5px dashed var(--border-strong)',
            borderRadius: '14px', padding: '20px 18px', textAlign: 'center',
          }}>
            <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '6px' }}>
              No upcoming games
            </div>
            <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent)' }}>
              + Schedule a game
            </div>
          </div>
        </Link>
      )}

      {/* Stats row */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem' }}>
        {[
          { label: 'Record', value: season ? `${record.w}–${record.l}` : '—' },
          { label: 'Upcoming', value: upcomingCount },
          { label: 'Players', value: rosterCount ?? 0 },
        ].map(s => (
          <div key={s.label} style={{
            flex: 1, background: 'var(--bg-card)', border: '0.5px solid var(--border)',
            borderRadius: '10px', padding: '12px 14px',
          }}>
            <div style={{ fontSize: '20px', fontWeight: 800 }}>{s.value}</div>
            <div style={{ fontSize: '10px', color: `rgba(var(--fg-rgb), 0.4)`, marginTop: '2px',
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '1.5rem' }}>
        {[
          { href: '/games/new', label: '+ New game', sub: 'Schedule a game' },
          { href: '/roster',    label: '👥 Roster',  sub: `${rosterCount ?? 0} active players` },
          { href: '/fairness',  label: '📊 Playing time', sub: 'Season fairness' },
          { href: '/settings',  label: '⚙️ Settings', sub: 'Team & season' },
        ].map(a => (
          <a key={a.href} href={a.href} style={{
            textDecoration: 'none', background: 'var(--bg-card)',
            border: '0.5px solid var(--border)', borderRadius: '10px',
            padding: '12px 14px', display: 'block',
          }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--fg)', marginBottom: '2px' }}>{a.label}</div>
            <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)` }}>{a.sub}</div>
          </a>
        ))}
      </div>

      {/* Recent results */}
      {recentGames.length > 0 && (
        <>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: `rgba(var(--fg-rgb), 0.35)`, marginBottom: '8px' }}>
            Recent results
          </div>
          {recentGames.map(game => {
            const score = getBoxScore(game)
            const won = score ? score.us > score.them : null
            return (
              <Link key={game.id} href={`/games/${game.id}`} style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'var(--bg-card)', border: '0.5px solid var(--border)',
                  borderRadius: '10px', padding: '12px 14px', marginBottom: '6px',
                }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '2px' }}>
                      vs {game.opponent}
                    </div>
                    <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)` }}>
                      {formatDate(game.game_date)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {score ? (
                      <>
                        <div style={{ fontSize: '16px', fontWeight: 800,
                          color: won ? '#6DB875' : '#E87060' }}>
                          {score.us}–{score.them}
                        </div>
                        <div style={{ fontSize: '10px', fontWeight: 700,
                          color: won ? '#6DB875' : '#E87060' }}>
                          {won ? 'W' : score.us === score.them ? 'T' : 'L'}
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.3)` }}>Final</div>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </>
      )}
    </main>
  )
}
