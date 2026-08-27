export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import path from 'path'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { prisma } from '@/lib/prisma'
import { collectionPath, ensureDefaultCollection } from '@/lib/collections'
import { getCurrentUser } from '@/lib/auth'
import { locationPath, type LocationNode } from '@/lib/locations'
import {
  BROTHER_DK_2210_WIDTH_PT,
  LABEL_HEIGHT_PT,
  LABEL_WIDTH_PT,
  LETTER_HEIGHT_PT,
  LETTER_WIDTH_PT,
  type LabelFormat,
  type LabelOrientation,
  labelOrientationFromValue,
  orientSize,
  plantLabelNameLines,
} from '@/lib/plant-labels'

const LABEL_ID_FONT = 'AxilDBLabelId'
const LABEL_ID_FONT_PATH = path.join(process.cwd(), 'public/fonts/IBMPlexMono-Regular.ttf')
const SHEET_MARGIN_X = 36
const SHEET_MARGIN_Y = 36
const SHEET_GUTTER_X = 18
const SHEET_GUTTER_Y = 0

type LabelItem = Awaited<ReturnType<typeof getLabelItems>>[number]
type LabelTarget = 'plants' | 'locations' | 'both'
type PlantLabelSort = 'plant-id' | 'added-newest' | 'added-oldest'
type PdfDocumentWithCatalog = PDFKit.PDFDocument & {
  _root: { data: Record<string, unknown> }
  addNamedJavaScript?: (name: string, js: string) => void
}

function oneLineFontSize(doc: PDFKit.PDFDocument, text: string, font: string, max: number, min: number, width: number) {
  for (let size = max; size >= min; size -= 0.5) {
    doc.font(font).fontSize(size)
    if (doc.widthOfString(text) <= width) return size
  }
  return min
}

function multiLineFontSize(doc: PDFKit.PDFDocument, lines: string[], font: string, max: number, min: number, width: number, height: number) {
  for (let size = max; size >= min; size -= 0.5) {
    doc.font(font).fontSize(size)
    const lineHeight = size * 0.9
    const fitsWidth = lines.every((line) => doc.widthOfString(line) <= width)
    if (fitsWidth && lineHeight * lines.length <= height) return size
  }
  return min
}

