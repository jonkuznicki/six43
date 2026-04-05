import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '../../../lib/supabase-server'

// Simple iCal parser — handles GameChanger's format without external deps
function parseIcal(text: string): Array<{ opponent: string; game_date: string; game_time: string | null }> {
  // Normalize line endings and unfold continuation lines
  const normalized = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')  // iCal line folding

  const SKIP_KEYWORDS = ['practice', 'training', 'scrimmage', 'event']

  const games: Array<{ opponent: string; game_date: string; game_time: string | null }> = []
  let inEvent = false
  let summary = ''
  let dtstartValue = ''

  for (const line of normalized.split('\n')) {
    const upper = line.toUpperCase()

    if (upper === 'BEGIN:VEVENT') {
      inEvent = true
      summary = ''
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

      // Parse DTSTART value: YYYYMMDD or YYYYMMDDTHHmmss[Z]
      const v = dtstartValue.replace('Z', '')
      const year  = v.slice(0, 4)
      const month = v.slice(4, 6)
      const day   = v.slice(6, 8)
      const game_date = `${year}-${month}-${day}`

      let game_time: string | null = null
      if (v.length >= 13 && v[8] === 'T') {
        const h = v.slice(9, 11)
        const m = v.slice(11, 13)
        game_time = `${h}:${m}`
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

    if (propName === 'SUMMARY')  summary      = value.trim()
    if (propName === 'DTSTART')  dtstartValue = value.trim()
  }

  return games
}

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { url } = await req.json()
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

  const games = parseIcal(icalText)

  // Save webcal_url to the active season
  const { data: season } = await supabase
    .from('seasons')
    .select('id')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (season) {
    await supabase
      .from('seasons')
      .update({ webcal_url: url.trim() })
      .eq('id', season.id)
  }

  return NextResponse.json({ games })
}
