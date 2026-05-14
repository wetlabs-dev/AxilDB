import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui'
import { fmtDate, plantName } from '@/lib/utils'
import Link from 'next/link'
export default async function Blooms(){ const blooms=await prisma.bloomEvent.findMany({include:{plantInstance:{include:{plantDefinition:true}}},orderBy:{bloomStartDate:'desc'}}); return <div className='space-y-6'><h2 className='text-3xl font-bold'>Bloom Tracker</h2>{blooms.map(b=><Card key={b.id}><h3 className='font-bold'><Link className='underline' href={`/instances/${b.plantInstanceId}`}>{b.plantInstance.plantId}</Link> · {plantName(b.plantInstance.plantDefinition)}</h3><p className='text-sm'>Start {fmtDate(b.bloomStartDate)} · Peak {fmtDate(b.peakBloomDate)} · End {fmtDate(b.bloomEndDate)} · {b.flowerCount || '—'} flowers</p><p>{b.notes}</p></Card>)}</div> }
