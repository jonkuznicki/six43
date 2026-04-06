const COOKIE_NAME = 'selected_team_id'
const MAX_AGE = 60 * 60 * 24 * 365 // 1 year

export function getSelectedTeamId(): string | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`))
  return match ? decodeURIComponent(match[1]) : null
}

export function setSelectedTeamId(teamId: string) {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(teamId)}; max-age=${MAX_AGE}; path=/; SameSite=Lax`
}
