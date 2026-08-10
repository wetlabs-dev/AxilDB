import { Card, Button, Field, Select, TextArea } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { canEditInCollection, canManageCollection, requireCollectionViewer } from '@/lib/collections'
import {
  DISTRIBUTOR_OUTLET_TYPES,
  DISTRIBUTOR_TYPES,
  PARTY_KINDS,
  SELLER_STOREFRONT_TYPES,
  SOURCE_TYPES,
  provenanceLabel,
} from '@/lib/provenance'
import { prisma } from '@/lib/prisma'
import {
  mergeDistributors,
  mergeSellers,
  mergeSources,
  resolveProvenanceItem,
  saveDistributor,
  saveDistributorOutlet,
  saveSeller,
  saveSellerStorefront,
  saveSource,
  toggleDistributorArchive,
  toggleDistributorOutletArchive,
  toggleSellerArchive,
  toggleSellerStorefrontArchive,
  toggleSourceArchive,
  updateProvenanceVisibility,
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
  const activeWhere = !includeArchived ? { active: true } : {}
  const nameWhere = q ? { contains: q, mode: 'insensitive' as const } : undefined
  const [sources, distributors, sellers, reconciliation] = await Promise.all([
    prisma.source.findMany({
      where: { collectionId: collection.id, ...activeWhere, ...(nameWhere ? { name: nameWhere } : {}) },
      include: { _count: { select: { acquisitions: true } } },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    }),
    prisma.distributor.findMany({
      where: {
        collectionId: collection.id,
        ...activeWhere,
        ...(nameWhere ? { OR: [{ name: nameWhere }, { outlets: { some: { name: nameWhere } } }, { sellerStorefronts: { some: { handleOrName: nameWhere } } }] } : {}),
      },
      include: {
        outlets: { orderBy: [{ active: 'desc' }, { name: 'asc' }] },
        sellerStorefronts: { where: { active: true }, include: { seller: true }, orderBy: { handleOrName: 'asc' } },
        _count: { select: { acquisitions: true, observations: true } },
        acquisitions: { select: { acquiredAt: true, quantity: true, price: true, currency: true } },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    }),
    prisma.seller.findMany({
      where: {
        collectionId: collection.id,
        ...activeWhere,
        ...(nameWhere ? { OR: [{ name: nameWhere }, { storefronts: { some: { handleOrName: nameWhere } } }] } : {}),
      },
      include: {
        storefronts: { include: { distributor: true, _count: { select: { acquisitions: true, observations: true } } }, orderBy: [{ active: 'desc' }, { handleOrName: 'asc' }] },
        _count: { select: { acquisitions: true, observations: true, storefronts: true } },
        acquisitions: { select: { acquiredAt: true, quantity: true, price: true, currency: true } },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    }),
    prisma.provenanceReconciliationItem.findMany({ where: { collectionId: collection.id, status: 'PENDING' }, orderBy: { createdAt: 'asc' } }),
  ])
  const activeSources = sources.filter((item) => item.active)
  const activeDistributors = distributors.filter((item) => item.active)
  const activeSellers = sellers.filter((item) => item.active)

  return (
    <div className="space-y-6">
      <header>
        <h2 className="text-3xl font-bold">Provenance</h2>
        <p className="mt-1 max-w-4xl text-sm text-stone-600">Keep upstream sources, actual sellers, marketplace storefronts, sales channels, and distributor-operated outlets distinct while preserving the full acquisition story.</p>
      </header>

      <Card>
        <form className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
          <Field label="Search provenance" name="q" defaultValue={q} placeholder="Source, seller, storefront, distributor, outlet" />
          <Select label="Records" name="status" defaultValue={params.status || 'active'}><option value="active">Active only</option><option value="all">Active + archived</option></Select>
          <Button>Filter</Button>
        </form>
      </Card>

      {canManage && (
        <Card>
          <h3 className="font-serif text-xl font-semibold">Public provenance</h3>
          <p className="mt-1 text-sm text-stone-600">Everything is collection-private unless enabled here. Ratings, private experience notes, and personal addresses are never public.</p>
          <form action={updateProvenanceVisibility} className="mt-3 grid gap-2 sm:grid-cols-2">
            <input type="hidden" name="collectionSlug" value={collection.slug} />
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showSourceProvenance" value="1" defaultChecked={collection.showSourceProvenance} /> Show source provenance</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showSellerIdentity" value="1" defaultChecked={collection.showSellerIdentity} /> Show seller identity</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showSellerStorefront" value="1" defaultChecked={collection.showSellerStorefront} /> Show seller storefront</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showDistributorIdentity" value="1" defaultChecked={collection.showDistributorIdentity} /> Show distributor / platform</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showDistributorOutlet" value="1" defaultChecked={collection.showDistributorOutlet} /> Show distributor outlet</label>
            <Button className="mt-2 w-fit sm:col-span-2">Save visibility</Button>
          </form>
        </Card>
      )}

      <section className="space-y-3">
        <div><h3 className="font-serif text-2xl font-semibold">Sellers & Storefronts</h3><p className="text-sm text-stone-600">The people or organizations that actually sold or transferred plants, with reusable identities for each marketplace or channel.</p></div>
        {canEdit && <SellerForm collectionSlug={collection.slug} />}
        <div className="grid gap-3 lg:grid-cols-2">
          {sellers.map((seller) => {
            const latest = seller.acquisitions.reduce<Date | null>((result, item) => !result || item.acquiredAt > result ? item.acquiredAt : result, null)
            const specimens = seller.acquisitions.reduce((sum, item) => sum + item.quantity, 0)
            const spending = seller.acquisitions.reduce((sum, item) => sum + Number(item.price || 0), 0)
            return (
              <Card key={seller.id} className={!seller.active ? 'opacity-70' : ''}>
                <div className="flex items-start justify-between gap-3"><div><h4 className="font-semibold">{seller.name}</h4><p className="text-xs text-stone-600">{provenanceLabel(seller.kind)} · {seller._count.storefronts} storefront(s)</p></div>{!seller.active && <span className="rounded-full border px-2 py-1 text-xs">Archived</span>}</div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600"><span>{seller._count.acquisitions} acquisition(s)</span><span>{specimens} specimen(s)</span><span>{seller._count.observations} observation(s)</span><span>{latest ? `Latest ${latest.toLocaleDateString()}` : 'No purchases'}</span>{spending > 0 && <span>${spending.toFixed(2)} recorded spending</span>}</div>
                {seller.rating && <p className="mt-2 text-sm font-semibold" aria-label={`${seller.rating} of 5 private seller rating`}>{'★'.repeat(seller.rating)}{'☆'.repeat(5 - seller.rating)} <span className="text-xs font-normal text-stone-600">private collection rating</span></p>}
                {seller.experienceNotes && canEdit && <p className="mt-2 rounded border border-stone-200 bg-white/40 p-2 text-sm"><span className="font-semibold">Private experience:</span> {seller.experienceNotes}</p>}
                {seller.storefronts.length > 0 && <div className="mt-3 grid gap-2">{seller.storefronts.map((storefront) => <StorefrontCard key={storefront.id} storefront={storefront} seller={seller} collectionSlug={collection.slug} distributors={activeDistributors} canEdit={canEdit} />)}</div>}
                {canEdit && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-[#2f6b45]">Edit seller and storefronts</summary><SellerForm collectionSlug={collection.slug} seller={seller} /><SellerStorefrontForm collectionSlug={collection.slug} sellerId={seller.id} distributors={activeDistributors} /><form action={toggleSellerArchive} className="mt-2"><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="id" value={seller.id} /><Button variant="secondary">{seller.active ? 'Archive' : 'Restore'}</Button></form></details>}
              </Card>
            )
          })}
          {!sellers.length && <Card><p className="text-sm text-stone-600">No sellers found.</p></Card>}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="space-y-3">
          <div><h3 className="font-serif text-2xl font-semibold">Sources</h3><p className="text-sm text-stone-600">Originators, breeders, growers, propagators, importers, and other upstream suppliers.</p></div>
          {canEdit && <SourceForm collectionSlug={collection.slug} />}
          {sources.map((source) => <Card key={source.id} className={!source.active ? 'opacity-70' : ''}><div className="flex items-start justify-between gap-3"><div><h4 className="font-semibold">{source.name}</h4><p className="text-xs text-stone-600">{provenanceLabel(source.kind)} · {provenanceLabel(source.sourceType)} · {source._count.acquisitions} acquisition link(s)</p></div>{!source.active && <span className="rounded-full border px-2 py-1 text-xs">Archived</span>}</div>{source.description && <p className="mt-2 text-sm">{source.description}</p>}{canEdit && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-[#2f6b45]">Edit source</summary><SourceForm collectionSlug={collection.slug} source={source} /><form action={toggleSourceArchive} className="mt-2"><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="id" value={source.id} /><Button variant="secondary">{source.active ? 'Archive' : 'Restore'}</Button></form></details>}</Card>)}
          {!sources.length && <Card><p className="text-sm text-stone-600">No sources found.</p></Card>}
        </section>

        <section className="space-y-3">
          <div><h3 className="font-serif text-2xl font-semibold">Distributors & Outlets</h3><p className="text-sm text-stone-600">Retailers, marketplaces, nurseries, and sales channels. Outlets belong to the distributor itself; independent marketplace accounts belong under Sellers.</p></div>
          {canEdit && <DistributorForm collectionSlug={collection.slug} />}
          {distributors.map((distributor) => (
            <Card key={distributor.id} className={!distributor.active ? 'opacity-70' : ''}>
              <div className="flex items-start justify-between gap-3"><div><h4 className="font-semibold">{distributor.name}</h4><p className="text-xs text-stone-600">{provenanceLabel(distributor.distributorType)} · {distributor._count.acquisitions} acquisition(s) · {distributor._count.observations} observation(s)</p></div>{!distributor.active && <span className="rounded-full border px-2 py-1 text-xs">Archived</span>}</div>
              {distributor.outlets.length > 0 && <div className="mt-3 grid gap-2">{distributor.outlets.map((outlet) => <div key={outlet.id} className="rounded border border-stone-200 p-2 text-sm"><strong>{outlet.name}</strong><span className="text-stone-600"> · {[provenanceLabel(outlet.outletType), outlet.city, outlet.region].filter(Boolean).join(' · ')}</span>{canEdit && <details className="mt-1"><summary className="cursor-pointer text-xs font-semibold text-[#2f6b45]">Edit outlet</summary><DistributorOutletForm collectionSlug={collection.slug} distributorId={distributor.id} outlet={outlet} /><form action={toggleDistributorOutletArchive} className="mt-1"><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="id" value={outlet.id} /><button className="text-xs font-semibold text-[#2f6b45] underline">{outlet.active ? 'Archive outlet' : 'Restore outlet'}</button></form></details>}</div>)}</div>}
              {distributor.sellerStorefronts.length > 0 && <div className="mt-3 rounded border border-stone-200 bg-white/35 p-2"><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Known sellers using this platform</p><div className="mt-1 flex flex-wrap gap-2">{distributor.sellerStorefronts.map((storefront) => <span key={storefront.id} className="rounded-full border border-[#c7d8bd] bg-[#edf3e6] px-2 py-1 text-xs">{storefront.seller.name} · {storefront.handleOrName}</span>)}</div></div>}
              {canEdit && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-[#2f6b45]">Edit distributor and outlets</summary><DistributorForm collectionSlug={collection.slug} distributor={distributor} /><DistributorOutletForm collectionSlug={collection.slug} distributorId={distributor.id} /><form action={toggleDistributorArchive} className="mt-2"><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="id" value={distributor.id} /><Button variant="secondary">{distributor.active ? 'Archive' : 'Restore'}</Button></form></details>}
            </Card>
          ))}
          {!distributors.length && <Card><p className="text-sm text-stone-600">No distributors found.</p></Card>}
        </section>
      </div>

      {canManage && (activeSources.length > 1 || activeDistributors.length > 1 || activeSellers.length > 1) && <Card><h3 className="font-serif text-xl font-semibold">Merge duplicates</h3><p className="mt-1 text-sm text-stone-600">Review first; AxilDB never merges similar names automatically.</p><div className="mt-3 grid gap-4 lg:grid-cols-3">{activeSources.length > 1 && <MergeForm action={mergeSources} collectionSlug={collection.slug} label="sources" records={activeSources} />}{activeSellers.length > 1 && <MergeForm action={mergeSellers} collectionSlug={collection.slug} label="sellers" records={activeSellers} />}{activeDistributors.length > 1 && <MergeForm action={mergeDistributors} collectionSlug={collection.slug} label="distributors" records={activeDistributors} />}</div></Card>}

      <Card>
        <h3 className="font-serif text-xl font-semibold">Reconciliation Queue</h3>
        <p className="mt-1 text-sm text-stone-600">Ambiguous legacy text stays untouched until it is resolved or dismissed.</p>
        <div className="mt-3 grid gap-3">
          {reconciliation.map((item) => <form key={item.id} action={resolveProvenanceItem} className="grid gap-2 rounded-lg border border-stone-200 p-3 md:grid-cols-3"><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="id" value={item.id} /><div className="md:col-span-3"><p className="text-xs uppercase tracking-wide text-stone-500">{item.entityType} · {item.legacyField}</p><p className="font-semibold">{item.legacyValue}</p></div><Select label="Seller" name="sellerId"><option value="">No seller</option>{activeSellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}</Select><Select label="Seller storefront" name="sellerStorefrontId"><option value="">No storefront</option>{activeSellers.flatMap((seller) => seller.storefronts.filter((storefront) => storefront.active).map((storefront) => <option key={storefront.id} value={storefront.id}>{seller.name} · {storefront.handleOrName}</option>))}</Select><Select label="Distributor / platform" name="distributorId"><option value="">No distributor</option>{activeDistributors.map((distributor) => <option key={distributor.id} value={distributor.id}>{distributor.name}</option>)}</Select><Select label="Distributor outlet" name="distributorOutletId"><option value="">No outlet</option>{activeDistributors.flatMap((distributor) => distributor.outlets.filter((outlet) => outlet.active).map((outlet) => <option key={outlet.id} value={outlet.id}>{distributor.name} · {outlet.name}</option>))}</Select><Select label="Assign source" name="sourceId"><option value="">No source</option>{activeSources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</Select><Select label="Resolution" name="resolution" defaultValue="RESOLVED"><option value="RESOLVED">Resolve and preserve legacy text</option><option value="DISMISSED">Dismiss and preserve legacy text</option></Select>{canEdit && <Button className="w-fit md:col-span-3">Apply resolution</Button>}</form>)}
          {!reconciliation.length && <p className="text-sm text-stone-600">No ambiguous provenance needs reconciliation.</p>}
        </div>
      </Card>
    </div>
  )
}

function SourceForm({ collectionSlug, source }: { collectionSlug: string; source?: any }) {
  return <form action={saveSource} className="mt-3 grid gap-2 rounded-lg border border-stone-200 bg-white/35 p-3 sm:grid-cols-2"><input type="hidden" name="collectionSlug" value={collectionSlug} />{source && <input type="hidden" name="id" value={source.id} />}<Field label="Name" name="name" defaultValue={source?.name} required /><Select label="Kind" name="kind" defaultValue={source?.kind || 'ORGANIZATION'}>{PARTY_KINDS.map(option)}</Select><Select label="Source type" name="sourceType" defaultValue={source?.sourceType || 'UNKNOWN'}>{SOURCE_TYPES.map(option)}</Select><Field label="Website" name="websiteUrl" type="url" defaultValue={source?.websiteUrl} /><Field label="Locality" name="locality" defaultValue={source?.locality} /><Field label="Region" name="region" defaultValue={source?.region} /><Field label="Country" name="country" defaultValue={source?.country} /><TextArea label="Description" name="description" defaultValue={source?.description} /><TextArea label="Internal notes" name="notes" defaultValue={source?.notes} /><Button className="w-fit sm:col-span-2">{source ? 'Save source' : 'Create source'}</Button></form>
}

function SellerForm({ collectionSlug, seller }: { collectionSlug: string; seller?: any }) {
  return <form action={saveSeller} className="mt-3 grid gap-2 rounded-lg border border-stone-200 bg-white/35 p-3 sm:grid-cols-2"><input type="hidden" name="collectionSlug" value={collectionSlug} />{seller && <input type="hidden" name="id" value={seller.id} />}<Field label="Seller name" name="name" defaultValue={seller?.name} required /><Select label="Kind" name="kind" defaultValue={seller?.kind || 'ORGANIZATION'}>{PARTY_KINDS.map(option)}</Select><Select label="Private experience rating" name="rating" defaultValue={seller?.rating ? String(seller.rating) : ''}><option value="">Not rated</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} of 5</option>)}</Select><Field label="Website" name="websiteUrl" type="url" defaultValue={seller?.websiteUrl} /><Field label="Region" name="region" defaultValue={seller?.region} /><Field label="Country" name="country" defaultValue={seller?.country} /><TextArea label="Description" name="description" defaultValue={seller?.description} /><TextArea label="Private experience notes" name="experienceNotes" defaultValue={seller?.experienceNotes} /><Button className="w-fit sm:col-span-2">{seller ? 'Save seller' : 'Create seller'}</Button></form>
}

function SellerStorefrontForm({ collectionSlug, sellerId, distributors, storefront }: { collectionSlug: string; sellerId: string; distributors: Array<{ id: string; name: string }>; storefront?: any }) {
  return <form action={saveSellerStorefront} className="mt-3 grid gap-2 rounded-lg border border-stone-200 p-3 sm:grid-cols-2"><input type="hidden" name="collectionSlug" value={collectionSlug} /><input type="hidden" name="sellerId" value={sellerId} />{storefront && <input type="hidden" name="id" value={storefront.id} />}<Field label="Storefront handle or name" name="handleOrName" defaultValue={storefront?.handleOrName} required /><Select label="Storefront type" name="storefrontType" defaultValue={storefront?.storefrontType || 'OTHER'}>{SELLER_STOREFRONT_TYPES.map(option)}</Select><Select label="Platform / distributor" name="distributorId" defaultValue={storefront?.distributorId || ''}><option value="">Direct or unspecified</option>{distributors.map((distributor) => <option key={distributor.id} value={distributor.id}>{distributor.name}</option>)}</Select><Field label="Profile URL" name="profileUrl" type="url" defaultValue={storefront?.profileUrl} /><TextArea label="Internal notes" name="notes" defaultValue={storefront?.notes} wrapperClassName="sm:col-span-2" /><Button className="w-fit sm:col-span-2">{storefront ? 'Save storefront' : 'Add storefront'}</Button></form>
}

function StorefrontCard({ storefront, seller, collectionSlug, distributors, canEdit }: { storefront: any; seller: any; collectionSlug: string; distributors: Array<{ id: string; name: string }>; canEdit: boolean }) {
  return <div className="rounded border border-stone-200 p-2 text-sm"><strong>{storefront.handleOrName}</strong><span className="text-stone-600"> · {storefront.distributor?.name || provenanceLabel(storefront.storefrontType)}</span><p className="mt-1 text-xs text-stone-500">{storefront._count.acquisitions} acquisition(s) · {storefront._count.observations} observation(s){!storefront.active ? ' · archived' : ''}</p>{canEdit && <details className="mt-1"><summary className="cursor-pointer text-xs font-semibold text-[#2f6b45]">Edit storefront</summary><SellerStorefrontForm collectionSlug={collectionSlug} sellerId={seller.id} distributors={distributors} storefront={storefront} /><form action={toggleSellerStorefrontArchive} className="mt-1"><input type="hidden" name="collectionSlug" value={collectionSlug} /><input type="hidden" name="id" value={storefront.id} /><button className="text-xs font-semibold text-[#2f6b45] underline">{storefront.active ? 'Archive storefront' : 'Restore storefront'}</button></form></details>}</div>
}

function DistributorForm({ collectionSlug, distributor }: { collectionSlug: string; distributor?: any }) {
  return <form action={saveDistributor} className="mt-3 grid gap-2 rounded-lg border border-stone-200 bg-white/35 p-3 sm:grid-cols-2"><input type="hidden" name="collectionSlug" value={collectionSlug} />{distributor && <input type="hidden" name="id" value={distributor.id} />}<Field label="Name" name="name" defaultValue={distributor?.name} required /><Select label="Kind" name="kind" defaultValue={distributor?.kind || 'ORGANIZATION'}>{PARTY_KINDS.map(option)}</Select><Select label="Distributor type" name="distributorType" defaultValue={distributor?.distributorType || 'OTHER'}>{DISTRIBUTOR_TYPES.map(option)}</Select><Select label="Private channel rating" name="rating" defaultValue={distributor?.rating ? String(distributor.rating) : ''}><option value="">Not rated</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} of 5</option>)}</Select><Field label="Website" name="websiteUrl" type="url" defaultValue={distributor?.websiteUrl} /><TextArea label="Description" name="description" defaultValue={distributor?.description} /><TextArea label="Private channel notes" name="experienceNotes" defaultValue={distributor?.experienceNotes} /><Button className="w-fit sm:col-span-2">{distributor ? 'Save distributor' : 'Create distributor'}</Button></form>
}

function DistributorOutletForm({ collectionSlug, distributorId, outlet }: { collectionSlug: string; distributorId: string; outlet?: any }) {
  return <form action={saveDistributorOutlet} className="mt-3 grid gap-2 rounded-lg border border-stone-200 p-3 sm:grid-cols-2"><input type="hidden" name="collectionSlug" value={collectionSlug} /><input type="hidden" name="distributorId" value={distributorId} />{outlet && <input type="hidden" name="id" value={outlet.id} />}<Field label={outlet ? 'Outlet name' : 'New outlet name'} name="name" defaultValue={outlet?.name} required /><Select label="Outlet type" name="outletType" defaultValue={outlet?.outletType || 'OTHER'}>{DISTRIBUTOR_OUTLET_TYPES.map(option)}</Select><Field label="Address" name="addressLine1" defaultValue={outlet?.addressLine1} /><Field label="City" name="city" defaultValue={outlet?.city} /><Field label="Region" name="region" defaultValue={outlet?.region} /><Field label="Postal code" name="postalCode" defaultValue={outlet?.postalCode} /><Field label="Country" name="country" defaultValue={outlet?.country} /><Field label="URL" name="url" type="url" defaultValue={outlet?.url} /><TextArea label="Internal notes" name="notes" defaultValue={outlet?.notes} /><Button className="w-fit sm:col-span-2">{outlet ? 'Save outlet' : 'Add outlet'}</Button></form>
}

function MergeForm({ action, collectionSlug, label, records }: { action: (fd: FormData) => Promise<void>; collectionSlug: string; label: string; records: Array<{ id: string; name: string }> }) {
  return <form action={action} className="grid gap-2 rounded-lg border border-stone-200 p-3"><h4 className="font-semibold">Merge {label}</h4><input type="hidden" name="collectionSlug" value={collectionSlug} /><Select label="Canonical record" name="canonicalId" required><option value="">Choose canonical</option>{records.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</Select><Select label="Duplicate to merge" name="duplicateId" required><option value="">Choose duplicate</option>{records.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</Select><Button>Merge and reassign</Button></form>
}
