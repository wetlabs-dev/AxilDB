import { archiveCollection, permanentlyDeleteCollection, restoreCollection } from '@/app/collection-actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { Button, Card, Field, LinkButton } from '@/components/ui'
import { requireServerAdmin } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import fs from 'fs/promises'
import path from 'path'

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

async function uploadBytes(paths: string[]) {
  let total = 0
  for (const photoPath of paths) {
    if (!photoPath.startsWith('/uploads/')) continue
    try {
      const stat = await fs.stat(path.join(process.cwd(), 'public', photoPath.replace(/^\/+/, '')))
      total += stat.size
    } catch {
      // Missing files are reported as zero so the dashboard remains available.
    }
  }
  return total
}

export default async function ServerCollections() {
  await requireServerAdmin()
  const collections = await prisma.collection.findMany({
    orderBy: [{ status: 'asc' }, { name: 'asc' }],
    include: {
      _count: {
        select: {
          memberships: true,
          plantDefinitions: true,
          plantInstances: true,
          propagationEvents: true,
          bloomEvents: true,
          photos: true,
          reminders: true,
          follows: true,
        },
      },
      photos: { select: { path: true } },
    },
  })
  const byteCounts = new Map<string, number>()
  for (const collection of collections) {
    byteCounts.set(collection.id, await uploadBytes(collection.photos.map((photo) => photo.path)))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">Server Collections</h2>
          <p className="mt-1 text-sm text-stone-600">Create collections, archive inactive workspaces, and permanently delete archived collections.</p>
        </div>
        <LinkButton href="/server/collections/new">New collection</LinkButton>
      </div>

      <div className="grid gap-4">
        {collections.map((collection) => (
          <Card key={collection.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="font-serif text-xl font-semibold">{collection.name}</h3>
                <p className="text-sm text-stone-600">
                  /c/{collection.slug} · {collection.visibility.toLowerCase()} · {collection.status.toLowerCase()}
                  {collection.isDefault ? ' · default' : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {collection.status === 'ACTIVE' && !collection.isDefault && (
                  <form action={archiveCollection}>
                    <input type="hidden" name="collectionId" value={collection.id} />
                    <Button className="bg-[#9a6a35] px-3 py-1.5 hover:bg-[#7d5528]">Archive</Button>
                  </form>
                )}
                {collection.status === 'ARCHIVED' && (
                  <form action={restoreCollection}>
                    <input type="hidden" name="collectionId" value={collection.id} />
                    <Button className="px-3 py-1.5">Restore</Button>
                  </form>
                )}
              </div>
            </div>
            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <span>Members: {collection._count.memberships}</span>
              <span>Definitions: {collection._count.plantDefinitions}</span>
              <span>Specimens: {collection._count.plantInstances}</span>
              <span>Propagations: {collection._count.propagationEvents}</span>
              <span>Blooms: {collection._count.bloomEvents}</span>
              <span>Photos: {collection._count.photos}</span>
              <span>Reminders: {collection._count.reminders}</span>
              <span>Uploads: {formatBytes(byteCounts.get(collection.id) || 0)}</span>
            </div>
            {collection.status === 'ARCHIVED' && !collection.isDefault && (
              <form action={permanentlyDeleteCollection} className="mt-4 grid gap-2 border-t border-stone-200 pt-4 sm:max-w-md">
                <input type="hidden" name="collectionId" value={collection.id} />
                <Field label={`Type "${collection.slug}" to permanently delete`} name="confirmSlug" />
                <ConfirmDeleteButton title="Permanently delete collection?" message={`This cascades all records in ${collection.name}. This cannot be undone.`} confirmLabel="Delete forever">
                  Permanently delete
                </ConfirmDeleteButton>
              </form>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
