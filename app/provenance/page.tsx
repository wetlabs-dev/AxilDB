import { Button, Card, DangerButton, Field, Select, TextArea } from '@/components/ui'
import { getCurrentUser } from '@/lib/auth'
import { canEditInCollection, canManageCollection, requireCollectionViewer } from '@/lib/collections'
import { PARTY_KINDS, SOURCE_TYPES, provenanceLabel } from '@/lib/provenance'
import { prisma } from '@/lib/prisma'
import {
  convertLegacyOutletToSalesChannel,
  deleteUnusedProvenanceRecord,
  mergeSalesChannels,
  mergeSellers,
  mergeSources,
  saveSalesChannelType,
  saveSeller,
  saveSellerStorefront,
  saveSource,
  toggleSalesChannelTypeArchive,
  toggleSellerArchive,
  toggleSellerStorefrontArchive,
  toggleSourceArchive,
  updateProvenanceVisibility,
} from '@/app/provenance-actions'

const option = (name: string) => <option key={name} value={name}>{provenanceLabel(name)}</option>
const aliases = (value: unknown) => Array.isArray(value) ? value.map(String) : []
const searchable = (...values: unknown[]) => values.flatMap((item) => Array.isArray(item) ? item : [item]).filter(Boolean).join(' ').toLowerCase()

