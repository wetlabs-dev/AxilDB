import { Card, Button, Field, Select, TextArea } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { canEditInCollection, canManageCollection, requireCollectionViewer } from '@/lib/collections'
import { DISTRIBUTOR_TYPES, PARTY_KINDS, SOURCE_TYPES, provenanceLabel } from '@/lib/provenance'
import { prisma } from '@/lib/prisma'
import {
  mergeDistributors, mergeSources, resolveProvenanceItem, saveDistributor, saveDistributorLocation,
  saveSource, toggleDistributorArchive, toggleDistributorLocationArchive, toggleSourceArchive, updateProvenanceVisibility,
} from '@/app/provenance-actions'

const option = (value: string) => <option key={value} value={value}>{provenanceLabel(value)}</option>

export default async function ProvenancePage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const context = await requireCollectionViewer()
  const user = await getCurrentUser()
  const { collection } = context
  const canEdit = canEditInCollection(user, context)
  const canManage = canManageCollection(user, context)
  const params = await searchParams
  const q = params.q?.trim() || ''
  const includeArchived = params.status === 'all'
  const textFilter = q ? { contains: q, mode: 'insensitive' as const } : undefined
  const [sources, distributors, reconciliation] = await Promise.all([
    prisma.source.findMany({
      where: { collectionId: collection.id, ...(!includeArchived ? { active: true } : {}), ...(textFilter ? { name: textFilter } : {}) },
      include: { _count: { select: { acquisitions: true } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    }),
    prisma.distributor.findMany({
      where: { collectionId: collection.id, ...(!includeArchived ? { active: true } : {}), ...(textFilter ? { name: textFilter } : {}) },
      include: {
        locations: { orderBy: [{ active: 'desc' }, { name: 'asc' }] },
        _count: { select: { acquisitions: true, observations: true } },
        acquisitions: { select: { acquiredAt: true, quantity: true, price: true, currency: true, plantInstances: { select: { plantInstance: { select: { status: true } } } } } },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    }),
    prisma.provenanceReconciliationItem.findMany({ where: { collectionId: collection.id, status: 'PENDING' }, orderBy: { createdAt: 'asc' } }),
  ])
  const activeSources = sources.filter((item) => item.active)
  const activeDistributors = distributors.filter((item) => item.active)

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold">Sources & Distributors</h2>
        <p className="mt-1 max-w-3xl text-sm text-stone-600">Reusable, collection-scoped acquisition provenance. Sources produced or supplied material; distributors are who the collection directly acquired it from.</p>
      </header>

      <Card>
        <form className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
          <Field label="Search provenance" name="q" defaultValue={q} placeholder="Name" />
          <Select label="Records" name="status" defaultValue={params.status || 'active'}><option value="active">Active only</option><option value="all">Active + archived</option></Select>
          <Button>Filter</Button>
        </form>
      </Card>

      {canManage && (
        <Card>
          <h3 className="font-serif text-xl font-semibold">Public provenance</h3>
          <p className="mt-1 text-sm text-stone-600">Ratings and experience notes are always private. Distributor identity and branch details remain private unless explicitly enabled.</p>
          <form action={updateProvenanceVisibility} className="mt-3 grid gap-2">
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showSourceProvenance" value="1" defaultChecked={collection.showSourceProvenance} /> Show source provenance in public acquisition contexts</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showDistributorIdentity" value="1" defaultChecked={collection.showDistributorIdentity} /> Show distributor identity</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showDistributorLocation" value="1" defaultChecked={collection.showDistributorLocation} /> Show distributor location</label>
            <Button className="mt-2 w-fit">Save visibility</Button>
          </form>
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-3">
          <div><h3 className="font-serif text-2xl font-semibold">Sources</h3><p className="text-sm text-stone-600">Originators, breeders, growers, propagators, importers, and other upstream suppliers.</p></div>
          {canEdit && <SourceForm collectionSlug={collection.slug} />}
          {sources.map((source) => (
            <Card key={source.id} className={!source.active ? 'opacity-70' : ''}>
              <div className="flex items-start justify-between gap-3"><div><h4 className="font-semibold">{source.name}</h4><p className="text-xs text-stone-600">{provenanceLabel(source.kind)} · {provenanceLabel(source.sourceType)} · {source._count.acquisitions} acquisition link(s)</p></div>{!source.active && <span className="rounded-full border px-2 py-1 text-xs">Archived</span>}</div>
              {source.description && <p className="mt-2 text-sm">{source.description}</p>}
              {(source.locality || source.region || source.country) && <p className="mt-1 text-xs text-stone-600">{[source.locality, source.region, source.country].filter(Boolean).join(', ')}</p>}
              {canEdit && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-[#2f6b45]">Edit source</summary><SourceForm collectionSlug={collection.slug} source={source} /><form action={toggleSourceArchive} className="mt-2"><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="id" value={source.id} /><Button variant="secondary">{source.active ? 'Archive' : 'Restore'}</Button></form></details>}
            </Card>
          ))}
          {!sources.length && <Card><p className="text-sm text-stone-600">No sources found.</p></Card>}
        </section>

        <section className="space-y-3">
          <div><h3 className="font-serif text-2xl font-semibold">Distributors</h3><p className="text-sm text-stone-600">The seller, trader, donor, or outlet from which the collection directly received a plant.</p></div>
          {canEdit && <DistributorForm collectionSlug={collection.slug} />}
          {distributors.map((distributor) => {
            const latest = distributor.acquisitions.reduce<Date | null>((result, item) => !result || item.acquiredAt > result ? item.acquiredAt : result, null)
            const specimens = distributor.acquisitions.reduce((sum, item) => sum + item.quantity, 0)
            return (
              <Card key={distributor.id} className={!distributor.active ? 'opacity-70' : ''}>
                <div className="flex items-start justify-between gap-3"><div><h4 className="font-semibold">{distributor.name}</h4><p className="text-xs text-stone-600">{provenanceLabel(distributor.kind)} · {provenanceLabel(distributor.distributorType)}</p></div>{!distributor.active && <span className="rounded-full border px-2 py-1 text-xs">Archived</span>}</div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600"><span>{distributor._count.acquisitions} acquisition(s)</span><span>{specimens} specimen(s)</span><span>{distributor._count.observations} observation(s)</span><span>{latest ? `Latest ${latest.toLocaleDateString()}` : 'No purchases'}</span></div>
                {distributor.rating && <p className="mt-2 text-sm font-semibold" aria-label={`${distributor.rating} of 5 private experience rating`}>{'★'.repeat(distributor.rating)}{'☆'.repeat(5 - distributor.rating)} <span className="text-xs font-normal text-stone-600">private collection rating</span></p>}
                {distributor.experienceNotes && canEdit && <p className="mt-2 rounded border border-stone-200 bg-white/40 p-2 text-sm"><span className="font-semibold">Private experience:</span> {distributor.experienceNotes}</p>}
                {distributor.locations.length > 0 && <div className="mt-3 grid gap-2">{distributor.locations.map((location) => <div key={location.id} className="rounded border border-stone-200 p-2 text-sm"><strong>{location.name}</strong><span className="text-stone-600"> · {[location.locationType, location.city, location.region].filter(Boolean).join(' · ') || 'location details not recorded'}</span>{canEdit && <details className="mt-1"><summary className="cursor-pointer text-xs font-semibold text-[#2f6b45]">Edit location</summary><DistributorLocationForm collectionSlug={collection.slug} distributorId={distributor.id} location={location}/><form action={toggleDistributorLocationArchive} className="mt-1"><input type="hidden" name="collectionSlug" value={collection.slug}/><input type="hidden" name="id" value={location.id}/><button className="text-xs font-semibold text-[#2f6b45] underline">{location.active ? 'Archive location' : 'Restore location'}</button></form></details>}</div>)}</div>}
                {canEdit && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-[#2f6b45]">Edit distributor and locations</summary><DistributorForm collectionSlug={collection.slug} distributor={distributor} /><DistributorLocationForm collectionSlug={collection.slug} distributorId={distributor.id} /><form action={toggleDistributorArchive} className="mt-2"><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="id" value={distributor.id} /><Button variant="secondary">{distributor.active ? 'Archive' : 'Restore'}</Button></form></details>}
              </Card>
            )
          })}
          {!distributors.length && <Card><p className="text-sm text-stone-600">No distributors found.</p></Card>}
        </section>
      </div>

      {canManage && (activeSources.length > 1 || activeDistributors.length > 1) && <Card><h3 className="font-serif text-xl font-semibold">Merge duplicates</h3><p className="mt-1 text-sm text-stone-600">Dependent acquisition and observation links move to the canonical record before the duplicate is removed.</p><div className="mt-3 grid gap-4 lg:grid-cols-2">{activeSources.length > 1 && <MergeForm action={mergeSources} collectionSlug={collection.slug} label="sources" records={activeSources}/>} {activeDistributors.length > 1 && <MergeForm action={mergeDistributors} collectionSlug={collection.slug} label="distributors" records={activeDistributors}/>}</div></Card>}

      <Card>
        <h3 className="font-serif text-xl font-semibold">Reconciliation Queue</h3>
        <p className="mt-1 text-sm text-stone-600">Ambiguous legacy text stays untouched until a gardener resolves or dismisses it.</p>
        <div className="mt-3 grid gap-3">
          {reconciliation.map((item) => <form key={item.id} action={resolveProvenanceItem} className="grid gap-2 rounded-lg border border-stone-200 p-3 md:grid-cols-4"><input type="hidden" name="collectionSlug" value={collection.slug}/><input type="hidden" name="id" value={item.id}/><div className="md:col-span-4"><p className="text-xs uppercase tracking-wide text-stone-500">{item.entityType} · {item.legacyField}</p><p className="font-semibold">{item.legacyValue}</p></div><Select label="Assign source" name="sourceId"><option value="">No source assignment</option>{activeSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</Select><Select label="Assign distributor" name="distributorId"><option value="">No distributor assignment</option>{activeDistributors.map((distributor) => <option key={distributor.id} value={distributor.id}>{distributor.name}</option>)}</Select><Select label="Assign branch/outlet" name="distributorLocationId"><option value="">No location assignment</option>{activeDistributors.flatMap((distributor) => distributor.locations.filter((location) => location.active).map((location) => <option key={location.id} value={location.id}>{distributor.name} · {location.name}</option>))}</Select><Select label="Resolution" name="resolution" defaultValue="RESOLVED"><option value="RESOLVED">Resolve and preserve legacy text</option><option value="DISMISSED">Dismiss and preserve legacy text</option></Select>{canEdit && <Button className="w-fit md:col-span-4">Apply resolution</Button>}</form>)}
          {!reconciliation.length && <p className="text-sm text-stone-600">No ambiguous provenance needs reconciliation.</p>}
        </div>
      </Card>
    </div>
  )
}

function SourceForm({ collectionSlug, source }: { collectionSlug: string; source?: any }) {
  return <form action={saveSource} className="mt-3 grid gap-2 rounded-lg border border-stone-200 bg-white/35 p-3 sm:grid-cols-2"><input type="hidden" name="collectionSlug" value={collectionSlug}/>{source && <input type="hidden" name="id" value={source.id}/>}<Field label="Name" name="name" defaultValue={source?.name} required/><Select label="Kind" name="kind" defaultValue={source?.kind || 'ORGANIZATION'}>{PARTY_KINDS.map(option)}</Select><Select label="Source type" name="sourceType" defaultValue={source?.sourceType || 'UNKNOWN'}>{SOURCE_TYPES.map(option)}</Select><Field label="Website" name="websiteUrl" type="url" defaultValue={source?.websiteUrl}/><Field label="Locality" name="locality" defaultValue={source?.locality}/><Field label="Region" name="region" defaultValue={source?.region}/><Field label="Country" name="country" defaultValue={source?.country}/><TextArea label="Description" name="description" defaultValue={source?.description}/><TextArea label="Internal notes" name="notes" defaultValue={source?.notes}/><Button className="w-fit sm:col-span-2">{source ? 'Save source' : 'Create source'}</Button></form>
}

function DistributorForm({ collectionSlug, distributor }: { collectionSlug: string; distributor?: any }) {
  return <form action={saveDistributor} className="mt-3 grid gap-2 rounded-lg border border-stone-200 bg-white/35 p-3 sm:grid-cols-2"><input type="hidden" name="collectionSlug" value={collectionSlug}/>{distributor && <input type="hidden" name="id" value={distributor.id}/>}<Field label="Name" name="name" defaultValue={distributor?.name} required/><Select label="Kind" name="kind" defaultValue={distributor?.kind || 'ORGANIZATION'}>{PARTY_KINDS.map(option)}</Select><Select label="Distributor type" name="distributorType" defaultValue={distributor?.distributorType || 'OTHER'}>{DISTRIBUTOR_TYPES.map(option)}</Select><Select label="Private experience rating" name="rating" defaultValue={distributor?.rating ? String(distributor.rating) : ''}><option value="">Not rated</option>{[1,2,3,4,5].map((rating) => <option key={rating} value={rating}>{rating} of 5</option>)}</Select><Field label="Website" name="websiteUrl" type="url" defaultValue={distributor?.websiteUrl}/><TextArea label="Description" name="description" defaultValue={distributor?.description}/><TextArea label="Private experience notes" name="experienceNotes" defaultValue={distributor?.experienceNotes}/><Button className="w-fit sm:col-span-2">{distributor ? 'Save distributor' : 'Create distributor'}</Button></form>
}

function DistributorLocationForm({ collectionSlug, distributorId, location }: { collectionSlug: string; distributorId: string; location?: any }) {
  return <form action={saveDistributorLocation} className="mt-3 grid gap-2 rounded-lg border border-stone-200 p-3 sm:grid-cols-2"><input type="hidden" name="collectionSlug" value={collectionSlug}/><input type="hidden" name="distributorId" value={distributorId}/>{location && <input type="hidden" name="id" value={location.id}/>}<Field label={location ? 'Branch/outlet name' : 'New branch/outlet name'} name="name" defaultValue={location?.name} required/><Field label="Location type" name="locationType" defaultValue={location?.locationType} placeholder="Online store, branch, show booth"/><Field label="Address" name="addressLine1" defaultValue={location?.addressLine1}/><Field label="City" name="city" defaultValue={location?.city}/><Field label="Region" name="region" defaultValue={location?.region}/><Field label="Postal code" name="postalCode" defaultValue={location?.postalCode}/><Field label="Country" name="country" defaultValue={location?.country}/><Field label="URL" name="url" type="url" defaultValue={location?.url}/><TextArea label="Internal notes" name="notes" defaultValue={location?.notes}/><Button className="w-fit sm:col-span-2">{location ? 'Save location' : 'Add location'}</Button></form>
}

function MergeForm({ action, collectionSlug, label, records }: { action: (fd: FormData) => Promise<void>; collectionSlug: string; label: string; records: Array<{ id: string; name: string }> }) {
  return <form action={action} className="grid gap-2 rounded-lg border border-stone-200 p-3"><h4 className="font-semibold">Merge {label}</h4><input type="hidden" name="collectionSlug" value={collectionSlug}/><Select label="Canonical record" name="canonicalId" required><option value="">Choose canonical</option>{records.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</Select><Select label="Duplicate to merge" name="duplicateId" required><option value="">Choose duplicate</option>{records.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</Select><Button>Merge and reassign</Button></form>
}
