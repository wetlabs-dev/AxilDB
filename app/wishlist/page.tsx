import Link from 'next/link'
import { PlantImage } from '@/components/PlantImage'
import { collectionPath, getCollectionContext, canCreateInCollection } from '@/lib/collections'
import { formatDate } from '@/lib/time'
import { plantName } from '@/lib/utils'
import {
  canBrowseWishlist,
  isPublicWishlistVisitor,
  loadWishlistEntries,
  normalizeWishlistPublicSettings,
  wishlistEnvironmentSummary,
  wishlistPriceRange,
} from '@/lib/wishlist'
import { prisma } from '@/lib/prisma'
import { WishlistSelectionControls } from '@/components/WishlistSelectionControls'

const statusLabels: Record<string, string> = {
  RESEARCHING: 'Researching', WISHLIST: 'Wishlist', ACTIVELY_SEEKING: 'Actively seeking',
  ON_HOLD: 'On hold', FULFILLED: 'Fulfilled', NO_LONGER_INTERESTED: 'No longer interested',
}

function money(value: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value)
}

function priorityLabel(value?: number | null) {
  if (!value) return 'Not prioritized'
  return `${value} of 5 priority`
}

function compactFacts(values: Array<string | null | false | undefined>) {
  return values.filter((value): value is string => Boolean(value))
}

