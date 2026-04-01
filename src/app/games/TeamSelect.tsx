'use client'

import { useRouter } from 'next/navigation'

export default function TeamSelect({
  teams,
  selectedTeamId,
}: {
  teams: { id: string; name: string }[]
  selectedTeamId: string | null
}) {
  const router = useRouter()

  if (teams.length <= 1) return null

  return (
    <select
      value={selectedTeamId ?? ''}
      onChange={e => router.push(`/games?teamId=${e.target.value}`)}
      style={{
        width: '100%', padding: '9px 12px', borderRadius: '8px',
        border: '0.5px solid var(--border-md)',
        background: 'var(--bg-card)', color: 'var(--fg)',
        fontSize: '14px', fontWeight: 600, cursor: 'pointer',
        marginBottom: '1.25rem',
      }}
    >
      {teams.map(t => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
    </select>
  )
}
