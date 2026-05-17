import { PlantImage } from '@/components/PlantImage'
import { Card } from '@/components/ui'
import { collectionPath, requireCollectionViewer } from '@/lib/collections'
import { prisma } from '@/lib/prisma'
import { cn, fmtDate, plantName } from '@/lib/utils'
import { Archive, Flower2, GitBranch, Leaf, Sparkles, Sprout } from 'lucide-react'
import Link from 'next/link'

type PhotoLookup = Record<string, string | undefined>
type ActivityKind = 'propagation' | 'bloom' | 'sport' | 'acquired' | 'archive'
type ActivityItem = {
  id: string
  kind: ActivityKind
  href: string
  date: Date
  title: string
  subtitle: string
  detail?: string | null
  image?: string
}

function coverFor(photos: PhotoLookup, id?: string | null) {
  return id ? photos[id] : undefined
}

const activityStyles: Record<ActivityKind, { label: string; className: string; imageClassName: string; icon: typeof Leaf }> = {
  propagation: {
    label: 'Propagation',
    icon: GitBranch,
    className: 'border-[#b7caa9] bg-[#f4f8ed]',
    imageClassName: 'bg-[#d6dfc9]/65 text-[#2f6b45]',
  },
  bloom: {
    label: 'Bloom',
    icon: Flower2,
    className: 'border-[#e8c4b7] bg-[#fff4ee]',
    imageClassName: 'bg-[#f3d5ca]/55 text-[#9a4f3b]',
  },
  sport: {
    label: 'Sport review',
    icon: Sparkles,
    className: 'border-[#d8c3e9] bg-[#fbf4ff]',
    imageClassName: 'bg-[#e9d8f3]/55 text-[#72508a]',
  },
  acquired: {
    label: 'New plant',
    icon: Leaf,
    className: 'border-[#c7d5b9] bg-[#f7f8ee]',
    imageClassName: 'bg-[#e2ead7]/65 text-[#2f6b45]',
  },
  archive: {
    label: 'Archived',
    icon: Archive,
    className: 'border-stone-300 bg-stone-100/70 opacity-80',
    imageClassName: 'bg-stone-200 text-stone-500 grayscale',
  },
}
const activityKinds = Object.keys(activityStyles) as ActivityKind[]

function activityHref(slug: string, activityTake: number, kind?: ActivityKind) {
  const params = new URLSearchParams()
  if (kind) params.set('type', kind)
  if (activityTake !== 12) params.set('activity', String(activityTake))
  const qs = params.toString()
  const path = qs ? `/?${qs}` : '/'
  return collectionPath(slug, path)
}

