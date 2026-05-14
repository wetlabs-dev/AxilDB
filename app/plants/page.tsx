import { prisma } from '@/lib/prisma'
import { createPlantDefinition } from '@/app/actions'
import { Card, Field, TextArea, Button, LinkButton } from '@/components/ui'
import { ConfidenceSelect, PlantAliasFields } from '@/components/PlantAliasFields'
import { canCreate, getCurrentUser, isAdmin } from '@/lib/auth'
import { plantName, taxonomyLabel } from '@/lib/utils'
import Link from 'next/link'

const selectClass = 'rounded-md border border-stone-300 bg-[#fffdf7] px-3 py-2 font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

export default async function Plants() {
  const user = await getCurrentUser()
  const [plants, bodies] = await Promise.all([
    prisma.plantDefinition.findMany({
      include: {
        governingBody: true,
        aliases: { orderBy: { name: 'asc' } },
        _count: { select: { instances: true } },
      },
      orderBy: [{ genus: 'asc' }, { species: 'asc' }],
    }),
    prisma.governingBody.findMany({ orderBy: { name: 'asc' } }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Plant Definitions</h2>
        <LinkButton href="/search">Search</LinkButton>
      </div>

      {canCreate(user) && (
        <Card>
          <form action={createPlantDefinition} className="grid gap-3 md:grid-cols-2">
            <Field label="Genus" name="genus" required />
            <Field label="Species" name="species" required />
            <Field label="Hybrid notation" name="hybridNotation" />
            <Field label="Cultivar name" name="cultivarName" />
            <Field label="Authority" name="authority" />
            <Field label="Cultivar registration number" name="cultivarRegistrationNumber" />
            <ConfidenceSelect name="confidence" />
            <Field label="Acquisition label" name="acquisitionLabel" />
            <Field label="Provisional taxon" name="provisionalTaxon" />
            <label className="grid gap-1.5 text-sm font-medium text-stone-800">
              Governing body
              <select className={selectClass} name="governingBodyId">
                <option value="">—</option>
                {bodies.map((body) => (
                  <option key={body.id} value={body.id}>
                    {body.name}
                  </option>
                ))}
              </select>
            </label>
            <TextArea label="Description" name="description" />
            <TextArea label="Notes" name="notes" />
            <PlantAliasFields />
            <Button className="md:col-span-2">Create plant definition</Button>
          </form>
        </Card>
      )}

      <div className="grid gap-3">
        {plants.map((plant) => (
          <Card key={plant.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-lg font-bold">{plantName(plant)}</span>
                <p className="text-sm">
                  {plant.governingBody?.abbreviation || 'No governing body'} · {plant._count.instances} instance(s) ·{' '}
                  {taxonomyLabel(plant.confidence)}
                </p>
                {(plant.acquisitionLabel || plant.provisionalTaxon || plant.authority) && (
                  <p className="text-sm text-stone-600">
                    {plant.acquisitionLabel && <>Acquired as {plant.acquisitionLabel}. </>}
                    {plant.provisionalTaxon && <>Provisional taxon: {plant.provisionalTaxon}. </>}
                    {plant.authority && <>Authority: {plant.authority}.</>}
                  </p>
                )}
                {plant.aliases.length > 0 && (
                  <p className="text-sm text-stone-600">
                    Aliases: {plant.aliases.slice(0, 4).map((alias) => alias.name).join(', ')}
                    {plant.aliases.length > 4 ? `, +${plant.aliases.length - 4} more` : ''}
                  </p>
                )}
                <p className="text-sm text-stone-600">{plant.description}</p>
              </div>
              {isAdmin(user) && (
                <Link className="rounded-xl border px-3 py-2 text-sm" href={`/plants/${plant.id}/edit`}>
                  Edit
                </Link>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
