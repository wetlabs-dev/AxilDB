export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { existsSync } from 'fs'
import path from 'path'
import PDFDocument from 'pdfkit'
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { isServerAdminRole } from '@/lib/roles'
import { formatDate } from '@/lib/time'
import { plantName } from '@/lib/utils'
import { canBrowseWishlist, isPublicWishlistVisitor, loadWishlistEntries, normalizeWishlistPublicSettings, wishlistEnvironmentSummary, wishlistPriceRange } from '@/lib/wishlist'

function csvCell(value: unknown) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function publicRows(entries: Awaited<ReturnType<typeof loadWishlistEntries>>, settings: ReturnType<typeof normalizeWishlistPublicSettings>) {
  return entries.map((entry) => {
    const range = wishlistPriceRange(entry.plantObservations)
    const latest = entry.plantObservations[0]
    return {
      name: plantName(entry),
      status: entry.acquisitionStatus || '',
      priority: settings.showPriority ? entry.acquisitionPriority || '' : '',
      catSafety: settings.showCatSafety ? entry.husbandryGuide?.toxicityPets || '' : '',
      difficulty: settings.showDifficulty ? entry.husbandryGuide?.propagationDifficulty || '' : '',
      desiredSize: settings.showDesiredSize ? entry.desiredSpecimenSize || '' : '',
      publicSummary: settings.showPublicResearchSummary ? entry.acquisitionResearchSummary || '' : '',
      environment: wishlistEnvironmentSummary(entry.husbandryGuide) || '',
      owned: settings.showOwnedCount ? entry.instances.length : '',
      observedRange: settings.showObservedPriceRange && range ? `${range.low}-${range.high} ${range.currency}` : '',
      latestObservation: settings.showLatestPublicObservation && latest ? formatDate(latest.observedAt) : '',
      plannedLocationCategory: settings.showPlannedLocationCategory ? entry.desiredLocation?.locationType.name || '' : '',
      tags: settings.showTags ? entry.tags.map((item) => item.plantTag.name).join('; ') : '',
    }
  })
}

function privateRows(entries: Awaited<ReturnType<typeof loadWishlistEntries>>) {
  return entries.map((entry) => {
    const range = wishlistPriceRange(entry.plantObservations)
    return {
      name: plantName(entry), status: entry.acquisitionStatus || '', priority: entry.acquisitionPriority || '',
      catSafety: entry.husbandryGuide?.toxicityPets || '', difficulty: entry.husbandryGuide?.propagationDifficulty || '',
      desiredSize: entry.desiredSpecimenSize || '', publicSummary: entry.acquisitionResearchSummary || '',
      environment: wishlistEnvironmentSummary(entry.husbandryGuide) || '', owned: entry.instances.length,
      idealPrice: entry.idealPurchasePrice || '', maximumPrice: entry.maximumPurchasePrice || '',
      observedRange: range ? `${range.low}-${range.high} ${range.currency}` : '',
      latestObservation: entry.plantObservations[0] ? formatDate(entry.plantObservations[0].observedAt) : '',
      plannedLocation: entry.desiredLocation?.name || '', interestNotes: entry.acquisitionInterestNotes || '',
      tags: entry.tags.map((item) => item.plantTag.name).join('; '),
    }
  })
}

