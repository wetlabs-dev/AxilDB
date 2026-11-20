import type { Prisma, PrismaClient } from '@prisma/client'
import { formatTypography } from '@/lib/typography'
import type { AuthUser } from '@/lib/auth'
import { canViewCollection } from '@/lib/collections'
import { collectionPath } from '@/lib/collection-path'
import { isServerAdminRole } from '@/lib/roles'
import type { QrTarget } from '@/lib/qr-payload'
export type QrRecord = { href: string; kind: 'plant' | 'location'; label: string; collectionName: string; collectionSlug: string }
export async function resolveQrTarget(db: PrismaClient, user: AuthUser, target: QrTarget): Promise<QrRecord[]> {
  const accessible: Prisma.CollectionWhereInput = { status: 'ACTIVE', ...(isServerAdminRole(user.role) ? {} : { OR: [{ visibility: 'PUBLIC' }, { memberships: { some: { userId: user.id, status: 'ACTIVE' } } }] }), ...('collectionSlug' in target && target.collectionSlug ? { slug: target.collectionSlug } : {}) }
  const collection = { include: { memberships: { where: { userId: user.id }, take: 1 } } }
  const [plants, locations] = await Promise.all([
    target.kind === 'location' ? [] : db.plantInstance.findMany({ where: { collection: accessible, OR: target.kind === 'identifier' ? [{ id: target.identifier }, { plantId: target.identifier }] : [{ id: target.identifier }] }, select: { id: true, plantId: true, collection }, orderBy: { id: 'asc' }, take: 11 }),
    target.kind === 'plant' ? [] : db.location.findMany({ where: { collection: accessible, OR: target.kind === 'identifier' ? [{ id: target.identifier }, { code: target.identifier }] : [{ id: target.identifier }] }, select: { id: true, code: true, name: true, collection }, orderBy: { id: 'asc' }, take: 11 }),
  ])
  return [...plants.map(p => ({ record: p, kind: 'plant' as const, label: p.plantId })), ...locations.map(l => ({ record: l, kind: 'location' as const, label: `${l.code} · ${formatTypography(l.name)}` }))].flatMap(({ record, kind, label }) => {
    const c = record.collection
    if (!c || !canViewCollection(user, { user, collection: c, membership: c.memberships[0] || null })) return []
    return [{ kind, label, collectionName: c.name, collectionSlug: c.slug, href: collectionPath(c.slug, `/${kind === 'plant' ? 'instances' : 'locations'}/${encodeURIComponent(record.id)}`) }]
  })
}
