'use client'

import { useState, useEffect } from 'react'
import { createClient } from '../../../lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const LOCATIONS = ['Home', 'Away', 'Neutral']

const FREE_GAME_LIMIT = 10

export default function NewGamePage() {
  const supabase = createClient()
  const router = useRouter()
  const [season, setSeason] = useState<any>(null)
  const [players, setPlayers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [plan, setPlan] = useState<'free' | 'pro'>('free')
  const [gameCount, setGameCount] = useState(0)
  const [pendingGameId, setPendingGameId] = useState<string | null>(null)
  const [prevGameForBatting, setPrevGameForBatting] = useState<{ id: string; opponent: string; game_date: string } | null>(null)
  const [battingModalOpen, setBattingModalOpen] = useState(false)
  const [creatingSlots, setCreatingSlots] = useState(false)
  const [form, setForm] = useState({
    opponent: '',
    game_date: new Date().toISOString().split('T')[0],
    game_time: '',
    location: '',
    innings_played: '6',
  })

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    const teamIdParam = new URLSearchParams(window.location.search).get('teamId')

    // Check plan
    const { data: planRow } = await supabase
      .from('user_plans')
      .select('plan')
      .maybeSingle()
    const userPlan: 'free' | 'pro' = planRow?.plan ?? 'free'
    setPlan(userPlan)

    // Count total games across all user's seasons (for free limit)
    if (userPlan === 'free' && user) {
      const { count } = await supabase
        .from('games')
        .select('id', { count: 'exact', head: true })
        .in('season_id',
          (await supabase
            .from('seasons')
            .select('id')
            .in('team_id',
              (await supabase.from('teams').select('id').eq('user_id', user.id)).data?.map(t => t.id) ?? []
            )
          ).data?.map(s => s.id) ?? []
        )
      setGameCount(count ?? 0)
    }

    const seasonQuery = supabase
      .from('seasons')
      .select('id, name, innings_per_game, team:teams(id, name)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)

    const { data: seasonData } = await (
      teamIdParam ? seasonQuery.eq('team_id', teamIdParam) : seasonQuery
    ).maybeSingle()

    setSeason(seasonData)

    if (seasonData) {
      setForm(f => ({ ...f, innings_played: String((seasonData as any).innings_per_game ?? 6) }))
      const { data: playerData } = await supabase
        .from('players')
        .select('id, first_name, last_name, jersey_number, batting_pref_order')
        .eq('season_id', seasonData.id)
        .eq('status', 'active')
        .order('batting_pref_order', { ascending: true, nullsFirst: false })
      setPlayers(playerData ?? [])
    }
    setLoading(false)
  }

  async function submit() {
    if (!form.opponent.trim()) { setError('Opponent is required.'); return }
    if (!form.game_date) { setError('Date is required.'); return }
    if (!season) { setError('No active season. Set one up in Settings.'); return }
    const inn = parseInt(form.innings_played)
    if (isNaN(inn) || inn < 1 || inn > 9) { setError('Innings must be 1–9.'); return }

    setSaving(true)
    setError('')

    const { data: game, error: gameErr } = await supabase
      .from('games')
      .insert({
        season_id: season.id,
        opponent: form.opponent.trim(),
        game_date: form.game_date,
        game_time: form.game_time || null,
        location: form.location || null,
        innings_played: inn,
        status: 'scheduled',
      })
      .select()
      .single()

    if (gameErr || !game) {
      setError(gameErr?.message ?? 'Failed to create game.')
      setSaving(false)
      return
    }

    if (players.length > 0) {
      // Check if any previous game has slots — if so, ask about batting order
      const { data: recentGames } = await supabase
        .from('games')
        .select('id, opponent, game_date')
        .eq('season_id', season.id)
        .neq('id', game.id)
        .not('game_date', 'is', null)
        .order('game_date', { ascending: false })
        .limit(5)

      let prevWithSlots: { id: string; opponent: string; game_date: string } | null = null
      for (const pg of recentGames ?? []) {
        const { count } = await supabase
          .from('lineup_slots')
          .select('id', { count: 'exact', head: true })
          .eq('game_id', pg.id)
        if ((count ?? 0) > 0) { prevWithSlots = pg; break }
      }

      if (prevWithSlots) {
        setPendingGameId(game.id)
        setPrevGameForBatting(prevWithSlots)
        setBattingModalOpen(true)
        setSaving(false)
        return
      }

      // No previous game — use roster order
      await supabase.from('lineup_slots').insert(
        players.map((p, i) => ({
          game_id: game.id, player_id: p.id,
          batting_order: i + 1, availability: 'available',
          inning_positions: [null, null, null, null, null, null, null, null, null],
        }))
      )
    }

    router.push(`/games/${game.id}`)
  }

  async function handleBattingChoice(choice: 'last' | 'roster') {
    if (!pendingGameId || !season) return
    setBattingModalOpen(false)
    setCreatingSlots(true)

    if (choice === 'last' && prevGameForBatting) {
      const { data: lastSlots } = await supabase
        .from('lineup_slots')
        .select('player_id, batting_order')
        .eq('game_id', prevGameForBatting.id)
        .order('batting_order', { ascending: true, nullsFirst: false })

      const lastOrderMap = new Map((lastSlots ?? []).map((s: any) => [s.player_id, s.batting_order]))
      const sorted = [...players].sort((a, b) => {
        const ao = lastOrderMap.get(a.id) ?? 999
        const bo = lastOrderMap.get(b.id) ?? 999
        if (ao !== bo) return ao - bo
        return (a.batting_pref_order ?? 99) - (b.batting_pref_order ?? 99)
      })
      await supabase.from('lineup_slots').insert(
        sorted.map((p, i) => ({
          game_id: pendingGameId, player_id: p.id,
          batting_order: i + 1, availability: 'available',
          inning_positions: [null, null, null, null, null, null, null, null, null],
        }))
      )
    } else {
      await supabase.from('lineup_slots').insert(
        players.map((p, i) => ({
          game_id: pendingGameId, player_id: p.id,
          batting_order: i + 1, availability: 'available',
          inning_positions: [null, null, null, null, null, null, null, null, null],
        }))
      )
    }

    router.push(`/games/${pendingGameId}`)
  }

  if (loading) return (
    <main style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--fg)',
      fontFamily: 'sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      Loading...
    </main>
  )

  const atLimit = plan === 'free' && gameCount >= FREE_GAME_LIMIT

  if (atLimit) return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '480px', margin: '0 auto', padding: '1.5rem 1rem 6rem' }}>
      <Link href="/games" style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`,
        textDecoration: 'none', display: 'block', marginBottom: '1.5rem' }}>‹ Games</Link>
      <div style={{
        background: 'rgba(232,160,32,0.07)',
        border: '0.5px solid rgba(232,160,32,0.25)',
        borderRadius: '14px',
        padding: '2rem 1.5rem',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚾</div>
        <div style={{ fontSize: '18px', fontWeight: 800, marginBottom: '8px' }}>
          You've used all {FREE_GAME_LIMIT} free games
        </div>
        <div style={{ fontSize: '14px', color: `rgba(var(--fg-rgb), 0.6)`, lineHeight: 1.6, marginBottom: '1.75rem' }}>
          Upgrade to Six43 Pro for unlimited games, full season history, and everything you need for a full season.
        </div>
        <div style={{ marginBottom: '8px', fontSize: '13px', color: `rgba(var(--fg-rgb), 0.4)` }}>
          <span style={{ textDecoration: 'line-through' }}>$2.99/mo</span>
        </div>
        <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--accent)', marginBottom: '4px' }}>
          $1.49/mo
        </div>
        <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '1.5rem' }}>
          or $12/year · introductory pricing
        </div>
        <div style={{
          display: 'inline-block',
          padding: '13px 32px',
          background: 'var(--accent)', color: 'var(--accent-text)',
          borderRadius: '8px', fontSize: '14px', fontWeight: 700,
          opacity: 0.6,
        }}>
          Upgrade to Pro — coming soon
        </div>
        <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.35)`, marginTop: '1rem' }}>
          Paid plans launching soon. Contact us if you need access now.
        </div>
      </div>
    </main>
  )

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)',
      fontFamily: 'sans-serif', maxWidth: '480px', margin: '0 auto', padding: '1.5rem 1rem 6rem' }}>

      <Link href="/games" style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.45)`,
        textDecoration: 'none', display: 'block', marginBottom: '1rem' }}>‹ Games</Link>

      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '4px' }}>New game</h1>
      {season && (
        <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '1.5rem' }}>
          {(season as any).team?.name} · {season.name}
        </div>
      )}

      {!season && !loading && (
        <div style={{ fontSize: '13px', color: '#E87060', background: 'rgba(192,57,43,0.12)',
          border: '0.5px solid rgba(192,57,43,0.3)', borderRadius: '8px',
          padding: '12px 14px', marginBottom: '1.5rem' }}>
          No active season. <Link href="/settings" style={{ color: 'var(--accent)' }}>Set one up in Settings →</Link>
        </div>
      )}

      {error && (
        <div style={{ fontSize: '13px', color: '#E87060', background: 'rgba(192,57,43,0.12)',
          border: '0.5px solid rgba(192,57,43,0.3)', borderRadius: '6px',
          padding: '10px 14px', marginBottom: '1rem' }}>{error}</div>
      )}

      <Field label="Opponent">
        <input
          value={form.opponent}
          onChange={e => setForm(f => ({ ...f, opponent: e.target.value }))}
          placeholder="Tigers"
          autoFocus
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={inp}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', margin: '12px 0' }}>
        <Field label="Date">
          <input type="date" value={form.game_date}
            onChange={e => setForm(f => ({ ...f, game_date: e.target.value }))} style={inp} />
        </Field>
        <Field label="Time (optional)">
          <input type="time" value={form.game_time}
            onChange={e => setForm(f => ({ ...f, game_time: e.target.value }))} style={inp} />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '1.5rem' }}>
        <Field label="Location">
          <select value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} style={inp}>
            <option value="">—</option>
            {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="Innings">
          <select value={form.innings_played} onChange={e => setForm(f => ({ ...f, innings_played: e.target.value }))} style={inp}>
            {[6, 7, 8, 9].map(n => <option key={n} value={n}>{n} innings</option>)}
          </select>
        </Field>
      </div>

      {players.length > 0 && (
        <div style={{ fontSize: '12px', color: `rgba(var(--fg-rgb), 0.4)`,
          marginBottom: '1.25rem', padding: '10px 14px',
          background: 'var(--bg-card)', border: '0.5px solid var(--border)', borderRadius: '8px' }}>
          {players.length} active player{players.length !== 1 ? 's' : ''} will be added to the lineup automatically
        </div>
      )}

      <button onClick={submit} disabled={saving || !season} style={{
        width: '100%', padding: '14px', borderRadius: '8px', border: 'none',
        background: 'var(--accent)', color: 'var(--accent-text)', fontSize: '15px', fontWeight: 700,
        cursor: (saving || !season) ? 'not-allowed' : 'pointer',
        opacity: (saving || !season) ? 0.7 : 1,
      }}>
        {saving ? 'Creating…' : 'Create game'}
      </button>

      {/* Batting order choice modal */}
      {battingModalOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
            zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <div style={{
            background: 'var(--bg2)', borderRadius: '14px', padding: '1.5rem',
            width: '340px', maxWidth: '92vw', border: '0.5px solid var(--border)',
          }}>
            <div style={{ fontSize: '17px', fontWeight: 700, marginBottom: '6px' }}>
              Starting batting order
            </div>
            <div style={{ fontSize: '13px', color: `rgba(var(--fg-rgb),0.45)`, marginBottom: '1.25rem', lineHeight: 1.5 }}>
              How should the initial batting order be set?
              {prevGameForBatting && (
                <span style={{ display: 'block', marginTop: '4px', color: `rgba(var(--fg-rgb),0.6)`, fontStyle: 'italic' }}>
                  Last game: vs {prevGameForBatting.opponent} ·{' '}
                  {new Date(prevGameForBatting.game_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={() => handleBattingChoice('last')}
                disabled={creatingSlots}
                style={{
                  flex: 1, padding: '14px 8px', borderRadius: '10px', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 600, textAlign: 'center',
                  border: '1.5px solid var(--border-md)', background: 'transparent',
                  color: `rgba(var(--fg-rgb),0.85)`, opacity: creatingSlots ? 0.5 : 1,
                }}
              >
                <div style={{ fontSize: '22px', marginBottom: '6px' }}>↩</div>
                Last game order
              </button>
              <button
                onClick={() => handleBattingChoice('roster')}
                disabled={creatingSlots}
                style={{
                  flex: 1, padding: '14px 8px', borderRadius: '10px', cursor: 'pointer',
                  fontSize: '13px', fontWeight: 600, textAlign: 'center',
                  border: '1.5px solid var(--border-md)', background: 'transparent',
                  color: `rgba(var(--fg-rgb),0.85)`, opacity: creatingSlots ? 0.5 : 1,
                }}
              >
                <div style={{ fontSize: '22px', marginBottom: '6px' }}>📋</div>
                Roster order
              </button>
            </div>
            {creatingSlots && (
              <div style={{ textAlign: 'center', fontSize: '12px', color: `rgba(var(--fg-rgb),0.4)`, marginTop: '12px' }}>
                Creating lineup…
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: `rgba(var(--fg-rgb), 0.4)`, marginBottom: '5px' }}>{label}</div>
      {children}
    </div>
  )
}

const inp: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '6px',
  border: '0.5px solid var(--border-md)',
  background: 'var(--bg-input)', color: 'var(--fg)',
  fontSize: '14px', boxSizing: 'border-box',
}
