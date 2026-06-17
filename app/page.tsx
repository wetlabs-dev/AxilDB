import { PlantImage, type PlantImageFrame } from '@/components/PlantImage'
import { regenerateCollectionBriefing } from '@/app/collection-actions'
import { startWorkflowRun } from '@/app/workflow-actions'
import { ConfirmDeleteButton } from '@/components/ConfirmDeleteButton'
import { PlantIdPreviewLink } from '@/components/PlantIdPreviewLink'
import { Button, Card, Select } from '@/components/ui'
import { getOrCreateTodaysCollectionBriefing } from '@/lib/briefing'
import { careQueueSummary, getCareQueue } from '@/lib/care-queue'
import { canCreateInCollection, canEditInCollection, collectionPath, requireCollectionViewer } from '@/lib/collections'
import { recentCollectionUpdates } from '@/lib/collection-updates'
import { prisma } from '@/lib/prisma'
import { isServerAdminRole } from '@/lib/roles'
import { resolveSunshineTarget, sunshineCountLabel, sunshineCounts, sunshineKey } from '@/lib/sunshine'
import { ensureStarterWorkflowTemplates, workflowProgress, workflowScopeLabel } from '@/lib/workflows'
import { cn, fmtDate, plantName } from '@/lib/utils'
import { Archive, ClipboardCheck, Flower2, GitBranch, Leaf, Sparkles, Sprout, Sun } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

type PhotoLookup = Record<string, PlantImageFrame | undefined>
type BriefingPlantLink = { plantId: string; href: string; aliases: string[] }
type ActivityKind = 'propagation' | 'bloom' | 'sport' | 'acquired' | 'archive' | 'sunshine'
type ActivityItem = {
  id: string
  kind: ActivityKind
  href: string
  date: Date
  title: string
  subtitle: string
  detail?: string | null
  image?: PlantImageFrame
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
  sunshine: {
    label: 'Sunshine',
    icon: Sun,
    className: 'activity-sunshine-card border-[#ead486] bg-[#fff9df]',
    imageClassName: 'activity-sunshine-image bg-[#f4e7aa]/55 text-[#7a5a00]',
  },
}
const activityKinds = Object.keys(activityStyles) as ActivityKind[]

function activityHref(slug: string, activityTake: number, includedKinds?: ActivityKind[]) {
  const params = new URLSearchParams()
  const normalizedKinds = includedKinds
    ? activityKinds.filter((kind) => includedKinds.includes(kind))
    : activityKinds
  if (normalizedKinds.length !== activityKinds.length) {
    params.set('type', normalizedKinds.length ? normalizedKinds.join(',') : 'none')
  }
  if (activityTake !== 12) params.set('activity', String(activityTake))
  const qs = params.toString()
  const path = qs ? `/?${qs}` : '/'
  return collectionPath(slug, path)
}

function parseActivityKinds(value?: string) {
  if (!value) return activityKinds
  if (value === 'none') return []
  const selected = value
    .split(',')
    .filter((kind): kind is ActivityKind => activityKinds.includes(kind as ActivityKind))
  return Array.from(new Set(selected))
}

function toggleActivityKind(includedKinds: ActivityKind[], kind: ActivityKind) {
  return includedKinds.includes(kind)
    ? includedKinds.filter((item) => item !== kind)
    : activityKinds.filter((item) => includedKinds.includes(item) || item === kind)
}

