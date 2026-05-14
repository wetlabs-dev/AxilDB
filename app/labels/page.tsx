import { prisma } from '@/lib/prisma'
import { Button, Card } from '@/components/ui'
import { plantName } from '@/lib/utils'

export default async function BulkLabels(){
 const instances=await prisma.plantInstance.findMany({where:{status:'ACTIVE'},include:{plantDefinition:true},orderBy:{plantId:'asc'}})
 return <div className='space-y-6'><h2 className='text-3xl font-bold'>Bulk Tag PDF Sheet</h2><Card><form action='/api/labels/bulk' method='get' className='grid gap-3'><div className='grid max-h-[520px] gap-2 overflow-auto rounded-lg border border-stone-200 bg-[#fffdf7] p-3'>{instances.map(i=><label key={i.id} className='flex min-w-0 items-start gap-2 text-sm'><input className='mt-1' type='checkbox' name='id' value={i.id}/><span className='font-bold'>{i.plantId}</span><span className='min-w-0 break-words'>{plantName(i.plantDefinition)}</span></label>)}</div><Button>Export selected PDF</Button><a className='rounded-md border border-stone-300 bg-[#fffdf7] px-4 py-2 text-center text-sm font-medium' href='/api/labels/bulk?all=1'>Export all active as PDF</a></form></Card></div>
}
