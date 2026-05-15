import { prisma } from '@/lib/prisma'
import { createPlantDefinition } from '@/app/actions'
import { AddPanel, Card, Field, TextArea, Button, LinkButton } from '@/components/ui'
import { ConfidenceSelect, PlantAliasFields } from '@/components/PlantAliasFields'
import { PlantImage } from '@/components/PlantImage'
import { canCreate, getCurrentUser, isAdmin } from '@/lib/auth'
import { plantName, taxonomyLabel } from '@/lib/utils'
import Link from 'next/link'

const selectClass = 'rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-1.5 text-sm font-normal shadow-inner shadow-stone-200/30 outline-none transition focus:border-[#2f6b45] focus:ring-2 focus:ring-[#8fa58f]/30'

export default async function Plants() {
  const user = await getCurrentUser()
  const [plants, bodies] = await Promise.all([
    prisma.plantDefinition.findMany({
      include: {
        governingBody: true,
        aliases: { orderBy: { name: 'asc' } },
        instances: { select: { id: true } },
        _count: { select: { instances: true } },
      },
      orderBy: [{ genus: 'asc' }, { species: 'asc' }],
    }),
    prisma.governingBody.findMany({ orderBy: { name: 'asc' } }),
  ])
  const instanceIds = plants.flatMap((plant) => plant.instances.map((instance) => instance.id))
  const typePhotos = await prisma.photo.findMany({
    where: { entityType: 'PLANT_INSTANCE', entityId: { in: instanceIds }, isType: true },
    orderBy: { createdAt: 'desc' },
  })
  const typePhotoByInstance = typePhotos.reduce<Record<string, string>>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo.path
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Plant Definitions</h2>
        <LinkButton href="/search">Search</LinkButton>
      </div>

      {canCreate(user) && (
        <AddPanel label="Add plant definition">
          <form action={createPlantDefinition} className="grid max-w-6xl gap-x-3 gap-y-2 lg:grid-cols-4">
            <Field label="Genus" name="genus" required />
            <Field label="Species" name="species" required />
            <Field label="Hybrid notation" name="hybridNotation" />
            <Field label="Cultivar name" name="cultivarName" />
            <Field label="Authority" name="authority" />
            <Field label="Cultivar registration number" name="cultivarRegistrationNumber" />
            <ConfidenceSelect name="confidence" />
            <Field label="Acquisition label" name="acquisitionLabel" />
            <Field label="Provisional taxon" name="provisionalTaxon" />
            <Field label="Wikipedia URL" name="wikipediaUrl" type="url" />
            <Field label="iNaturalist URL" name="inaturalistUrl" type="url" />
            <Field label="POWO URL" name="powoUrl" type="url" />
            <Field label="GBIF URL" name="gbifUrl" type="url" />
            <label className="grid gap-1 text-sm font-medium text-stone-800">
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
            <TextArea label="Description" name="description" wrapperClassName="lg:col-span-2" />
            <TextArea label="Notes" name="notes" wrapperClassName="lg:col-span-2" />
            <PlantAliasFields />
            <Button className="justify-self-start lg:col-span-4">Create plant definition</Button>
          </form>
        </AddPanel>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {plants.map((plant) => {
          const typePhoto = plant.instances.map((instance) => typePhotoByInstance[instance.id]).find(Boolean)
          return (
          <Card key={plant.id} className="overflow-hidden p-0">
            <div className="aspect-[4/3]">
              <PlantImage src={typePhoto} alt={plantName(plant)} />
            </div>
            <div className="p-3">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-sm font-bold leading-tight">{plantName(plant)}</span>
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
                {(plant.wikipediaUrl || plant.inaturalistUrl || plant.powoUrl || plant.gbifUrl) && (
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {plant.wikipediaUrl && <a className="rounded-md border border-stone-300 bg-white/60 px-2 py-1 underline" href={plant.wikipediaUrl}>Wikipedia</a>}
                    {plant.inaturalistUrl && <a className="rounded-md border border-stone-300 bg-white/60 px-2 py-1 underline" href={plant.inaturalistUrl}>iNaturalist</a>}
                    {plant.powoUrl && <a className="rounded-md border border-stone-300 bg-white/60 px-2 py-1 underline" href={plant.powoUrl}>POWO</a>}
                    {plant.gbifUrl && <a className="rounded-md border border-stone-300 bg-white/60 px-2 py-1 underline" href={plant.gbifUrl}>GBIF</a>}
                  </div>
                )}
                <p className="text-sm text-stone-600">{plant.description}</p>
                </div>
              {isAdmin(user) && (
                <Link className="rounded-md border px-2 py-1 text-xs" href={`/plants/${plant.id}/edit`}>
                  Edit
                </Link>
              )}
              </div>
            </div>
          </Card>
          )
        })}
      </div>
    </div>
  )
}