function ActivityCard({
  item,
}: {
  item: ActivityItem
}) {
  const style = activityStyles[item.kind]
  const Icon = style.icon

  return (
    <Link
      href={item.href}
      className={cn(
        'group grid overflow-hidden rounded-lg border shadow-[0_8px_24px_rgba(47,38,24,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(47,38,24,0.10)] sm:h-36 sm:grid-cols-[8.5rem_1fr]',
        style.className,
      )}
    >
      <div className="h-40 overflow-hidden sm:h-full">
        <PlantImage src={item.image} alt="" className={cn('transition duration-300 group-hover:scale-[1.03]', style.imageClassName)} />
      </div>
      <div className="min-h-0 min-w-0 overflow-hidden p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-current/20 bg-white/55 px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-stone-700">
            <Icon className="h-3.5 w-3.5" />
            {style.label}
          </span>
          <span className="text-xs font-medium text-stone-500">{fmtDate(item.date)}</span>
        </div>
        <h4 className="mt-2 truncate font-serif text-lg leading-tight">{item.title}</h4>
        <p className="mt-1 truncate text-sm text-stone-700">{item.subtitle}</p>
        {item.detail && <p className="mt-2 line-clamp-2 text-xs leading-5 text-stone-600">{item.detail}</p>}
      </div>
    </Link>
  )
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ activity?: string; type?: string }>
}) {
  const sp = await searchParams
  const { collection } = await requireCollectionViewer()
  const collectionWhere = { collectionId: collection.id }
  const activityTake = Math.min(Math.max(Number(sp.activity || 12) || 12, 12), 48)
  const activeKind = activityKinds.includes(sp.type as ActivityKind) ? (sp.type as ActivityKind) : undefined
  const queryTake = activeKind ? Math.max(activityTake * 4, 48) : activityTake
  const [active, recentProps, blooms, sports, acquired, archived] = await Promise.all([
    prisma.plantInstance.count({ where: { ...collectionWhere, status: 'ACTIVE' } }),
    prisma.propagationEvent.findMany({
      where: collectionWhere,
      take: activeKind && activeKind !== 'propagation' ? 0 : queryTake,
      orderBy: { date: 'desc' },
      include: {
        parents: { include: { parentPlantInstance: { include: { plantDefinition: true } } } },
        children: { include: { childPlantInstance: { include: { plantDefinition: true } } } },
      },
    }),
    prisma.bloomEvent.findMany({
      where: collectionWhere,
      take: activeKind && activeKind !== 'bloom' ? 0 : queryTake,
      orderBy: { bloomStartDate: 'desc' },
      include: { plantInstance: { include: { plantDefinition: true } } },
    }),
    prisma.plantInstance.findMany({
      where: { ...collectionWhere, OR: [{ isSportCandidate: true }, { sportStatus: { not: 'NONE' } }] },
      take: activeKind && activeKind !== 'sport' ? 0 : queryTake,
      include: { plantDefinition: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.plantInstance.findMany({
      where: { ...collectionWhere, instanceType: 'MOTHER' },
      take: activeKind && activeKind !== 'acquired' ? 0 : queryTake,
      orderBy: [{ acquisitionDate: 'desc' }, { createdAt: 'desc' }],
      include: { plantDefinition: true },
    }),
    prisma.plantInstance.findMany({
      where: { ...collectionWhere, status: 'ARCHIVED' },
      take: activeKind && activeKind !== 'archive' ? 0 : queryTake,
      orderBy: { archiveDate: 'desc' },
      include: { plantDefinition: true },
    }),
  ])

  const instanceIds = Array.from(new Set([
    ...recentProps.flatMap((event) => [
      ...event.children.map((child) => child.childPlantInstanceId),
      ...event.parents.map((parent) => parent.parentPlantInstanceId),
    ]),
    ...blooms.map((bloom) => bloom.plantInstanceId),
    ...sports.map((sport) => sport.id),
    ...acquired.map((item) => item.id),
    ...archived.map((item) => item.id),
  ]))
  const bloomIds = blooms.map((bloom) => bloom.id)

  const [coverPhotos, bloomPhotos] = await Promise.all([
    prisma.photo.findMany({
      where: { ...collectionWhere, entityType: 'PLANT_INSTANCE', entityId: { in: instanceIds } },
      orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.photo.findMany({
      where: { ...collectionWhere, entityType: 'BLOOM_EVENT', entityId: { in: bloomIds } },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  const coverPhotosByInstance = coverPhotos.reduce<PhotoLookup>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo.path
    return acc
  }, {})
  const bloomPhotosByEvent = bloomPhotos.reduce<PhotoLookup>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo.path
    return acc
  }, {})

  const activity: ActivityItem[] = [
    ...recentProps.map((event) => {
      const firstChild = event.children[0]?.childPlantInstance
      const firstParent = event.parents[0]?.parentPlantInstance
      const children = event.children.map((child) => child.childPlantInstance.plantId)
      const parents = event.parents.map((parent) => parent.parentPlantInstance.plantId)
      return {
        id: event.id,
        kind: 'propagation' as const,
        href: firstChild ? collectionPath(collection.slug, `/instances/${firstChild.id}`) : collectionPath(collection.slug, '/propagations'),
        date: event.date,
        title: firstChild?.plantId || event.method,
        subtitle: `${event.method.replaceAll('_', ' ')} · ${event.successStatus.toLowerCase()}`,
        detail: `Children: ${children.join(', ') || '—'}${parents.length ? ` · Parents: ${parents.join(', ')}` : ''}`,
        image: coverFor(coverPhotosByInstance, firstChild?.id) || coverFor(coverPhotosByInstance, firstParent?.id),
      }
    }),
    ...blooms.map((bloom) => ({
      id: bloom.id,
      kind: 'bloom' as const,
      href: collectionPath(collection.slug, `/instances/${bloom.plantInstanceId}`),
      date: bloom.bloomStartDate,
      title: bloom.plantInstance.plantId,
      subtitle: plantName(bloom.plantInstance.plantDefinition),
      detail: [bloom.firstBloom ? 'First bloom' : null, bloom.flowerCount ? `${bloom.flowerCount} flower${bloom.flowerCount === 1 ? '' : 's'}` : null, bloom.notes].filter(Boolean).join(' · '),
      image: coverFor(bloomPhotosByEvent, bloom.id) || coverFor(coverPhotosByInstance, bloom.plantInstanceId),
    })),
    ...sports.map((sport) => ({
      id: sport.id,
      kind: 'sport' as const,
      href: collectionPath(collection.slug, `/instances/${sport.id}`),
      date: sport.updatedAt,
      title: sport.plantId,
      subtitle: `${sport.sportStatus.replaceAll('_', ' ').toLowerCase()} · ${plantName(sport.plantDefinition)}`,
      detail: sport.sportDescription,
      image: coverFor(coverPhotosByInstance, sport.id),
    })),
    ...acquired.map((item) => ({
      id: item.id,
      kind: 'acquired' as const,
      href: collectionPath(collection.slug, `/instances/${item.id}`),
      date: item.acquisitionDate || item.createdAt,
      title: item.plantId,
      subtitle: plantName(item.plantDefinition),
      detail: [item.source, item.distributor, item.location].filter(Boolean).join(' · '),
      image: coverFor(coverPhotosByInstance, item.id),
    })),
    ...archived.map((item) => ({
      id: item.id,
      kind: 'archive' as const,
      href: collectionPath(collection.slug, `/instances/${item.id}`),
      date: item.archiveDate || item.updatedAt,
      title: item.plantId,
      subtitle: item.archiveReason || plantName(item.plantDefinition),
      detail: item.archiveNotes,
      image: coverFor(coverPhotosByInstance, item.id),
    })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .filter((item) => !activeKind || item.kind === activeKind)
    .slice(0, activityTake)

  const stats = [
    ['Active plants', active, Leaf, collectionPath(collection.slug, '/instances')],
    ['Recent propagations', recentProps.length, GitBranch, collectionPath(collection.slug, '/propagations')],
    ['Recent blooms', blooms.length, Flower2, collectionPath(collection.slug, '/blooms')],
    ['Sport candidates', sports.length, Sprout, collectionPath(collection.slug, '/sports')],
  ] as const

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Dashboard</h2>
        <p className="mt-1 text-sm text-stone-600">Welcome back. Here&apos;s what&apos;s growing on.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(([label, value, Icon, href]) => (
          <Link key={label} href={href} className="group block">
            <Card className="transition group-hover:-translate-y-0.5 group-hover:shadow-[0_14px_36px_rgba(47,38,24,0.10)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-stone-600">{label}</div>
                <div className="mt-2 font-serif text-4xl font-semibold">{value}</div>
              </div>
              <div className="rounded-md bg-[#d6dfc9]/70 p-2 text-[#2f6b45]">
                <Icon className="h-6 w-6" />
              </div>
            </div>
            </Card>
          </Link>
        ))}
      </div>

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-bold">Recent activity</h3>
            <p className="mt-1 text-sm text-stone-600">The latest propagations, blooms, sport notes, acquisitions, and archive actions in one stream.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {activeKind && (
              <Link
                href={activityHref(collection.slug, activityTake)}
                className="rounded-full border border-stone-300 bg-white/70 px-2 py-1 font-medium text-stone-700 transition hover:bg-white"
              >
                All activity
              </Link>
            )}
            {Object.entries(activityStyles).map(([kind, style]) => (
              <Link
                key={kind}
                href={activityHref(collection.slug, activityTake, activeKind === kind ? undefined : (kind as ActivityKind))}
                aria-pressed={activeKind === kind}
                className={cn(
                  'rounded-full border px-2 py-1 font-medium transition hover:-translate-y-0.5 hover:shadow-sm',
                  style.className,
                  activeKind === kind ? 'ring-2 ring-[#2f6b45]/35' : 'opacity-80 hover:opacity-100',
                )}
              >
                {style.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
          {activity.map((item) => (
            <ActivityCard key={`${item.kind}-${item.id}`} item={item} />
          ))}
          {activity.length === 0 && <p className="text-sm text-stone-600">No recent activity yet.</p>}
        </div>
        {activity.length >= activityTake && activityTake < 48 && (
          <div className="mt-5 flex justify-center">
            <Link className="rounded-md border border-stone-300 bg-white/60 px-4 py-2 text-sm font-medium text-stone-800 transition hover:bg-white" href={activityHref(collection.slug, activityTake + 12, activeKind)}>
              Load 12 more
            </Link>
          </div>
        )}
      </Card>
    </div>
  )
}
