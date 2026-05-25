export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import { requireCollectionViewer } from '@/lib/collections'
import { careTaskLabel } from '@/lib/care-queue'
import { attachCareSheetPhotos, careSheetModeLabel, sectionValuesForInstance } from '@/lib/care-sheets'
import { prisma } from '@/lib/prisma'
import { plantName } from '@/lib/utils'

function contentLeft(doc: PDFKit.PDFDocument) {
  return doc.page.margins.left
}

function contentRight(doc: PDFKit.PDFDocument) {
  return doc.page.width - doc.page.margins.right
}

function contentWidth(doc: PDFKit.PDFDocument) {
  return contentRight(doc) - contentLeft(doc)
}

function line(doc: PDFKit.PDFDocument, text: string, options: PDFKit.Mixins.TextOptions = {}) {
  doc.x = contentLeft(doc)
  doc.text(text, { width: contentWidth(doc), ...options })
}

function maybeValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function taskDate(date?: Date | null) {
  return date ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'No due date'
}

function ensureRoom(doc: PDFKit.PDFDocument, needed = 72) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - needed) doc.addPage()
}

function drawChecklistTask(doc: PDFKit.PDFDocument, task: any) {
  ensureRoom(doc, 72)
  const left = contentLeft(doc)
  const right = contentRight(doc)
  const checkboxSize = 9
  const gap = 8
  const textX = left + checkboxSize + gap
  const textWidth = right - textX
  const startY = doc.y
  const plant = task.plantInstance

  doc.rect(left, startY + 2, checkboxSize, checkboxSize).stroke('#333')
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#222')
  doc.text(`${careTaskLabel(task.taskType as any)} · ${taskDate(task.dueAt)} · ${task.title}`, textX, startY - 1, { width: textWidth })
  doc.font('Helvetica').fontSize(9).fillColor('#555')
  if (plant) {
    doc.text(`${plant.plantId} · ${plantName(plant.plantDefinition)}`, textX, doc.y, { width: textWidth })
  }
  if (task.reason) {
    doc.text(task.reason, textX, doc.y, { width: textWidth })
  }
  doc.fillColor('#222')
  doc.x = left
  doc.moveDown(0.45)
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sheet = await prisma.careSheet.findUnique({
    where: { id },
    include: {
      collection: true,
      plants: {
        orderBy: [{ displayOrder: 'asc' }],
        include: {
          plantInstance: {
            include: {
              plantDefinition: {
                include: {
                  aliases: true,
                  governingBody: true,
                  husbandryGuide: true,
                },
              },
              husbandryOverride: true,
            },
          },
        },
      },
      tasks: {
        orderBy: [{ dueAt: 'asc' }, { title: 'asc' }],
        include: {
          plantInstance: { include: { plantDefinition: true } },
        },
      },
    },
  })
  if (!sheet) return NextResponse.json({ error: 'Care sheet not found' }, { status: 404 })
  await requireCollectionViewer(sheet.collection.slug)
  const hydratedSheet = await attachCareSheetPhotos(prisma, sheet)

  const doc = new PDFDocument({ size: 'LETTER', margin: 42 })
  const chunks: Buffer[] = []
  doc.on('data', (chunk) => chunks.push(chunk))
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))

  doc.font('Times-Bold').fontSize(24).text(hydratedSheet.title)
  doc.moveDown(0.25)
  doc.font('Helvetica').fontSize(10).fillColor('#555')
  line(doc, `${hydratedSheet.collection.name} · ${careSheetModeLabel(hydratedSheet.mode)} · Generated ${new Date().toLocaleDateString()}`)
  if (hydratedSheet.startsAt || hydratedSheet.expiresAt) {
    line(doc, `Window: ${taskDate(hydratedSheet.startsAt)} through ${taskDate(hydratedSheet.expiresAt)}`)
  }
  doc.moveDown(1)
  doc.fillColor('#222')

  const settings = (hydratedSheet.settings || {}) as Record<string, any>
  if (settings.customInstructions) {
    doc.font('Times-Bold').fontSize(13).text('Instructions')
    doc.moveDown(0.25)
    doc.font('Helvetica').fontSize(10)
    line(doc, String(settings.customInstructions))
    doc.moveDown(0.8)
  }

  if (hydratedSheet.tasks.length > 0) {
    doc.font('Times-Bold').fontSize(16).text('Checklist')
    doc.moveDown(0.5)
    for (const task of hydratedSheet.tasks) {
      drawChecklistTask(doc, task)
    }
    doc.moveDown(0.8)
  }

  doc.font('Times-Bold').fontSize(16).text('Plants')
  doc.moveDown(0.5)
  for (const row of hydratedSheet.plants) {
    const instance = row.plantInstance
    ensureRoom(doc, 120)
    doc.font('Times-Bold').fontSize(13).fillColor('#222').text(instance.plantId)
    doc.font('Helvetica').fontSize(10).fillColor('#444')
    line(doc, `${plantName(instance.plantDefinition)}${instance.location ? ` · ${instance.location}` : ''}`)
    const guide = (instance.plantDefinition as any).resolvedHusbandryGuide || instance.plantDefinition.husbandryGuide
    const summaries = [
      maybeValue(instance.husbandryOverride?.summaryWater) || maybeValue(guide?.summaryWater),
      maybeValue(instance.husbandryOverride?.summaryLight) || maybeValue(guide?.summaryLight),
      maybeValue(instance.husbandryOverride?.summaryToxicity) || maybeValue(guide?.summaryToxicity),
      maybeValue(instance.husbandryOverride?.summaryCare) || maybeValue(guide?.summaryCare),
    ].filter(Boolean)
    if (summaries.length) line(doc, summaries.join(' · '))

    const sections = sectionValuesForInstance(instance as any, hydratedSheet.sections as string[])
    for (const section of sections) {
      const values = (section.fields as Array<{ label: string; value: string; overridden?: boolean }>).filter((field) => field.value)
      if (!values.length) continue
      ensureRoom(doc, 64)
      doc.moveDown(0.3)
      doc.font('Helvetica-Bold').fillColor('#2f6b45').text(section.title)
      doc.font('Helvetica').fillColor('#444')
      for (const field of values.slice(0, 5)) {
        line(doc, `${field.label}: ${field.value}${field.overridden ? ' (local adjustment)' : ''}`)
      }
    }
    doc.moveDown(0.8)
    doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke('#ddd')
    doc.moveDown(0.8)
  }

  doc.end()
  const pdf = await done
  const safeTitle = hydratedSheet.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'care-sheet'
  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeTitle}.pdf"`,
    },
  })
}
