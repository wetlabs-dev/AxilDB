import QRCode from 'qrcode'
import { collectionPath, requireCollectionViewer } from '@/lib/collections'
import { Button, Select } from '@/components/ui'
import { approximatePreviewFontSize, labelOrientationFromValue, plantLabelNameLines } from '@/lib/plant-labels'
import { prisma } from '@/lib/prisma'

export default async function Label({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ orientation?: string }>
}) {
  const { collection } = await requireCollectionViewer()
  const { id } = await params
  const sp = await searchParams
  const orientation = labelOrientationFromValue(sp.orientation || null, 'fixed')
  const instance = await prisma.plantInstance.findFirstOrThrow({
    where: { id, collectionId: collection.id },
    include: { plantDefinition: true },
  })
  const url = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.axildb.com'}${collectionPath(collection.slug, `/instances/${id}`)}`
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 256 })
  const nameLines = plantLabelNameLines(instance.plantDefinition)
  const isPortrait = orientation === 'portrait'
  const nameFontSize = approximatePreviewFontSize(nameLines, isPortrait ? 14 : nameLines.length >= 3 ? 22 : 28, isPortrait ? 6 : 9, isPortrait ? 14 : 12)
  const collectionFontSize = approximatePreviewFontSize([collection.name], isPortrait ? 9 : 13, isPortrait ? 5 : 6.5, isPortrait ? 16 : 28)
  const plantIdFontSize = approximatePreviewFontSize([instance.plantId], isPortrait ? 8 : 12, isPortrait ? 4.5 : 6, isPortrait ? 14 : 24)

  return (
    <div className="label-page-shell space-y-4">
      <style>{`
        @page { size: ${isPortrait ? '1.25in 2.25in' : '2.25in 1.25in'}; margin: 0; }
        @media print {
          body { margin: 0; background: white; }
          .label-page-shell { margin: 0 !important; padding: 0 !important; }
        }
      `}</style>
      <div className="no-print grid max-w-sm gap-3">
        <p className="text-sm text-stone-600">Use browser print to send this exact-size label to your label printer.</p>
        <form className="flex items-end gap-2" method="get">
          <Select label="Orientation" name="orientation" defaultValue={orientation}>
            <option value="landscape">Landscape</option>
            <option value="portrait">Portrait</option>
          </Select>
          <Button className="shrink-0">Update preview</Button>
        </form>
      </div>
      <div className={`tag-print ${isPortrait ? 'portrait' : ''}`}>
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