function ActivityCard({
  item,
  timezone,
}: {
  item: ActivityItem
  timezone?: string | null
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
          <span className="text-xs font-medium text-stone-500">{fmtDate(item.date, timezone)}</span>
        </div>
        <h4 className="mt-2 truncate font-serif text-lg leading-tight">{item.title}</h4>
        <p className="mt-1 truncate text-sm text-stone-700">{item.subtitle}</p>
        {item.detail && <p className="mt-2 line-clamp-2 text-xs leading-5 text-stone-600">{item.detail}</p>}
      </div>
    </Link>
  )
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sequencePrefix(plantId: string) {
  return plantId.slice(0, plantId.lastIndexOf('-'))
}

function renderBriefingPlantLink(collectionSlug: string, link: BriefingPlantLink, children: ReactNode, key: string) {
  return (
    <PlantIdPreviewLink key={key} collectionSlug={collectionSlug} plantId={link.plantId} href={link.href}>
      {children}
    </PlantIdPreviewLink>
  )
}

function renderLinkedText(text: string, plantLinks: BriefingPlantLink[], keyPrefix: string, collectionSlug: string): ReactNode[] {
  if (!plantLinks.length || !text) return [text]

  const tokens = plantLinks.flatMap((link) => [link.plantId, ...link.aliases].map((value) => ({ value, link })))
    .filter((item) => item.value)
    .sort((a, b) => b.value.length - a.value.length)
  if (!tokens.length) return [text]

  const plantById = new Map(plantLinks.map((link) => [link.plantId, link]))
  const pattern = new RegExp(`(${tokens.map((item) => escapeRegExp(item.value)).join('|')})`, 'g')
  const nodes: ReactNode[] = []
  let lastIndex = 0

  for (const match of text.matchAll(pattern)) {
    const value = match[0]
    const index = match.index ?? 0
    if (index > lastIndex) nodes.push(text.slice(lastIndex, index))

    const link = tokens.find((item) => item.value === value)?.link
    nodes.push(
      link ? renderBriefingPlantLink(collectionSlug, link, link.plantId, `${keyPrefix}-plant-${index}`) : value,
    )
    lastIndex = index + value.length

    if (link) {
      const prefix = sequencePrefix(link.plantId)
      let shorthand = text.slice(lastIndex).match(/^(\s*\/\s*)(-\d{3})/)
      while (shorthand) {
        const candidate = plantById.get(`${prefix}${shorthand[2]}`)
        if (!candidate) break
        nodes.push(shorthand[1])
        nodes.push(renderBriefingPlantLink(collectionSlug, candidate, shorthand[2], `${keyPrefix}-plant-shorthand-${lastIndex}`))
        lastIndex += shorthand[0].length
        shorthand = text.slice(lastIndex).match(/^(\s*\/\s*)(-\d{3})/)
      }
    }
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes
}

function renderInlineBriefingMarkdown(text: string, plantLinks: BriefingPlantLink[], keyPrefix: string, collectionSlug: string): ReactNode[] {
  const tokenPattern = /(\*\*[^*]+?\*\*|`[^`]+?`|\*[^*\n]+?\*)/g
  const nodes: ReactNode[] = []
  let lastIndex = 0

  for (const match of text.matchAll(tokenPattern)) {
    const token = match[0]
    const index = match.index ?? 0
    if (index > lastIndex) nodes.push(...renderLinkedText(text.slice(lastIndex, index), plantLinks, `${keyPrefix}-text-${index}`, collectionSlug))

    if (token.startsWith('**')) {
      nodes.push(
        <strong key={`${keyPrefix}-bold-${index}`} className="font-semibold text-[var(--ax-heading)]">
          {renderLinkedText(token.slice(2, -2), plantLinks, `${keyPrefix}-bold-${index}`, collectionSlug)}
        </strong>,
      )
    } else if (token.startsWith('`')) {
      const codeText = token.slice(1, -1)
      const linkedCode = renderLinkedText(codeText, plantLinks, `${keyPrefix}-code-${index}`, collectionSlug)
      if (linkedCode.some((node) => typeof node !== 'string')) {
        nodes.push(...linkedCode)
        lastIndex = index + token.length
        continue
      }
      nodes.push(
        <span
          key={`${keyPrefix}-code-${index}`}
          className="rounded border border-[color:var(--ax-border)] bg-[var(--ax-primary-wash)] px-1 py-0.5 font-mono text-[0.92em] text-[var(--ax-text)]"
        >
          {linkedCode}
        </span>,
      )
    } else {
      nodes.push(
        <em key={`${keyPrefix}-italic-${index}`} className="italic text-[var(--ax-muted-strong)]">
          {renderLinkedText(token.slice(1, -1), plantLinks, `${keyPrefix}-italic-${index}`, collectionSlug)}
        </em>,
      )
    }

    lastIndex = index + token.length
  }

  if (lastIndex < text.length) nodes.push(...renderLinkedText(text.slice(lastIndex), plantLinks, `${keyPrefix}-text-end`, collectionSlug))
  return nodes
}

