import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import type { PrismaClient } from '@prisma/client'

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

function privateAddress(address: string) {
  const normalized = address.toLowerCase()
  if (normalized === '::1' || normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) return true
  const octets = normalized.split('.').map(Number)
  if (octets.length !== 4) return false
  return octets[0] === 10 || octets[0] === 127 || (octets[0] === 169 && octets[1] === 254) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168)
}

async function safeUrl(raw: string) {
  const url = new URL(raw)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP(S) URLs can be checked.')
  if (url.username || url.password || url.hostname === 'localhost' || url.hostname.endsWith('.local')) throw new Error('Local or credentialed URLs are not allowed.')
  const addresses = isIP(url.hostname) ? [{ address: url.hostname }] : await lookup(url.hostname, { all: true })
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) throw new Error('Private network targets are not allowed.')
  return url
}

async function checkUrl(label: string, raw: string) {
  try {
    const url = await safeUrl(raw)
    const response = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(6_000), headers: { 'User-Agent': 'AxilDB authority-link-check/1.0' } })
    return { label, url: raw, ok: response.status >= 200 && response.status < 400, status: response.status }
  } catch (error) {
    return { label, url: raw, ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function checkStaleTaxonomicAuthorityUrls(prisma: PrismaClient, now = new Date()) {
  const authorities = await prisma.taxonomicAuthority.findMany({
    where: { OR: [{ lastUrlCheckAt: null }, { lastUrlCheckAt: { lt: new Date(now.getTime() - CHECK_INTERVAL_MS) } }] },
    orderBy: { lastUrlCheckAt: { sort: 'asc', nulls: 'first' } },
    take: 5,
  })
  let broken = 0
  for (const authority of authorities) {
    const links = [
      ['Website', authority.website], ['Registration', authority.registrationUrl], ['Cultivar search', authority.cultivarSearchUrl],
      ['Membership', authority.membershipUrl], ['Official record', authority.externalAuthorityUrl],
    ].filter((entry): entry is [string, string] => Boolean(entry[1]))
    const results = await Promise.all(links.map(([label, url]) => checkUrl(label, url)))
    const failed = results.filter((result) => !result.ok)
    const status = links.length === 0 ? 'NO_URLS' : failed.length === 0 ? 'HEALTHY' : failed.length === links.length ? 'BROKEN' : 'PARTIAL'
    if (failed.length) broken += 1
    await prisma.taxonomicAuthority.update({ where: { id: authority.id }, data: { lastUrlCheckAt: now, urlHealthStatus: status, urlHealthDetailsJson: results as any } })

    const incidentType = `taxonomic-authority-url:${authority.id}`
    const existing = await prisma.serverIncident.findFirst({ where: { type: incidentType, status: 'OPEN' }, orderBy: { detectedAt: 'desc' } })
    if (failed.length && !existing) {
      await prisma.serverIncident.create({ data: {
        type: incidentType, category: 'NETWORK', severity: 'WARNING', status: 'OPEN', detectedAt: now,
        title: `Taxonomic Authority links need review: ${authority.name}`,
        description: `${failed.length} of ${links.length} official resource links could not be verified.`,
        metadata: { taxonomicAuthorityId: authority.id, results } as any,
      } })
    } else if (!failed.length && existing) {
      await prisma.serverIncident.update({ where: { id: existing.id }, data: { status: 'RESOLVED', resolvedAt: now, durationSeconds: Math.max(0, Math.round((now.getTime() - existing.detectedAt.getTime()) / 1000)), metadata: { taxonomicAuthorityId: authority.id, results } as any } })
    }
  }
  return { checked: authorities.length, broken }
}
