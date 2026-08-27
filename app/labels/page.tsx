import { prisma } from '@/lib/prisma'
import { LabelExportControls } from '@/components/LabelExportControls'
import { Button, Card } from '@/components/ui'
import { plantName } from '@/lib/utils'
import { collectionPath, requireCollectionViewer } from '@/lib/collections'
import { locationPath } from '@/lib/locations'

export default async function BulkLabels({
  searchParams,
}: {
  searchParams: Promise<{ target?: string; sort?: string }>
}) {
  const { collection } = await requireCollectionViewer()
  const sp = await searchParams
  const target = sp.target === 'locations' ? 'locations' : sp.target === 'both' ? 'both' : 'plants'
  const sort = sp.sort === 'added-newest' || sp.sort === 'added-oldest' ? sp.sort : 'plant-id'
  const [instances, locations] = await Promise.all([
    prisma.plantInstance.findMany({
      where: { collectionId: collection.id, status: 'ACTIVE' },
      include: { plantDefinition: true },
      orderBy: sort === 'added-newest'
        ? [{ createdAt: 'desc' }, { plantId: 'asc' }]
        : sort === 'added-oldest'
          ? [{ createdAt: 'asc' }, { plantId: 'asc' }]
          : [{ plantId: 'asc' }],
    }),
    prisma.location.findMany({
      where: { collectionId: collection.id, status: 'ACTIVE' },
      include: { locationType: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    }),
  ])
  const locationNodes = locations.map((location) => ({
    id: location.id,
    parentLocationId: location.parentLocationId,
    name: location.name,
    code: location.code,
    status: location.status,
    sortOrder: location.sortOrder,
    locationType: location.locationType,
  }))
  const showPlants = target === 'plants' || target === 'both'
  const showLocations = target === 'locations' || target === 'both'

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Plant Label PDFs</h2>
      <p className="max-w-2xl text-sm text-stone-600">
        Export labels for single-label rolls, printable sheets, or Brother DK-2210 continuous tape.
      </p>
      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          {[
            ['plants', 'Plants'],
            ['locations', 'Locations'],
            ['both', 'Plants + Locations'],
          ].map(([value, label]) => (
            <a
              key={value}
              href={collectionPath(collection.slug, `/labels?target=${value}&sort=${sort}`)}
              className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${target === value ? 'border-[#2f6b45] bg-[#e8efdf] text-[#2f6b45]' : 'border-stone-300 bg-white/70 text-stone-700'}`}
            >
              {label}
            </a>
          ))}
        </div>
        {showPlants && (
          <form action={collectionPath(collection.slug, '/labels')} method="get" className="mb-4 flex flex-wrap items-end gap-2">
            <input type="hidden" name="target" value={target} />
            <label className="grid min-w-52 gap-1 text-sm font-semibold">
              Sort plants by
              <select className="rounded-md border border-stone-300 bg-[#fffdf7] px-3 py-2 font-normal" name="sort" defaultValue={sort}>
                <option value="plant-id">Plant ID</option>
                <option value="added-newest">Date added, newest first</option>
                <option value="added-oldest">Date added, oldest first</option>
              </select>
            </label>
            <Button>Sort</Button>
          </form>
        )}
        <form action="/api/labels/bulk" method="get" className="grid gap-3">
          <input type="hidden" name="collectionSlug" value={collection.slug} />
          <input type="hidden" name="target" value={target} />
          <input type="hidden" name="sort" value={sort} />
          <input type="hidden" name="download" value="1" />
          <LabelExportControls />
          <div className="grid max-h-[520px] gap-2 overflow-auto rounded-lg border border-stone-200 bg-[#fffdf7] p-3">
            {showPlants && (
              <div className="grid gap-2">
                {target === 'both' && <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Plants</p>}
                {instances.map((instance) => (
                  <label key={instance.id} className="flex min-w-0 items-start gap-2 text-sm">
                    <input className="mt-1" type="checkbox" name="id" value={`plant:${instance.id}`} />
                    <span className="font-bold">{instance.plantId}</span>
                    <span className="min-w-0 break-words">{plantName(instance.plantDefinition)}</span>
                  </label>
                ))}
              </div>
            )}
            {showLocations && (
              <div className="grid gap-2 border-t border-stone-200 pt-3 first:border-t-0 first:pt-0">
                {target === 'both' && <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">Locations</p>}
                {locations.map((location) => (
                  <label key={location.id} className="flex min-w-0 items-start gap-2 text-sm">
                    <input className="mt-1" type="checkbox" name="id" value={`location:${location.id}`} />
                    <span className="font-bold">{location.code}</span>
                    <span className="min-w-0 break-words">{locationPath(location.id, locationNodes)} · {location.locationType.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button>Export selected PDF</Button>
            <Button
              className="border border-stone-300 bg-[#fffdf7] text-stone-800 hover:bg-[#f5f0e2]"
              name="all"
              value="1"
            >
              Export all shown as PDF
            </Button>
          </div>
          <a className="text-sm underline" href={collectionPath(collection.slug, '/labels')}>
            Refresh list
          </a>
        </form>
      </Card>
    </div>
  )
}
