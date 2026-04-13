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

function parseIcal(text: string, timezone?: string): Array<{ opponent: string; game_date: string; game_time: string | null; location: 'Home' | 'Away' }> {
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')

  const SKIP_KEYWORDS = ['practice', 'training', 'scrimmage', 'event']
  const games: Array<{ opponent: string; game_date: string; game_time: string | null; location: 'Home' | 'Away' }> = []
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
      let location: 'Home' | 'Away' = 'Home'
      if (/^vs\.?\s*/i.test(summary)) {
        location = 'Home'
        opponent = summary.replace(/^vs\.?\s*/i, '').trim()
      } else if (/^@\s*/i.test(summary)) {
        location = 'Away'
        opponent = summary.replace(/^@\s*/i, '').trim()
      } else {
        const midVs = summary.match(/\s+vs\.?\s+(.+)$/i)
        const midAt = summary.match(/\s+@\s+(.+)$/i)
        if (midVs) { location = 'Home'; opponent = midVs[1].trim() }
        else if (midAt) { location = 'Away'; opponent = midAt[1].trim() }
        else { opponent = summary.trim() }
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
      games.push({ opponent, game_date, game_time, location })
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
  | { type: 'new';     opponent: string; game_date: string; game_time: string | null; location: 'Home' | 'Away'; suggested_placeholder_id?: string; suggested_placeholder_label?: string }
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

  // Get existing games in season (including placeholder flag for exclusion logic)
  const { data: dbGames } = await supabase
    .from('games')
    .select('id, opponent, game_date, game_time, status, is_placeholder, tournament_id')
    .eq('season_id', season.id)

  const changes: SyncChange[] = []

  // Track which DB games were matched
  const matchedDbIds = new Set<string>()

  // Build list of unmatched placeholders for swap suggestions
  const placeholders = (dbGames ?? []).filter((g: any) => g.is_placeholder)

  for (const icalGame of icalGames) {
    // Find a DB game with matching opponent (case-insensitive, unmatched, non-placeholder)
    const dbMatch = (dbGames ?? []).find((g: any) =>
      !matchedDbIds.has(g.id) &&
      !g.is_placeholder &&
      g.opponent.toLowerCase().trim() === icalGame.opponent.toLowerCase().trim()
    )

    if (!dbMatch) {
      // Check if a placeholder exists within ±1 day for a swap suggestion
      const suggestedPH = placeholders.find((ph: any) => {
        const phDate  = new Date(ph.game_date + 'T12:00:00').getTime()
        const gcDate  = new Date(icalGame.game_date + 'T12:00:00').getTime()
        const diffDays = Math.abs(phDate - gcDate) / (1000 * 60 * 60 * 24)
        return diffDays <= 1
      })
      changes.push({
        type: 'new',
        opponent:   icalGame.opponent,
        game_date:  icalGame.game_date,
        game_time:  icalGame.game_time,
        location:   icalGame.location,
        ...(suggestedPH ? {
          suggested_placeholder_id:    suggestedPH.id,
          suggested_placeholder_label: suggestedPH.opponent,
        } : {}),
      })
    } else {
      matchedDbIds.add(dbMatch.id)
      const dateChanged = dbMatch.game_date !== icalGame.game_date
      // Normalize to HH:MM before comparing — Postgres returns "HH:MM:SS" but the
      // iCal parser produces "HH:MM", so without slicing every timed game shows as changed.
      const toHHMM = (t: string | null) => t ? t.slice(0, 5) : null
      const timeChanged = toHHMM(dbMatch.game_time) !== toHHMM(icalGame.game_time)
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
    // Placeholders are intentionally unmatched — never flag them as removed
    if ((dbGame as any).is_placeholder) continue

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
