import QRCode from 'qrcode'
import { Button } from '@/components/ui'
import { collectionPath, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { fmtDate, plantName } from '@/lib/utils'

export default async function Label({ params }: { params: Promise<{ id: string }> }) {
  const { collection } = await requireCollectionViewer()
  const { id } = await params
  const instance = await prisma.plantInstance.findFirstOrThrow({
    where: { id, collectionId: collection.id },
    include: { plantDefinition: true },
  })
  const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.axildb.com'}${collectionPath(collection.slug, `/instances/${id}`)}`
  const qr = await QRCode.toDataURL(url)

  return (
    <div className="space-y-4">
      <Button className="no-print">Use browser print</Button>
      <div className="tag-print">
        <div>
          <div className="text-sm font-bold">{instance.plantId}</div>
          <div className="text-xs italic">{plantName(instance.plantDefinition)}</div>
          <div className="mt-1 text-[10px]">{instance.instanceType} · {instance.location || ''}</div>
          <div className="text-[10px]">
            {instance.propagationDate ? `Prop: ${fmtDate(instance.propagationDate)}` : `Acq: ${fmtDate(instance.acquisitionDate)}`}
          </div>
        </div>
        <img src={qr} alt="" />
      </div>
    </div>
  )
}
