export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { existsSync } from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import { isPublishedExhibitVisible, loadExhibitForDisplay } from '@/lib/exhibits'
import { prisma } from '@/lib/prisma'
import { formatDate } from '@/lib/time'
import { plantName, taxonomyLabel } from '@/lib/utils'

const PAGE_BG = '#f8f3e6'
const INK = '#2f2618'
const MUTED = '#756f64'
const GREEN = '#2f6b45'
const BORDER = '#d8d0bc'
const CARD = '#fffaf0'
const WASH = '#e8efdf'
const FOOTER_Y = 724
const FONT_DIR = path.join(process.cwd(), 'public', 'fonts')
const AXILDB_FONT_FILES = {
  sans: 'Inter-400.ttf',
  sansMedium: 'Inter-500.ttf',
  sansSemi: 'Inter-600.ttf',
  sansBold: 'Inter-700.ttf',
  serifSemi: 'Fraunces-600.ttf',
  serifBold: 'Fraunces-700.ttf',
  serifBlack: 'Fraunces-800.ttf',
  mono: 'IBMPlexMono-Regular.ttf',
} as const
const FONT = {
  sans: 'Helvetica',
  sansMedium: 'Helvetica',
  sansSemi: 'Helvetica-Bold',
  sansBold: 'Helvetica-Bold',
  serifSemi: 'Times-Bold',
  serifBold: 'Times-Bold',
  serifBlack: 'Times-Bold',
  mono: 'Courier',
}

function left(doc: PDFKit.PDFDocument) {
  return doc.page.margins.left
}

function right(doc: PDFKit.PDFDocument) {
  return doc.page.width - doc.page.margins.right
}

function width(doc: PDFKit.PDFDocument) {
  return right(doc) - left(doc)
}

function bottom(doc: PDFKit.PDFDocument) {
  return doc.page.height - doc.page.margins.bottom
}

function drawPageBackground(doc: PDFKit.PDFDocument) {
  doc.save()
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(PAGE_BG)
  doc.restore()
  doc.fillColor(INK)
}

function registerAxilDbFonts(doc: PDFKit.PDFDocument) {
  for (const [name, filename] of Object.entries(AXILDB_FONT_FILES)) {
    const fontPath = path.join(FONT_DIR, filename)
    if (!existsSync(fontPath)) continue
    const pdfName = `AxilDB-${name}`
    doc.registerFont(pdfName, fontPath)
    ;(FONT as Record<string, string>)[name] = pdfName
  }
}

function drawRunningHeader(doc: PDFKit.PDFDocument, title: string) {
  doc.save()
  doc.font(FONT.sans).fontSize(7.5).fillColor('#8a8173')
  doc.text(`AxilDB Collection Exhibit - ${title}`, left(doc), 30, { width: 360, lineBreak: false })
  doc.restore()
}

function newPage(doc: PDFKit.PDFDocument, title?: string) {
  doc.addPage()
  drawPageBackground(doc)
  if (title) drawRunningHeader(doc, title)
  doc.y = doc.page.margins.top
}

function ensureRoom(doc: PDFKit.PDFDocument, needed: number, title?: string) {
  if (doc.y + needed > bottom(doc)) newPage(doc, title)
}

function text(doc: PDFKit.PDFDocument, value: string, options: PDFKit.Mixins.TextOptions = {}) {
  doc.text(value, left(doc), doc.y, { width: width(doc), ...options })
}

function clean(value?: string | null) {
  return value?.trim() || null
}

function localUploadPath(photo?: { path?: string | null } | null) {
  if (!photo?.path || !photo.path.startsWith('/uploads/') || photo.path.includes('..')) return null
  const local = path.join(process.cwd(), 'public', photo.path)
  return existsSync(local) ? local : null
}

function drawPhoto(doc: PDFKit.PDFDocument, photo: any, x: number, y: number, w: number, h: number) {
  const local = localUploadPath(photo)
  doc.save()
  doc.roundedRect(x, y, w, h, 8).fillAndStroke(WASH, BORDER)
  if (local) {
    try {
      doc.image(local, x + 1, y + 1, { fit: [w - 2, h - 2], align: 'center', valign: 'center' })
    } catch {
      doc.font(FONT.sans).fontSize(8).fillColor(MUTED).text('Image unavailable', x + 8, y + h / 2 - 5, { width: w - 16, align: 'center' })
    }
  }
  doc.restore()
}