export default async function WishlistPage({ searchParams }: {
  searchParams: Promise<{ q?: string; status?: string; priority?: string; genus?: string; owned?: string; sort?: string; compact?: string; catSafety?: string; difficulty?: string; size?: string; locationType?: string; recent?: string }>
}) {
  const context = await getCollectionContext()
  const { collection } = context
  const publicVisitor = isPublicWishlistVisitor({ userRole: context.user?.role, membershipStatus: context.membership?.status })
  const allowed = canBrowseWishlist({
    acquisitionVisibility: collection.acquisitionVisibility,
    userRole: context.user?.role,
    membershipStatus: context.membership?.status,
  })
  if (!allowed) {
    return (
      <main className="ax-public-light min-h-screen bg-[#f8f3e6] px-4 py-12 text-stone-900">
        <section className="mx-auto max-w-2xl rounded-lg border border-stone-200 bg-white/80 p-6">
          <h1 className="font-serif text-3xl font-semibold">Wishlist unavailable</h1>
          <p className="mt-2 text-stone-600">This collection has not made its acquisition wishlist visible to you.</p>
          {!context.user && <Link href={`/login?next=${encodeURIComponent(collectionPath(collection.slug, '/wishlist'))}`} className="mt-4 inline-block font-semibold text-[#2f6b45] underline">Sign in</Link>}
        </section>
      </main>
    )
  }

  const settings = normalizeWishlistPublicSettings(collection.wishlistPublicSettingsJson)
  const sp = await searchParams
  const allEntries = await loadWishlistEntries(prisma, collection.id, { includeFulfilled: publicVisitor ? settings.showFulfilled : true, publicOnly: publicVisitor })
  const query = String(sp.q || '').trim().toLowerCase()
  const priority = Number(sp.priority || 0)
  const filtered = allEntries.filter((entry) => {
    const haystack = [plantName(entry), entry.provisionalTaxon, ...entry.aliases.map((alias) => alias.name), entry.desiredSpecimenSize].filter(Boolean).join(' ').toLowerCase()
    if (query && !haystack.includes(query)) return false
    if (sp.status && entry.acquisitionStatus !== sp.status) return false
    if (priority && entry.acquisitionPriority !== priority) return false
    if (sp.genus && entry.genus.toLowerCase() !== sp.genus.toLowerCase()) return false
    if (sp.catSafety && entry.husbandryGuide?.toxicityPets !== sp.catSafety) return false
    if (sp.difficulty && entry.husbandryGuide?.propagationDifficulty !== sp.difficulty) return false
    if (sp.size && entry.desiredSpecimenSize !== sp.size) return false
    if (sp.locationType && entry.desiredLocation?.locationType.name !== sp.locationType) return false
    if (sp.recent === '1' && entry.createdAt < new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)) return false
    if (sp.owned === 'yes' && entry.instances.length === 0) return false
    if (sp.owned === 'no' && entry.instances.length > 0) return false
    return true
  })
  const entries = [...filtered].sort((left, right) => {
    if (sp.sort === 'name') return plantName(left).localeCompare(plantName(right))
    if (sp.sort === 'newest') return right.createdAt.getTime() - left.createdAt.getTime()
    if (sp.sort === 'observed') return (right.plantObservations[0]?.observedAt.getTime() || 0) - (left.plantObservations[0]?.observedAt.getTime() || 0)
    if (sp.sort === 'price') return (wishlistPriceRange(left.plantObservations)?.low ?? Infinity) - (wishlistPriceRange(right.plantObservations)?.low ?? Infinity)
    if (sp.sort === 'status') return String(left.acquisitionStatus).localeCompare(String(right.acquisitionStatus))
    return Number(right.acquisitionPriority || 0) - Number(left.acquisitionPriority || 0)
  })
  const genera = Array.from(new Set(allEntries.map((entry) => entry.genus))).sort()
  const catSafetyOptions = Array.from(new Set(allEntries.map((entry) => entry.husbandryGuide?.toxicityPets).filter(Boolean) as string[])).sort()
  const difficultyOptions = Array.from(new Set(allEntries.map((entry) => entry.husbandryGuide?.propagationDifficulty).filter(Boolean) as string[])).sort()
  const sizeOptions = Array.from(new Set(allEntries.map((entry) => entry.desiredSpecimenSize).filter(Boolean) as string[])).sort()
  const locationTypeOptions = Array.from(new Set(allEntries.map((entry) => entry.desiredLocation?.locationType.name).filter(Boolean) as string[])).sort()
  const canAcquire = !publicVisitor && canCreateInCollection(context.user, context)
  const compact = sp.compact === '1'
  const statusCounts = Object.entries(statusLabels).map(([status, label]) => [status, label, allEntries.filter((entry) => entry.acquisitionStatus === status).length] as const).filter(([, , count]) => count > 0)

  const content = (
      <div className="mx-auto grid max-w-6xl gap-5">
        <header className="rounded-lg border border-stone-200 bg-white/80 p-5 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2f6b45]">{collection.name}</p>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="font-serif text-4xl font-semibold">Plant Wishlist</h1>
              {collection.wishlistIntro && <p className="mt-2 max-w-3xl text-stone-700">{collection.wishlistIntro}</p>}
              <p className="mt-2 text-sm text-stone-500">{allEntries.length} active acquisition target{allEntries.length === 1 ? '' : 's'}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Link className="rounded-md border border-stone-300 bg-white px-3 py-2 font-semibold" href={`${collectionPath(collection.slug, '/wishlist')}?compact=${compact ? '0' : '1'}`}>{compact ? 'Card view' : 'Shopping view'}</Link>
              <a className="rounded-md border border-stone-300 bg-white px-3 py-2 font-semibold" href={`/api/exports/wishlist?collection=${encodeURIComponent(collection.slug)}&format=csv${publicVisitor ? '&public=1' : ''}`}>CSV</a>
              <a className="rounded-md border border-stone-300 bg-white px-3 py-2 font-semibold" href={`/api/exports/wishlist?collection=${encodeURIComponent(collection.slug)}&format=pdf${publicVisitor ? '&public=1' : ''}`}>PDF</a>
            </div>
          </div>
        </header>

        <div className="flex flex-wrap gap-2" aria-label="Wishlist status summary">
          {statusCounts.map(([status, label, count]) => <Link key={status} href={`${collectionPath(collection.slug, '/wishlist')}?status=${status}`} className="rounded-full border border-[#b7caa9] bg-[#edf3e6] px-3 py-1 text-xs font-semibold text-[#255537]">{label} · {count}</Link>)}
        </div>

        <form className="grid gap-2 rounded-lg border border-stone-200 bg-white/75 p-4 sm:grid-cols-2 lg:grid-cols-6">
          <input className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm lg:col-span-2" name="q" defaultValue={sp.q} placeholder="Search names, aliases, size" />
          <select className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" name="status" defaultValue={sp.status || ''}><option value="">All statuses</option>{Object.entries(statusLabels).filter(([value]) => value !== 'NO_LONGER_INTERESTED').map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" name="genus" defaultValue={sp.genus || ''}><option value="">All genera</option>{genera.map((genus) => <option key={genus}>{genus}</option>)}</select>
          {(!publicVisitor || settings.showPriority) && <select className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" name="priority" defaultValue={sp.priority || ''}><option value="">All priorities</option>{[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>Priority {value}</option>)}</select>}
          <select className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" name="owned" defaultValue={sp.owned || ''}><option value="">Owned or unowned</option><option value="yes">Already owned</option><option value="no">Not owned</option></select>
          {(!publicVisitor || settings.showCatSafety) && catSafetyOptions.length > 0 && <select className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" name="catSafety" defaultValue={sp.catSafety || ''}><option value="">All cat-safety guidance</option>{catSafetyOptions.map((value) => <option key={value}>{value}</option>)}</select>}
          {(!publicVisitor || settings.showDifficulty) && difficultyOptions.length > 0 && <select className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" name="difficulty" defaultValue={sp.difficulty || ''}><option value="">All difficulty levels</option>{difficultyOptions.map((value) => <option key={value}>{value}</option>)}</select>}
          {(!publicVisitor || settings.showDesiredSize) && sizeOptions.length > 0 && <select className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" name="size" defaultValue={sp.size || ''}><option value="">All desired sizes</option>{sizeOptions.map((value) => <option key={value}>{value}</option>)}</select>}
          {(!publicVisitor || settings.showPlannedLocationCategory) && locationTypeOptions.length > 0 && <select className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" name="locationType" defaultValue={sp.locationType || ''}><option value="">All planned settings</option>{locationTypeOptions.map((value) => <option key={value}>{value}</option>)}</select>}
          <label className="flex items-center gap-2 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm"><input type="checkbox" name="recent" value="1" defaultChecked={sp.recent === '1'} /> Added in last 90 days</label>
          <select className="rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" name="sort" defaultValue={sp.sort || 'priority'}><option value="priority">Highest priority</option><option value="newest">Newest added</option><option value="name">Botanical name</option><option value="observed">Recently observed</option>{(!publicVisitor || settings.showObservedPriceRange) && <option value="price">Lowest observed price</option>}<option value="status">Status</option></select>
          <button className="rounded-md bg-[#2f6b45] px-4 py-2 text-sm font-semibold text-white sm:w-fit">Apply filters</button>
        </form>

        <form action={collectionPath(collection.slug, '/acquisitions/bulk')} method="get">
          {canAcquire && <WishlistSelectionControls />}
          <div className={compact ? 'grid gap-2' : 'grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3'}>
            {entries.map((entry) => {
              const latest = entry.plantObservations[0]
              const range = wishlistPriceRange(entry.plantObservations)
              const environment = wishlistEnvironmentSummary(entry.husbandryGuide)
              const observedPrice = range
                ? `Observed ${money(range.low, range.currency)}${range.high !== range.low ? `-${money(range.high, range.currency)}` : ''}`
                : null
              const primaryFacts = compactFacts([
                (!publicVisitor || settings.showPriority) && priorityLabel(entry.acquisitionPriority),
                (!publicVisitor || settings.showDesiredSize) && entry.desiredSpecimenSize ? `Size: ${entry.desiredSpecimenSize}` : null,
                (!publicVisitor || settings.showPlannedLocationCategory) && entry.desiredLocation?.locationType ? `Setting: ${entry.desiredLocation.locationType.name}` : null,
                !publicVisitor && entry.idealPurchasePrice ? `Target ${money(Number(entry.idealPurchasePrice), 'USD')}` : null,
                (!publicVisitor || settings.showObservedPriceRange) && observedPrice,
                (!publicVisitor || settings.showOwnedCount) ? (entry.instances.length > 0 ? `${entry.instances.length} owned` : 'Not owned') : null,
              ]).slice(0, 6)
              const careFacts = compactFacts([
                (!publicVisitor || settings.showCatSafety) && entry.husbandryGuide?.toxicityPets ? `Pet safety: ${entry.husbandryGuide.toxicityPets}` : null,
                (!publicVisitor || settings.showDifficulty) && entry.husbandryGuide?.propagationDifficulty ? `Difficulty: ${entry.husbandryGuide.propagationDifficulty}` : null,
                !publicVisitor && entry.maximumPurchasePrice ? `Ceiling ${money(Number(entry.maximumPurchasePrice), 'USD')}` : null,
              ]).slice(0, 3)
              return (
                <article key={entry.id} className={`relative min-w-0 overflow-hidden rounded-lg border border-stone-200 bg-white/80 shadow-sm ${compact ? 'grid grid-cols-[6rem_minmax(0,1fr)]' : ''}`}>
                  <div className={compact ? 'h-full min-h-32 overflow-hidden bg-[#edf3e6]' : 'aspect-[16/11] max-h-64 overflow-hidden bg-[#edf3e6]'}>
                    <PlantImage src={entry.coverPhoto} alt={plantName(entry)} className="h-full w-full object-cover" />
                  </div>
                  <div className="min-w-0 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#2f6b45]">{statusLabels[entry.acquisitionStatus || '']}</p>
                        <h2 className="mt-1 font-serif text-xl font-semibold leading-tight">{plantName(entry)}</h2>
                        {entry.aliases.length > 0 && <p className="mt-1 line-clamp-1 text-xs text-stone-500">{entry.aliases.slice(0, 3).map((alias) => alias.name).join(', ')}</p>}
                      </div>
                      {canAcquire && <input aria-label={`Select ${plantName(entry)}`} type="checkbox" name="definition" value={entry.id} className="h-5 w-5 shrink-0" />}
                    </div>
                    {primaryFacts.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {primaryFacts.map((fact) => (
                          <span key={fact} className="rounded-full border border-[#d7c792] bg-[#fff8d8] px-2 py-1 text-xs font-semibold text-[#6f541f]">{fact}</span>
                        ))}
                      </div>
                    )}
                    {careFacts.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {careFacts.map((fact) => (
                          <span key={fact} className="rounded-full border border-stone-200 bg-stone-50 px-2 py-1 text-xs text-stone-600">{fact}</span>
                        ))}
                      </div>
                    )}
                    {(!publicVisitor || settings.showPublicResearchSummary) && entry.acquisitionResearchSummary && <p className="mt-3 line-clamp-3 text-sm leading-5 text-stone-700">{entry.acquisitionResearchSummary}</p>}
                    {environment && <p className="mt-2 line-clamp-2 text-xs leading-5 text-stone-500">Environment: {environment}</p>}
                    {(!publicVisitor || settings.showLatestPublicObservation) && latest && <p className="mt-2 text-xs text-stone-500">Last observed {formatDate(latest.observedAt)} · {latest.availability.toLowerCase().replaceAll('_', ' ')}</p>}
                  </div>
                </article>
              )
            })}
            {entries.length === 0 && <p className="rounded-lg border border-stone-200 bg-white/70 p-5 text-sm text-stone-600">No wishlist entries match these filters.</p>}
          </div>
        </form>
      </div>
  )

  return publicVisitor ? (
    <main className="ax-public-light min-h-screen bg-[#f8f3e6] px-4 py-8 text-stone-900">
      {content}
    </main>
  ) : content
}
