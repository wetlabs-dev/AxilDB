import LineageGraph from '@/components/LineageGraph'
import { Card } from '@/components/ui'
import { getLineageGraph } from '@/lib/lineage'
import { prisma } from '@/lib/prisma'
import { plantName } from '@/lib/utils'
import Link from 'next/link'

export default async function Graphs({
  searchParams,
}: {
  searchParams: Promise<{ root?: string; q?: string }>
}) {
  const sp = await searchParams
  const q = (sp.q || '').trim()
  const roots = await prisma.plantInstance.findMany({
    where: {
      status: 'ACTIVE',
      ...(q
        ? {
            OR: [
              { plantId: { contains: q } },
              { location: { contains: q } },
              { plantDefinition: { is: { genus: { contains: q } } } },
              { plantDefinition: { is: { species: { contains: q } } } },
              { plantDefinition: { is: { cultivarName: { contains: q } } } },
            ],
          }
        : {}),
    },
    include: { plantDefinition: true },
    orderBy: { plantId: 'asc' },
  })
  const root = sp.root || roots[0]?.id
  const graph = root ? await getLineageGraph(root) : { nodes: [], edges: [] }
  const selected = roots.find((item) => item.id === root)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Lineage Graphs</h2>
        <p className="mt-1 text-sm text-stone-600">Choose a plant, then follow its descendants through propagation events and sport lines.</p>
      </div>

      <div className="grid gap-4 xl:grid-cols-[18rem_1fr]">
        <aside className="xl:sticky xl:top-8 xl:self-start">
          <Card className="p-3">
            <form className="grid gap-2">
              <label className="grid gap-1 text-sm font-medium text-stone-800">
                Filter plants
                <input
                  className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30"
                  name="q"
                  placeholder="ID, genus, species..."
                  defaultValue={q}
                />
              </label>
              <button className="rounded-md bg-[#2f6b45] px-3 py-1.5 text-sm font-medium text-white">Filter</button>
            </form>

            <div className="mt-4 max-h-[64vh] space-y-1 overflow-auto pr-1">
              {roots.map((item) => {
                const active = item.id === root
                return (
                  <Link
                    key={item.id}
                    className={`block rounded-md border px-3 py-2 text-sm transition ${
                      active
                        ? 'border-[#2f6b45] bg-[#d6dfc9] text-[#1f472f] shadow-sm'
                        : 'border-transparent hover:border-stone-200 hover:bg-white/60'
                    }`}
                    href={`/graphs?root=${item.id}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
                  >
                    <span className="block font-semibold">{item.plantId}</span>
                    <span className="line-clamp-2 text-xs text-stone-600">{plantName(item.plantDefinition)}</span>
                  </Link>
                )
              })}
              {roots.length === 0 && <p className="px-2 py-3 text-sm text-stone-600">No matching active plants.</p>}
            </div>
          </Card>
        </aside>

        <section className="min-w-0 space-y-3">
          {selected && (
            <div className="rounded-lg border border-stone-200 bg-[#fffaf0]/82 px-4 py-3 text-sm shadow-sm">
              <span className="font-semibold">Selected:</span> {selected.plantId} · {plantName(selected.plantDefinition)}
            </div>
          )}
          {root ? <LineageGraph nodes={graph.nodes} edges={graph.edges} selectedId={root} /> : <Card>No plants yet.</Card>}
        </section>
      </div>
    </div>
  )
}