function detailGrid(doc: PDFKit.PDFDocument, rows: Array<[string, string | null | undefined]>, columns = 2, title?: string) {
  const visible = rows.filter(([, value]) => clean(value))
  if (!visible.length) return
  const gap = 8
  const colW = (width(doc) - gap * (columns - 1)) / columns
  for (let i = 0; i < visible.length; i += columns) {
    const row = visible.slice(i, i + columns)
    const rowH = Math.max(44, ...row.map(([, value]) => {
      doc.font(FONT.sans).fontSize(9.2)
      return Math.min(72, doc.heightOfString(String(value), { width: colW - 18, lineGap: 1 }) + 28)
    }))
    ensureRoom(doc, rowH + 6, title)
    const y = doc.y
    row.forEach(([label, value], col) => {
      const x = left(doc) + col * (colW + gap)
      doc.roundedRect(x, y, colW, rowH, 6).fillAndStroke('#fffdf7', '#e1d8c7')
      doc.font(FONT.sansBold).fontSize(6.5).fillColor(MUTED).text(label.toUpperCase(), x + 9, y + 8, { width: colW - 18, characterSpacing: 0.7 })
      doc.font(FONT.sans).fontSize(9.2).fillColor(INK).text(String(value), x + 9, y + 22, { width: colW - 18, lineGap: 1, height: rowH - 28, ellipsis: true })
    })
    doc.y = y + rowH + 6
  }
}

function referenceLinkRow(doc: PDFKit.PDFDocument, items: Array<[string, string | null | undefined]>, title?: string) {
  const visible = items.filter(([, href]) => clean(href))
  if (!visible.length) return
  ensureRoom(doc, 24, title)
  doc.font(FONT.sans).fontSize(8.5)
  let x = left(doc)
  let rowY = doc.y
  const startY = doc.y
  doc.font(FONT.sansBold).fontSize(7.5).fillColor(MUTED).text('REFERENCES', x, rowY + 1, { width: 66, characterSpacing: 0.7, lineBreak: false })
  x += 76
  for (const [label, href] of visible) {
    doc.font(FONT.sansBold).fontSize(8.5)
    const linkW = doc.widthOfString(label)
    if (x + linkW > right(doc)) {
      x = left(doc)
      rowY += 16
      ensureRoom(doc, 16, title)
    }
    doc.fillColor(GREEN).text(label, x, rowY, { width: linkW, link: href || undefined, underline: true, lineBreak: false })
    x += linkW + 12
  }
  doc.y = Math.max(rowY + 18, startY + 18)
}

function writeParagraph(doc: PDFKit.PDFDocument, value?: string | null, fontSize = 9.5, title?: string) {
  const body = clean(value)
  if (!body) return
  ensureRoom(doc, 38, title)
  doc.font(FONT.sans).fontSize(fontSize).fillColor(INK)
  text(doc, body, { lineGap: 2 })
  doc.moveDown(0.55)
}

