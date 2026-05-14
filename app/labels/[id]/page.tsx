import { prisma } from '@/lib/prisma'
import { Button } from '@/components/ui'
import { plantName, fmtDate } from '@/lib/utils'
import QRCode from 'qrcode'
export default async function Label({params}:{params:Promise<{id:string}>}){ const {id}=await params; const i=await prisma.plantInstance.findUniqueOrThrow({where:{id},include:{plantDefinition:true}}); const url=`${process.env.NEXT_PUBLIC_APP_URL || 'https://app.axildb.com'}/instances/${id}`; const qr=await QRCode.toDataURL(url); return <div className='space-y-4'><Button className='no-print'>Use browser print</Button><div className='tag-print'><div><div className='text-sm font-bold'>{i.plantId}</div><div className='text-xs italic'>{plantName(i.plantDefinition)}</div><div className='mt-1 text-[10px]'>{i.instanceType} · {i.location || ''}</div><div className='text-[10px]'>{i.propagationDate ? `Prop: ${fmtDate(i.propagationDate)}` : `Acq: ${fmtDate(i.acquisitionDate)}`}</div></div><img src={qr}/></div></div> }
