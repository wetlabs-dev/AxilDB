export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { prisma } from '@/lib/prisma'
import { collectionPath, ensureDefaultCollection } from '@/lib/collections'
import { getCurrentUser } from '@/lib/auth'
import { LABEL_HEIGHT_PT, LABEL_WIDTH_PT, plantLabelNameLines } from '@/lib/plant-labels'

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

export async function GET(req: Request) {
  const url=new URL(req.url)
  const ids=url.searchParams.getAll('id')
  const all=url.searchParams.get('all')==='1'
  const slug=url.searchParams.get('collectionSlug')
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
  const items=await prisma.plantInstance.findMany({where: all?{collectionId:collection.id,status:'ACTIVE'}:{collectionId:collection.id,id:{in:ids}},include:{plantDefinition:true},orderBy:{plantId:'asc'}})
  const doc=new PDFDocument({size:[LABEL_WIDTH_PT,LABEL_HEIGHT_PT],margin:0})
  const chunks:Buffer[]=[]
  doc.on('data',c=>chunks.push(c))
  const done=new Promise<Buffer>(resolve=>doc.on('end',()=>resolve(Buffer.concat(chunks))))
  if (!items.length) {
    doc.font('Helvetica').fontSize(10).text('No labels selected.', 8, 36, { width: LABEL_WIDTH_PT - 16, align: 'center' })
  }
  for (let index = 0; index < items.length; index += 1) {
    if (index > 0) doc.addPage()
    const i = items[index]
    const link=`${process.env.NEXT_PUBLIC_APP_URL || 'https://app.axildb.com'}${collectionPath(collection.slug, `/instances/${i.id}`)}`
    const qr=await QRCode.toDataURL(link,{margin:1,width:256})
    const qrBuffer = Buffer.from(qr.split(',')[1], 'base64')
    const margin = 5
    const qrSize = 48
    const qrX = LABEL_WIDTH_PT - margin - qrSize
    const qrY = 23
    const nameX = 7
    const nameY = 23
    const nameWidth = qrX - nameX - 7
    const nameHeight = 43
    const nameLines = plantLabelNameLines(i.plantDefinition)
    const collectionSize = oneLineFontSize(doc, collection.name, 'Times-Bold', 13, 6.5, LABEL_WIDTH_PT - 12)
    doc.font('Times-Bold').fontSize(collectionSize).text(collection.name, 6, 4, {
      width: LABEL_WIDTH_PT - 12,
      align: 'center',
      lineBreak: false,
    })
    doc.image(qrBuffer, qrX, qrY, {width:qrSize,height:qrSize})
    const nameSize = multiLineFontSize(doc, nameLines, 'Times-Italic', nameLines.length >= 3 ? 22 : 28, 9, nameWidth, nameHeight)
    const lineHeight = nameSize * 0.9
    let currentY = nameY + (nameHeight - lineHeight * nameLines.length) / 2
    doc.font('Times-Italic').fontSize(nameSize)
    for (const line of nameLines) {
      doc.text(line, nameX, currentY, { width: nameWidth, lineBreak: false })
      currentY += lineHeight
    }
    const idSize = oneLineFontSize(doc, i.plantId, 'Helvetica', 12, 6, LABEL_WIDTH_PT - 12)
    doc.font('Helvetica').fontSize(idSize).text(i.plantId, 6, 74, {
      width: LABEL_WIDTH_PT - 12,
      align: 'center',
      lineBreak: false,
    })
  }
  doc.end()
  const pdf=await done
  return new NextResponse(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="axildb-plant-labels.pdf"'}})
}