function drawDefinitionSection(
  doc: PDFKit.PDFDocument,
  data: NonNullable<Awaited<ReturnType<typeof loadExhibitForDisplay>>>,
  group: any,
  startNewPage: boolean,
) {
  if (startNewPage) newPage(doc, data.exhibit.title)
  else ensureRoom(doc, 156, data.exhibit.title)

  doc.font(FONT.sansBold).fontSize(8.5).fillColor(GREEN).text(`${group.entries.length} selected specimen${group.entries.length === 1 ? '' : 's'}`.toUpperCase(), left(doc), doc.y, { characterSpacing: 1.1 })
  doc.moveDown(0.18)
  doc.font(FONT.serifBold).fontSize(25).fillColor(INK)
  text(doc, plantName(group.definition))
  doc.moveDown(0.35)
  writeParagraph(doc, group.definition.description, 10, data.exhibit.title)

  if (data.settings.typeImages && group.typePhotos.length) {
    ensureRoom(doc, 106, data.exhibit.title)
    const y = doc.y
    group.typePhotos.slice(0, 4).forEach((photo: any, index: number) => {
      drawPhoto(doc, photo, left(doc) + index * 122, y, 112, 78)
      if (photo.caption) {
        doc.font(FONT.sans).fontSize(7.5).fillColor(MUTED).text(photo.caption, left(doc) + index * 122, y + 82, { width: 112, height: 16, ellipsis: true })
      }
    })
    doc.y = y + 104
  }

  if (data.settings.taxonomyDetails) {
    detailGrid(doc, [
      ['Authority', group.definition.authority],
      ['Registration', group.definition.cultivarRegistrationNumber],
      ['Governing body', group.definition.governingBody?.name],
      ['Confidence', taxonomyLabel(group.definition.confidence)],
      ['Validation', group.definition.isValidated ? `Validated ${formatDate(group.definition.validatedAt)}` : 'Not validated'],
      ['Acquisition label', group.definition.acquisitionLabel],
    ], 2, data.exhibit.title)
  }

  if (data.settings.aliases && group.definition.aliases.length) {
    ensureRoom(doc, 32, data.exhibit.title)
    doc.font(FONT.sansBold).fontSize(8.5).fillColor(INK).text('Also known as', left(doc), doc.y)
    doc.font(FONT.sans).fontSize(9).fillColor(INK)
    text(doc, group.definition.aliases.map((alias: any) => alias.name).join(', '))
    doc.moveDown(0.55)
  }

  if (data.settings.husbandry && group.definition.husbandryGuide) {
    const guide = group.definition.husbandryGuide
    detailGrid(doc, [
      ['Care', guide.summaryCare],
      ['Water', guide.summaryWater || guide.wateringCadence],
      ['Light', guide.summaryLight || guide.lightIntensity],
      ['Medium', guide.mediumPreferred],
      ['Bloom', guide.bloomSeason],
      ['Propagation', guide.propagationMethods],
    ], 2, data.exhibit.title)
  }

  if (data.settings.referenceLinks) {
    referenceLinkRow(doc, [
      ['Wikipedia', group.definition.wikipediaUrl],
      ['iNaturalist', group.definition.inaturalistUrl],
      ['POWO', group.definition.powoUrl],
      ['GBIF', group.definition.gbifUrl],
    ], data.exhibit.title)
  }

  doc.moveDown(0.4)
  for (const entry of group.entries) drawSpecimenCard(doc, data, entry)
}

