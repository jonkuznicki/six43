import { describe, it, expect } from 'vitest'
import { parseRegistrationFile } from './parseRegistration'

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

describe('parseRegistrationFile — prior team / org mapping', () => {
  it('stores non-Other team directly as priorTeam', () => {
    const { rows } = parseRegistrationFile(makeCsv(BASE_HEADERS, [makeRow('HBA - 11u Blue')]))
    expect(rows[0].priorTeam).toBe('HBA - 11u Blue')
    expect(rows[0].priorOrg).toBeNull()
  })

  it('keeps priorTeam as "Other" and stores write-in in priorOrg (single-quote column)', () => {
    const { rows } = parseRegistrationFile(makeCsv(BASE_HEADERS, [makeRow('Other', 'Kiwanis Giants 12u')]))
    expect(rows[0].priorTeam).toBe('Other')
    expect(rows[0].priorOrg).toBe('Kiwanis Giants 12u')
  })

  it('keeps priorTeam as "OTHER" and stores write-in in priorOrg', () => {
    const { rows } = parseRegistrationFile(makeCsv(BASE_HEADERS, [makeRow('OTHER', 'Kiwanis Giants 12u')]))
    expect(rows[0].priorTeam).toBe('OTHER')
    expect(rows[0].priorOrg).toBe('Kiwanis Giants 12u')
  })

  it('handles double-quote variant of the write-in column name', () => {
    const headers = [
      'First Name', 'Last Name', 'Age Group',
      '2026 Season Team / League Name?',
      'If 2026 Team is "Other", please provide team name',
    ]
    const { rows } = parseRegistrationFile(makeCsv(headers, [makeRow('Other', 'Tigers 10u')]))
    expect(rows[0].priorTeam).toBe('Other')
    expect(rows[0].priorOrg).toBe('Tigers 10u')
  })

  it('returns null priorOrg when Other is selected but write-in is blank', () => {
    const { rows } = parseRegistrationFile(makeCsv(BASE_HEADERS, [makeRow('Other', '')]))
    expect(rows[0].priorTeam).toBe('Other')
    expect(rows[0].priorOrg).toBeNull()
  })

  it('returns null priorTeam when team column is blank', () => {
    const { rows } = parseRegistrationFile(makeCsv(BASE_HEADERS, [makeRow('')]))
    expect(rows[0].priorTeam).toBeNull()
  })

  it('trims whitespace from team and write-in values', () => {
    const { rows } = parseRegistrationFile(makeCsv(BASE_HEADERS, [makeRow('  HBA - 11u Blue  ')]))
    expect(rows[0].priorTeam).toBe('HBA - 11u Blue')
  })
})
