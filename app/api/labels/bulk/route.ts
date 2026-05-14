export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { prisma } from '@/lib/prisma'
import { plantName, fmtDate } from '@/lib/utils'
export async function GET(req: Request) {
  const url=new URL(req.url)
  const ids=url.searchParams.getAll('id')
  const all=url.searchParams.get('all')==='1'
  const items=await prisma.plantInstance.findMany({where: all?{status:'ACTIVE'}:{id:{in:ids}},include:{plantDefinition:true},orderBy:{plantId:'asc'}})
  const doc=new PDFDocument({size:'LETTER',margin:36})
  const chunks:Buffer[]=[]
  doc.on('data',c=>chunks.push(c))
  const done=new Promise<Buffer>(resolve=>doc.on('end',()=>resolve(Buffer.concat(chunks))))
  const w=180,h=90,gap=12; let x=36,y=36
  for (const i of items) {
    if (y+h>756){ doc.addPage(); x=36; y=36 }
    const link=`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/instances/${i.id}`
    const qr=await QRCode.toDataURL(link,{margin:1,width:96})
    doc.rect(x,y,w,h).stroke()
    doc.fontSize(11).font('Helvetica-Bold').text(i.plantId,x+8,y+8,{width:w-72})
    doc.fontSize(8).font('Helvetica-Oblique').text(plantName(i.plantDefinition),x+8,y+24,{width:w-72})
    doc.fontSize(7).font('Helvetica').text(`${i.instanceType} · ${i.location || ''}`,x+8,y+46,{width:w-72})
    doc.fontSize(7).text(i.propagationDate ? `Prop: ${fmtDate(i.propagationDate)}` : `Acq: ${fmtDate(i.acquisitionDate)}`,x+8,y+58,{width:w-72})
    doc.image(qr,x+w-62,y+14,{width:52,height:52})
    x += w+gap
    if (x+w>576){ x=36; y+=h+gap }
  }
  if (!items.length) doc.fontSize(14).text('No labels selected.')
  doc.end()
  const pdf=await done
  return new NextResponse(new Uint8Array(pdf),{headers:{'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="axildb-plant-tags.pdf"'}})
}
