import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui'
import { fmtDate, plantName } from '@/lib/utils'
import Link from 'next/link'
export default async function Archived(){ const items=await prisma.plantInstance.findMany({where:{status:'ARCHIVED'},include:{plantDefinition:true},orderBy:{archiveDate:'desc'}}); return <div className='space-y-6'><h2 className='text-3xl font-bold'>Archived Plants</h2>{items.map(i=><Card key={i.id}><Link className='font-bold underline' href={`/instances/${i.id}`}>{i.plantId}</Link><p className='text-sm'>{plantName(i.plantDefinition)} · {fmtDate(i.archiveDate)} · {i.archiveReason}</p><p>{i.archiveNotes}</p></Card>)}</div> }
