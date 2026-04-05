import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../lib/supabase-server'

// Convert a UTC iCal timestamp to a target IANA timezone
// Input: "20240412T220000" (already Z-stripped), timezone: "America/Chicago"
// Output: { game_date: "2024-04-12", game_time: "17:00" }
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
  const game_time = `${h}:${tt.minute}`

  return { game_date, game_time }
}

// Simple iCal parser — handles GameChanger's format without external deps
function parseIcal(text: string, timezone?: string): Array<{ opponent: string; game_date: string; game_time: string | null }> {
  // Normalize line endings and unfold continuation lines
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')  // iCal line folding

  const SKIP_KEYWORDS = ['practice', 'training', 'scrimmage', 'event']

  const games: Array<{ opponent: string; game_date: string; game_time: string | null }> = []
  let inEvent = false
  let summary = ''
  let dtstartRaw = ''   // raw value from the line (before Z strip)
  let dtstartValue = '' // value after Z strip

  for (const line of normalized.split('\n')) {
    const upper = line.toUpperCase()

    if (upper === 'BEGIN:VEVENT') {
      inEvent = true
      summary = ''
      dtstartRaw = ''
      dtstartValue = ''
      continue
    }

    if (upper === 'END:VEVENT') {
      inEvent = false
      if (!summary || !dtstartValue) continue

      // Skip non-game events
      const lsum = summary.toLowerCase()
      if (SKIP_KEYWORDS.some(kw => lsum.includes(kw))) continue

      // Strip leading "vs. " or "@ "
      const opponent = summary.replace(/^(vs\.?\s*|@\s*)/i, '').trim()
      if (!opponent) continue

      const isUtc = dtstartRaw.endsWith('Z')
      const v = dtstartValue  // already Z-stripped

      let game_date = `${v.slice(0,4)}-${v.slice(4,6)}-${v.slice(6,8)}`
      let game_time: string | null = null

      if (v.length >= 13 && v[8] === 'T') {
        if (isUtc && timezone) {
          // GameChanger exports UTC — convert to the team's timezone
          const converted = convertUtcToTimezone(v, timezone)
          game_date = converted.game_date
          game_time = converted.game_time
        } else {
          // TZID was present (already local) or no timezone info — use as-is
          game_time = `${v.slice(9,11)}:${v.slice(11,13)}`
        }
      }

      games.push({ opponent, game_date, game_time })
      continue
    }

    if (!inEvent) continue

    // Parse property: NAME;PARAMS:VALUE
    const colonIdx = line.indexOf(':')
    if (colonIdx < 1) continue
    const propFull = line.slice(0, colonIdx)  // e.g. "DTSTART;TZID=America/Chicago"
    const value    = line.slice(colonIdx + 1)
    const propName = propFull.split(';')[0].toUpperCase()

    if (propName === 'SUMMARY') summary      = value.trim()
    if (propName === 'DTSTART') {
      dtstartRaw   = value.trim()
      dtstartValue = dtstartRaw.replace('Z', '')
    }
  }

  return games
}

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { url, seasonId, timezone } = await req.json()
  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'url is required' }, { status: 400 })
  }

  // Convert webcal:// → https://
  const httpsUrl = url.trim().replace(/^webcal:\/\//i, 'https://')

  // Fetch the iCal file
  let icalText: string
  try {
    const resp = await fetch(httpsUrl, { headers: { 'User-Agent': 'Six43/1.0' } })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    icalText = await resp.text()
  } catch (e: any) {
    return NextResponse.json({ error: `Could not fetch schedule: ${e.message}` }, { status: 422 })
  }

  const games = parseIcal(icalText, timezone ?? undefined)

  // Save webcal_url (and timezone) to the correct season
  const targetSeasonId = seasonId ?? null
  if (targetSeasonId) {
    const update: any = { webcal_url: url.trim() }
    if (timezone) update.timezone = timezone
    await supabase.from('seasons').update(update).eq('id', targetSeasonId)
  } else {
    // Fallback: save to most recent active season
    const { data: season } = await supabase
      .from('seasons').select('id').eq('is_active', true)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (season) {
      const update: any = { webcal_url: url.trim() }
      if (timezone) update.timezone = timezone
      await supabase.from('seasons').update(update).eq('id', season.id)
    }
  }

  return NextResponse.json({ games })
}
