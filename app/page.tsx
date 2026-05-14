import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui'
import Link from 'next/link'
export default async function Dashboard(){
 const [active, recentProps, blooms, sports, archived]=await Promise.all([
  prisma.plantInstance.count({where:{status:'ACTIVE'}}),
  prisma.propagationEvent.findMany({take:5,orderBy:{date:'desc'},include:{children:{include:{childPlantInstance:true}}}}),
  prisma.bloomEvent.findMany({take:5,orderBy:{bloomStartDate:'desc'},include:{plantInstance:true}}),
  prisma.plantInstance.findMany({where:{OR:[{isSportCandidate:true},{sportStatus:{not:'NONE'}}]},take:5,include:{plantDefinition:true}}),
  prisma.plantInstance.findMany({where:{status:'ARCHIVED'},take:5,orderBy:{archiveDate:'desc'},include:{plantDefinition:true}})
 ])
 return <div className='space-y-6'><h2 className='text-3xl font-bold'>Dashboard</h2><div className='grid gap-4 md:grid-cols-4'><Card><div className='text-sm'>Active plants</div><div className='text-4xl font-bold'>{active}</div></Card><Card><div className='text-sm'>Recent propagations</div><div className='text-4xl font-bold'>{recentProps.length}</div></Card><Card><div className='text-sm'>Recent blooms</div><div className='text-4xl font-bold'>{blooms.length}</div></Card><Card><div className='text-sm'>Sport candidates</div><div className='text-4xl font-bold'>{sports.length}</div></Card></div><div className='grid gap-4 lg:grid-cols-2'><Card><h3 className='font-bold'>Recent propagations</h3>{recentProps.map(p=><p key={p.id} className='mt-2 text-sm'>{p.date.toLocaleDateString()} · {p.method} · {p.children.map(c=>c.childPlantInstance.plantId).join(', ')}</p>)}</Card><Card><h3 className='font-bold'>Sport candidates needing review</h3>{sports.map(s=><p key={s.id} className='mt-2 text-sm'><Link className='underline' href={`/instances/${s.id}`}>{s.plantId}</Link> · {s.sportStatus}</p>)}</Card><Card><h3 className='font-bold'>Recent blooms</h3>{blooms.map(b=><p key={b.id} className='mt-2 text-sm'>{b.bloomStartDate.toLocaleDateString()} · <Link className='underline' href={`/instances/${b.plantInstanceId}`}>{b.plantInstance.plantId}</Link></p>)}</Card><Card><h3 className='font-bold'>Recently archived</h3>{archived.map(a=><p key={a.id} className='mt-2 text-sm'>{a.plantId} · {a.archiveReason}</p>)}</Card></div></div>
}
