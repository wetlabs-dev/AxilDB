import { prisma } from './prisma'
import { plantName } from './utils'

export async function getLineageGraph(rootId: string) {
  const nodes = new Map<string, any>()
  const edges: any[] = []
  const visit = async (id: string) => {
    if (nodes.has(id)) return
    const item = await prisma.plantInstance.findUnique({ where:{id}, include:{plantDefinition:true} })
    if (!item) return
    nodes.set(id, { id, data: { label: `${item.plantId}\n${plantName(item.plantDefinition)}` }, position: { x:0, y:0 }, className: `${item.status === 'ARCHIVED' ? 'opacity-40' : ''} ${item.isSportCandidate || item.sportStatus !== 'NONE' ? 'border-2 border-amber-500' : ''}` })
    const outgoing = await prisma.parentageLink.findMany({ where:{parentPlantInstanceId:id}, include:{propagationEvent:{include:{children:{include:{childPlantInstance:true}}}}} })
    for (const link of outgoing) {
      for (const child of link.propagationEvent.children) {
        if (child.childPlantInstanceId === id) continue
        edges.push({ id: `${id}-${child.childPlantInstanceId}-${link.propagationEventId}`, source: id, target: child.childPlantInstanceId, animated: item.sportStatus !== 'NONE', label: link.propagationEvent.method })
        await visit(child.childPlantInstanceId)
      }
    }
  }
  await visit(rootId)
  return { nodes: Array.from(nodes.values()), edges }
}

export async function findRootMothers(instanceId: string): Promise<string[]> {
  const parents = await prisma.parentageLink.findMany({ where: { propagationEvent: { children: { some: { childPlantInstanceId: instanceId } } } }, include: { parentPlantInstance: true } })
  if (!parents.length) return [instanceId]
  const roots = await Promise.all(parents.map(p => findRootMothers(p.parentPlantInstanceId)))
  return Array.from(new Set(roots.flat()))
}
