import Link from 'next/link'
import { CollectionExhibitAccessMode } from '@prisma/client'
import { subscribeToCollectionExhibit } from '@/app/exhibit-actions'
import { PlantImage } from '@/components/PlantImage'
import { cn, plantName, taxonomyLabel } from '@/lib/utils'
import { formatDate } from '@/lib/time'
import { distributorDisplay, sourceChainDisplay } from '@/lib/provenance'
import { wishlistEnvironmentSummary, wishlistPriceRange } from '@/lib/wishlist'

type DisplayExhibit = Awaited<ReturnType<typeof import('@/lib/exhibits').loadExhibitForDisplay>>

function simpleMarkdown(text?: string | null) {
  if (!text) return null
  return text.split('\n').map((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return <div key={index} className="h-2" />
    const heading = trimmed.match(/^#{1,4}\s+(.+)$/)
    if (heading) return <h3 key={index} className="mt-5 font-serif text-2xl font-semibold first:mt-0">{heading[1]}</h3>
    const bullet = trimmed.match(/^[-*]\s+(.+)$/)
    if (bullet) return <p key={index} className="pl-4 text-sm leading-6">- {bullet[1]}</p>
    return <p key={index} className="text-sm leading-6">{trimmed}</p>
  })
}

function textList(items: Array<string | null | undefined>) {
  return items.map((item) => item?.trim()).filter(Boolean) as string[]
}

function formatStatus(status: string) {
  return status.toLowerCase().replace(/_/g, ' ')
}

function PhotoStrip({ photos, label }: { photos: any[]; label: string }) {
  if (!photos.length) return null
  return (
    <div className="grid gap-2">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{label}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {photos.map((photo) => (
          <figure key={photo.id} className="overflow-hidden rounded-md border border-stone-200 bg-white/70">
            <div className="aspect-[4/3] bg-[#e8efdf]">
              <PlantImage src={photo} alt={photo.caption || label} className="h-full w-full object-cover" />
            </div>
            {photo.caption && <figcaption className="px-2 py-1 text-xs text-stone-600">{photo.caption}</figcaption>}
          </figure>
        ))}
      </div>
    </div>
  )
}

function DetailList({ items }: { items: Array<[string, string | null | undefined]> }) {
  const rows = items.filter(([, value]) => value)
  if (!rows.length) return null
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-md border border-stone-200 bg-white/45 px-3 py-2">
          <dt className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-stone-500">{label}</dt>
          <dd className="mt-1 text-stone-800">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function PlantCard({ entry, settings, collectionSlug, visibility }: { entry: any; settings: any; collectionSlug?: string; visibility: any }) {
  const plant = entry.plantInstance
  const acquisition = plant.acquisitionRecordLinks?.[0]?.acquisitionRecord
  const openConditions = plant.conditions.filter((condition: any) => condition.status !== 'RESOLVED')
  const activeQuarantine = plant.quarantines.find((quarantine: any) => quarantine.status === 'ACTIVE')
  const timelineHighlights = [
    ...plant.blooms.slice(0, 2).map((bloom: any) => ({ at: bloom.bloomStartDate, text: `Bloom noted ${formatDate(bloom.bloomStartDate)}` })),
    ...plant.careEvents.slice(0, 2).map((event: any) => ({ at: event.performedAt, text: `${event.eventType.toLowerCase()} care ${formatDate(event.performedAt)}` })),
    ...entry.photos.slice(0, 2).map((photo: any) => ({ at: photo.createdAt, text: `Photo added ${formatDate(photo.createdAt)}` })),
    ...openConditions.slice(0, 2).map((condition: any) => ({ at: condition.observedAt, text: `${condition.category} observed ${formatDate(condition.observedAt)}` })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 4)
  const lineageItems = [
    ...plant.parentLinks.map((link: any) => `Parent in propagation ${formatDate(link.propagationEvent.date)} (${link.parentRole.toLowerCase()})`),
    ...plant.childLinks.map((link: any) => `Produced ${link.childPlantInstance.plantId} on ${formatDate(link.propagationEvent.date)}`),
  ]
  const compactLineage = [
    ...plant.parentLinks.map((link: any) => `${link.parentPlantInstance.plantId} -> ${plant.plantId}`),
    ...plant.childLinks.map((link: any) => `${plant.plantId} -> ${link.childPlantInstance.plantId}`),
  ].slice(0, 6)

  return (
    <article className="grid gap-4 rounded-lg border border-stone-200 bg-[#fffaf0]/72 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-xs font-semibold uppercase tracking-[0.08em] text-[#2f6b45]">{plant.plantId}</p>
          <h4 className="mt-1 font-serif text-2xl font-semibold">{plantName(plant.plantDefinition)}</h4>
          {entry.customCaption && <p className="mt-1 text-sm text-stone-700">{entry.customCaption}</p>}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {entry.featured && <span className="rounded-full border border-[#2f6b45]/25 bg-[#e8efdf] px-2 py-1 font-semibold text-[#2f6b45]">Featured</span>}
          {settings.archivedStatus && plant.status === 'ARCHIVED' && <span className="rounded-full border border-stone-300 px-2 py-1 font-semibold text-stone-600">Archived</span>}
          {settings.quarantineStatus && activeQuarantine && <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 font-semibold text-amber-800">Quarantine</span>}
        </div>
      </div>

      <PhotoStrip photos={entry.photos} label="Specimen photos" />

      <DetailList
        items={[
          ['Location', settings.location ? entry.locationPath || 'No location set' : null],
          ['Acquired', settings.acquisitionSource ? formatDate(plant.acquisitionDate) : null],
          ['Source', settings.acquisitionSource && visibility.showSourceProvenance ? sourceChainDisplay(acquisition?.sources || [], plant.source) : null],
          ['Distributor', settings.acquisitionSource && visibility.showDistributorIdentity ? distributorDisplay(acquisition?.distributor, visibility.showDistributorLocation ? acquisition?.distributorLocation : null, plant.distributor) : null],
          ['Status', settings.archivedStatus ? formatStatus(plant.status) : null],
          ['Sunshine', settings.sunshine ? String(entry.sunshineCount || 0) : null],
        ]}
      />

      {settings.bloomHistory && plant.blooms.length > 0 && (
        <section className="grid gap-1 text-sm">
          <h5 className="font-semibold">Bloom history</h5>
          {plant.blooms.slice(0, 4).map((bloom: any) => (
            <p key={bloom.id} className="text-stone-700">
              {formatDate(bloom.bloomStartDate)}
              {bloom.flowerCount ? ` - ${bloom.flowerCount} flowers` : ''}
              {bloom.firstBloom ? ' - first bloom' : ''}
            </p>
          ))}
        </section>
      )}

      {settings.conditions && openConditions.length > 0 && (
        <section className="grid gap-1 text-sm">
          <h5 className="font-semibold">Open conditions</h5>
          {openConditions.slice(0, 4).map((condition: any) => (
            <p key={condition.id} className="text-stone-700">{condition.category} - {condition.severity.toLowerCase()} - {formatDate(condition.observedAt)}</p>
          ))}
        </section>
      )}

      {settings.careNotes && plant.careEvents.length > 0 && (
        <section className="grid gap-1 text-sm">
          <h5 className="font-semibold">Recent care</h5>
          {plant.careEvents.slice(0, 4).map((event: any) => (
            <p key={event.id} className="text-stone-700">{event.eventType.toLowerCase()} - {formatDate(event.performedAt)}{event.notes ? ` - ${event.notes}` : ''}</p>
          ))}
        </section>
      )}

      {settings.notes && entry.notes.length > 0 && (
        <section className="grid gap-1 text-sm">
          <h5 className="font-semibold">Notes</h5>
          {entry.notes.slice(0, 3).map((note: any) => (
            <p key={note.id} className="text-stone-700">{note.note}</p>
          ))}
        </section>
      )}

      {(settings.lineage || settings.miniLineage || settings.propagationHistory) && lineageItems.length > 0 && (
        <section className="grid gap-1 text-sm">
          <h5 className="font-semibold">Lineage</h5>
          {settings.miniLineage && compactLineage.length > 0 && (
            <div className="flex flex-wrap gap-2 py-1">
              {compactLineage.map((item) => (
                <span key={item} className="rounded-full border border-stone-200 bg-white/70 px-2 py-1 font-mono text-[0.7rem] text-stone-700">{item}</span>
              ))}
            </div>
          )}
          {lineageItems.slice(0, 5).map((item) => <p key={item} className="text-stone-700">{item}</p>)}
        </section>
      )}

      {settings.timeline && timelineHighlights.length > 0 && (
        <section className="grid gap-1 text-sm">
          <h5 className="font-semibold">Timeline highlights</h5>
          {timelineHighlights.map((item) => <p key={`${item.at}-${item.text}`} className="text-stone-700">{item.text}</p>)}
        </section>
      )}

      {collectionSlug && (
        <Link className="text-sm font-semibold text-[#2f6b45] underline-offset-4 hover:underline" href={`/c/${collectionSlug}/instances/${plant.id}`}>
          Open internal plant record
        </Link>
      )}
    </article>
  )
}

function DefinitionGroup({ group, settings, collectionSlug, visibility }: { group: any; settings: any; collectionSlug?: string; visibility: any }) {
  const definition = group.definition
  const aliases = textList(group.definition.aliases.map((alias: any) => alias.name))
  const guide = definition.husbandryGuide
  return (
    <section className="grid gap-5 rounded-xl border border-stone-200 bg-white/68 p-5 shadow-sm">
      <div className="grid gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">{group.entries.length} selected specimens</p>
          <h2 className="font-serif text-3xl font-semibold">{plantName(definition)}</h2>
          {definition.description && <p className="mt-2 text-sm leading-6 text-stone-700">{definition.description}</p>}
        </div>
        {settings.typeImages && <PhotoStrip photos={group.typePhotos} label="Definition images" />}
        {settings.taxonomyDetails && (
          <DetailList
            items={[
              ['Authority', definition.authority],
              ['Registration', definition.cultivarRegistrationNumber],
              ['Governing body', definition.governingBody?.name],
              ['Confidence', taxonomyLabel(definition.confidence)],
              ['Validation', definition.isValidated ? `Validated ${formatDate(definition.validatedAt)}` : 'Not validated'],
            ]}
          />
        )}
        {settings.aliases && aliases.length > 0 && <p className="text-sm text-stone-700"><span className="font-semibold">Also known as:</span> {aliases.join(', ')}</p>}
        {settings.husbandry && guide && (
          <DetailList
            items={[
              ['Care', guide.summaryCare],
              ['Water', guide.summaryWater || guide.wateringCadence],
              ['Light', guide.summaryLight || guide.lightIntensity],
              ['Medium', guide.mediumPreferred],
              ['Bloom', guide.bloomSeason],
              ['Propagation', guide.propagationMethods],
            ]}
          />
        )}
        {settings.referenceLinks && (
          <div className="flex flex-wrap gap-2 text-sm">
            {[
              ['Wikipedia', definition.wikipediaUrl],
              ['iNaturalist', definition.inaturalistUrl],
              ['POWO', definition.powoUrl],
              ['GBIF', definition.gbifUrl],
            ].filter(([, href]) => href).map(([label, href]) => (
              <a key={label} className="rounded-full border border-stone-200 bg-[#fffaf0] px-3 py-1 font-semibold text-[#2f6b45]" href={href as string}>
                {label}
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="grid gap-4">
        {group.entries.map((entry: any) => (
          <PlantCard key={entry.id} entry={entry} settings={settings} collectionSlug={collectionSlug} visibility={visibility} />
        ))}
      </div>
    </section>
  )
}

function WishlistSection({ items, heading }: { items: any[]; heading: string }) {
  if (!items.length) return null
  return (
    <section className="grid gap-4 rounded-xl border border-[#c7d8bd] bg-[#f7f8ee] p-5 shadow-sm">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#2f6b45]">Future collection</p><h2 className="font-serif text-3xl font-semibold">{heading}</h2><p className="mt-1 text-sm text-stone-600">Plants the collection is researching or hopes to acquire.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        {items.map((entry) => {
          const definition = entry.plantDefinition
          const range = wishlistPriceRange(definition.plantObservations)
          return (
            <article key={entry.id} className="overflow-hidden rounded-lg border border-stone-200 bg-white/75">
              {entry.typePhotos[0] && <div className="aspect-[4/3]"><PlantImage src={entry.typePhotos[0]} alt={plantName(definition)} className="h-full w-full object-cover" /></div>}
              <div className="p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs"><span className="font-bold uppercase tracking-wide text-[#2f6b45]">Planned acquisition</span>{entry.featured && <span className="rounded-full border border-[#b7caa9] bg-[#edf3e6] px-2 py-0.5 font-semibold">Featured</span>}</div>
                <h3 className="mt-1 font-serif text-2xl font-semibold">{plantName(definition)}</h3>
                {entry.customCaption && <p className="mt-2 text-sm text-stone-700">{entry.customCaption}</p>}
                <DetailList items={[
                  ['Status', formatStatus(definition.acquisitionStatus || 'wishlist')],
                  ['Desired size', definition.desiredSpecimenSize],
                  ['Environment', wishlistEnvironmentSummary(definition.husbandryGuide)],
                  ['Owned specimens', String(definition.instances.length)],
                  ['Public observations', range ? `${range.low}-${range.high} ${range.currency}` : null],
                ]} />
                {definition.acquisitionResearchSummary && <p className="mt-3 text-sm leading-6 text-stone-700">{definition.acquisitionResearchSummary}</p>}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

export function CollectionExhibitView({
  data,
  token,
  staffCollectionSlug,
  print = false,
  subscribeStatus,
}: {
  data: NonNullable<DisplayExhibit>
  token?: string | null
  staffCollectionSlug?: string
  print?: boolean
  subscribeStatus?: string | null
}) {
  const { exhibit, settings, groups, wishlistItems } = data
  const tokenValue = token || (exhibit.accessMode === CollectionExhibitAccessMode.UNLISTED ? exhibit.token : '')
  const subscribeMessage = subscribeStatus === 'sent'
    ? 'Check your email to confirm this exhibit subscription.'
    : subscribeStatus === 'invalid'
      ? 'Please enter a valid email address.'
      : subscribeStatus === 'failed'
        ? 'We could not send the confirmation email. Please try again later.'
        : null
  return (
    <main className={cn('ax-public-light min-h-screen bg-[#f8f3e6] px-4 py-8 text-stone-900 print:bg-white print:px-0', print && 'bg-white')}>
      <article className="mx-auto grid max-w-6xl gap-8">
        <header className="grid gap-4 rounded-xl border border-stone-200 bg-white/82 p-6 shadow-sm print:border-0 print:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#2f6b45]">{exhibit.collection.name}</p>
              <h1 className="mt-2 font-serif text-4xl font-semibold">{exhibit.title}</h1>
              {exhibit.description && <p className="mt-2 max-w-3xl text-stone-700">{exhibit.description}</p>}
            </div>
            <div className="flex flex-wrap gap-2 print:hidden">
              <Link className="rounded-md border border-stone-300 bg-white/70 px-3 py-2 text-sm font-semibold text-stone-800" href={`/exhibit/${exhibit.slug}/print${tokenValue ? `?token=${encodeURIComponent(tokenValue)}` : ''}`}>
                Print / save PDF
              </Link>
              <Link className="rounded-md border border-stone-300 bg-white/70 px-3 py-2 text-sm font-semibold text-stone-800" href={`/api/exhibits/${exhibit.slug}/pdf${tokenValue ? `?token=${encodeURIComponent(tokenValue)}` : ''}`}>
                Download PDF
              </Link>
              {staffCollectionSlug && (
                <Link className="rounded-md bg-[#2f6b45] px-3 py-2 text-sm font-semibold text-white" href={`/c/${staffCollectionSlug}/exhibits/${exhibit.id}`}>
                  Edit exhibit
                </Link>
              )}
            </div>
          </div>
          {exhibit.coverPhoto && (
            <div className="max-h-[420px] overflow-hidden rounded-lg border border-stone-200 bg-[#e8efdf]">
              <PlantImage src={exhibit.coverPhoto} alt="" className="h-full max-h-[420px] w-full object-cover" />
            </div>
          )}
          {exhibit.introMarkdown && <div className="grid gap-2 text-stone-800">{simpleMarkdown(exhibit.introMarkdown)}</div>}
          <p className="text-xs text-stone-500">
            {groups.reduce((total, group) => total + group.entries.length, 0)} specimens across {groups.length} definitions
            {exhibit.expiresAt ? ` - available through ${formatDate(exhibit.expiresAt)}` : ''}
          </p>
        </header>

        {!print && (
          <section className="rounded-xl border border-stone-200 bg-white/72 p-5 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="font-serif text-2xl font-semibold">Get exhibit updates</h2>
                <p className="text-sm text-stone-600">Subscribe by email with double opt-in. No account is required.</p>
                {subscribeMessage && (
                  <p className={cn('mt-2 rounded-md border px-3 py-2 text-sm', subscribeStatus === 'failed' || subscribeStatus === 'invalid' ? 'border-red-200 bg-red-50 text-red-800' : 'border-[#2f6b45]/25 bg-[#e8efdf] text-[#2f6b45]')}>
                    {subscribeMessage}
                  </p>
                )}
              </div>
              <form action={subscribeToCollectionExhibit} className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[28rem] sm:flex-row">
                <input type="hidden" name="slug" value={exhibit.slug} />
                <input type="hidden" name="token" value={tokenValue || ''} />
                <input className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm" name="email" type="email" placeholder="email@example.com" required />
                <button className="inline-flex min-w-[6rem] shrink-0 items-center justify-center whitespace-nowrap rounded-md bg-[#2f6b45] px-4 py-2 text-sm font-semibold text-white">Subscribe</button>
              </form>
            </div>
          </section>
        )}

        <div className="grid gap-6">
          {groups.map((group) => <DefinitionGroup key={group.definition.id} group={group} settings={settings} collectionSlug={staffCollectionSlug} visibility={exhibit.collection} />)}
          <WishlistSection items={wishlistItems} heading={settings.wishlistHeading} />
        </div>
      </article>
    </main>
  )
}