async function getLabelItems(collectionId: string, all: boolean, ids: string[], target: LabelTarget, sort: PlantLabelSort) {
  const parsedPlantIds = ids
    .filter((id) => id.startsWith('plant:'))
    .map((id) => id.slice('plant:'.length))
  const parsedLocationIds = ids
    .filter((id) => id.startsWith('location:'))
    .map((id) => id.slice('location:'.length))
  const bareIds = ids.filter((id) => !id.includes(':'))
  const plantIds = target === 'plants' ? [...bareIds, ...parsedPlantIds] : parsedPlantIds
  const locationIds = target === 'locations' ? [...bareIds, ...parsedLocationIds] : parsedLocationIds

  const locationItems = async () => {
    const [items, allLocations] = await Promise.all([
      prisma.location.findMany({
        where: all ? { collectionId, status: 'ACTIVE' } : { collectionId, id: { in: locationIds } },
        include: { locationType: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      prisma.location.findMany({
        where: { collectionId },
        include: { locationType: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
    ])
    const locationNodes: LocationNode[] = allLocations.map((location) => ({
      id: location.id,
      parentLocationId: location.parentLocationId,
      name: location.name,
      code: location.code,
      status: location.status,
      sortOrder: location.sortOrder,
      locationType: location.locationType,
    }))
    return items.map((item) => ({ ...item, labelPath: locationPath(item.id, locationNodes) }))
  }

  const plantItems = () => prisma.plantInstance.findMany({
    where: all ? { collectionId, status: 'ACTIVE' } : { collectionId, id: { in: plantIds } },
    include: { plantDefinition: true },
    orderBy: sort === 'added-newest'
      ? [{ createdAt: 'desc' }, { plantId: 'asc' }]
      : sort === 'added-oldest'
        ? [{ createdAt: 'asc' }, { plantId: 'asc' }]
        : [{ plantId: 'asc' }],
  })

  if (target === 'locations') return locationItems()
  if (target === 'plants') return plantItems()
  const [plants, locations] = await Promise.all([plantItems(), locationItems()])
  return [...plants, ...locations]
}

function isLocationItem(item: LabelItem): item is Extract<LabelItem, { code: string; name: string }> {
  return 'code' in item && 'name' in item
}

function labelNameLines(item: LabelItem) {
  if (!isLocationItem(item)) return plantLabelNameLines(item.plantDefinition)
  const labelPath = 'labelPath' in item ? String(item.labelPath || '') : ''
  return [item.name, item.locationType.name, ...(labelPath && labelPath !== item.name ? [labelPath] : [])]
}

function labelCode(item: LabelItem) {
  return isLocationItem(item) ? item.code : item.plantId
}

function labelLink(collectionSlug: string, item: LabelItem) {
  const path = isLocationItem(item) ? `/locations/${item.id}` : `/instances/${item.id}`
  return `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.axildb.com'}${collectionPath(collectionSlug, path)}`
}

async function qrBufferFor(link: string) {
  const qr = await QRCode.toDataURL(link, { margin: 1, width: 256 })
  return Buffer.from(qr.split(',')[1], 'base64')
}

function drawFixedLabel(
  doc: PDFKit.PDFDocument,
  item: LabelItem,
  collectionName: string,
  qrBuffer: Buffer,
  x = 0,
  y = 0,
  width = LABEL_WIDTH_PT,
  height = LABEL_HEIGHT_PT,
) {
  const margin = 5
  const qrSize = Math.min(48, height - 38, width * 0.34)
  const qrX = x + width - margin - qrSize
  const qrY = y + Math.max(21, (height - qrSize) / 2)
  const nameX = x + 7
  const nameY = y + 23
  const nameWidth = qrX - nameX - 7
  const nameHeight = Math.max(28, height - 47)
  const nameLines = labelNameLines(item)
  const collectionSize = oneLineFontSize(doc, collectionName, 'Times-Bold', 13, 6.5, width - 12)
  doc.font('Times-Bold').fontSize(collectionSize).text(collectionName, x + 6, y + 4, {
    width: width - 12,
    align: 'center',
    lineBreak: false,
  })
  doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize })
  const nameSize = multiLineFontSize(doc, nameLines, 'Times-Italic', nameLines.length >= 3 ? 22 : 28, 9, nameWidth, nameHeight)
  const lineHeight = nameSize * 0.9
  let currentY = nameY + (nameHeight - lineHeight * nameLines.length) / 2
  doc.font('Times-Italic').fontSize(nameSize)
  for (const line of nameLines) {
    doc.text(line, nameX, currentY, { width: nameWidth, lineBreak: false })
    currentY += lineHeight
  }
  const idText = labelCode(item)
  const idSize = oneLineFontSize(doc, idText, LABEL_ID_FONT, 12, 6, width - 12)
  doc.font(LABEL_ID_FONT).fontSize(idSize).text(idText, x + 6, y + height - 16, {
    width: width - 12,
    align: 'center',
    lineBreak: false,
  })
}

function drawPortraitLabel(
  doc: PDFKit.PDFDocument,
  item: LabelItem,
  collectionName: string,
  qrBuffer: Buffer,
  width = LABEL_HEIGHT_PT,
  height = LABEL_WIDTH_PT,
  x = 0,
  y = 0,
) {
  const margin = 5
  const textWidth = width - margin * 2
  const qrSize = Math.min(width - 18, 58)
  const nameLines = labelNameLines(item)
  const collectionSize = oneLineFontSize(doc, collectionName, 'Times-Bold', 9, 5, textWidth)
  const nameSize = multiLineFontSize(doc, nameLines, 'Times-Italic', 14, 6, textWidth, 48)
  const idText = labelCode(item)
  const idSize = oneLineFontSize(doc, idText, LABEL_ID_FONT, 8, 4.5, textWidth)

  let currentY = y + margin
  doc.font('Times-Bold').fontSize(collectionSize).text(collectionName, x + margin, currentY, {
    width: textWidth,
    align: 'center',
    lineBreak: false,
  })
  currentY += collectionSize * 1.25 + 5
  doc.image(qrBuffer, x + (width - qrSize) / 2, currentY, { width: qrSize, height: qrSize })
  currentY += qrSize + 6
  doc.font('Times-Italic').fontSize(nameSize)
  for (const line of nameLines) {
    doc.text(line, x + margin, currentY, { width: textWidth, align: 'center', lineBreak: false })
    currentY += nameSize * 1.05
  }
  doc.font(LABEL_ID_FONT).fontSize(idSize).text(idText, x + margin, y + height - margin - idSize * 1.2, {
    width: textWidth,
    align: 'center',
    lineBreak: false,
  })
}

function brotherLabelHeight(doc: PDFKit.PDFDocument, item: LabelItem, collectionName: string) {
  const margin = 4.5
  const textWidth = BROTHER_DK_2210_WIDTH_PT - margin * 2
  const qrSize = textWidth
  const nameLines = labelNameLines(item)
  const collectionSize = oneLineFontSize(doc, collectionName, 'Times-Bold', 7.5, 4, textWidth)
  const nameSize = multiLineFontSize(doc, nameLines, 'Times-Italic', 13, 6, textWidth, 60)
  const idSize = oneLineFontSize(doc, labelCode(item), LABEL_ID_FONT, 6.5, 3.8, textWidth)
  const collectionHeight = collectionSize * 1.2
  const nameHeight = nameSize * 1.05 * nameLines.length
  const idHeight = idSize * 1.25
  return Math.max(170, margin + qrSize + 7 + collectionHeight + 7 + nameHeight + 8 + idHeight + margin)
}

function drawBrotherLabel(
  doc: PDFKit.PDFDocument,
  item: LabelItem,
  collectionName: string,
  qrBuffer: Buffer,
  height: number,
) {
  const margin = 4.5
  const textWidth = BROTHER_DK_2210_WIDTH_PT - margin * 2
  const qrSize = textWidth
  const nameLines = labelNameLines(item)
  const collectionSize = oneLineFontSize(doc, collectionName, 'Times-Bold', 7.5, 4, textWidth)
  const nameSize = multiLineFontSize(doc, nameLines, 'Times-Italic', 13, 6, textWidth, 60)
  const idText = labelCode(item)
  const idSize = oneLineFontSize(doc, idText, LABEL_ID_FONT, 6.5, 3.8, textWidth)

  let y = margin
  doc.image(qrBuffer, margin, y, { width: qrSize, height: qrSize })
  y += qrSize + 7
  doc.font('Times-Bold').fontSize(collectionSize).text(collectionName, margin, y, {
    width: textWidth,
    align: 'center',
    lineBreak: false,
  })
  y += collectionSize * 1.2 + 7
  doc.font('Times-Italic').fontSize(nameSize)
  for (const line of nameLines) {
    doc.text(line, margin, y, { width: textWidth, align: 'center', lineBreak: false })
    y += nameSize * 1.05
  }
  doc.font(LABEL_ID_FONT).fontSize(idSize).text(idText, margin, height - margin - idSize * 1.25, {
    width: textWidth,
    align: 'center',
    lineBreak: false,
  })
}

function brotherLandscapeWidth(doc: PDFKit.PDFDocument, item: LabelItem, collectionName: string) {
  const margin = 5
  const qrSize = BROTHER_DK_2210_WIDTH_PT - margin * 2
  const nameLines = labelNameLines(item)
  const textWidth = Math.max(
    132,
    doc.font('Times-Bold').fontSize(8).widthOfString(collectionName) + 8,
    ...nameLines.map((line) => doc.font('Times-Italic').fontSize(13).widthOfString(line) + 8),
    doc.font(LABEL_ID_FONT).fontSize(7).widthOfString(labelCode(item)) + 8,
  )
  return Math.max(210, margin + qrSize + 7 + textWidth + margin)
}

function drawBrotherLandscapeLabel(
  doc: PDFKit.PDFDocument,
  item: LabelItem,
  collectionName: string,
  qrBuffer: Buffer,
  width: number,
) {
  const margin = 5
  const height = BROTHER_DK_2210_WIDTH_PT
  const qrSize = height - margin * 2
  const textX = margin + qrSize + 7
  const textWidth = width - textX - margin
  const nameLines = labelNameLines(item)
  const collectionSize = oneLineFontSize(doc, collectionName, 'Times-Bold', 8, 4.5, textWidth)
  const nameSize = multiLineFontSize(doc, nameLines, 'Times-Italic', 13, 6, textWidth, 38)
  const idText = labelCode(item)
  const idSize = oneLineFontSize(doc, idText, LABEL_ID_FONT, 7, 4, textWidth)

  doc.image(qrBuffer, margin, margin, { width: qrSize, height: qrSize })
  doc.font('Times-Bold').fontSize(collectionSize).text(collectionName, textX, margin + 1, {
    width: textWidth,
    align: 'center',
    lineBreak: false,
  })

  const lineHeight = nameSize * 1.05
  let currentY = (height - lineHeight * nameLines.length) / 2
  doc.font('Times-Italic').fontSize(nameSize)
  for (const line of nameLines) {
    doc.text(line, textX, currentY, { width: textWidth, align: 'center', lineBreak: false })
    currentY += lineHeight
  }

  doc.font(LABEL_ID_FONT).fontSize(idSize).text(idText, textX, height - margin - idSize * 1.2, {
    width: textWidth,
    align: 'center',
    lineBreak: false,
  })
}

function parseFormat(url: URL): LabelFormat {
  const format = url.searchParams.get('format')
  if (format === 'sheet' || format === 'brother-dk-2210') return format
  return 'fixed'
}

function filenameFor(format: LabelFormat, orientation: LabelOrientation) {
  const suffix = `-${orientation}`
  if (format === 'sheet') return `axildb-plant-label-sheet${suffix}.pdf`
  if (format === 'brother-dk-2210') return `axildb-brother-dk-2210-labels${suffix}.pdf`
  return `axildb-plant-labels${suffix}.pdf`
}

function isMobileRequest(req: Request) {
  const mobileHint = req.headers.get('sec-ch-ua-mobile') || ''
  const userAgent = req.headers.get('user-agent') || ''
  return mobileHint.includes('?1') || /\b(iPhone|iPad|iPod|Android|Mobile)\b/i.test(userAgent) || (/Macintosh/i.test(userAgent) && /Mobile/i.test(userAgent))
}

function addOpenPrintAction(doc: PDFKit.PDFDocument) {
  const internalDoc = doc as PdfDocumentWithCatalog
  const printScript = 'this.print({ bUI: true, bSilent: false, bShrinkToFit: false });'
  internalDoc.addNamedJavaScript?.('axildb-mobile-label-print', printScript)
  const action = doc.ref({
    S: 'JavaScript',
    JS: new String(printScript),
  })
  internalDoc._root.data.OpenAction = action
  action.end(undefined)
}

function labelPageSize(format: LabelFormat, orientation: LabelOrientation, brotherLength = 170): [number, number] {
  if (format === 'sheet') return orientSize(LETTER_WIDTH_PT, LETTER_HEIGHT_PT, orientation)
  if (format === 'brother-dk-2210') {
    return orientation === 'landscape'
      ? [brotherLength, BROTHER_DK_2210_WIDTH_PT]
      : [BROTHER_DK_2210_WIDTH_PT, brotherLength]
  }
  return orientSize(LABEL_WIDTH_PT, LABEL_HEIGHT_PT, orientation)
}

function sheetGrid(pageWidth: number, pageHeight: number) {
  const usableWidth = pageWidth - SHEET_MARGIN_X * 2
  const usableHeight = pageHeight - SHEET_MARGIN_Y * 2
  const columns = Math.max(1, Math.floor((usableWidth + SHEET_GUTTER_X) / (LABEL_WIDTH_PT + SHEET_GUTTER_X)))
  const rows = Math.max(1, Math.floor((usableHeight + SHEET_GUTTER_Y) / (LABEL_HEIGHT_PT + SHEET_GUTTER_Y)))
  return {
    columns,
    rows,
    perPage: columns * rows,
    offsetX: SHEET_MARGIN_X + Math.max(0, (usableWidth - columns * LABEL_WIDTH_PT - (columns - 1) * SHEET_GUTTER_X) / 2),
    offsetY: SHEET_MARGIN_Y + Math.max(0, (usableHeight - rows * LABEL_HEIGHT_PT - (rows - 1) * SHEET_GUTTER_Y) / 2),
  }
}

export async function GET(req: Request) {
  const url=new URL(req.url)
  const autoPrintOnOpen = isMobileRequest(req)
  const ids=url.searchParams.getAll('id')
  const all=url.searchParams.get('all')==='1'
  const rawTarget = url.searchParams.get('target')
  const target: LabelTarget = rawTarget === 'locations' ? 'locations' : rawTarget === 'both' ? 'both' : 'plants'
  const rawSort = url.searchParams.get('sort')
  const sort: PlantLabelSort = rawSort === 'added-newest' || rawSort === 'added-oldest' ? rawSort : 'plant-id'
  const slug=url.searchParams.get('collectionSlug')
  const format = parseFormat(url)
  const orientation = labelOrientationFromValue(url.searchParams.get('orientation'), format)
  const collection=slug
    ? await prisma.collection.findUnique({where:{slug},select:{id:true,name:true,slug:true,visibility:true}})
    : await ensureDefaultCollection().then(collection=>({
      id: collection.id,
      name: collection.name,
      slug: collection.slug,
      visibility: collection.visibility,
    }))
  if (!collection) return NextResponse.json({error:'Collection not found'}, {status:404})
  const user=await getCurrentUser()
  if (collection.visibility !== 'PUBLIC') {
    if (!user) return NextResponse.json({error:'Unauthorized'}, {status:401})
    const membership=await prisma.collectionMembership.findUnique({where:{collectionId_userId:{collectionId:collection.id,userId:user.id}},select:{status:true}})
    if (membership?.status !== 'ACTIVE') return NextResponse.json({error:'Forbidden'}, {status:403})
  }
  const items=await getLabelItems(collection.id, all, ids, target, sort)
  const sizingDoc = new PDFDocument({ size: [BROTHER_DK_2210_WIDTH_PT, 170], margin: 0 })
  sizingDoc.registerFont(LABEL_ID_FONT, LABEL_ID_FONT_PATH)
  const firstBrotherLength = items[0]
    ? orientation === 'landscape'
      ? brotherLandscapeWidth(sizingDoc, items[0], collection.name)
      : brotherLabelHeight(sizingDoc, items[0], collection.name)
    : 170
  sizingDoc.end()
  const initialSize = labelPageSize(format, orientation, firstBrotherLength)
  const doc=new PDFDocument({size:initialSize,margin:0})
  doc.registerFont(LABEL_ID_FONT, LABEL_ID_FONT_PATH)
  if (autoPrintOnOpen) addOpenPrintAction(doc)
  const chunks:Buffer[]=[]
  doc.on('data',c=>chunks.push(c))
  const done=new Promise<Buffer>(resolve=>doc.on('end',()=>resolve(Buffer.concat(chunks))))
  if (!items.length) {
    doc.font('Helvetica').fontSize(10).text('No labels selected.', 8, 36, { width: initialSize[0] - 16, align: 'center' })
  }
  if (format === 'sheet') {
    const [pageWidth, pageHeight] = labelPageSize('sheet', orientation)
    const grid = sheetGrid(pageWidth, pageHeight)
    for (let index = 0; index < items.length; index += 1) {
      if (index > 0 && index % grid.perPage === 0) doc.addPage({ size: [pageWidth, pageHeight], margin: 0 })
      const item = items[index]
      const position = index % grid.perPage
      const column = position % grid.columns
      const row = Math.floor(position / grid.columns)
      const x = grid.offsetX + column * (LABEL_WIDTH_PT + SHEET_GUTTER_X)
      const y = grid.offsetY + row * (LABEL_HEIGHT_PT + SHEET_GUTTER_Y)
      const qrBuffer = await qrBufferFor(labelLink(collection.slug, item))
      drawFixedLabel(doc, item, collection.name, qrBuffer, x, y)
    }
  } else if (format === 'brother-dk-2210') {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      const length = orientation === 'landscape'
        ? brotherLandscapeWidth(doc, item, collection.name)
        : brotherLabelHeight(doc, item, collection.name)
      if (index > 0) doc.addPage({ size: labelPageSize(format, orientation, length), margin: 0 })
      const qrBuffer = await qrBufferFor(labelLink(collection.slug, item))
      if (orientation === 'landscape') {
        drawBrotherLandscapeLabel(doc, item, collection.name, qrBuffer, length)
      } else {
        drawBrotherLabel(doc, item, collection.name, qrBuffer, length)
      }
    }
  } else {
    const [pageWidth, pageHeight] = labelPageSize(format, orientation)
    for (let index = 0; index < items.length; index += 1) {
      if (index > 0) doc.addPage({ size: [pageWidth, pageHeight], margin: 0 })
      const item = items[index]
      const qrBuffer = await qrBufferFor(labelLink(collection.slug, item))
      if (orientation === 'portrait') {
        drawPortraitLabel(doc, item, collection.name, qrBuffer, pageWidth, pageHeight)
      } else {
        drawFixedLabel(doc, item, collection.name, qrBuffer, 0, 0, pageWidth, pageHeight)
      }
    }
  }
  doc.end()
  const pdf=await done
  const filename = filenameFor(format, orientation)
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${autoPrintOnOpen ? 'inline' : 'attachment'}; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}
