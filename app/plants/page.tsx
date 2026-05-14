import { prisma } from '@/lib/prisma'
import { createPlantDefinition } from '@/app/actions'
import { Card, Field, TextArea, Button, LinkButton } from '@/components/ui'
import { canCreate, getCurrentUser, isAdmin } from '@/lib/auth'
import { plantName } from '@/lib/utils'
import Link from 'next/link'

export default async function Plants(){
 const user=await getCurrentUser()
 const [plants,bodies]=await Promise.all([prisma.plantDefinition.findMany({include:{governingBody:true,_count:{select:{instances:true}}},orderBy:[{genus:'asc'},{species:'asc'}]}),prisma.governingBody.findMany({orderBy:{name:'asc'}})])
 return <div className='space-y-6'><div className='flex items-center justify-between'><h2 className='text-3xl font-bold'>Plant Definitions</h2><LinkButton href='/search'>Search</LinkButton></div>
 {canCreate(user) && <Card><form action={createPlantDefinition} className='grid gap-3 md:grid-cols-2'><Field label='Genus' name='genus' required/><Field label='Species' name='species' required/><Field label='Hybrid notation' name='hybridNotation'/><Field label='Cultivar name' name='cultivarName'/><Field label='Cultivar registration number' name='cultivarRegistrationNumber'/><label className='grid gap-1 text-sm font-medium'>Governing body<select className='rounded-lg border px-3 py-2 font-normal' name='governingBodyId'><option value=''>—</option>{bodies.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label><TextArea label='Description' name='description'/><TextArea label='Notes' name='notes'/><Button className='md:col-span-2'>Create plant definition</Button></form></Card>}
 <div className='grid gap-3'>{plants.map(p=><Card key={p.id}><div className='flex items-center justify-between gap-4'><div><span className='text-lg font-bold'>{plantName(p)}</span><p className='text-sm'>{p.governingBody?.abbreviation || 'No governing body'} · {p._count.instances} instance(s)</p><p className='text-sm text-stone-600'>{p.description}</p></div>{isAdmin(user) && <Link className='rounded-xl border px-3 py-2 text-sm' href={`/plants/${p.id}/edit`}>Edit</Link>}</div></Card>)}</div></div>
}
