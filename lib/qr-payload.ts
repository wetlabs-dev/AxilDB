/** QR text is untrusted. Never navigate to raw text; construct an allowlisted route that authorizes at its destination. */
export const maxQrPayloadLength = 2048
export type QrTarget = { kind: 'plant' | 'location'; identifier: string; collectionSlug?: string } | { kind: 'identifier'; identifier: string }
const identifier = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/
const slug = /^[a-z0-9][a-z0-9_-]{0,79}$/
export function qrOrigins(values: Array<string | undefined | null>): string[] {
  return [...new Set(values.flatMap(value => {
    try { const u = new URL(value || ''); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash ? [u.origin] : [] } catch { return [] }
  }))]
}
export function parseQrPayload(input: string, origins: string[], manual = false): QrTarget | null {
  if (typeof input !== 'string' || input.length > maxQrPayloadLength) return null
  const text = input.trim()
  if (/[\u0000-\u001f\u007f\\]/u.test(text)) return null
  if (identifier.test(text) && text !== '.' && text !== '..') return { kind: 'identifier', identifier: text }
  if (manual) return null
  try {
    const relative = text.startsWith('/') && !text.startsWith('//')
    if (!relative && !/^https?:\/\//i.test(text)) return null
    // Reject dot-segment normalization instead of allowing URL() to hide a different path.
    const rawPath = relative ? text.split(/[?#]/)[0] : text.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0]
    if (rawPath.split('/').some(part => ['.', '..'].includes(decodeURIComponent(part)))) return null
    const url = new URL(text, origins[0] || 'https://invalid.invalid')
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || (!relative && !qrOrigins(origins).includes(url.origin))) return null
    const parts = url.pathname.replace(/\/$/, '').split('/').slice(1).map(part => decodeURIComponent(part))
    let collectionSlug: string | undefined, resource: string, id: string
    if (parts.length === 4 && parts[0] === 'c') { [, collectionSlug, resource, id] = parts }
    else if (parts.length === 2) { [resource, id] = parts; collectionSlug = url.searchParams.get('collection') || undefined }
    else return null
    if (collectionSlug && !slug.test(collectionSlug) || !identifier.test(id) || ['.', '..'].includes(id)) return null
    if (!['instances', 'locations'].includes(resource)) return null
    // Query strings/fragments never become navigation destinations.
    return { kind: resource === 'instances' ? 'plant' : 'location', identifier: id, ...(collectionSlug ? { collectionSlug } : {}) }
  } catch { return null }
}
export function qrTargetKey(target: QrTarget) { return `${target.kind}:${'collectionSlug' in target ? target.collectionSlug || '' : ''}:${target.identifier}` }

/** Canonical scoped URLs already contain their destination. Authorization stays on that route. */
export function directQrDestination(target: QrTarget): { href: string; kind: 'plant' | 'location' } | null {
  if (target.kind === 'identifier' || !target.collectionSlug) return null
  return { kind: target.kind, href: `/c/${target.collectionSlug}/${target.kind === 'plant' ? 'instances' : 'locations'}/${encodeURIComponent(target.identifier)}` }
}
