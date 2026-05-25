import { prisma } from '@/lib/prisma'
import { Button, Card, Select } from '@/components/ui'
import { plantName } from '@/lib/utils'
import { collectionPath, requireCollectionViewer } from '@/lib/collections'

export default async function BulkLabels() {
  const { collection } = await requireCollectionViewer()
  const instances = await prisma.plantInstance.findMany({
    where: { collectionId: collection.id, status: 'ACTIVE' },
    include: { plantDefinition: true },
    orderBy: { plantId: 'asc' },
  })

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Plant Label PDFs</h2>
      <p className="max-w-2xl text-sm text-stone-600">
        Export labels for single-label rolls, printable sheets, or Brother DK-2210 continuous tape.
      </p>
      <Card>
        <form action="/api/labels/bulk" method="get" className="grid gap-3">
          <input type="hidden" name="collectionSlug" value={collection.slug} />
          <Select
            label="Print format"
            name="format"
            defaultValue="fixed"
            help="Choose one label per PDF page, a letter-size sheet of ganged labels, or narrow continuous Brother DK-2210 labels."
            wrapperClassName="max-w-xl"
          >
            <option value="fixed">2.25 × 1.25 inch label, one per page</option>
            <option value="sheet">Legacy print sheet, ganged labels</option>
            <option value="brother-dk-2210">Brother DK-2210 continuous 1 1/7 inch label</option>
          </Select>
          <div className="grid max-h-[520px] gap-2 overflow-auto rounded-lg border border-stone-200 bg-[#fffdf7] p-3">
            {instances.map((instance) => (
              <label key={instance.id} className="flex min-w-0 items-start gap-2 text-sm">
                <input className="mt-1" type="checkbox" name="id" value={instance.id} />
                <span className="font-bold">{instance.plantId}</span>
                <span className="min-w-0 break-words">{plantName(instance.plantDefinition)}</span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button>Export selected PDF</Button>
            <Button
              className="border border-stone-300 bg-[#fffdf7] text-stone-800 hover:bg-[#f5f0e2]"
              name="all"
              value="1"
            >
              Export all active as PDF
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
