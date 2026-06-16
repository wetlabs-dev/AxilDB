export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { existsSync } from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import { isPublishedExhibitVisible, loadExhibitForDisplay } from '@/lib/exhibits'
import { prisma } from '@/lib/prisma'
import { formatDate } from '@/lib/time'
import { plantName } from '@/lib/utils'

function contentLeft(doc: PDFKit.PDFDocument) {
  return doc.page.margins.left
}

function contentWidth(doc: PDFKit.PDFDocument) {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right
}

function line(doc: PDFKit.PDFDocument, text: string, options: PDFKit.Mixins.TextOptions = {}) {
  doc.x = contentLeft(doc)
  doc.text(text, { width: contentWidth(doc), ...options })
}

function ensureRoom(doc: PDFKit.PDFDocument, needed = 92, footer: () => void) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - needed) {
    footer()
    doc.addPage()
  }
}

function localUploadPath(photo?: { path?: string | null } | null) {
  if (!photo?.path || !photo.path.startsWith('/uploads/') || photo.path.includes('..')) return null
  const local = path.join(process.cwd(), 'public', photo.path)
  return existsSync(local) ? local : null
}

function drawPhoto(doc: PDFKit.PDFDocument, photo: any, x: number, y: number, width: number, height: number) {
  const local = localUploadPath(photo)
  doc.roundedRect(x, y, width, height, 8).fillAndStroke('#e8efdf', '#d8d0bc')
  if (!local) return
  try {
    doc.image(local, x, y, { fit: [width, height], align: 'center', valign: 'center' })
  } catch {
    doc.font('Helvetica').fontSize(8).fillColor('#756f64').text('Image unavailable', x + 8, y + height / 2 - 5, { width: width - 16, align: 'center' })
  }
}

function detail(doc: PDFKit.PDFDocument, label: string, value?: string | null) {
  if (!value) return
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#756f64').text(label.toUpperCase(), { continued: false })
  doc.font('Helvetica').fontSize(10).fillColor('#2f2618')
  line(doc, value)
  doc.moveDown(0.35)
}

export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const url = new URL(req.url)
  const token = url.searchParams.get('token')
  const data = await loadExhibitForDisplay(prisma, decodeURIComponent(slug))
  if (!data || !isPublishedExhibitVisible(data.exhibit, token)) {
    return NextResponse.json({ error: 'Exhibit not found' }, { status: 404 })
  }

  const doc = new PDFDocument({ size: 'LETTER', margin: 44, bufferPages: true })
  const chunks: Buffer[] = []
  doc.on('data', (chunk) => chunks.push(chunk))
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))

  let pageNumber = 0
  const footer = () => {
    pageNumber += 1
    const bottom = doc.page.height - 36
    doc.font('Helvetica').fontSize(8).fillColor('#8a8173')
    doc.text(`AxilDB Collection Exhibit · ${data.exhibit.title}`, doc.page.margins.left, bottom, { width: 360 })
    doc.text(String(pageNumber), doc.page.width - doc.page.margins.right - 40, bottom, { width: 40, align: 'right' })
    doc.fillColor('#2f2618')
  }

  doc.rect(0, 0, doc.page.width, doc.page.height).fill('#f8f3e6')
  doc.fillColor('#2f2618')
  doc.font('Times-Bold').fontSize(32).text(data.exhibit.title, 56, 92, { width: 390 })
  doc.moveDown(0.4)
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#2f6b45')
  line(doc, data.exhibit.collection.name)
  doc.moveDown(1)
  doc.font('Helvetica').fontSize(12).fillColor('#4d463c')
  if (data.exhibit.description) line(doc, data.exhibit.description, { lineGap: 3 })
  doc.moveDown(1)
  line(doc, `Generated ${formatDate(new Date())} · ${data.groups.reduce((total, group) => total + group.entries.length, 0)} specimens · ${data.groups.length} definition sections`)
  if (data.exhibit.coverPhoto) drawPhoto(doc, data.exhibit.coverPhoto, 56, 360, 500, 260)

  for (const group of data.groups) {
    footer()
    doc.addPage()
    doc.font('Times-Bold').fontSize(22).fillColor('#2f2618')
    line(doc, plantName(group.definition))
    doc.font('Helvetica').fontSize(10).fillColor('#756f64')
    line(doc, `${group.entries.length} selected specimen${group.entries.length === 1 ? '' : 's'}`)
    doc.moveDown(0.5)
    doc.fillColor('#2f2618')
    if (group.definition.description) {
      doc.font('Helvetica').fontSize(10)
      line(doc, group.definition.description, { lineGap: 2 })
      doc.moveDown(0.6)
    }
    if (data.settings.taxonomyDetails) {
      detail(doc, 'Authority', group.definition.authority)
      detail(doc, 'Registration', group.definition.cultivarRegistrationNumber)
      detail(doc, 'Validation', group.definition.isValidated ? `Validated ${formatDate(group.definition.validatedAt)}` : 'Not validated')
    }
    if (data.settings.typeImages && group.typePhotos.length) {
      const y = doc.y + 4
      group.typePhotos.slice(0, 3).forEach((photo, index) => drawPhoto(doc, photo, contentLeft(doc) + index * 120, y, 108, 82))
      doc.y = y + 96
    }

    for (const entry of group.entries) {
      ensureRoom(doc, 178, footer)
      const plant = entry.plantInstance
      const startY = doc.y
      doc.roundedRect(contentLeft(doc), startY, contentWidth(doc), 150, 10).fillAndStroke('#fffaf0', '#d8d0bc')
      doc.fillColor('#2f2618')
      const textX = contentLeft(doc) + 16
      const photoX = contentLeft(doc) + contentWidth(doc) - 128
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#2f6b45').text(plant.plantId, textX, startY + 14, { width: 320 })
      doc.font('Times-Bold').fontSize(15).fillColor('#2f2618').text(plantName(plant.plantDefinition), textX, doc.y + 2, { width: 320 })
      doc.font('Helvetica').fontSize(9).fillColor('#4d463c')
      const meta = [
        data.settings.location ? entry.locationPath || 'No location set' : null,
        data.settings.acquisitionSource && plant.source ? `Source: ${plant.source}` : null,
        data.settings.archivedStatus ? `Status: ${plant.status.toLowerCase()}` : null,
        data.settings.sunshine ? `Sunshine: ${entry.sunshineCount || 0}` : null,
      ].filter(Boolean)
      doc.text(meta.join(' · '), textX, doc.y + 4, { width: 340, lineGap: 2 })
      if (entry.customCaption) doc.text(entry.customCaption, textX, doc.y + 5, { width: 340, lineGap: 2 })
      if (data.settings.bloomHistory && plant.blooms.length) {
        doc.text(`Recent bloom: ${formatDate(plant.blooms[0].bloomStartDate)}${plant.blooms[0].flowerCount ? ` · ${plant.blooms[0].flowerCount} flowers` : ''}`, textX, doc.y + 5, { width: 340 })
      }
      if ((data.settings.lineage || data.settings.miniLineage) && (plant.parentLinks.length || plant.childLinks.length)) {
        doc.text(`Lineage links: ${plant.parentLinks.length} parent · ${plant.childLinks.length} child`, textX, doc.y + 5, { width: 340 })
      }
      if (entry.photos.length) drawPhoto(doc, entry.photos[0], photoX, startY + 16, 104, 104)
      doc.y = startY + 166
    }
  }

  footer()
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
