import { NextResponse } from 'next/server'
import { createServerClient } from '../../../lib/supabase-server'

function convertUtcToTimezone(v: string, timezone: string): { game_date: string; game_time: string | null } {
  const isoStr = `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}T${v.slice(9,11)}:${v.slice(11,13)}:00Z`
  const date = new Date(isoStr)
  const dateParts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const tp: Record<string, string> = {}
  for (const p of dateParts) tp[p.type] = p.value
  const game_date = `${tp.year}-${tp.month}-${tp.day}`
  const timeParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date)
  const tt: Record<string, string> = {}
  for (const p of timeParts) tt[p.type] = p.value
  const h = tt.hour === '24' ? '00' : tt.hour
  return { game_date, game_time: `${h}:${tt.minute}` }
}

function parseIcal(text: string, timezone?: string): Array<{ opponent: string; game_date: string; game_time: string | null }> {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')

  const SKIP_KEYWORDS = ['practice', 'training', 'scrimmage', 'event']
  const games: Array<{ opponent: string; game_date: string; game_time: string | null }> = []
  let inEvent = false
  let summary = ''
  let dtstartRaw = ''
  let dtstartValue = ''

  for (const line of normalized.split('\n')) {
    const upper = line.toUpperCase()

    if (upper === 'BEGIN:VEVENT') {
      inEvent = true; summary = ''; dtstartRaw = ''; dtstartValue = ''
      continue
    }
    if (upper === 'END:VEVENT') {
      inEvent = false
      if (!summary || !dtstartValue) continue
      const lsum = summary.toLowerCase()
      if (SKIP_KEYWORDS.some(kw => lsum.includes(kw))) continue
      let opponent: string
      if (/^(vs\.?\s*|@\s*)/i.test(summary)) {
        opponent = summary.replace(/^(vs\.?\s*|@\s*)/i, '').trim()
      } else {
        const mid = summary.match(/\s+(?:vs\.?|@)\s+(.+)$/i)
        opponent = mid ? mid[1].trim() : summary.trim()
      }
      if (!opponent) continue
      const isUtc = dtstartRaw.endsWith('Z')
      const v = dtstartValue
      let game_date = `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`
      let game_time: string | null = null
      if (v.length >= 13 && v[8] === 'T') {
        if (isUtc && timezone) {
          const converted = convertUtcToTimezone(v, timezone)
          game_date = converted.game_date
          game_time = converted.game_time
        } else {
          game_time = `${v.slice(9,11)}:${v.slice(11,13)}`
        }
      }
      games.push({ opponent, game_date, game_time })
      continue
    }
    if (!inEvent) continue
    const colonIdx = line.indexOf(':')
    if (colonIdx < 1) continue
    const propName = line.slice(0, colonIdx).split(';')[0].toUpperCase()
    const value = line.slice(colonIdx + 1).trim()
    if (propName === 'SUMMARY') summary = value
    if (propName === 'DTSTART') { dtstartRaw = value; dtstartValue = value.replace('Z', '') }
  }

  return games
}

export type SyncChange =
  | { type: 'new';     opponent: string; game_date: string; game_time: string | null }
  | { type: 'changed'; game_id: string; opponent: string; old_date: string; old_time: string | null; new_date: string; new_time: string | null }
  | { type: 'removed'; game_id: string; opponent: string; game_date: string }
  | { type: 'skipped'; game_id: string; opponent: string; game_date: string; reason: string }

export async function GET(request: Request) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const teamId = new URL(request.url).searchParams.get('teamId')

  // Get active season with webcal_url and timezone
  let seasonQuery = supabase
    .from('seasons')
    .select('id, webcal_url, timezone')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)

  if (teamId) seasonQuery = (seasonQuery as any).eq('team_id', teamId)

  const { data: season } = await seasonQuery.maybeSingle()

  if (!season?.webcal_url) {
    return NextResponse.json({ error: 'No webcal URL saved for this season' }, { status: 404 })
  }

  // Fetch iCal
  let icalText: string
  try {
    const httpsUrl = season.webcal_url.replace(/^webcal:\/\//i, 'https://')
    const resp = await fetch(httpsUrl, { headers: { 'User-Agent': 'Six43/1.0' } })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    icalText = await resp.text()
  } catch (e: any) {
    return NextResponse.json({ error: `Could not fetch schedule: ${e.message}` }, { status: 422 })
  }

  const icalGames = parseIcal(icalText, season.timezone ?? undefined)

  // Get existing games in season
  const { data: dbGames } = await supabase
    .from('games')
    .select('id, opponent, game_date, game_time, status')
    .eq('season_id', season.id)

  const changes: SyncChange[] = []

  // Track which DB games were matched
  const matchedDbIds = new Set<string>()

  for (const icalGame of icalGames) {
    // Find a DB game with matching opponent (case-insensitive, unmatched)
    const dbMatch = (dbGames ?? []).find(g =>
      !matchedDbIds.has(g.id) &&
      g.opponent.toLowerCase().trim() === icalGame.opponent.toLowerCase().trim()
    )

    if (!dbMatch) {
      changes.push({ type: 'new', ...icalGame })
    } else {
      matchedDbIds.add(dbMatch.id)
      const dateChanged = dbMatch.game_date !== icalGame.game_date
      const timeChanged = (dbMatch.game_time ?? null) !== (icalGame.game_time ?? null)
      if (dateChanged || timeChanged) {
        changes.push({
          type: 'changed',
          game_id: dbMatch.id,
          opponent: dbMatch.opponent,
          old_date: dbMatch.game_date,
          old_time: dbMatch.game_time ?? null,
          new_date: icalGame.game_date,
          new_time: icalGame.game_time,
        })
      }
    }
  }

  // Check for removed / skipped
  for (const dbGame of dbGames ?? []) {
    if (matchedDbIds.has(dbGame.id)) continue

    if (dbGame.status === 'in_progress' || dbGame.status === 'final') {
      changes.push({
        type: 'skipped',
        game_id: dbGame.id,
        opponent: dbGame.opponent,
        game_date: dbGame.game_date,
        reason: 'Game already played',
      })
    } else if (dbGame.status === 'scheduled' || dbGame.status === 'lineup_ready') {
      changes.push({
        type: 'removed',
        game_id: dbGame.id,
        opponent: dbGame.opponent,
        game_date: dbGame.game_date,
      })
    }
  }

  return NextResponse.json({ changes })
}