async function pdfBuffer(collectionName: string, rows: ReturnType<typeof publicRows> | ReturnType<typeof privateRows>) {
  const doc = new PDFDocument({ size: 'LETTER', margins: { top: 54, right: 48, bottom: 54, left: 48 }, bufferPages: true })
  const chunks: Buffer[] = []
  doc.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
  const fontDir = path.join(process.cwd(), 'public', 'fonts')
  const serif = path.join(fontDir, 'Fraunces-700.ttf')
  const sans = path.join(fontDir, 'Inter-400.ttf')
  const bold = path.join(fontDir, 'Inter-700.ttf')
  if (existsSync(serif)) doc.registerFont('AxilSerif', serif)
  if (existsSync(sans)) doc.registerFont('AxilSans', sans)
  if (existsSync(bold)) doc.registerFont('AxilBold', bold)
  const SANS = existsSync(sans) ? 'AxilSans' : 'Helvetica'
  const BOLD = existsSync(bold) ? 'AxilBold' : 'Helvetica-Bold'
  const SERIF = existsSync(serif) ? 'AxilSerif' : 'Times-Bold'
  const addBackground = () => doc.save().rect(0, 0, doc.page.width, doc.page.height).fill('#f8f3e6').restore()
  addBackground()
  doc.fillColor('#2f6b45').font(BOLD).fontSize(9).text(collectionName.toUpperCase(), { characterSpacing: 1.3 })
  doc.moveDown(0.5).fillColor('#2f2618').font(SERIF).fontSize(28).text('Plant Wishlist')
  doc.moveDown(0.35).font(SANS).fontSize(9).fillColor('#756f64').text(`Generated ${formatDate(new Date())} · ${rows.length} acquisition targets`)
  doc.moveDown(1)
  for (const row of rows) {
    const visible = Object.entries(row).filter(([key, value]) => key !== 'name' && value !== '' && value != null)
    const body = visible.map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}: ${value}`).join('\n')
    doc.font(SANS).fontSize(8.5)
    const height = Math.max(62, doc.heightOfString(body, { width: 450 }) + 40)
    if (doc.y + height > 720) { doc.addPage(); addBackground(); doc.y = 54 }
    const y = doc.y
    doc.roundedRect(48, y, 516, height, 7).fillAndStroke('#fffaf0', '#d8d0bc')
    doc.fillColor('#2f2618').font(SERIF).fontSize(16).text(String(row.name), 62, y + 12, { width: 488 })
    doc.fillColor('#5f584e').font(SANS).fontSize(8.5).text(body, 62, doc.y + 6, { width: 488, lineGap: 2 })
    doc.y = y + height + 10
  }
  doc.end()
  await new Promise<void>((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject) })
  return Buffer.concat(chunks)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const slug = String(url.searchParams.get('collection') || '').trim()
  const collection = await prisma.collection.findUnique({ where: { slug } })
  if (!collection || collection.status === 'ARCHIVED') return NextResponse.json({ error: 'Collection not found.' }, { status: 404 })
  const user = await getCurrentUser()
  const membership = user ? await prisma.collectionMembership.findUnique({ where: { collectionId_userId: { collectionId: collection.id, userId: user.id } } }) : null
  const allowed = canBrowseWishlist({ acquisitionVisibility: collection.acquisitionVisibility, userRole: user?.role, membershipStatus: membership?.status })
  if (!allowed) return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const publicOnly = isPublicWishlistVisitor({ userRole: user?.role, membershipStatus: membership?.status }) || url.searchParams.get('public') === '1'
  if (!publicOnly && !isServerAdminRole(user?.role) && membership?.status !== 'ACTIVE') return NextResponse.json({ error: 'Not authorized.' }, { status: 403 })
  const settings = normalizeWishlistPublicSettings(collection.wishlistPublicSettingsJson)
  const entries = await loadWishlistEntries(prisma, collection.id, { includeFulfilled: publicOnly ? settings.showFulfilled : true, publicOnly })
  const rows = publicOnly ? publicRows(entries, settings) : privateRows(entries)
  const format = url.searchParams.get('format') || 'csv'
  const filename = `${collection.slug}-wishlist`
  if (format === 'pdf') {
    const body = await pdfBuffer(collection.name, rows)
    return new NextResponse(new Uint8Array(body), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}.pdf"` } })
  }
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
  const csv = [keys.join(','), ...rows.map((row) => keys.map((key) => csvCell((row as any)[key])).join(','))].join('\n')
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}.csv"` } })
}