function specimenTimelineHighlights(plant: any, entry: any) {
  const openConditions = plant.conditions.filter((condition: any) => condition.status !== 'RESOLVED')
  return [
    ...plant.blooms.slice(0, 2).map((bloom: any) => ({ at: bloom.bloomStartDate, text: `Bloom noted ${formatDate(bloom.bloomStartDate)}` })),
    ...plant.careEvents.slice(0, 2).map((event: any) => ({ at: event.performedAt, text: `${String(event.eventType).toLowerCase()} care ${formatDate(event.performedAt)}` })),
    ...entry.photos.slice(0, 2).map((photo: any) => ({ at: photo.createdAt, text: `Photo added ${formatDate(photo.createdAt)}` })),
    ...openConditions.slice(0, 2).map((condition: any) => ({ at: condition.observedAt, text: `${condition.category} observed ${formatDate(condition.observedAt)}` })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 4)
}

function specimenSections(data: NonNullable<Awaited<ReturnType<typeof loadExhibitForDisplay>>>, entry: any) {
  const plant = entry.plantInstance
  const sections: Array<{ title: string; lines: string[] }> = []
  const openConditions = plant.conditions.filter((condition: any) => condition.status !== 'RESOLVED')
  const activeQuarantine = plant.quarantines.find((quarantine: any) => quarantine.status === 'ACTIVE')
  const lineageItems = [
    ...plant.parentLinks.map((link: any) => `Parent in propagation ${formatDate(link.propagationEvent.date)} (${String(link.parentRole).toLowerCase()})`),
    ...plant.childLinks.map((link: any) => `Produced ${link.childPlantInstance.plantId} on ${formatDate(link.propagationEvent.date)}`),
  ]
  const compactLineage = [
    ...plant.parentLinks.map((link: any) => `${link.parentPlantInstance.plantId} -> ${plant.plantId}`),
    ...plant.childLinks.map((link: any) => `${plant.plantId} -> ${link.childPlantInstance.plantId}`),
  ]
  const timelineHighlights = specimenTimelineHighlights(plant, entry)

  if (data.settings.bloomHistory && plant.blooms.length) {
    sections.push({
      title: 'Bloom history',
      lines: plant.blooms.slice(0, 4).map((bloom: any) => `${formatDate(bloom.bloomStartDate)}${bloom.flowerCount ? ` - ${bloom.flowerCount} flowers` : ''}${bloom.firstBloom ? ' - first bloom' : ''}`),
    })
  }
  if (data.settings.quarantineStatus && activeQuarantine) {
    sections.push({ title: 'Quarantine', lines: [activeQuarantine.reason || `Started ${formatDate(activeQuarantine.startedAt)}`] })
  }
  if (data.settings.conditions && openConditions.length) {
    sections.push({
      title: 'Open conditions',
      lines: openConditions.slice(0, 4).map((condition: any) => `${condition.category} - ${String(condition.severity).toLowerCase()} - ${formatDate(condition.observedAt)}`),
    })
  }
  if (data.settings.careNotes && plant.careEvents.length) {
    sections.push({
      title: 'Recent care',
      lines: plant.careEvents.slice(0, 4).map((event: any) => `${String(event.eventType).toLowerCase()} - ${formatDate(event.performedAt)}${event.notes ? ` - ${event.notes}` : ''}`),
    })
  }
  if (data.settings.notes && entry.notes.length) {
    sections.push({ title: 'Notes', lines: entry.notes.slice(0, 3).map((note: any) => note.note) })
  }
  if ((data.settings.lineage || data.settings.miniLineage || data.settings.propagationHistory) && lineageItems.length) {
    sections.push({
      title: 'Lineage',
      lines: [...(data.settings.miniLineage ? compactLineage.slice(0, 6) : []), ...lineageItems.slice(0, 5)],
    })
  }
  if (data.settings.timeline && timelineHighlights.length) {
    sections.push({ title: 'Timeline highlights', lines: timelineHighlights.map((item) => item.text) })
  }
  return sections
}

function sectionTextHeight(doc: PDFKit.PDFDocument, lines: string[], textW: number) {
  doc.font(FONT.sans).fontSize(7.8)
  return lines.reduce((total, line) => total + Math.max(9.5, doc.heightOfString(line, { width: textW, lineGap: 1 })), 0)
}

function drawSpecimenCard(doc: PDFKit.PDFDocument, data: NonNullable<Awaited<ReturnType<typeof loadExhibitForDisplay>>>, entry: any) {
  const plant = entry.plantInstance
  const sections = specimenSections(data, entry)
  const imageSize = 96
  const textX = left(doc) + 16
  const imageX = right(doc) - imageSize - 16
  const textW = imageX - textX - 16
  const sectionHeight = sections.reduce((total, section) => total + 13 + sectionTextHeight(doc, section.lines, textW) + 5, 0)
  const cardH = Math.max(154, 108 + sectionHeight)
  ensureRoom(doc, cardH + 14, data.exhibit.title)
  const x = left(doc)
  const y = doc.y
  doc.roundedRect(x, y, width(doc), cardH, 10).fillAndStroke(CARD, BORDER)

  doc.font(FONT.mono).fontSize(8.2).fillColor(GREEN).text(plant.plantId, textX, y + 14, { width: textW })
  doc.font(FONT.serifBold).fontSize(15).fillColor(INK).text(plantName(plant.plantDefinition), textX, doc.y + 2, { width: textW })
  doc.font(FONT.sans).fontSize(8.7).fillColor('#4d463c')
  const meta = [
    data.settings.location ? entry.locationPath || 'No location set' : null,
    data.settings.acquisitionSource && plant.source ? `Source: ${plant.source}` : null,
    data.settings.acquisitionSource && plant.distributor ? `Distributor: ${plant.distributor}` : null,
    data.settings.archivedStatus ? `Status: ${String(plant.status).toLowerCase()}` : null,
    data.settings.sunshine ? `Sunshine: ${entry.sunshineCount || 0}` : null,
  ].filter(Boolean)
  doc.text(meta.join(' - '), textX, doc.y + 5, { width: textW, lineGap: 2 })
  if (entry.customCaption) doc.text(entry.customCaption, textX, doc.y + 5, { width: textW, lineGap: 2 })

  let sectionY = Math.max(doc.y + 8, y + 74)
  for (const section of sections) {
    doc.font(FONT.sansBold).fontSize(7.7).fillColor(INK).text(section.title, textX, sectionY, { width: textW, lineBreak: false })
    sectionY += 10
    doc.font(FONT.sans).fontSize(7.8).fillColor('#4d463c')
    for (const line of section.lines) {
      const lineHeight = Math.max(9.5, doc.heightOfString(line, { width: textW, lineGap: 1 }))
      doc.text(line, textX, sectionY, { width: textW, lineGap: 1 })
      sectionY += lineHeight
    }
    sectionY += 3
  }

  if (entry.photos.length) drawPhoto(doc, entry.photos[0], imageX, y + 18, imageSize, imageSize)
  doc.y = y + cardH + 12
}

function addFooters(doc: PDFKit.PDFDocument, title: string) {
  const range = doc.bufferedPageRange()
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i)
    doc.font(FONT.sans).fontSize(7.5).fillColor('#8a8173')
    doc.text(`AxilDB Collection Exhibit - ${title}`, doc.page.margins.left, FOOTER_Y, { width: 360, lineBreak: false })
    doc.text(String(i + 1), doc.page.width - doc.page.margins.right - 40, FOOTER_Y, { width: 40, align: 'right', lineBreak: false })
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const data = await loadExhibitForDisplay(prisma, decodeURIComponent(slug))
  if (!data || !isPublishedExhibitVisible(data.exhibit, token)) {
    return NextResponse.json({ error: 'Exhibit not found' }, { status: 404 })
  }

  const doc = new PDFDocument({ size: 'LETTER', margin: 56, bufferPages: true, autoFirstPage: true })
  registerAxilDbFonts(doc)
  const chunks: Buffer[] = []
  doc.on('data', (chunk) => chunks.push(chunk))
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))
  drawPageBackground(doc)

  doc.font(FONT.sansBold).fontSize(9).fillColor(GREEN).text(data.exhibit.collection.name.toUpperCase(), 56, 72, { characterSpacing: 1.2 })
  doc.font(FONT.serifBlack).fontSize(34).fillColor(INK).text(data.exhibit.title, 56, 102, { width: 430 })
  doc.font(FONT.sans).fontSize(11).fillColor('#4d463c')
  const specimenCount = data.groups.reduce((total, group) => total + group.entries.length, 0)
  doc.text(`Generated ${formatDate(new Date())} - ${specimenCount} specimens - ${data.groups.length} definition section${data.groups.length === 1 ? '' : 's'}`, 56, 164, { width: 430 })
  if (data.exhibit.description) doc.text(data.exhibit.description, 56, 196, { width: 430, lineGap: 3 })
  if (data.exhibit.coverPhoto) drawPhoto(doc, data.exhibit.coverPhoto, 56, 338, 500, 260)
  else doc.y = Math.max(doc.y + 36, 232)

  data.groups.forEach((group, index) => {
    drawDefinitionSection(doc, data, group, index > 0 || Boolean(data.exhibit.coverPhoto))
  })

  addFooters(doc, data.exhibit.title)
  doc.end()
  const pdf = await done
  await prisma.auditLog.create({
    data: {
      action: 'GENERATE',
      entityType: 'COLLECTION_EXHIBIT_PDF',
      entityId: data.exhibit.id,
      summary: `Generated PDF for exhibit ${data.exhibit.title}`,
      collectionId: data.exhibit.collectionId,
    },
  })
  const safeTitle = data.exhibit.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'collection-exhibit'
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeTitle}.pdf"`,
    },
  })
}
