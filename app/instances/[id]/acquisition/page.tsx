import Link from 'next/link'
import { savePlantInstanceAcquisition } from '@/app/acquisition-actions'
import { AcquisitionSourceChainFields } from '@/components/AcquisitionSourceChainFields'
import { DistributorFields } from '@/components/DistributorFields'
import { Button, Card, Field, TextArea } from '@/components/ui'
import { collectionPath, requireCollectionLogger } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { dateInput, plantName } from '@/lib/utils'

export default async function EditPlantAcquisition({ params }: { params: Promise<{ id: string }> }) {
  const { collection } = await requireCollectionLogger()
  const { id } = await params
  const [instance, sources, distributors, sellers] = await Promise.all([
    prisma.plantInstance.findFirstOrThrow({
      where: { id, collectionId: collection.id },
      include: {
        plantDefinition: true,
        acquisitionRecordLinks: { include: { acquisitionRecord: { include: { sources: { include: { source: true }, orderBy: { sortOrder: 'asc' } } } } }, orderBy: { acquisitionRecord: { acquiredAt: 'desc' } }, take: 1 },
      },
    }),
    prisma.source.findMany({ where: { collectionId: collection.id, active: true }, orderBy: { name: 'asc' } }),
    prisma.distributor.findMany({ where: { collectionId: collection.id, active: true }, include: { outlets: { where: { active: true } } }, orderBy: { name: 'asc' } }),
    prisma.seller.findMany({ where: { collectionId: collection.id, active: true }, include: { storefronts: { where: { active: true }, include: { salesChannelType: true }, orderBy: { handleOrName: 'asc' } } }, orderBy: { name: 'asc' } }),
  ])
  const record = instance.acquisitionRecordLinks[0]?.acquisitionRecord

  return <div className="space-y-6">
    <header><p className="text-sm font-semibold uppercase tracking-wide text-[#2f6b45]">{instance.plantId}</p><h2 className="text-3xl font-bold">Edit Acquisition &amp; Provenance</h2><p className="mt-1 text-sm text-stone-600">{plantName(instance.plantDefinition)} · acquisition history is kept separately from ordinary specimen details.</p></header>
    <Card>
      <form action={savePlantInstanceAcquisition} className="grid max-w-5xl gap-4">
        <input type="hidden" name="collectionSlug" value={collection.slug} />
        <input type="hidden" name="plantInstanceId" value={instance.id} />
        {record && <input type="hidden" name="acquisitionRecordId" value={record.id} />}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Acquired date" name="acquiredAt" type="date" defaultValue={dateInput(record?.acquiredAt || instance.acquisitionDate)} required />
          <Field label="Acquisition label" name="acquisitionLabel" defaultValue={instance.acquisitionLabel} wrapperClassName="lg:col-span-2" />
          <Field label="Price" name="price" type="number" min="0" step="0.01" defaultValue={record?.price?.toString() || instance.purchasePrice?.toString()} />
          <Field label="Currency" name="currency" defaultValue={record?.currency || 'USD'} />
          <Field label="Specimen size" name="specimenSize" defaultValue={record?.specimenSize} />
          <Field label="Pot size" name="potSize" defaultValue={record?.potSize} />
        </div>
        <DistributorFields distributors={distributors} sellers={sellers} defaultSellerId={record?.sellerId || ''} defaultStorefrontId={record?.sellerStorefrontId || ''} defaultDistributorId={record?.distributorId || ''} defaultOutletId={record?.distributorOutletId || ''} />
        <AcquisitionSourceChainFields sources={sources} initialRows={record?.sources.map((item) => ({ sourceId: item.sourceId, role: item.role, notes: item.notes, isPrimary: item.isPrimary })) || []} />
        <TextArea label="Acquisition notes" name="notes" defaultValue={record?.notes} />
        <div className="flex flex-wrap items-center gap-3"><Button>{record ? 'Save acquisition changes' : 'Create acquisition record'}</Button><Link className="text-sm font-semibold text-[#2f6b45] underline" href={collectionPath(collection.slug, `/instances/${instance.id}`)}>Cancel</Link>{record && <span className="text-xs text-stone-500">Linked acquisition {record.id}</span>}</div>
      </form>
    </Card>
  </div>
}
