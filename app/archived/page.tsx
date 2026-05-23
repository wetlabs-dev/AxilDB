import { SortControl } from '@/components/SortControl'
import { Card } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { collectionPath, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { compareText, sortPreference, timeValue, type SortOption } from '@/lib/sort-preferences'
import { fmtDate, plantName } from '@/lib/utils'
import Link from 'next/link'

const archivedSortOptions: SortOption[] = [
  { value: 'archiveDesc', label: 'Newest archived' },
  { value: 'archiveAsc', label: 'Oldest archived' },
  { value: 'plantIdAsc', label: 'Plant ID A-Z' },
]

export default async function Archived() {
  const user = await getCurrentUser()
  const { collection } = await requireCollectionViewer()
  const sortKey = await sortPreference(user?.id, 'archived', 'archiveDesc', archivedSortOptions.map((option) => option.value))
  const items = await prisma.plantInstance.findMany({
    where: { collectionId: collection.id, status: 'ARCHIVED' },
    include: { plantDefinition: true },
    orderBy: { archiveDate: 'desc' },
  })
  const sortedItems = [...items].sort((left, right) => {
    if (sortKey === 'archiveAsc') return timeValue(left.archiveDate) - timeValue(right.archiveDate)
    if (sortKey === 'plantIdAsc') return compareText(left.plantId, right.plantId)
    return timeValue(right.archiveDate) - timeValue(left.archiveDate)
  })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-3xl font-bold">Archived Plants</h2>
        <SortControl
          section="archived"
          value={sortKey}
          options={archivedSortOptions}
          back={collectionPath(collection.slug, '/archived')}
          disabled={!user}
        />
      </div>
      {sortedItems.map((item) => (
        <Card key={item.id}>
          <Link className="font-bold underline" href={collectionPath(collection.slug, `/instances/${item.id}`)}>
            {item.plantId}
          </Link>
          <p className="text-sm">{plantName(item.plantDefinition)} · {fmtDate(item.archiveDate)} · {item.archiveReason}</p>
          <p>{item.archiveNotes}</p>
        </Card>
      ))}
      {items.length === 0 && <Card>No archived plants yet.</Card>}
    </div>
  )
}
