import { PlantImage } from '@/components/PlantImage'
import { Card } from '@/components/ui'
import { prisma } from '@/lib/prisma'
import { fmtDate, plantName } from '@/lib/utils'
import { Flower2, GitBranch, Leaf, Sprout } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

type PhotoLookup = Record<string, string | undefined>

function coverFor(photos: PhotoLookup, id?: string | null) {
  return id ? photos[id] : undefined
}

function MiniCard({
  href,
  image,
  title,
  meta,
  children,
}: {
  href: string
  image?: string
  title: string
  meta: string
  children?: ReactNode
}) {
  return (
    <Link href={href} className="group overflow-hidden rounded-lg border border-stone-200 bg-white/65 shadow-[0_8px_30px_rgba(47,38,24,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_36px_rgba(47,38,24,0.10)]">
      <div className="aspect-[4/3] overflow-hidden">
        <PlantImage src={image} alt="" className="transition duration-300 group-hover:scale-[1.03]" />
      </div>
      <div className="p-4">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#2f6b45]">{meta}</p>
        <h4 className="mt-1 font-serif text-lg leading-tight">{title}</h4>
        {children && <div className="mt-2 text-sm leading-6 text-stone-700">{children}</div>}
      </div>
    </Link>
  )
}

export default async function Dashboard() {
  const [active, recentProps, blooms, sports, archived] = await Promise.all([
    prisma.plantInstance.count({ where: { status: 'ACTIVE' } }),
    prisma.propagationEvent.findMany({
      take: 6,
      orderBy: { date: 'desc' },
      include: {
        parents: { include: { parentPlantInstance: { include: { plantDefinition: true } } } },
        children: { include: { childPlantInstance: { include: { plantDefinition: true } } } },
      },
    }),
    prisma.bloomEvent.findMany({
      take: 6,
      orderBy: { bloomStartDate: 'desc' },
      include: { plantInstance: { include: { plantDefinition: true } } },
    }),
    prisma.plantInstance.findMany({
      where: { OR: [{ isSportCandidate: true }, { sportStatus: { not: 'NONE' } }] },
      take: 6,
      include: { plantDefinition: true },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.plantInstance.findMany({
      where: { status: 'ARCHIVED' },
      take: 6,
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
    ...archived.map((item) => item.id),
  ]))
  const bloomIds = blooms.map((bloom) => bloom.id)

  const [coverPhotos, bloomPhotos] = await Promise.all([
    prisma.photo.findMany({
      where: { entityType: 'PLANT_INSTANCE', entityId: { in: instanceIds } },
      orderBy: [{ isCover: 'desc' }, { createdAt: 'desc' }],
    }),
    prisma.photo.findMany({
      where: { entityType: 'BLOOM_EVENT', entityId: { in: bloomIds } },
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

  const stats = [
    ['Active plants', active, Leaf, '/instances'],
    ['Recent propagations', recentProps.length, GitBranch, '/propagations'],
    ['Recent blooms', blooms.length, Flower2, '/blooms'],
    ['Sport candidates', sports.length, Sprout, '/sports'],
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

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <h3 className="font-bold">Recent propagations</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {recentProps.map((event) => {
              const firstChild = event.children[0]?.childPlantInstance
              const firstParent = event.parents[0]?.parentPlantInstance
              const image = coverFor(coverPhotosByInstance, firstChild?.id) || coverFor(coverPhotosByInstance, firstParent?.id)
              return (
                <MiniCard
                  key={event.id}
                  href="/propagations"
                  image={image}
                  title={firstChild ? firstChild.plantId : event.method}
                  meta={`${fmtDate(event.date)} · ${event.method}`}
                >
                  {event.children.map((child) => child.childPlantInstance.plantId).join(', ')}
                </MiniCard>
              )
            })}
          </div>
        </Card>

        <Card>
          <h3 className="font-bold">Sport candidates needing review</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sports.map((sport) => (
              <MiniCard
                key={sport.id}
                href={`/instances/${sport.id}`}
                image={coverFor(coverPhotosByInstance, sport.id)}
                title={sport.plantId}
                meta={sport.sportStatus}
              >
                {plantName(sport.plantDefinition)}
              </MiniCard>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="font-bold">Recent blooms</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {blooms.map((bloom) => (
              <MiniCard
                key={bloom.id}
                href={`/instances/${bloom.plantInstanceId}`}
                image={coverFor(bloomPhotosByEvent, bloom.id) || coverFor(coverPhotosByInstance, bloom.plantInstanceId)}
                title={bloom.plantInstance.plantId}
                meta={fmtDate(bloom.bloomStartDate)}
              >
                {plantName(bloom.plantInstance.plantDefinition)}
              </MiniCard>
            ))}
          </div>
        </Card>

        <Card>
          <h3 className="font-bold">Recently archived</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {archived.length === 0 && <p className="text-sm text-stone-600">No archived plants yet.</p>}
            {archived.map((item) => (
              <MiniCard
                key={item.id}
                href={`/instances/${item.id}`}
                image={coverFor(coverPhotosByInstance, item.id)}
                title={item.plantId}
                meta={fmtDate(item.archiveDate)}
              >
                {item.archiveReason || plantName(item.plantDefinition)}
              </MiniCard>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