function renderBriefingMarkdown(markdown: string, links: BriefingPlantLink[], collectionSlug: string) {
  const plantLinks = links
    .filter((link) => [link.plantId, ...link.aliases].some((value) => markdown.includes(value)))
    .sort((a, b) => Math.max(b.plantId.length, ...b.aliases.map((value) => value.length)) - Math.max(a.plantId.length, ...a.aliases.map((value) => value.length)))

  return markdown.split('\n').map((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) return <div key={index} className="h-2" />

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      return (
        <h4
          key={index}
          className={cn(
            'font-semibold text-[var(--ax-heading)]',
            level <= 2 ? 'mt-5 font-serif text-xl leading-tight first:mt-0' : 'mt-4 text-base',
          )}
        >
          {renderInlineBriefingMarkdown(heading[2], plantLinks, `briefing-${index}-heading`, collectionSlug)}
        </h4>
      )
    }

    const bullet = trimmed.match(/^[-*]\s+(.+)$/)
    if (bullet) {
      const indent = Math.min(Math.floor(line.search(/\S/) / 2), 3)
      return (
        <div key={index} className="flex gap-2 text-sm leading-6 text-[var(--ax-text)]" style={{ paddingLeft: `${indent * 1.25}rem` }}>
          <span className="mt-[0.42rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--ax-primary)]" aria-hidden="true" />
          <span>{renderInlineBriefingMarkdown(bullet[1], plantLinks, `briefing-${index}-bullet`, collectionSlug)}</span>
        </div>
      )
    }

    return (
      <p key={index} className="text-sm leading-6 text-[var(--ax-text)]">
        {renderInlineBriefingMarkdown(trimmed, plantLinks, `briefing-${index}-paragraph`, collectionSlug)}
      </p>
    )
  })
}