export default async function ProvenancePage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  const context = await requireCollectionViewer()
  const user = await getCurrentUser()
  const { collection } = context
  const canEdit = canEditInCollection(user, context)
  const canManage = canManageCollection(user, context)
  const params = await searchParams
  const q = params.q?.trim().toLowerCase() || ''
  const includeArchived = params.status === 'all'
  const [sourceRows, sellerRows, channelTypes, legacyOutlets] = await Promise.all([
    prisma.source.findMany({ where: { collectionId: collection.id, ...(!includeArchived ? { active: true } : {}) }, include: { _count: { select: { acquisitions: true } } }, orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
    prisma.seller.findMany({
      where: { collectionId: collection.id, ...(!includeArchived ? { active: true } : {}) },
      include: {
        storefronts: { include: { salesChannelType: true, distributor: true, _count: { select: { acquisitions: true, observations: true, acquisitionBatches: true, preferredBy: true } } }, orderBy: [{ active: 'desc' }, { handleOrName: 'asc' }] },
        _count: { select: { acquisitions: true, observations: true, acquisitionBatches: true, preferredBy: true, storefronts: true } },
      },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    }),
    prisma.salesChannelType.findMany({ where: { collectionId: collection.id, ...(!includeArchived ? { active: true } : {}) }, include: { _count: { select: { channels: true } } }, orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }] }),
    prisma.distributorOutlet.findMany({
      where: { collectionId: collection.id, active: true }, include: { distributor: true, _count: { select: { acquisitions: true, observations: true, acquisitionBatches: true } } }, orderBy: { name: 'asc' },
    }),
  ])
  const sources = sourceRows.filter((source) => !q || searchable(source.name, source.websiteUrl, source.locality, source.region, source.country, aliases(source.aliasesJson)).includes(q))
  const sellers = sellerRows.filter((seller) => !q || searchable(seller.name, seller.websiteUrl, seller.region, seller.country, aliases(seller.aliasesJson), seller.storefronts.map((channel) => `${channel.handleOrName} ${channel.profileUrl || ''} ${channel.salesChannelType?.name || ''}`)).includes(q))
  const activeSources = sourceRows.filter((item) => item.active)
  const activeSellers = sellerRows.filter((item) => item.active)
  const channels = sellerRows.flatMap((seller) => seller.storefronts.map((channel) => ({ ...channel, name: `${seller.name} · ${channel.handleOrName}` })))
  const activeChannels = channels.filter((item) => item.active)

  return <div className="space-y-6">
    <header>
      <h2 className="text-3xl font-bold">Provenance</h2>
      <p className="mt-1 max-w-4xl text-sm text-stone-600">Manage who a plant came from, how it was acquired, and the upstream chain that produced it.</p>
    </header>

    <Card><form className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end"><Field label="Search provenance" name="q" defaultValue={params.q} placeholder="Seller, channel, source, website, or alias" /><Select label="Records" name="status" defaultValue={params.status || 'active'}><option value="active">Active only</option><option value="all">Active + archived</option></Select><Button>Search</Button></form></Card>

    {canManage && <Card>
      <h3 className="font-serif text-xl font-semibold">Public visibility</h3>
      <p className="mt-1 text-sm text-stone-600">Control source, seller, and sales-channel visibility independently. Private ratings, notes, and addresses are never published.</p>
      <form action={updateProvenanceVisibility} className="mt-3 grid gap-2 sm:grid-cols-3">
        <input type="hidden" name="collectionSlug" value={collection.slug} />
        {collection.showDistributorIdentity && <input type="hidden" name="showDistributorIdentity" value="1" />}
        {collection.showDistributorOutlet && <input type="hidden" name="showDistributorOutlet" value="1" />}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showSourceProvenance" value="1" defaultChecked={collection.showSourceProvenance} /> Sources</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showSellerIdentity" value="1" defaultChecked={collection.showSellerIdentity} /> Sellers</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="showSellerStorefront" value="1" defaultChecked={collection.showSellerStorefront} /> Sales channels</label>
        <Button className="mt-2 w-fit sm:col-span-3">Save visibility</Button>
      </form>
    </Card>}

    <section className="space-y-3">
      <div><h3 className="font-serif text-2xl font-semibold">Sellers</h3><p className="text-sm text-stone-600">The person or organization from whom the collection directly received a plant.</p></div>
      {canEdit && <details className="rounded-lg border border-stone-200 p-3"><summary className="cursor-pointer font-semibold text-[#2f6b45]">Add seller</summary><SellerForm collectionSlug={collection.slug} /></details>}
      <div className="grid gap-3 lg:grid-cols-2">{sellers.map((seller) => <Card key={seller.id} className={!seller.active ? 'opacity-70' : ''}>
        <details open={params.q ? true : undefined}><summary className="cursor-pointer list-none"><div className="flex items-start justify-between gap-3"><div><h4 className="font-semibold">{seller.name}</h4><p className="text-xs text-stone-600">{provenanceLabel(seller.kind)} · {seller._count.storefronts} sales channel(s) · {seller._count.acquisitions} acquisition(s)</p></div>{!seller.active && <span className="rounded-full border px-2 py-1 text-xs">Archived</span>}</div></summary>
          {seller.websiteUrl && <a className="mt-2 block text-sm font-semibold text-[#2f6b45] underline" href={seller.websiteUrl} rel="noreferrer" target="_blank">{seller.websiteUrl}</a>}
          {seller.rating && <p className="mt-2 text-sm">Private experience rating: {seller.rating} of 5</p>}
          <div className="mt-3 grid gap-2">{seller.storefronts.map((channel) => <ChannelCard key={channel.id} channel={channel} sellerId={seller.id} collectionSlug={collection.slug} channelTypes={channelTypes} canEdit={canEdit} canManage={canManage} />)}</div>
          {canEdit && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-[#2f6b45]">Edit seller or add sales channel</summary><SellerForm collectionSlug={collection.slug} seller={seller} /><ChannelForm collectionSlug={collection.slug} sellerId={seller.id} channelTypes={channelTypes} /><form action={toggleSellerArchive} className="mt-2"><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="id" value={seller.id} /><Button>{seller.active ? 'Archive seller' : 'Restore seller'}</Button></form>{canManage && Object.values(seller._count).every((count) => count === 0) && <DeleteForm collectionSlug={collection.slug} id={seller.id} recordType="SELLER" />}</details>}
        </details>
      </Card>)}{!sellers.length && <Card><p className="text-sm text-stone-600">No sellers match this view.</p></Card>}</div>
    </section>

    <section className="space-y-3">
      <div><h3 className="font-serif text-2xl font-semibold">Sources</h3><p className="text-sm text-stone-600">Breeders, originators, growers, propagators, importers, and other upstream sources.</p></div>
      {canEdit && <details className="rounded-lg border border-stone-200 p-3"><summary className="cursor-pointer font-semibold text-[#2f6b45]">Add source</summary><SourceForm collectionSlug={collection.slug} /></details>}
      <div className="grid gap-3 lg:grid-cols-2">{sources.map((source) => <Card key={source.id} className={!source.active ? 'opacity-70' : ''}><h4 className="font-semibold">{source.name}</h4><p className="text-xs text-stone-600">{provenanceLabel(source.sourceType)} · {source._count.acquisitions} acquisition link(s){!source.active ? ' · archived' : ''}</p>{source.description && <p className="mt-2 text-sm">{source.description}</p>}{canEdit && <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-[#2f6b45]">Edit source</summary><SourceForm collectionSlug={collection.slug} source={source} /><form action={toggleSourceArchive} className="mt-2"><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="id" value={source.id} /><Button>{source.active ? 'Archive source' : 'Restore source'}</Button></form>{canManage && source._count.acquisitions === 0 && <DeleteForm collectionSlug={collection.slug} id={source.id} recordType="SOURCE" />}</details>}</Card>)}</div>
    </section>

    {canManage && <section className="space-y-3"><div><h3 className="font-serif text-2xl font-semibold">Sales Channel Types</h3><p className="text-sm text-stone-600">Reusable labels for websites, marketplaces, stores, nurseries, shows, and custom channels.</p></div><Card><div className="flex flex-wrap gap-2">{channelTypes.map((type) => <span key={type.id} className="rounded-full border border-[#c7d8bd] bg-[#edf3e6] px-3 py-1 text-sm">{type.name} · {type._count.channels}{!type.active ? ' · archived' : ''}</span>)}</div><form action={saveSalesChannelType} className="mt-4 flex flex-wrap items-end gap-2"><input type="hidden" name="collectionSlug" value={collection.slug} /><Field label="Custom channel type" name="name" required /><Button>Add type</Button></form>{channelTypes.filter((type) => !type.isBuiltIn).map((type) => <form key={type.id} action={toggleSalesChannelTypeArchive} className="mt-2 inline-block pr-2"><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="id" value={type.id} /><button className="text-xs font-semibold text-[#2f6b45] underline">{type.active ? `Archive ${type.name}` : `Restore ${type.name}`}</button></form>)}</Card></section>}

    {canManage && <Card><h3 className="font-serif text-xl font-semibold">Cleanup</h3><p className="mt-1 text-sm text-stone-600">Merge duplicates or convert older outlet records. The previews show affected records; legacy rows remain available for history.</p><div className="mt-4 grid gap-4 lg:grid-cols-3">{activeSources.length > 1 && <MergeForm action={mergeSources} collectionSlug={collection.slug} label="sources" records={activeSources} />}{activeSellers.length > 1 && <MergeForm action={mergeSellers} collectionSlug={collection.slug} label="sellers" records={activeSellers} />}{activeChannels.length > 1 && <MergeForm action={mergeSalesChannels} collectionSlug={collection.slug} label="sales channels" records={activeChannels} />}</div>{legacyOutlets.length > 0 && <div className="mt-5"><h4 className="font-semibold">Legacy outlet conversion</h4><div className="mt-2 grid gap-2">{legacyOutlets.map((outlet) => <form key={outlet.id} action={convertLegacyOutletToSalesChannel} className="grid gap-2 rounded-lg border border-stone-200 p-3 md:grid-cols-[1fr_1fr_9rem_auto] md:items-end"><input type="hidden" name="collectionSlug" value={collection.slug} /><input type="hidden" name="outletId" value={outlet.id} /><div><strong>{outlet.distributor.name} · {outlet.name}</strong><p className="text-xs text-stone-600">{outlet._count.acquisitions} acquisitions · {outlet._count.observations} observations · {outlet._count.acquisitionBatches} batches</p></div><Select label="Convert under seller" name="sellerId" required><option value="">Choose seller</option>{activeSellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}</Select><Field label="Confirmation" name="confirmation" placeholder="CONVERT" required /><Button>Convert</Button></form>)}</div></div>}</Card>}
  </div>
}

function SourceForm({ collectionSlug, source }: { collectionSlug: string; source?: any }) {
  return <form action={saveSource} className="mt-3 grid gap-2 rounded-lg border border-stone-200 bg-white/35 p-3 sm:grid-cols-2"><input type="hidden" name="collectionSlug" value={collectionSlug} />{source && <input type="hidden" name="id" value={source.id} />}<Field label="Name" name="name" defaultValue={source?.name} required /><Select label="Kind" name="kind" defaultValue={source?.kind || 'ORGANIZATION'}>{PARTY_KINDS.map(option)}</Select><Select label="Source type" name="sourceType" defaultValue={source?.sourceType || 'UNKNOWN'}>{SOURCE_TYPES.map(option)}</Select><Field label="Website" name="websiteUrl" type="url" defaultValue={source?.websiteUrl} /><Field label="Aliases" name="aliases" defaultValue={aliases(source?.aliasesJson).join(', ')} help="Comma-separated names used for search." /><Field label="Locality" name="locality" defaultValue={source?.locality} /><Field label="Region" name="region" defaultValue={source?.region} /><Field label="Country" name="country" defaultValue={source?.country} /><TextArea label="Description" name="description" defaultValue={source?.description} /><TextArea label="Internal notes" name="notes" defaultValue={source?.notes} /><Button className="w-fit sm:col-span-2">{source ? 'Save source' : 'Create source'}</Button></form>
}

function SellerForm({ collectionSlug, seller }: { collectionSlug: string; seller?: any }) {
  return <form action={saveSeller} className="mt-3 grid gap-2 rounded-lg border border-stone-200 bg-white/35 p-3 sm:grid-cols-2"><input type="hidden" name="collectionSlug" value={collectionSlug} />{seller && <input type="hidden" name="id" value={seller.id} />}<Field label="Seller name" name="name" defaultValue={seller?.name} required /><Select label="Kind" name="kind" defaultValue={seller?.kind || 'ORGANIZATION'}>{PARTY_KINDS.map(option)}</Select><Field label="Website" name="websiteUrl" type="url" defaultValue={seller?.websiteUrl} /><Field label="Aliases" name="aliases" defaultValue={aliases(seller?.aliasesJson).join(', ')} /><Field label="Region" name="region" defaultValue={seller?.region} /><Field label="Country" name="country" defaultValue={seller?.country} /><Select label="Private experience rating" name="rating" defaultValue={seller?.rating || ''}><option value="">Not rated</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating} value={rating}>{rating} of 5</option>)}</Select><TextArea label="Description" name="description" defaultValue={seller?.description} /><TextArea label="Private experience notes" name="experienceNotes" defaultValue={seller?.experienceNotes} /><Button className="w-fit sm:col-span-2">{seller ? 'Save seller' : 'Create seller'}</Button></form>
}

function ChannelForm({ collectionSlug, sellerId, channelTypes, channel }: { collectionSlug: string; sellerId: string; channelTypes: any[]; channel?: any }) {
  return <form action={saveSellerStorefront} className="mt-3 grid gap-2 rounded-lg border border-stone-200 p-3 sm:grid-cols-2"><input type="hidden" name="collectionSlug" value={collectionSlug} /><input type="hidden" name="sellerId" value={sellerId} />{channel && <input type="hidden" name="id" value={channel.id} />}<input type="hidden" name="storefrontType" value={channel?.storefrontType || 'OTHER'} /><input type="hidden" name="distributorId" value={channel?.distributorId || ''} /><Field label="Display name" name="handleOrName" defaultValue={channel?.handleOrName} required /><Select label="Channel type" name="salesChannelTypeId" defaultValue={channel?.salesChannelTypeId || ''} required><option value="">Choose type</option>{channelTypes.filter((type) => type.active).map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</Select><Field label="URL" name="profileUrl" type="url" defaultValue={channel?.profileUrl} /><Field label="Address" name="addressLine1" defaultValue={channel?.addressLine1} /><Field label="Address line 2" name="addressLine2" defaultValue={channel?.addressLine2} /><Field label="City" name="city" defaultValue={channel?.city} /><Field label="Region" name="region" defaultValue={channel?.region} /><Field label="Postal code" name="postalCode" defaultValue={channel?.postalCode} /><Field label="Country" name="country" defaultValue={channel?.country} /><Field label="Phone" name="phone" defaultValue={channel?.phone} /><TextArea label="Internal notes" name="notes" defaultValue={channel?.notes} wrapperClassName="sm:col-span-2" /><Button className="w-fit sm:col-span-2">{channel ? 'Save sales channel' : 'Add sales channel'}</Button></form>
}

function ChannelCard({ channel, sellerId, collectionSlug, channelTypes, canEdit, canManage }: any) {
  const count = channel._count.acquisitions + channel._count.observations + channel._count.acquisitionBatches + channel._count.preferredBy
  return <div className="rounded border border-stone-200 p-2 text-sm"><strong>{channel.handleOrName}</strong><span className="text-stone-600"> · {channel.salesChannelType?.name || 'Other'}</span><p className="text-xs text-stone-500">{channel._count.acquisitions} acquisitions · {channel._count.observations} observations{!channel.active ? ' · archived' : ''}</p>{canEdit && <details className="mt-1"><summary className="cursor-pointer text-xs font-semibold text-[#2f6b45]">Edit sales channel</summary><ChannelForm collectionSlug={collectionSlug} sellerId={sellerId} channelTypes={channelTypes} channel={channel} /><form action={toggleSellerStorefrontArchive} className="mt-2"><input type="hidden" name="collectionSlug" value={collectionSlug} /><input type="hidden" name="id" value={channel.id} /><button className="text-xs font-semibold text-[#2f6b45] underline">{channel.active ? 'Archive sales channel' : 'Restore sales channel'}</button></form>{canManage && count === 0 && <DeleteForm collectionSlug={collectionSlug} id={channel.id} recordType="SALES_CHANNEL" />}</details>}</div>
}

function DeleteForm({ collectionSlug, id, recordType }: { collectionSlug: string; id: string; recordType: string }) {
  return <form action={deleteUnusedProvenanceRecord} className="mt-3 flex flex-wrap items-end gap-2 rounded border border-red-200 p-2"><input type="hidden" name="collectionSlug" value={collectionSlug} /><input type="hidden" name="id" value={id} /><input type="hidden" name="recordType" value={recordType} /><Field label="Type DELETE" name="confirmation" required /><DangerButton>Permanently delete unused record</DangerButton></form>
}

function MergeForm({ action, collectionSlug, label, records }: { action: (fd: FormData) => Promise<void>; collectionSlug: string; label: string; records: Array<{ id: string; name: string }> }) {
  return <form action={action} className="grid gap-2 rounded-lg border border-stone-200 p-3"><h4 className="font-semibold">Merge {label}</h4><input type="hidden" name="collectionSlug" value={collectionSlug} /><Select label="Keep" name="canonicalId" required><option value="">Choose record</option>{records.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</Select><Select label="Merge into it" name="duplicateId" required><option value="">Choose duplicate</option>{records.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</Select><Button>Previewed above; merge references</Button></form>
}
