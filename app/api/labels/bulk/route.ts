export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import path from 'path'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { prisma } from '@/lib/prisma'
import { collectionPath, ensureDefaultCollection } from '@/lib/collections'
import { getCurrentUser } from '@/lib/auth'
import { LABEL_HEIGHT_PT, LABEL_WIDTH_PT, plantLabelNameLines } from '@/lib/plant-labels'

const LABEL_ID_FONT = 'AxilDBLabelId'
const LABEL_ID_FONT_PATH = path.join(process.cwd(), 'public/fonts/IBMPlexMono-Regular.ttf')
const LETTER_WIDTH_PT = 8.5 * 72
const LETTER_HEIGHT_PT = 11 * 72
const SHEET_MARGIN_X = 36
const SHEET_MARGIN_Y = 36
const SHEET_GUTTER_X = 18
const SHEET_COLUMNS = 3
const SHEET_ROWS = 8
const BROTHER_DK_2210_WIDTH_PT = (1 + 1 / 7) * 72

type LabelFormat = 'fixed' | 'sheet' | 'brother-dk-2210'

type LabelItem = Awaited<ReturnType<typeof getLabelItems>>[number]

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

async function getLabelItems(collectionId: string, all: boolean, ids: string[]) {
  return prisma.plantInstance.findMany({
    where: all ? { collectionId, status: 'ACTIVE' } : { collectionId, id: { in: ids } },
    include: { plantDefinition: true },
    orderBy: { plantId: 'asc' },
  })
}

function labelLink(collectionSlug: string, instanceId: string) {
  return `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.axildb.com'}${collectionPath(collectionSlug, `/instances/${instanceId}`)}`
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
) {
  const margin = 5
  const qrSize = 48
  const qrX = x + LABEL_WIDTH_PT - margin - qrSize
  const qrY = y + 23
  const nameX = x + 7
  const nameY = y + 23
  const nameWidth = qrX - nameX - 7
  const nameHeight = 43
  const nameLines = plantLabelNameLines(item.plantDefinition)
  const collectionSize = oneLineFontSize(doc, collectionName, 'Times-Bold', 13, 6.5, LABEL_WIDTH_PT - 12)
  doc.font('Times-Bold').fontSize(collectionSize).text(collectionName, x + 6, y + 4, {
    width: LABEL_WIDTH_PT - 12,
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
  const idSize = oneLineFontSize(doc, item.plantId, LABEL_ID_FONT, 12, 6, LABEL_WIDTH_PT - 12)
  doc.font(LABEL_ID_FONT).fontSize(idSize).text(item.plantId, x + 6, y + 74, {
    width: LABEL_WIDTH_PT - 12,
    align: 'center',
    lineBreak: false,
  })
}

function brotherLabelHeight(doc: PDFKit.PDFDocument, item: LabelItem, collectionName: string) {
  const margin = 4.5
  const textWidth = BROTHER_DK_2210_WIDTH_PT - margin * 2
  const qrSize = textWidth
  const nameLines = plantLabelNameLines(item.plantDefinition)
  const collectionSize = oneLineFontSize(doc, collectionName, 'Times-Bold', 7.5, 4, textWidth)
  const nameSize = multiLineFontSize(doc, nameLines, 'Times-Italic', 13, 6, textWidth, 60)
  const idSize = oneLineFontSize(doc, item.plantId, LABEL_ID_FONT, 6.5, 3.8, textWidth)
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
  const nameLines = plantLabelNameLines(item.plantDefinition)
  const collectionSize = oneLineFontSize(doc, collectionName, 'Times-Bold', 7.5, 4, textWidth)
  const nameSize = multiLineFontSize(doc, nameLines, 'Times-Italic', 13, 6, textWidth, 60)
  const idSize = oneLineFontSize(doc, item.plantId, LABEL_ID_FONT, 6.5, 3.8, textWidth)

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
  doc.font(LABEL_ID_FONT).fontSize(idSize).text(item.plantId, margin, height - margin - idSize * 1.25, {
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

function filenameFor(format: LabelFormat) {
  if (format === 'sheet') return 'axildb-plant-label-sheet.pdf'
  if (format === 'brother-dk-2210') return 'axildb-brother-dk-2210-labels.pdf'
  return 'axildb-plant-labels.pdf'
}

export async function GET(req: Request) {
  const url=new URL(req.url)
  const ids=url.searchParams.getAll('id')
  const all=url.searchParams.get('all')==='1'
  const slug=url.searchParams.get('collectionSlug')
  const format = parseFormat(url)
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
  const items=await getLabelItems(collection.id, all, ids)
  const sizingDoc = new PDFDocument({ size: [BROTHER_DK_2210_WIDTH_PT, 170], margin: 0 })
  sizingDoc.registerFont(LABEL_ID_FONT, LABEL_ID_FONT_PATH)
  const firstBrotherHeight = items[0] ? brotherLabelHeight(sizingDoc, items[0], collection.name) : 170
  sizingDoc.end()
  const initialSize: [number, number] =
    format === 'sheet'
      ? [LETTER_WIDTH_PT, LETTER_HEIGHT_PT]
      : format === 'brother-dk-2210'
        ? [BROTHER_DK_2210_WIDTH_PT, firstBrotherHeight]
        : [LABEL_WIDTH_PT, LABEL_HEIGHT_PT]
  const doc=new PDFDocument({size:initialSize,margin:0})
  doc.registerFont(LABEL_ID_FONT, LABEL_ID_FONT_PATH)
  const chunks:Buffer[]=[]
  doc.on('data',c=>chunks.push(c))
  const done=new Promise<Buffer>(resolve=>doc.on('end',()=>resolve(Buffer.concat(chunks))))
  if (!items.length) {
    doc.font('Helvetica').fontSize(10).text('No labels selected.', 8, 36, { width: initialSize[0] - 16, align: 'center' })
  }
  if (format === 'sheet') {
    for (let index = 0; index < items.length; index += 1) {
      if (index > 0 && index % (SHEET_COLUMNS * SHEET_ROWS) === 0) doc.addPage({ size: [LETTER_WIDTH_PT, LETTER_HEIGHT_PT], margin: 0 })
      const item = items[index]
      const position = index % (SHEET_COLUMNS * SHEET_ROWS)
      const column = position % SHEET_COLUMNS
      const row = Math.floor(position / SHEET_COLUMNS)
      const x = SHEET_MARGIN_X + column * (LABEL_WIDTH_PT + SHEET_GUTTER_X)
      const y = SHEET_MARGIN_Y + row * LABEL_HEIGHT_PT
      const qrBuffer = await qrBufferFor(labelLink(collection.slug, item.id))
      drawFixedLabel(doc, item, collection.name, qrBuffer, x, y)
    }
  } else if (format === 'brother-dk-2210') {
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      const height = brotherLabelHeight(doc, item, collection.name)
      if (index > 0) doc.addPage({ size: [BROTHER_DK_2210_WIDTH_PT, height], margin: 0 })
      const qrBuffer = await qrBufferFor(labelLink(collection.slug, item.id))
      drawBrotherLabel(doc, item, collection.name, qrBuffer, height)
    }
  } else {
    for (let index = 0; index < items.length; index += 1) {
      if (index > 0) doc.addPage()
      const item = items[index]
      const qrBuffer = await qrBufferFor(labelLink(collection.slug, item.id))
      drawFixedLabel(doc, item, collection.name, qrBuffer)
    }
  }
  doc.end()
  const pdf=await done
  return new NextResponse(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="${filenameFor(format)}"`}})
}