export default async function Dashboard({
  searchParams,
}: {
  searchParams: Promise<{ activity?: string; type?: string }>
}) {
  const sp = await searchParams
  const context = await requireCollectionViewer()
  const { collection } = context
  const collectionWhere = { collectionId: collection.id }
  const activityTake = Math.min(Math.max(Number(sp.activity || 12) || 12, 12), 48)
  const includedActivityKinds = parseActivityKinds(sp.type)
  const includesActivityKind = (kind: ActivityKind) => includedActivityKinds.includes(kind)
  const queryTake = includedActivityKinds.length === activityKinds.length ? activityTake : Math.max(activityTake * 4, 48)
  const preferences = context.user
    ? await prisma.emailPreference.findUnique({ where: { userId: context.user.id } })
    : null
  const canGenerateBriefing = Boolean(
    collection.aiFeaturesEnabled
      && collection.aiBriefingEnabled
      && context.user
      && context.membership?.status === 'ACTIVE',
  )
  const canRegenerateBriefing = Boolean(
    collection.aiFeaturesEnabled
      && collection.aiBriefingEnabled
      && context.user
      && isServerAdminRole(context.user.role),
  )
  const canViewCollectionUpdates = canEditInCollection(context.user, context)
  const canStartWorkflows = canCreateInCollection(context.user, context)
  await ensureStarterWorkflowTemplates(prisma, collection.id)
  const briefing = canGenerateBriefing
    ? await getOrCreateTodaysCollectionBriefing(prisma, {
        collectionId: collection.id,
        collectionSlug: collection.slug,
        userId: context.user!.id,
        timezone: preferences?.timezone,
      })
    : null
  const [
    active,
    propagationEvents,
    acquiredPropagations,
    bloomCount,
    sportCandidates,
    recentProps,
    blooms,
    sports,
    acquired,
    archived,
    careItems,
    recentSunshine,
    workflowTemplates,
    activeWorkflowRuns,
  ] = await Promise.all([
    prisma.plantInstance.count({ where: { ...collectionWhere, status: 'ACTIVE' } }),
    prisma.propagationEvent.count({ where: collectionWhere }),
    prisma.plantInstance.count({ where: { ...collectionWhere, status: { not: 'ARCHIVED' }, instanceType: 'ACQUIRED_PROPAGATION' } }),
    prisma.bloomEvent.count({ where: collectionWhere }),
    prisma.plantInstance.count({ where: { ...collectionWhere, OR: [{ isSportCandidate: true }, { sportStatus: { not: 'NONE' } }] } }),
    prisma.propagationEvent.findMany({
      where: collectionWhere,
      take: includesActivityKind('propagation') ? queryTake : 0,
      orderBy: { date: 'desc' },
      include: {
        parents: { include: { parentPlantInstance: { include: { plantDefinition: true } } } },
        children: { include: { childPlantInstance: { include: { plantDefinition: true } } } },
      },
    }),
    prisma.bloomEvent.findMany({
      where: collectionWhere,
      take: includesActivityKind('bloom') ? queryTake : 0,
      orderBy: { bloomStartDate: 'desc' },
      include: { plantInstance: { include: { plantDefinition: true } } },
    }),
    prisma.plantInstance.findMany({
      where: { ...collectionWhere, OR: [{ isSportCandidate: true }, { sportStatus: { not: 'NONE' } }] },
      take: includesActivityKind('sport') ? queryTake : 0,
      include: { plantDefinition: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.plantInstance.findMany({
      where: { ...collectionWhere, instanceType: { in: ['MOTHER', 'ACQUIRED_PROPAGATION'] } },
      take: includesActivityKind('acquired') || includesActivityKind('propagation') ? queryTake : 0,
      orderBy: [{ acquisitionDate: 'desc' }, { createdAt: 'desc' }],
      include: { plantDefinition: true },
    }),
    prisma.plantInstance.findMany({
      where: { ...collectionWhere, status: 'ARCHIVED' },
      take: includesActivityKind('archive') ? queryTake : 0,
      orderBy: { archiveDate: 'desc' },
      include: { plantDefinition: true },
    }),
    getCareQueue(prisma, { collectionId: collection.id, collectionSlug: collection.slug, userId: context.user?.id, timezone: preferences?.timezone }),
    prisma.sunshine.findMany({
      where: { ...collectionWhere, targetType: 'PLANT_INSTANCE' },
      orderBy: { createdAt: 'desc' },
      take: includesActivityKind('sunshine') ? queryTake : 0,
      select: { id: true, targetType: true, targetId: true, createdAt: true },
    }),
    prisma.workflowTemplate.findMany({
      where: { collectionId: collection.id, isArchived: false },
      orderBy: [{ isBuiltIn: 'desc' }, { name: 'asc' }],
      take: 8,
    }),
    prisma.workflowRun.findMany({
      where: { collectionId: collection.id, status: 'ACTIVE' },
      include: { steps: true, location: true, assignedTo: { select: { email: true } }, plants: true },
      orderBy: { startedAt: 'desc' },
      take: 4,
    }),
  ])
  const care = careQueueSummary(careItems, new Date(), preferences?.timezone)

  const instanceIds = Array.from(new Set([
    ...recentProps.flatMap((event) => [
      ...event.children.map((child) => child.childPlantInstanceId),
      ...event.parents.map((parent) => parent.parentPlantInstanceId),
    ]),
    ...blooms.map((bloom) => bloom.plantInstanceId),
    ...sports.map((sport) => sport.id),
    ...acquired.map((item) => item.id),
    ...archived.map((item) => item.id),
    ...recentSunshine.map((item) => item.targetId),
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
  const briefingPlantLinks: BriefingPlantLink[] = briefing
    ? (await prisma.plantInstance.findMany({
        where: collectionWhere,
        select: { id: true, plantId: true },
        orderBy: { plantId: 'asc' },
      })).map((instance) => ({
        plantId: instance.plantId,
        aliases: [instance.id],
        href: collectionPath(collection.slug, `/instances/${instance.id}`),
      }))
    : []

  const coverPhotosByInstance = coverPhotos.reduce<PhotoLookup>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo
    return acc
  }, {})
  const bloomPhotosByEvent = bloomPhotos.reduce<PhotoLookup>((acc, photo) => {
    if (!acc[photo.entityId]) acc[photo.entityId] = photo
    return acc
  }, {})
  const recentSunshineTargets = recentSunshine
    .map((item) => ({
      targetType: 'PLANT_INSTANCE' as const,
      targetId: item.targetId,
    }))
  const recentSunshineCounts = await sunshineCounts(
    prisma,
    collection.id,
    recentSunshineTargets,
  )
  const recentSunshineItems = (await Promise.all(recentSunshine.map(async (item) => {
    const target = await resolveSunshineTarget(prisma, collection.id, collection.slug, item.targetType, item.targetId)
    return target ? { ...item, target, count: recentSunshineCounts.get(sunshineKey(item.targetType, item.targetId)) || 0 } : null
  }))).filter((item): item is NonNullable<typeof item> => item !== null)

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
    ...acquired.map((item) => {
      const isAcquiredPropagation = item.instanceType === 'ACQUIRED_PROPAGATION'
      return {
        id: item.id,
        kind: isAcquiredPropagation ? 'propagation' as const : 'acquired' as const,
        href: collectionPath(collection.slug, `/instances/${item.id}`),
        date: item.acquisitionDate || item.createdAt,
        title: item.plantId,
        subtitle: isAcquiredPropagation ? `ACQUIRED PROPAGATION · ${plantName(item.plantDefinition)}` : plantName(item.plantDefinition),
        detail: [item.source, item.distributor, item.location].filter(Boolean).join(' · '),
        image: coverFor(coverPhotosByInstance, item.id),
      }
    }),
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
    ...recentSunshineItems.map((item) => ({
      id: item.id,
      kind: 'sunshine' as const,
      href: item.target.href,
      date: item.createdAt,
      title: item.target.label,
      subtitle: 'Received sunshine',
      detail: `${sunshineCountLabel(item.count)} · Givers stay private`,
      image: coverFor(coverPhotosByInstance, item.targetId),
    })),
  ]
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .filter((item) => includesActivityKind(item.kind))
    .slice(0, activityTake)
  const stats = [
    ['Care today', care.today, ClipboardCheck, collectionPath(collection.slug, '/care')],
    ['Active plants', active, Leaf, collectionPath(collection.slug, '/instances')],
    ['Propagations', propagationEvents + acquiredPropagations, GitBranch, activityHref(collection.slug, activityTake, ['propagation'])],
    ['Recent blooms', bloomCount, Flower2, collectionPath(collection.slug, '/blooms')],
    ['Sport candidates', sportCandidates, Sprout, collectionPath(collection.slug, '/sports')],
  ] as const
  const collectionUpdates = canViewCollectionUpdates
    ? await recentCollectionUpdates(prisma, collection.id, collection.slug, 5)
    : []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold">Dashboard</h2>
        <p className="mt-1 text-sm text-stone-600">Welcome back. Here&apos;s what&apos;s growing on.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
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

      {briefing && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-serif text-2xl font-semibold">{briefing.title}</h3>
              <p className="mt-1 text-sm text-stone-600">
                {briefing.status === 'READY' ? 'AI generated' : briefing.status === 'FAILED' ? 'Fallback after AI failure' : 'Fallback summary'} ·{' '}
                {fmtDate(briefing.generatedAt, briefing.timezone)} · {briefing.localDate} ({briefing.timezone})
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-stone-200 bg-white/60 px-3 py-1 text-xs font-semibold text-stone-700">
                Refresh available tomorrow
              </span>
              {canRegenerateBriefing && (
                <form action={regenerateCollectionBriefing}>
                  <input type="hidden" name="collectionSlug" value={collection.slug} />
                  <ConfirmDeleteButton
                    title="Regenerate today's briefing?"
                    message="This replaces today's cached briefing for the collection. It may use one AI briefing request if AI briefing generation is enabled and available."
                    confirmLabel="Regenerate"
                    pendingLabel="Regenerating..."
                    pendingMessage="Regenerating today's Collection Briefing. The AI request can take a few moments."
                    className="px-3 py-1.5 text-xs"
                  >
                    Regenerate today
                  </ConfirmDeleteButton>
                </form>
              )}
            </div>
          </div>
          <details open className="group mt-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] px-4 py-3 text-sm font-semibold text-[var(--ax-heading)] transition hover:bg-[var(--ax-primary-wash)] [&::-webkit-details-marker]:hidden">
              <span>Briefing summary</span>
              <span className="text-xs text-[var(--ax-muted)]">
                <span className="group-open:hidden">Show</span>
                <span className="hidden group-open:inline">Hide</span>
              </span>
            </summary>
            <div className="mt-3 rounded-lg border border-[color:var(--ax-border)] bg-[var(--ax-surface-muted)] p-4">
              {renderBriefingMarkdown(briefing.summaryMarkdown, briefingPlantLinks, collection.slug)}
            </div>
          </details>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="font-serif text-2xl font-semibold">Workflow launchpad</h3>
            <p className="mt-1 text-sm text-stone-600">Start a common greenhouse workflow or jump back into active runs.</p>
          </div>
          <Link className="rounded-full border border-stone-300 bg-white/70 px-3 py-1 text-xs font-semibold text-stone-700" href={collectionPath(collection.slug, '/workflows')}>
            All workflows
          </Link>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
          {canStartWorkflows ? (
            <form action={startWorkflowRun} className="grid gap-3 rounded-lg border border-stone-200 bg-white/55 p-3">
              <input type="hidden" name="collectionSlug" value={collection.slug} />
              <input type="hidden" name="scopeType" value="COLLECTION" />
              <Select label="Start workflow" name="templateId">
                {workflowTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
              </Select>
              <Button>Start collection workflow</Button>
            </form>
          ) : (
            <p className="rounded-lg border border-stone-200 bg-white/55 p-3 text-sm text-stone-600">Viewer access can inspect workflows but cannot start runs.</p>
          )}
          <div className="grid gap-2">
            {activeWorkflowRuns.length === 0 && <p className="rounded-lg border border-stone-200 bg-white/55 p-3 text-sm text-stone-600">No active workflow runs.</p>}
            {activeWorkflowRuns.map((run) => {
              const progress = workflowProgress(run)
              return (
                <Link key={run.id} href={collectionPath(collection.slug, `/workflows/runs/${run.id}`)} className="rounded-lg border border-stone-200 bg-white/55 p-3 text-sm transition hover:border-[#8fa58f]">
                  <span className="font-serif text-lg font-semibold">{run.title}</span>
                  <span className="mt-1 block text-stone-600">{workflowScopeLabel(run.scopeType)} · {run.location ? `${run.location.code} ${run.location.name}` : `${run.plants.length} selected plant${run.plants.length === 1 ? '' : 's'}`} · {progress.completed}/{progress.total} steps</span>
                </Link>
              )
            })}
          </div>
        </div>
      </Card>

      {canViewCollectionUpdates && (
        <Card>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h3 className="font-bold">Recent Collection Updates</h3>
              <p className="mt-1 text-sm text-stone-600">Validated definition changes affecting plants in this collection.</p>
            </div>
            <Link className="rounded-full border border-stone-300 bg-white/70 px-3 py-1 text-xs font-semibold text-stone-700" href={collectionPath(collection.slug, '/validated-definitions')}>
              View validated definitions
            </Link>
          </div>
          <div className="mt-4 overflow-x-auto">
            {collectionUpdates.length === 0 ? (
              <p className="text-sm text-stone-600">No recent validated definition updates affect this collection.</p>
            ) : (
              <table className="w-full min-w-[44rem] border-collapse text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-[0.12em] text-stone-500">
                    <th className="border-b border-stone-200 px-3 py-2">Definition</th>
                    <th className="border-b border-stone-200 px-3 py-2">Field / Section</th>
                    <th className="border-b border-stone-200 px-3 py-2">Previous</th>
                    <th className="border-b border-stone-200 px-3 py-2">Updated</th>
                    <th className="border-b border-stone-200 px-3 py-2 text-right">Plants</th>
                  </tr>
                </thead>
                <tbody>
                  {collectionUpdates.flatMap((update) => update.rows.map((row, index) => (
                    <tr key={`${update.id}-${row.field}-${index}`} className="align-top">
                      <td className="border-b border-stone-200 px-3 py-2">
                        <Link href={update.definitionUrl} className="font-semibold text-[var(--ax-primary)] underline underline-offset-2">
                          {update.definitionName}
                        </Link>
                        <p className="text-xs text-stone-500">{fmtDate(update.changedAt, preferences?.timezone)}</p>
                      </td>
                      <td className="border-b border-stone-200 px-3 py-2">{row.field}</td>
                      <td className="border-b border-stone-200 px-3 py-2 text-stone-600">{row.previous}</td>
                      <td className="border-b border-stone-200 px-3 py-2">{row.updated}</td>
                      <td className="border-b border-stone-200 px-3 py-2 text-right">{update.affectedCount}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-bold">Recent activity</h3>
            <p className="mt-1 text-sm text-stone-600">The latest propagations, blooms, sport notes, acquisitions, sunshine, and archive actions in one stream.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {includedActivityKinds.length !== activityKinds.length && (
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
                href={activityHref(collection.slug, activityTake, toggleActivityKind(includedActivityKinds, kind as ActivityKind))}
                aria-pressed={includedActivityKinds.includes(kind as ActivityKind)}
                className={cn(
                  'rounded-full border px-2 py-1 font-medium transition hover:-translate-y-0.5 hover:shadow-sm',
                  style.className,
                  includedActivityKinds.includes(kind as ActivityKind) ? 'ring-2 ring-[#2f6b45]/35' : 'opacity-45 hover:opacity-80',
                )}
              >
                {style.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
          {activity.map((item) => (
            <ActivityCard key={`${item.kind}-${item.id}`} item={item} timezone={preferences?.timezone} />
          ))}
          {activity.length === 0 && <p className="text-sm text-stone-600">No recent activity yet.</p>}
        </div>
        {activity.length >= activityTake && activityTake < 48 && (
          <div className="mt-5 flex justify-center">
            <Link className="rounded-md border border-stone-300 bg-white/60 px-4 py-2 text-sm font-medium text-stone-800 transition hover:bg-white" href={activityHref(collection.slug, activityTake + 12, includedActivityKinds)}>
              Load 12 more
            </Link>
          </div>
        )}
      </Card>
    </div>
  )
}
