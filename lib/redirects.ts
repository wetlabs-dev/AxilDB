export const RETURN_TO_HEADER = 'x-axildb-return-to'

export function safeNextPath(value?: string | null) {
  const raw = String(value || '').trim()
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/'

  try {
    const parsed = new URL(raw, 'https://app.axildb.com')
    if (parsed.origin !== 'https://app.axildb.com') return '/'
    if (parsed.pathname === '/login' || parsed.pathname === '/magic-login' || parsed.pathname === '/two-factor') return '/'
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/'
  }
}

export function pathWithNext(path: string, next?: string | null) {
  const safe = safeNextPath(next)
  if (safe === '/') return path
  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}next=${encodeURIComponent(safe)}`
}
