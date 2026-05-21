import QRCode from 'qrcode'
import { collectionPath, requireCollectionViewer } from '@/lib/collections'
import { approximatePreviewFontSize, plantLabelNameLines } from '@/lib/plant-labels'
import { prisma } from '@/lib/prisma'

export default async function Label({ params }: { params: Promise<{ id: string }> }) {
  const { collection } = await requireCollectionViewer()
  const { id } = await params
  const instance = await prisma.plantInstance.findFirstOrThrow({
    where: { id, collectionId: collection.id },
    include: { plantDefinition: true },
  })
  const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.axildb.com'}${collectionPath(collection.slug, `/instances/${id}`)}`
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 256 })
  const nameLines = plantLabelNameLines(instance.plantDefinition)
  const nameFontSize = approximatePreviewFontSize(nameLines, nameLines.length >= 3 ? 22 : 28, 9, 12)
  const collectionFontSize = approximatePreviewFontSize([collection.name], 13, 6.5, 28)
  const plantIdFontSize = approximatePreviewFontSize([instance.plantId], 12, 6, 24)

  return (
    <div className="label-page-shell space-y-4">
      <style>{`
        @page { size: 2.25in 1.25in; margin: 0; }
        @media print {
          body { margin: 0; background: white; }
          .label-page-shell { margin: 0 !important; padding: 0 !important; }
        }
      `}</style>
      <p className="no-print text-sm text-stone-600">Use browser print to send this exact-size label to your label printer.</p>
      <div className="tag-print">
        <div
          className="tag-collection"
          style={{ fontSize: `${collectionFontSize}pt` }}
        >
          {collection.name}
        </div>
        <div className="tag-name" style={{ fontSize: `${nameFontSize}pt` }}>
          {nameLines.map((line) => (
            <div key={line}>{line}</div>
          ))}
        </div>
        <img className="tag-qr" src={qr} alt="" />
        <div className="tag-plant-id" style={{ fontSize: `${plantIdFontSize}pt` }}>
          {instance.plantId}
        </div>
      </div>
    </div>
  )
}
