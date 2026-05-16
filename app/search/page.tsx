import { prisma } from '@/lib/prisma'
import { Card, Button } from '@/components/ui'
import { plantName, fmtDate, taxonomyLabel } from '@/lib/utils'
import Link from 'next/link'

const control = 'rounded-md border border-stone-300 bg-[#fffdf7] px-3 py-2 text-sm shadow-inner shadow-stone-200/30 outline-none focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'
const contains = (value: string) => ({ contains: value, mode: 'insensitive' as const })

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; type?: string; sport?: string }>
}) {
  const sp = await searchParams
  const q = (sp.q || '').trim()
  const status = sp.status || ''
  const type = sp.type || ''
  const sport = sp.sport || ''

  const definitionSearch = q
    ? {
        OR: [
          { genus: contains(q) },
          { species: contains(q) },
          { cultivarName: contains(q) },
          { authority: contains(q) },
          { acquisitionLabel: contains(q) },
          { provisionalTaxon: contains(q) },
          { wikipediaUrl: contains(q) },
          { inaturalistUrl: contains(q) },
          { powoUrl: contains(q) },
          { gbifUrl: contains(q) },
          { description: contains(q) },
          { notes: contains(q) },
          { aliases: { some: { OR: [{ name: contains(q) }, { source: contains(q) }, { notes: contains(q) }] } } },
        ],
      }
    : {}

  const instances = await prisma.plantInstance.findMany({
    where: {
      AND: [
        status ? { status } : {},
        type ? { instanceType: type } : {},
        sport ? { sportStatus: sport } : {},
        q
          ? {
              OR: [
                { plantId: contains(q) },
                { location: contains(q) },
                { source: contains(q) },
                { stockNumber: contains(q) },
                { plantDefinition: definitionSearch },
              ],
            }
          : {},
      ],
    },
    include: { plantDefinition: { include: { aliases: true } } },
    orderBy: { plantId: 'asc' },
  })

  const defs = await prisma.plantDefinition.findMany({
    where: definitionSearch,
    include: {
      aliases: { orderBy: { name: 'asc' } },
      _count: { select: { instances: true } },
    },
    orderBy: { genus: 'asc' },
  })

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold">Search / Filter</h2>
      <Card>
        <form className="grid gap-3 md:grid-cols-5">
          <input className={`${control} md:col-span-2`} name="q" placeholder="Search plant ID, cultivar, aliases, source, notes…" defaultValue={q} />
          <select className={control} name="status" defaultValue={status}>
            <option value="">Any status</option>
            <option>ACTIVE</option>
            <option>ARCHIVED</option>
          </select>
          <select className={control} name="type" defaultValue={type}>
            <option value="">Any type</option>
            <option>MOTHER</option>
            <option>PROPAGATION</option>
          </select>
          <select className={control} name="sport" defaultValue={sport}>
            <option value="">Any sport status</option>
            <option>NONE</option>
            <option>SUSPECTED</option>
            <option>CANDIDATE</option>
            <option>STABLE</option>
            <option>UNSTABLE</option>
            <option>REVERTED</option>
            <option>REGISTERED</option>
          </select>
          <Button className="md:col-span-5">Search</Button>
        </form>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-bold">Plant instances</h3>
          {instances.map((instance) => (
            <p key={instance.id} className="border-t border-stone-200 py-2 text-sm">
              <Link className="font-bold underline" href={`/instances/${instance.id}`}>
                {instance.plantId}
              </Link>{' '}
              · {plantName(instance.plantDefinition)} · {instance.status} · {fmtDate(instance.propagationDate || instance.acquisitionDate)}
            </p>
          ))}
        </Card>
        <Card>
          <h3 className="mb-3 font-bold">Plant definitions</h3>
          {defs.map((definition) => (
            <div key={definition.id} className="border-t border-stone-200 py-2 text-sm">
              <p>
                <Link className="font-bold underline" href={`/plants/${definition.id}/edit`}>
                  {plantName(definition)}
                </Link>{' '}
                · {definition._count.instances} instance(s) · {taxonomyLabel(definition.confidence)}
              </p>
              {definition.aliases.length > 0 && (
                <p className="text-stone-600">Aliases: {definition.aliases.map((alias) => alias.name).join(', ')}</p>
              )}
            </div>
          ))}
        </Card>
      </div>
    </div>
  )
}
