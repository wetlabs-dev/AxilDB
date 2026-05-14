import { prisma } from '@/lib/prisma'
import { getLineageGraph } from '@/lib/lineage'
import LineageGraph from '@/components/LineageGraph'
import { Card } from '@/components/ui'
import Link from 'next/link'
import { plantName } from '@/lib/utils'
export default async function Graphs({searchParams}:{searchParams:Promise<{root?:string}>}){ const sp=await searchParams; const roots=await prisma.plantInstance.findMany({where:{instanceType:'MOTHER'},include:{plantDefinition:true},orderBy:{plantId:'asc'}}); const root=sp.root || roots[0]?.id; const graph=root ? await getLineageGraph(root) : {nodes:[],edges:[]}; return <div className='space-y-6'><h2 className='text-3xl font-bold'>Lineage Graphs</h2><Card><div className='flex flex-wrap gap-2'>{roots.map(r=><Link className='rounded-lg border px-3 py-2 text-sm' key={r.id} href={`/graphs?root=${r.id}`}>{r.plantId} · {plantName(r.plantDefinition)}</Link>)}</div></Card>{root ? <LineageGraph nodes={graph.nodes} edges={graph.edges}/> : <Card>No mother plants yet.</Card>}</div> }
