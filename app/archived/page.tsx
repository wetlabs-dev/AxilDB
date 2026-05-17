import { Card } from '@/components/ui'
import { collectionPath, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { fmtDate, plantName } from '@/lib/utils'
import Link from 'next/link'

export default async function Archived() {
  const { collection } = await requireCollectionViewer()
  const items = await prisma.plantInstance.findMany({
    where: { collectionId: collection.id, status: 'ARCHIVED' },
    include: { plantDefinition: true },
    orderBy: { archiveDate: 'desc' },
  })

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Archived Plants</h2>
      {items.map((item) => (
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
