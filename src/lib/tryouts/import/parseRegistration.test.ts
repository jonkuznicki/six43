import { describe, it, expect } from 'vitest'
import { parseRegistrationFile } from './parseRegistration'

// Build a minimal CSV buffer from headers + data rows.
function makeCsv(headers: string[], rows: string[][]): Buffer {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`
  const lines = [
    headers.map(escape).join(','),
    ...rows.map(row => row.map(escape).join(',')),
  ]
  return Buffer.from(lines.join('\n'), 'utf-8')
}

const BASE_HEADERS = [
  'First Name',
  'Last Name',
  'Age Group',
  '2026 Season Team / League Name?',
  "If 2026 Team is 'Other', please provide team name",
]

function makeRow(team: string, writeIn = ''): string[] {
  return ['John', 'Smith', '11U', team, writeIn]
}

describe('parseRegistrationFile — prior team resolution', () => {
  it('uses the team column value directly when it is not "Other"', () => {
    const { rows } = parseRegistrationFile(makeCsv(BASE_HEADERS, [makeRow('HBA - 11u Blue')]))
    expect(rows).toHaveLength(1)
    expect(rows[0].priorTeam).toBe('HBA - 11u Blue')
  })

  it('resolves "OTHER" to the write-in team name', () => {
    const { rows } = parseRegistrationFile(makeCsv(BASE_HEADERS, [makeRow('OTHER', 'Kiwanis Giants 12u')]))
    expect(rows[0].priorTeam).toBe('Kiwanis Giants 12u')
  })

  it('resolves "Other" (title case) to the write-in team name', () => {
    const { rows } = parseRegistrationFile(makeCsv(BASE_HEADERS, [makeRow('Other', 'Kiwanis Giants 12u')]))
    expect(rows[0].priorTeam).toBe('Kiwanis Giants 12u')
  })

  it('resolves "other" (lowercase) to the write-in team name', () => {
    const { rows } = parseRegistrationFile(makeCsv(BASE_HEADERS, [makeRow('other', 'Kiwanis Giants 12u')]))
    expect(rows[0].priorTeam).toBe('Kiwanis Giants 12u')
  })

  it('trims whitespace from the team value before checking for "other"', () => {
    const { rows } = parseRegistrationFile(makeCsv(BASE_HEADERS, [makeRow('  Other  ', 'Kiwanis Giants 12u')]))
    expect(rows[0].priorTeam).toBe('Kiwanis Giants 12u')
  })

  it('returns null priorTeam when "Other" but write-in is blank', () => {
    const { rows } = parseRegistrationFile(makeCsv(BASE_HEADERS, [makeRow('Other', '')]))
    expect(rows[0].priorTeam).toBeNull()
  })

  it('returns null priorTeam when team column is blank', () => {
    const { rows } = parseRegistrationFile(makeCsv(BASE_HEADERS, [makeRow('')]))
    expect(rows[0].priorTeam).toBeNull()
  })

  it('trims whitespace from a non-Other team value', () => {
    const { rows } = parseRegistrationFile(makeCsv(BASE_HEADERS, [makeRow('  HBA - 11u Blue  ')]))
    expect(rows[0].priorTeam).toBe('HBA - 11u Blue')
  })

  it('handles double-quote variant of the write-in column name', () => {
    const headers = [
      'First Name', 'Last Name', 'Age Group',
      '2026 Season Team / League Name?',
      'If 2026 Team is "Other", please provide team name',
    ]
    const { rows } = parseRegistrationFile(makeCsv(headers, [makeRow('OTHER', 'Tigers 10u')]))
    expect(rows[0].priorTeam).toBe('Tigers 10u')
  })

  it('does not put the write-in value into priorOrg', () => {
    const { rows } = parseRegistrationFile(makeCsv(BASE_HEADERS, [makeRow('OTHER', 'Kiwanis Giants 12u')]))
    expect(rows[0].priorOrg).toBeNull()
  })
})
