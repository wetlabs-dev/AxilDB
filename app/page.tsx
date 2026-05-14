import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui'
import { Flower2, GitBranch, Leaf, Sprout } from 'lucide-react'
import Link from 'next/link'

export default async function Dashboard(){
 const [active, recentProps, blooms, sports, archived]=await Promise.all([
  prisma.plantInstance.count({where:{status:'ACTIVE'}}),
  prisma.propagationEvent.findMany({take:5,orderBy:{date:'desc'},include:{children:{include:{childPlantInstance:true}}}}),
  prisma.bloomEvent.findMany({take:5,orderBy:{bloomStartDate:'desc'},include:{plantInstance:true}}),
  prisma.plantInstance.findMany({where:{OR:[{isSportCandidate:true},{sportStatus:{not:'NONE'}}]},take:5,include:{plantDefinition:true}}),
  prisma.plantInstance.findMany({where:{status:'ARCHIVED'},take:5,orderBy:{archiveDate:'desc'},include:{plantDefinition:true}})
 ])
 const stats=[
  ['Active plants', active, Leaf],
  ['Recent propagations', recentProps.length, GitBranch],
  ['Recent blooms', blooms.length, Flower2],
  ['Sport candidates', sports.length, Sprout],
 ] as const
 return <div className='space-y-6'><div><h2 className='text-3xl font-bold'>Dashboard</h2><p className='mt-1 text-sm text-stone-600'>Welcome back. Here’s what’s growing on.</p></div><div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4'>{stats.map(([label,value,Icon])=><Card key={label}><div className='flex items-start justify-between gap-3'><div><div className='text-sm text-stone-600'>{label}</div><div className='mt-2 font-serif text-4xl font-semibold'>{value}</div></div><div className='rounded-md bg-[#d6dfc9]/70 p-2 text-[#2f6b45]'><Icon className='h-6 w-6'/></div></div></Card>)}</div><div className='grid gap-4 lg:grid-cols-2'><Card><h3 className='font-bold'>Recent propagations</h3>{recentProps.map(p=><p key={p.id} className='mt-2 border-t border-stone-200 pt-2 text-sm'>{p.date.toLocaleDateString()} · {p.method} · {p.children.map(c=>c.childPlantInstance.plantId).join(', ')}</p>)}</Card><Card><h3 className='font-bold'>Sport candidates needing review</h3>{sports.map(s=><p key={s.id} className='mt-2 border-t border-stone-200 pt-2 text-sm'><Link className='underline' href={`/instances/${s.id}`}>{s.plantId}</Link> · {s.sportStatus}</p>)}</Card><Card><h3 className='font-bold'>Recent blooms</h3>{blooms.map(b=><p key={b.id} className='mt-2 border-t border-stone-200 pt-2 text-sm'>{b.bloomStartDate.toLocaleDateString()} · <Link className='underline' href={`/instances/${b.plantInstanceId}`}>{b.plantInstance.plantId}</Link></p>)}</Card><Card><h3 className='font-bold'>Recently archived</h3>{archived.map(a=><p key={a.id} className='mt-2 border-t border-stone-200 pt-2 text-sm'>{a.plantId} · {a.archiveReason}</p>)}</Card></div></div>
}
