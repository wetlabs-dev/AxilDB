import { mergePlantInstances } from '@/app/plant-instance-merge-actions'
import { Button, Card, Field, TextArea } from '@/components/ui'
import { collectionPath, requireCollectionAdmin } from '@/lib/collections'
import { locationPath } from '@/lib/locations'
import { plantInstanceMergeReasons } from '@/lib/plant-instance-merges'
import { prisma } from '@/lib/prisma'
import { dateInput, fmtDate, plantName } from '@/lib/utils'
import Link from 'next/link'

export default async function MergePlantInstancesPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[]; definition?: string }>
}) {
  const { collection } = await requireCollectionAdmin()
  const params = await searchParams
  const requestedIds = (Array.isArray(params.ids) ? params.ids : String(params.ids || '').split(',')).filter(Boolean)
  const requested = requestedIds.length
    ? await prisma.plantInstance.findMany({ where: { collectionId: collection.id, id: { in: requestedIds }, status: 'ACTIVE' }, select: { id: true, plantDefinitionId: true } })
    : []
  const definitionId = params.definition || requested[0]?.plantDefinitionId || ''
  const candidates = definitionId
    ? await prisma.plantInstance.findMany({
        where: { collectionId: collection.id, plantDefinitionId: definitionId, status: 'ACTIVE', mergeConstituent: null },
        include: { plantDefinition: true, currentLocation: { include: { locationType: true } }, currentSubstrate: { include: { recipeVersion: { include: { recipe: true } } } } },
        orderBy: [{ acquisitionDate: 'asc' }, { createdAt: 'asc' }],
      })
    : []
  const selected = new Set(requestedIds.length >= 2 ? requestedIds : candidates.map((candidate) => candidate.id))
  const oldest = candidates.find((candidate) => selected.has(candidate.id)) || candidates[0]
  const locationNodes = await prisma.location.findMany({ where: { collectionId: collection.id }, include: { locationType: true } })

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2f6b45]">Plant lifecycle</p>
        <h2 className="text-3xl font-bold">Pot specimens together</h2>
        <p className="mt-1 max-w-3xl text-sm text-stone-600">Permanently combine active specimens of one plant definition. Historical records remain attached to their original IDs and appear in the survivor's unified timeline.</p>
      </div>

      {!definitionId || candidates.length < 2 ? (
        <Card>
          <h3 className="font-bold">Not enough eligible specimens</h3>
          <p className="mt-1 text-sm">Open an active specimen and choose Pot together. At least two active specimens with the same plant definition are required.</p>
          <Link className="mt-3 inline-block font-semibold text-[#2f6b45] underline" href={collectionPath(collection.slug, '/instances')}>Return to plant instances</Link>
        </Card>
      ) : (
        <form action={mergePlantInstances} className="space-y-5">
          <input type="hidden" name="collectionSlug" value={collection.slug} />
          <Card>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">1. Select specimens</p>
            <h3 className="mt-1 text-xl font-bold">{plantName(candidates[0].plantDefinition)}</h3>
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {candidates.map((candidate) => (
                <label key={candidate.id} className="flex gap-3 rounded-md border border-stone-200 bg-white/55 p-3">
                  <input type="checkbox" name="plantInstanceIds" value={candidate.id} defaultChecked={selected.has(candidate.id)} />
                  <span className="min-w-0 text-sm">
                    <span className="block font-bold text-[#2f6b45]">{candidate.plantId}</span>
                    <span className="block">Acquired {fmtDate(candidate.acquisitionDate)} · {candidate.currentLocation ? locationPath(candidate.currentLocation.id, locationNodes) : candidate.location || 'No location'}</span>
                    <span className="block text-stone-600">{candidate.currentSubstrate?.recipeVersion?.recipe.name || candidate.currentSubstrate?.substrateMode.replaceAll('_', ' ').toLowerCase() || 'Substrate not recorded'}</span>
                  </span>
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">2. Choose survivor</p>
            <p className="mt-1 text-sm text-stone-600">The oldest acquisition is selected by default. This specimen keeps its Plant ID, QR code, URLs, and future care schedule.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {candidates.map((candidate) => <label key={candidate.id} className="rounded-md border border-stone-300 bg-white/60 px-3 py-2 text-sm font-semibold"><input className="mr-2" type="radio" name="survivingPlantInstanceId" value={candidate.id} defaultChecked={candidate.id === oldest?.id} />{candidate.plantId}</label>)}
            </div>
          </Card>

          <Card>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">3. Resolve current metadata</p>
            <p className="mt-1 text-sm text-stone-600">Choose which specimen supplies each current value. Historical values remain in the constituent records.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {[
                ['instanceType', 'Plant type'], ['currentLocationId', 'Current location'], ['source', 'Source'], ['distributor', 'Seller / distributor'],
                ['stockNumber', 'Stock number'], ['acquisitionLabel', 'Acquisition label'], ['purchasePrice', 'Purchase price'],
                ['substrate', 'Current substrate'], ['husbandry', 'Local husbandry adjustments'],
              ].map(([field, label]) => (
                <label key={field} className="grid gap-1 text-sm font-medium">{label}
                  <select name={`${field}SourceId`} defaultValue={oldest?.id} className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-2 font-normal">
                    {candidates.map((candidate) => {
                      const display = field === 'currentLocationId'
                        ? candidate.currentLocation?.name || candidate.location
                        : field === 'substrate'
                          ? candidate.currentSubstrate?.recipeVersion?.recipe.name || candidate.currentSubstrate?.substrateMode
                          : field === 'husbandry'
                            ? 'Use this specimen’s local adjustments'
                            : String((candidate as unknown as Record<string, unknown>)[field] || 'Not set')
                      return <option key={candidate.id} value={candidate.id}>{candidate.plantId} · {display || 'Not set'}</option>
                    })}
                  </select>
                </label>
              ))}
            </div>
          </Card>

          <Card>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-stone-500">4. Record and confirm</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm font-medium">Reason<select name="reason" required className="rounded-md border border-stone-300 bg-[#fffdf7] px-2.5 py-2 font-normal">{plantInstanceMergeReasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <Field label="Merge date" name="mergeDate" type="date" defaultValue={dateInput(new Date())} required />
              <TextArea label="Merge notes" name="notes" wrapperClassName="md:col-span-2" />
            </div>
            <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-bold">This operation is intentionally irreversible.</p>
              <p>Constituent specimens become read-only historical records. Their IDs remain searchable and their old QR codes continue to open those records.</p>
              <label className="mt-2 flex items-start gap-2 font-semibold"><input type="checkbox" required />I understand and want to permanently merge these specimens.</label>
            </div>
            <Button className="mt-4">Pot together permanently</Button>
          </Card>
        </form>
      )}
    </div>
  )
}
