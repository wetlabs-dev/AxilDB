import { prisma } from '@/lib/prisma'
import { Card } from '@/components/ui'
import { plantName } from '@/lib/utils'
export default async function BulkLabels(){
 const instances=await prisma.plantInstance.findMany({where:{status:'ACTIVE'},include:{plantDefinition:true},orderBy:{plantId:'asc'}})
 return <div className='space-y-6'><h2 className='text-3xl font-bold'>Bulk Tag PDF Sheet</h2><Card><form action='/api/labels/bulk' method='get' className='grid gap-3'><div className='grid max-h-[520px] gap-2 overflow-auto rounded-xl border bg-white p-3'>{instances.map(i=><label key={i.id} className='flex items-center gap-2 text-sm'><input type='checkbox' name='id' value={i.id}/><span className='font-bold'>{i.plantId}</span><span>{plantName(i.plantDefinition)}</span></label>)}</div><button className='rounded-xl bg-green-800 px-4 py-2 text-sm font-medium text-white'>Export selected PDF</button><a className='rounded-xl border px-4 py-2 text-center text-sm' href='/api/labels/bulk?all=1'>Export all active as PDF</a></form></Card></div>
}
